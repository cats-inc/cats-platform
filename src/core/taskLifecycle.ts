import {
  CoreConflictError,
  CoreValidationError,
} from './errors.js';
import {
  appendCoreActivity,
  createCatActorId,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  upsertCoreRun,
  upsertCoreTask,
} from './model.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
} from './types.js';
import type {
  ChatChannelState,
  ChatState,
} from '../products/chat/api/contracts.js';
import type { ChatStore } from '../products/chat/state/store.js';
import type {
  RuntimeClient,
  RuntimeObservedSessionPayload,
  RuntimeWakeupCreateResult,
} from '../platform/runtime/client.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function cloneMetadata(metadata: CoreRecordMetadata | null | undefined): CoreRecordMetadata {
  return metadata ? structuredClone(metadata) : {};
}

function cloneTaskInput(task: CoreTaskRecord): {
  id: string;
  title: string;
  status: CoreTaskRecord['status'];
  conversationId: string | null;
  parentTaskId?: string | null;
  ownerActorId: string;
  orchestratorActorId: string | null;
  assignedActorIds: string[];
  summary: string | null;
  approval: CoreTaskRecord['approval'];
  createdAt: string;
  metadata: CoreRecordMetadata;
} {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    conversationId: task.conversationId,
    parentTaskId: task.parentTaskId ?? null,
    ownerActorId: task.ownerActorId,
    orchestratorActorId: task.orchestratorActorId,
    assignedActorIds: [...task.assignedActorIds],
    summary: task.summary,
    approval: structuredClone(task.approval),
    createdAt: task.createdAt,
    metadata: cloneMetadata(task.metadata),
  };
}

function cloneRunInput(run: CoreRunRecord): {
  id: string;
  title: string;
  status: CoreRunRecord['status'];
  conversationId: string | null;
  taskId: string | null;
  parentRunId: string | null;
  orchestratorActorId: string | null;
  traceId: string | null;
  summary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  metadata: CoreRecordMetadata;
} {
  return {
    id: run.id,
    title: run.title,
    status: run.status,
    conversationId: run.conversationId,
    taskId: run.taskId,
    parentRunId: run.parentRunId,
    orchestratorActorId: run.orchestratorActorId,
    traceId: run.traceId,
    summary: run.summary,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    metadata: cloneMetadata(run.metadata),
  };
}

function isDispatchableTaskStatus(status: CoreTaskRecord['status']): boolean {
  return status === 'approved' || status === 'in_progress';
}

function resolveConversationChannel(
  core: CatsCoreState,
  chat: ChatState,
  task: CoreTaskRecord,
): ChatChannelState | null {
  if (!task.conversationId) {
    return null;
  }

  const conversation = core.conversations.find((candidate) => candidate.id === task.conversationId);
  if (!conversation?.sourceChannelId) {
    return null;
  }

  return chat.channels.find((candidate) => candidate.id === conversation.sourceChannelId) ?? null;
}

function resolveActorSessionId(
  channel: ChatChannelState | null,
  actorId: string,
): string | null {
  if (!channel) {
    return null;
  }

  if (actorId === GLOBAL_ORCHESTRATOR_ACTOR_ID) {
    return channel.orchestratorLease.sessionId;
  }

  const assignment = channel.catAssignments.find((candidate) =>
    candidate.status === 'active' && createCatActorId(candidate.catId) === actorId);
  return assignment?.execution.lease.sessionId ?? null;
}

function resolveActorName(core: CatsCoreState, actorId: string): string {
  return core.actors.find((candidate) => candidate.id === actorId)?.name ?? actorId;
}

function mergeTaskLifecycleMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  patch: Record<string, unknown>,
): CoreRecordMetadata {
  const next = cloneMetadata(metadata);
  const current = asRecord(next.taskLifecycle) ?? {};
  next.taskLifecycle = {
    ...current,
    ...patch,
  };
  return next;
}

function mapRuntimeRunStatusToCoreStatus(
  runtimeRunStatus: string | null,
  runtimeState: string | null,
): CoreRunRecord['status'] {
  switch (runtimeRunStatus) {
    case 'running':
      return 'running';
    case 'succeeded':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'cancelled';
    case 'blocked':
    case 'cooldown':
      return 'blocked';
    default:
      return runtimeState === 'running' ? 'running' : 'queued';
  }
}

function mapCoreRunStatusToTaskStatus(status: CoreRunRecord['status']): CoreTaskRecord['status'] {
  switch (status) {
    case 'running':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'cancelled';
    case 'queued':
    default:
      return 'approved';
  }
}

function readObservedInspection(
  payload: RuntimeObservedSessionPayload,
): {
  state: string | null;
  currentRun: Record<string, unknown> | null;
  lastRun: Record<string, unknown> | null;
} {
  const session = asRecord(payload.session);
  const inspection = asRecord(session?.inspection);
  return {
    state: readString(inspection?.state),
    currentRun: asRecord(inspection?.currentRun),
    lastRun: asRecord(inspection?.lastRun),
  };
}

function isTerminalCoreRunStatus(status: CoreRunRecord['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'blocked' || status === 'cancelled';
}

function buildTerminalTaskMessage(
  task: CoreTaskRecord,
  actorName: string,
  runStatus: CoreRunRecord['status'],
): string {
  switch (runStatus) {
    case 'completed':
      return `${actorName} completed "${task.title}".`;
    case 'failed':
      return `${actorName} failed "${task.title}".`;
    case 'cancelled':
      return `${actorName} cancelled "${task.title}".`;
    case 'blocked':
      return `${actorName} blocked "${task.title}".`;
    case 'running':
      return `${actorName} started "${task.title}".`;
    case 'queued':
    default:
      return `${actorName} queued "${task.title}".`;
  }
}

export interface ApplyTaskAssignmentLifecycleInput {
  core: CatsCoreState;
  previousTask: CoreTaskRecord | null;
  task: CoreTaskRecord;
  chat: ChatState;
  runtimeClient?: Pick<RuntimeClient, 'createWakeup'>;
  now?: Date;
}

export interface ApplyTaskAssignmentLifecycleResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
  wakeups: RuntimeWakeupCreateResult[];
  activities: CoreActivityRecord[];
}

export async function applyTaskAssignmentLifecycle(
  input: ApplyTaskAssignmentLifecycleInput,
): Promise<ApplyTaskAssignmentLifecycleResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const activities: CoreActivityRecord[] = [];
  const wakeups: RuntimeWakeupCreateResult[] = [];
  let nextCore = input.core;
  let nextTask = input.task;

  if (!input.runtimeClient || !isDispatchableTaskStatus(nextTask.status) || nextTask.assignedActorIds.length === 0) {
    return {
      core: nextCore,
      task: nextTask,
      wakeups,
      activities,
    };
  }

  const previousAssigned = new Set(input.previousTask?.assignedActorIds ?? []);
  const becameDispatchable = !isDispatchableTaskStatus(input.previousTask?.status ?? 'draft');
  const actorsToWake = nextTask.assignedActorIds.filter((actorId) =>
    becameDispatchable || !previousAssigned.has(actorId));

  if (actorsToWake.length === 0) {
    return {
      core: nextCore,
      task: nextTask,
      wakeups,
      activities,
    };
  }

  const channel = resolveConversationChannel(nextCore, input.chat, nextTask);
  const wakeupSummaries: Array<Record<string, unknown>> = [];

  for (const actorId of actorsToWake) {
    const sessionId = resolveActorSessionId(channel, actorId);
    if (!sessionId) {
      continue;
    }

    const created = await input.runtimeClient.createWakeup({
      reason: `Task assigned: ${nextTask.title}`,
      target: { sessionId },
      scheduleAt: nowIso,
      coalesceKey: `task:${nextTask.id}:actor:${actorId}`,
      metadata: {
        source: 'cats-core-task-assignment',
        taskId: nextTask.id,
        assignedActorId: actorId,
        conversationId: nextTask.conversationId,
      },
    });
    wakeups.push(created);
    wakeupSummaries.push({
      requestId: created.request.id,
      sessionId,
      assignedActorId: actorId,
      coalesced: created.coalesced,
      scheduledAt: created.request.scheduleAt ?? nowIso,
    });
    const actorName = resolveActorName(nextCore, actorId);
    const activity = appendCoreActivity(
      nextCore,
      {
        kind: 'status_change',
        actorId: nextTask.orchestratorActorId,
        conversationId: nextTask.conversationId,
        taskId: nextTask.id,
        runId: null,
        message: `Queued runtime wakeup for ${actorName} on "${nextTask.title}".`,
        metadata: {
          source: 'task-lifecycle',
          assignedActorId: actorId,
          sessionId,
          wakeupRequestId: created.request.id,
          coalesced: created.coalesced,
        },
      },
      now,
    );
    nextCore = activity.core;
    activities.push(activity.activity);
  }

  if (wakeupSummaries.length > 0) {
    const updatedTask = upsertCoreTask(
      nextCore,
      {
        ...cloneTaskInput(nextTask),
        metadata: mergeTaskLifecycleMetadata(nextTask.metadata, {
          lastWakeupAt: nowIso,
          wakeups: wakeupSummaries,
        }),
      },
      now,
    );
    nextCore = updatedTask.core;
    nextTask = updatedTask.task;
  }

  return {
    core: nextCore,
    task: nextTask,
    wakeups,
    activities,
  };
}

export interface CheckoutTaskExecutionInput {
  core: CatsCoreState;
  taskId: string;
  actorId: string;
  sessionId: string;
  now?: Date;
}

export interface CheckoutTaskExecutionResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
  run: CoreRunRecord;
  activity: CoreActivityRecord;
}

export function checkoutTaskExecution(
  input: CheckoutTaskExecutionInput,
): CheckoutTaskExecutionResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const task = input.core.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) {
    throw new CoreValidationError(`taskId not found: ${input.taskId}`, 'task_not_found');
  }
  if (task.status === 'in_progress') {
    throw new CoreConflictError(`Task is already in progress: ${task.id}`, 'task_checkout_conflict');
  }
  if (task.status !== 'approved') {
    throw new CoreValidationError(
      `Task must be approved before checkout: ${task.id}`,
      'task_checkout_requires_approved',
    );
  }
  if (!task.assignedActorIds.includes(input.actorId)) {
    throw new CoreValidationError(
      `Actor is not assigned to task: ${input.actorId}`,
      'task_checkout_actor_not_assigned',
    );
  }

  const runWrite = upsertCoreRun(
    input.core,
    {
      title: `${task.title} execution`,
      status: 'running',
      conversationId: task.conversationId,
      taskId: task.id,
      orchestratorActorId: task.orchestratorActorId,
      summary: `Execution started by ${resolveActorName(input.core, input.actorId)}.`,
      startedAt: nowIso,
      metadata: {
        source: 'task-lifecycle',
        sessionId: input.sessionId,
        actorId: input.actorId,
      },
    },
    now,
  );
  const taskWrite = upsertCoreTask(
    runWrite.core,
    {
      ...cloneTaskInput(task),
      status: 'in_progress',
      metadata: mergeTaskLifecycleMetadata(task.metadata, {
        actorId: input.actorId,
        sessionId: input.sessionId,
        checkoutAt: nowIso,
        runId: runWrite.run.id,
      }),
    },
    now,
  );
  const actorName = resolveActorName(taskWrite.core, input.actorId);
  const activity = appendCoreActivity(
    taskWrite.core,
    {
      kind: 'status_change',
      actorId: input.actorId,
      conversationId: taskWrite.task.conversationId,
      taskId: taskWrite.task.id,
      runId: runWrite.run.id,
      message: `${actorName} started "${taskWrite.task.title}".`,
      metadata: {
        source: 'task-lifecycle',
        sessionId: input.sessionId,
        runId: runWrite.run.id,
      },
    },
    now,
  );

  return {
    core: activity.core,
    task: taskWrite.task,
    run: runWrite.run,
    activity: activity.activity,
  };
}

const activeTaskRunWatchers = new Map<string, Promise<void>>();

export interface StartTaskRunWatcherInput {
  chatStore: Pick<ChatStore, 'readCore' | 'writeCore'>;
  runtimeClient: Pick<RuntimeClient, 'observeSession' | 'streamSession'>;
  taskId: string;
  runId: string;
  sessionId: string;
  actorId: string;
  now?: () => Date;
}

async function reconcileObservedTaskRun(
  input: StartTaskRunWatcherInput,
): Promise<void> {
  const now = input.now?.() ?? new Date();
  const observed = await input.runtimeClient.observeSession(input.sessionId);
  const inspection = readObservedInspection(observed);
  const observedRun = inspection.currentRun ?? inspection.lastRun;
  if (!observedRun) {
    return;
  }

  const runtimeRunStatus = readString(observedRun.status);
  const nextRunStatus = mapRuntimeRunStatusToCoreStatus(runtimeRunStatus, inspection.state);
  const startedAt = readString(observedRun.startedAt) ?? now.toISOString();
  const endedAt = readNullableString(observedRun.endedAt);
  const resultSummary = readNullableString(observedRun.resultSummary);
  const error = readNullableString(observedRun.error);
  const usage = asRecord(observedRun.usage);

  const coreBefore = await input.chatStore.readCore();
  const taskBefore = coreBefore.tasks.find((candidate) => candidate.id === input.taskId);
  const runBefore = coreBefore.runs.find((candidate) => candidate.id === input.runId);
  if (!taskBefore || !runBefore) {
    return;
  }

  const runWrite = upsertCoreRun(
    coreBefore,
    {
      ...cloneRunInput(runBefore),
      status: nextRunStatus,
      startedAt,
      completedAt: isTerminalCoreRunStatus(nextRunStatus) ? endedAt ?? now.toISOString() : runBefore.completedAt,
      summary: resultSummary ?? error ?? runBefore.summary,
      metadata: {
        ...cloneMetadata(runBefore.metadata),
        source: 'task-lifecycle',
        sessionId: input.sessionId,
        actorId: input.actorId,
        runtimeState: inspection.state,
        runtimeRunStatus,
        ...(usage ? { usage } : {}),
        ...(error ? { error } : {}),
      },
    },
    now,
  );

  const nextTaskStatus = mapCoreRunStatusToTaskStatus(nextRunStatus);
  const taskWrite = upsertCoreTask(
    runWrite.core,
    {
      ...cloneTaskInput(taskBefore),
      status: nextTaskStatus,
      metadata: mergeTaskLifecycleMetadata(taskBefore.metadata, {
        actorId: input.actorId,
        sessionId: input.sessionId,
        runId: input.runId,
        observedAt: now.toISOString(),
        runtimeState: inspection.state,
        runtimeRunStatus,
        completedAt: isTerminalCoreRunStatus(nextRunStatus) ? endedAt ?? now.toISOString() : null,
      }),
    },
    now,
  );

  let nextCore = taskWrite.core;
  if (taskBefore.status !== nextTaskStatus || runBefore.status !== nextRunStatus) {
    const actorName = resolveActorName(nextCore, input.actorId);
    nextCore = appendCoreActivity(
      nextCore,
      {
        kind: 'status_change',
        actorId: input.actorId,
        conversationId: taskWrite.task.conversationId,
        taskId: taskWrite.task.id,
        runId: input.runId,
        message: buildTerminalTaskMessage(taskWrite.task, actorName, nextRunStatus),
        metadata: {
          source: 'task-lifecycle',
          sessionId: input.sessionId,
          runtimeState: inspection.state,
          runtimeRunStatus,
        },
      },
      now,
    ).core;
  }

  await input.chatStore.writeCore(nextCore);
}

export function startTaskRunWatcher(input: StartTaskRunWatcherInput): boolean {
  const watcherKey = `${input.taskId}:${input.runId}:${input.sessionId}`;
  if (activeTaskRunWatchers.has(watcherKey)) {
    return false;
  }

  const watcher = (async () => {
    try {
      const initialObserve = await input.runtimeClient.observeSession(input.sessionId);
      if (initialObserve.stream?.available) {
        try {
          await input.runtimeClient.streamSession(input.sessionId, async () => {});
        } catch {
          // Reconciliation falls back to observe even if the live stream disappears.
        }
      }
      await reconcileObservedTaskRun(input);
    } finally {
      activeTaskRunWatchers.delete(watcherKey);
    }
  })();

  activeTaskRunWatchers.set(watcherKey, watcher);
  return true;
}
