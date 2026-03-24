import {
  CoreConflictError,
  CoreValidationError,
} from './errors.js';
import {
  appendCoreActivity,
  upsertCoreRun,
  upsertCoreTask,
} from './model.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreRunRecord,
  CoreTaskRecord,
} from './types.js';
import type {
  RuntimeClient,
  RuntimeWakeupCreateResult,
} from '../platform/runtime/client.js';
import {
  resolveTaskConversationSessionId,
  type TaskExecutionLocator,
} from './taskExecutionLocator.js';
import {
  cloneTaskInput,
  isDispatchableTaskStatus,
  mergeTaskLifecycleMetadata,
  resolveActorName,
} from './taskLifecycleShared.js';
import {
  startTaskRunWatcher,
} from './taskLifecycleWatchers.js';
import type {
  StartTaskRunWatcherInput,
} from './taskLifecycleWatchers.js';

export type { StartTaskRunWatcherInput } from './taskLifecycleWatchers.js';
export { startTaskRunWatcher } from './taskLifecycleWatchers.js';

export interface ApplyTaskAssignmentLifecycleInput {
  core: CatsCoreState;
  previousTask: CoreTaskRecord | null;
  task: CoreTaskRecord;
  executionLocator?: TaskExecutionLocator;
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

  if (
    !input.runtimeClient
    || !input.executionLocator
    || !isDispatchableTaskStatus(nextTask.status)
    || nextTask.assignedActorIds.length === 0
  ) {
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

  const conversation = await input.executionLocator.resolveTaskConversation(nextCore, nextTask);
  const wakeupSummaries: Array<Record<string, unknown>> = [];

  for (const actorId of actorsToWake) {
    const sessionId = resolveTaskConversationSessionId(conversation, actorId);
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
