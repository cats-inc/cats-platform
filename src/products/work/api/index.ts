import type { CoreStore } from '../../../core/store.js';
import type {
  CatsCoreState,
  CoreActorRecord,
  CoreRunRecord,
  CoreTaskRecord,
  EvidenceEvent,
  ExecutionTargetSummary,
} from '../../../core/types.js';
import { CoreNotFoundError } from '../../../core/errors.js';
import { appendCoreTrace, upsertCoreRun } from '../../../core/model/index.js';
import { handleCoreError } from '../../../core/api/shared.js';
import {
  resolveFullResponseText,
  type RuntimeClient,
  type RuntimeMessageResult,
  type RuntimeSessionInfo,
} from '../../../platform/runtime/client.js';
import {
  buildSupervisedRunInspectionProjection,
  createDurableToolEvidenceSink,
  deriveChildBudgetEnvelope,
  deriveRunState,
  writeRunStateMetadata,
  type BudgetEnvelope,
  type RunLoopDecisionHandoff,
} from '../../../platform/supervision/index.js';
import { startProviderAgentRunLoop } from '../../../platform/orchestration/index.js';
import { buildWorkTaskRuntimeExecutionRequest } from '../state/taskExecutionRequest.js';
import {
  buildWorkDashboardProjection,
  buildWorkProjectDetailProjection,
  buildWorkProjectListProjection,
  buildWorkTaskListProjection,
  buildWorkTaskDetailProjection,
  buildWorkWorkItemDetailProjection,
  buildWorkWorkItemListProjection,
  type WorkDashboardProjection,
  type WorkProjectDetailProjection,
  type WorkSupervisedRunLaunchProjection,
  type WorkTaskListProjection,
  type WorkTaskDetailProjection,
  type WorkWorkItemDetailProjection,
} from './projection.js';
import { routeWorkIntakeApi } from './intakeRoutes.js';
import {
  matchRoute,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import {
  buildWorkApiProjectPath,
  buildWorkApiTaskPath,
  buildWorkApiWorkItemPath,
  WORK_API_PREFIX,
  WORK_API_PROJECT_DETAIL_PATTERN,
  WORK_API_PROJECTS_PATH,
  WORK_API_TASK_DETAIL_PATTERN,
  WORK_API_TASK_SUPERVISED_RUN_PATTERN,
  WORK_API_TASKS_PATH,
  WORK_API_WORK_ITEM_DETAIL_PATTERN,
  WORK_API_WORK_ITEMS_PATH,
} from '../shared/apiPaths.js';

export const WORK_API_SLICE = 'work';

const WORK_SUPERVISED_RUN_PARENT_BUDGET: BudgetEnvelope = {
  maxTokens: 120_000,
  maxDurationMs: 60 * 60 * 1000,
  hardStop: true,
};

const WORK_SUPERVISED_RUN_DEFAULT_BUDGET: BudgetEnvelope = {
  maxTokens: 60_000,
  maxDurationMs: 30 * 60 * 1000,
  hardStop: true,
};

export interface WorkRuntimeTargetOverride {
  provider?: string | null;
  instance?: string | null;
  model?: string | null;
  cwd?: string | null;
}

export interface WorkApiDependencies {
  coreStore: CoreStore;
  runtimeClient?: RuntimeClient;
  runtimeTarget?: WorkRuntimeTargetOverride;
  evidenceDataDir?: string;
  readEvidenceEvents?: (conversationId: string) => EvidenceEvent[];
  now?: () => Date;
}

export type WorkApiRouteContext = RouteContext<WorkApiDependencies>;

export function createWorkDashboardPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): WorkDashboardProjection {
  return buildWorkDashboardProjection(core);
}

export function createWorkTaskDetailPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
  taskId: string,
  evidenceEvents: EvidenceEvent[] = [],
): WorkTaskDetailProjection | null {
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  return task ? buildWorkTaskDetailProjection(core, task, evidenceEvents) : null;
}

export async function createWorkSupervisedRunPayload(
  dependencies: WorkApiDependencies,
  taskId: string,
): Promise<WorkSupervisedRunLaunchProjection> {
  const now = dependencies.now?.() ?? new Date();
  const evaluatedAt = now.toISOString();
  const core = await dependencies.coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;

  if (!task) {
    throw new CoreNotFoundError(`No task found for id ${taskId}.`, 'task_not_found');
  }

  const existingRun = findActiveWorkSupervisedRun(core.runs, task.id);
  if (existingRun) {
    if (dependencies.runtimeClient && !hasStartedRuntimeBridge(existingRun)) {
      return launchRuntimeForWorkSupervisedRun({
        dependencies,
        core,
        task,
        run: existingRun,
        created: false,
        evaluatedAt,
        now,
      });
    }

    return {
      task,
      run: existingRun,
      created: false,
      supervision: buildSupervisedRunInspectionProjection(core, existingRun.id),
    };
  }

  const runState = deriveRunState({ lifecycle: 'queued' });
  const taskSupervision = asRecord(task.metadata.supervision);
  const parentBudget =
    readBudgetEnvelope(taskSupervision?.parentBudget) ??
    readBudgetEnvelope(task.metadata.supervisionParentBudget) ??
    WORK_SUPERVISED_RUN_PARENT_BUDGET;
  const requestedBudget =
    readBudgetEnvelope(taskSupervision?.requestedBudget) ??
    readBudgetEnvelope(task.metadata.supervisionRequestedBudget);
  const budget = deriveChildBudgetEnvelope({
    parent: parentBudget,
    requested: requestedBudget,
    defaults: WORK_SUPERVISED_RUN_DEFAULT_BUDGET,
  });
  const next = upsertCoreRun(
    core,
    {
      title: `Supervised run for ${task.title}`,
      status: 'queued',
      conversationId: task.conversationId,
      taskId: task.id,
      orchestratorActorId: task.ownerActorId,
      summary: 'Queued supervised Work run.',
      createdAt: evaluatedAt,
      metadata: writeRunStateMetadata({
        metadata: {
          supervision: {
            budget,
            budgetSource: 'work_supervised_run_launcher',
            source: 'work_supervised_run_launcher',
          },
        },
        evaluation: runState,
        evaluatedAt,
      }),
    },
    now,
  );
  const persisted = await dependencies.coreStore.writeCore(next.core);
  const run = persisted.runs.find((candidate) => candidate.id === next.run.id) ?? next.run;

  if (dependencies.runtimeClient) {
    return launchRuntimeForWorkSupervisedRun({
      dependencies,
      core: persisted,
      task,
      run,
      created: next.created,
      evaluatedAt,
      now,
    });
  }

  return {
    task,
    run,
    created: next.created,
    supervision: buildSupervisedRunInspectionProjection(persisted, run.id),
  };
}

export function createWorkProjectListPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
) {
  return buildWorkProjectListProjection(core);
}

export function createWorkTaskListPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): WorkTaskListProjection {
  return buildWorkTaskListProjection(core);
}

export function createWorkProjectDetailPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
  projectId: string,
): WorkProjectDetailProjection | null {
  const project = core.projects.find((candidate) => candidate.id === projectId) ?? null;
  return project ? buildWorkProjectDetailProjection(core, project) : null;
}

export function createWorkWorkItemListPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
) {
  return buildWorkWorkItemListProjection(core);
}

export function createWorkWorkItemDetailPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
  workItemId: string,
): WorkWorkItemDetailProjection | null {
  const workItem = core.workItems.find((candidate) => candidate.id === workItemId) ?? null;
  return workItem ? buildWorkWorkItemDetailProjection(core, workItem) : null;
}

export async function routeWorkApi(
  context: WorkApiRouteContext,
): Promise<boolean> {
  // Intake routes (templates, intake submit, plan review, approve/reject)
  if (await routeWorkIntakeApi(context)) {
    return true;
  }

  const projectDetailMatch = matchRoute(context.url.pathname, WORK_API_PROJECT_DETAIL_PATTERN);
  if (projectDetailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const projectId = projectDetailMatch[0];
    if (!projectId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_project_id', message: 'Project id is required.' },
      });
      return true;
    }

    const payload = createWorkProjectDetailPayload(
      await context.dependencies.coreStore.readCore(),
      projectId,
    );
    if (!payload) {
      sendJson(context.response, 404, {
        error: { code: 'project_not_found', message: `No project found for id ${projectId}.` },
      });
      return true;
    }

    sendJson(context.response, 200, payload);
    return true;
  }

  if (context.url.pathname === WORK_API_PROJECTS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createWorkProjectListPayload(await context.dependencies.coreStore.readCore()),
    );
    return true;
  }

  const workItemDetailMatch = matchRoute(context.url.pathname, WORK_API_WORK_ITEM_DETAIL_PATTERN);
  if (workItemDetailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const workItemId = workItemDetailMatch[0];
    if (!workItemId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_work_item_id', message: 'Work item id is required.' },
      });
      return true;
    }

    const payload = createWorkWorkItemDetailPayload(
      await context.dependencies.coreStore.readCore(),
      workItemId,
    );
    if (!payload) {
      sendJson(context.response, 404, {
        error: { code: 'work_item_not_found', message: `No work item found for id ${workItemId}.` },
      });
      return true;
    }

    sendJson(context.response, 200, payload);
    return true;
  }

  if (context.url.pathname === WORK_API_WORK_ITEMS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createWorkWorkItemListPayload(await context.dependencies.coreStore.readCore()),
    );
    return true;
  }

  if (context.url.pathname === WORK_API_TASKS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createWorkTaskListPayload(await context.dependencies.coreStore.readCore()),
    );
    return true;
  }

  const supervisedRunMatch = matchRoute(
    context.url.pathname,
    WORK_API_TASK_SUPERVISED_RUN_PATTERN,
  );
  if (supervisedRunMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    const taskId = supervisedRunMatch[0];
    if (!taskId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_task_id', message: 'Task id is required.' },
      });
      return true;
    }

    try {
      const payload = await createWorkSupervisedRunPayload(context.dependencies, taskId);
      sendJson(
        context.response,
        payload.created ? 201 : 200,
        payload,
      );
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  const detailMatch = matchRoute(context.url.pathname, WORK_API_TASK_DETAIL_PATTERN);
  if (detailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const taskId = detailMatch[0];
    if (!taskId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_task_id', message: 'Task id is required.' },
      });
      return true;
    }

    const core = await context.dependencies.coreStore.readCore();
    const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const evidenceEvents = task?.conversationId
      ? context.dependencies.readEvidenceEvents?.(task.conversationId) ?? []
      : [];
    const payload = task
      ? buildWorkTaskDetailProjection(core, task, evidenceEvents)
      : null;
    if (!payload) {
      sendJson(context.response, 404, {
        error: { code: 'task_not_found', message: `No task found for id ${taskId}.` },
      });
      return true;
    }

    sendJson(context.response, 200, payload);
    return true;
  }

  if (context.url.pathname === WORK_API_PREFIX) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createWorkDashboardPayload(await context.dependencies.coreStore.readCore()),
    );
    return true;
  }

  return false;
}

function findActiveWorkSupervisedRun(
  runs: CoreRunRecord[],
  taskId: string,
): CoreRunRecord | null {
  return runs
    .filter((run) =>
      run.taskId === taskId &&
      isActiveRunStatus(run.status) &&
      asRecord(run.metadata.supervision)?.source === 'work_supervised_run_launcher')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

function isActiveRunStatus(status: CoreRunRecord['status']): boolean {
  return status === 'queued' || status === 'running' || status === 'blocked';
}

async function launchRuntimeForWorkSupervisedRun(input: {
  dependencies: WorkApiDependencies;
  core: CatsCoreState;
  task: CoreTaskRecord;
  run: CoreRunRecord;
  created: boolean;
  evaluatedAt: string;
  now: Date;
}): Promise<WorkSupervisedRunLaunchProjection> {
  const { dependencies, task, created, evaluatedAt, now } = input;
  const runtimeClient = dependencies.runtimeClient;

  if (!runtimeClient) {
    return {
      task,
      run: input.run,
      created,
      supervision: buildSupervisedRunInspectionProjection(input.core, input.run.id),
    };
  }

  try {
    const runtime = await startWorkSupervisedRuntime({
      dependencies,
      runtimeClient,
      core: input.core,
      task,
      run: input.run,
      evaluatedAt,
    });
    const activeRunState = deriveRunState({ lifecycle: 'active' });
    const metadata = writeRunStateMetadata({
      metadata: writeRuntimeBridgeMetadata(input.run.metadata, {
        status: 'started',
        session: runtime.session,
        message: runtime.message,
        target: runtime.target,
        startedAt: evaluatedAt,
        messageSentAt: evaluatedAt,
        handoff: runtime.handoff,
      }),
      evaluation: activeRunState,
      evaluatedAt,
    });
    const next = upsertCoreRun(
      input.core,
      {
        id: input.run.id,
        title: input.run.title,
        status: 'running',
        startedAt: input.run.startedAt ?? evaluatedAt,
        summary: `Started supervised Work runtime session ${runtime.session.id}.`,
        metadata,
      },
      now,
    );
    const traced = appendCoreTrace(
      next.core,
      {
        id: `${input.run.id}:runtime-response`,
        traceId: input.run.traceId ?? `trace-${input.run.id}`,
        kind: 'outcome',
        conversationId: input.run.conversationId,
        runId: input.run.id,
        taskId: input.task.id,
        actorId: runtime.actorRef,
        message: buildRuntimeResponseTraceMessage(runtime.session, runtime.message),
        metadata: {
          source: 'work_supervised_runtime_bridge',
          sessionId: runtime.session.id,
          provider: runtime.session.provider,
          model: runtime.session.model,
          tokensUsed: runtime.message.tokensUsed,
        },
      },
      now,
    );
    const persisted = await dependencies.coreStore.writeCore(traced.core);
    const run = persisted.runs.find((candidate) => candidate.id === input.run.id) ?? next.run;

    return {
      task,
      run,
      created,
      supervision: buildSupervisedRunInspectionProjection(persisted, run.id),
    };
  } catch (error) {
    const blocker = {
      code: 'runtime_launch_failed',
      message: formatRuntimeLaunchError(error),
    };
    const blockedRunState = deriveRunState({
      lifecycle: 'active',
      blockers: [blocker],
    });
    const metadata = writeRunStateMetadata({
      metadata: writeRuntimeBridgeMetadata(input.run.metadata, {
        status: 'failed',
        error: blocker.message,
        failedAt: evaluatedAt,
      }),
      evaluation: blockedRunState,
      evaluatedAt,
    });
    const next = upsertCoreRun(
      input.core,
      {
        id: input.run.id,
        title: input.run.title,
        status: 'blocked',
        summary: 'Blocked before runtime launch completed.',
        metadata,
      },
      now,
    );
    const persisted = await dependencies.coreStore.writeCore(next.core);
    const run = persisted.runs.find((candidate) => candidate.id === input.run.id) ?? next.run;

    return {
      task,
      run,
      created,
      supervision: buildSupervisedRunInspectionProjection(persisted, run.id),
    };
  }
}

async function startWorkSupervisedRuntime(input: {
  dependencies: WorkApiDependencies;
  runtimeClient: RuntimeClient;
  core: CatsCoreState;
  task: CoreTaskRecord;
  run: CoreRunRecord;
  evaluatedAt: string;
}): Promise<{
  session: RuntimeSessionInfo;
  message: RuntimeMessageResult;
  target: ResolvedWorkRuntimeTarget;
  actorRef: string;
  handoff: RunLoopDecisionHandoff;
}> {
  const drivingActor = resolveDrivingActor(input.core, input.task, input.run);
  const target = resolveWorkRuntimeTarget(input.core, input.task, drivingActor, input.dependencies);
  const evidenceSink = input.dependencies.evidenceDataDir && input.run.conversationId
    ? createDurableToolEvidenceSink({
      dataDir: input.dependencies.evidenceDataDir,
      conversationId: input.run.conversationId,
    })
    : undefined;
  const executionRequest = buildWorkTaskRuntimeExecutionRequest({
    core: input.core,
    task: input.task,
  });
  const budget = readBudgetEnvelope(
    asRecord(input.run.metadata.supervision)?.budget,
  );
  const baseContext = {
    source: 'assignment' as const,
    reason: 'work_supervised_run',
    taskId: input.task.id,
    labels: ['cats-work', 'supervised-run'],
    ...(target.cwd
      ? {
          workspace: {
            cwd: target.cwd,
          },
        }
      : {}),
    metadata: {
      product: 'work',
      taskId: input.task.id,
      runId: input.run.id,
      actorId: drivingActor?.id ?? input.run.orchestratorActorId,
      launchedAt: input.evaluatedAt,
    },
  };
  const actorRef = drivingActor?.id ?? input.run.orchestratorActorId ?? 'actor-orchestrator-global';
  const loop = await startProviderAgentRunLoop({
    runtimeClient: input.runtimeClient,
    product: 'cats-work',
    surface: 'work-supervised-run-loop',
    runId: input.run.id,
    actorRef,
    evidenceSink,
    budget,
    sessionActionId: `${input.run.id}:runtime-session`,
    sessionReason: 'work_supervised_run_start',
    sessionInput: {
      provider: target.provider,
      instance: target.instance ?? undefined,
      model: target.model ?? undefined,
      cwd: target.cwd,
      workspaceKind: target.cwd ? 'source' : 'sandbox',
      workspaceAccess: 'read_write',
      permissionMode: 'skip',
      sharingMode: 'isolated',
      instructions: WORK_SUPERVISED_RUNTIME_INSTRUCTIONS,
      context: baseContext,
      ...executionRequest,
    },
    messageActionId: `${input.run.id}:runtime-message`,
    messageReason: 'work_supervised_run_prompt',
    messageContent: buildWorkSupervisedRunPrompt(input.core, input.task, input.run),
    messageInput: (session) => ({
      instructions: WORK_SUPERVISED_RUNTIME_INSTRUCTIONS,
      context: {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          runtimeSessionId: session.id,
        },
      },
      ...executionRequest,
    }),
  });

  return {
    session: loop.session,
    message: loop.message,
    target,
    actorRef,
    handoff: loop.handoff,
  };
}

const WORK_SUPERVISED_RUNTIME_INSTRUCTIONS = [
  'You are the driving agent for a Cats Work supervised run.',
  'Do the next useful execution step for the assigned Work task.',
  'Respect supervision metadata, approvals, budgets, and tool/API boundaries.',
  'If required context or permission is missing, state the blocker instead of inventing facts.',
].join(' ');

interface ResolvedWorkRuntimeTarget {
  provider: string;
  instance: string | null;
  model: string | null;
  cwd: string | null;
}

function hasStartedRuntimeBridge(run: CoreRunRecord): boolean {
  const runtimeBridge = asRecord(asRecord(run.metadata.supervision)?.runtimeBridge);
  return runtimeBridge?.status === 'started' && typeof runtimeBridge.sessionId === 'string';
}

function resolveDrivingActor(
  core: CatsCoreState,
  task: CoreTaskRecord,
  run: CoreRunRecord,
): CoreActorRecord | null {
  const assignedActor = task.assignedActorIds
    .map((actorId) => core.actors.find((actor) => actor.id === actorId) ?? null)
    .find((actor) => actor?.defaultExecutionTarget) ?? null;
  if (assignedActor) {
    return assignedActor;
  }

  return core.actors.find((actor) => actor.id === run.orchestratorActorId)
    ?? core.actors.find((actor) => actor.kind === 'orchestrator' && actor.defaultExecutionTarget)
    ?? null;
}

function resolveWorkRuntimeTarget(
  core: CatsCoreState,
  task: CoreTaskRecord,
  drivingActor: CoreActorRecord | null,
  dependencies: WorkApiDependencies,
): ResolvedWorkRuntimeTarget {
  const actorTarget = drivingActor?.defaultExecutionTarget;
  const target = normalizeExecutionTarget({
    provider: dependencies.runtimeTarget?.provider ?? actorTarget?.provider ?? 'claude',
    instance: dependencies.runtimeTarget?.instance ?? actorTarget?.instance ?? null,
    model: dependencies.runtimeTarget?.model ?? actorTarget?.model ?? null,
  });

  return {
    ...target,
    cwd: readNonEmptyString(dependencies.runtimeTarget?.cwd)
      ?? resolveWorkTaskWorkspacePath(core, task),
  };
}

function normalizeExecutionTarget(target: Partial<ExecutionTargetSummary>): ExecutionTargetSummary {
  return {
    provider: readNonEmptyString(target.provider) ?? 'claude',
    instance: readNonEmptyString(target.instance),
    model: readNonEmptyString(target.model),
  };
}

function resolveWorkTaskWorkspacePath(
  core: CatsCoreState,
  task: CoreTaskRecord,
): string | null {
  const workItem = core.workItems.find((candidate) => candidate.taskId === task.id) ?? null;
  const project = workItem?.projectId
    ? core.projects.find((candidate) => candidate.id === workItem.projectId) ?? null
    : null;

  return readNonEmptyString(project?.repoPath);
}

function buildWorkSupervisedRunPrompt(
  core: CatsCoreState,
  task: CoreTaskRecord,
  run: CoreRunRecord,
): string {
  const workItem = core.workItems.find((candidate) => candidate.taskId === task.id) ?? null;
  const project = workItem?.projectId
    ? core.projects.find((candidate) => candidate.id === workItem.projectId) ?? null
    : null;
  const planning = buildWorkTaskRuntimeExecutionRequest({
    core,
    task,
  });
  const sections = [
    `Work task: ${task.title}`,
    task.summary ? `Task summary: ${task.summary}` : null,
    workItem ? `Work item: ${workItem.title}` : null,
    project ? `Project: ${project.title}` : null,
    planning.requestedStrategy ? `Requested strategy: ${planning.requestedStrategy}` : null,
    planning.acceptanceCriteria ? `Acceptance criteria: ${planning.acceptanceCriteria}` : null,
    `Supervised run id: ${run.id}`,
    'Return progress, blockers, and the concrete next action you took.',
  ];

  return sections.filter((section): section is string => Boolean(section)).join('\n');
}

function writeRuntimeBridgeMetadata(
  metadata: Record<string, unknown>,
  update: {
    status: 'started';
    session: RuntimeSessionInfo;
    message: RuntimeMessageResult;
    target: ResolvedWorkRuntimeTarget;
    startedAt: string;
    messageSentAt: string;
    handoff: RunLoopDecisionHandoff;
  } | {
    status: 'failed';
    error: string;
    failedAt: string;
  },
): Record<string, unknown> {
  const supervision = asRecord(metadata.supervision) ?? {};
  const existingBridge = asRecord(supervision.runtimeBridge) ?? {};

  return {
    ...metadata,
    supervision: {
      ...supervision,
      runtimeBridge: update.status === 'started'
        ? {
            ...existingBridge,
            status: 'started',
            sessionId: update.session.id,
            provider: update.session.provider,
            instance: update.target.instance,
            model: update.session.model,
            requestedProvider: update.target.provider,
            requestedModel: update.target.model,
            cwd: update.session.cwd,
            startedAt: update.startedAt,
            messageSentAt: update.messageSentAt,
            tokensUsed: update.message.tokensUsed,
            runLoopHandoff: update.handoff,
            lastError: null,
          }
        : {
            ...existingBridge,
            status: 'failed',
            failedAt: update.failedAt,
            lastError: update.error,
          },
    },
  };
}

function buildRuntimeResponseTraceMessage(
  session: RuntimeSessionInfo,
  message: RuntimeMessageResult,
): string {
  const text = resolveFullResponseText(message.segments).trim();
  if (!text) {
    return `Runtime session ${session.id} started and returned no text.`;
  }

  return clipTraceMessage(`Runtime response from ${session.provider}: ${text}`);
}

function clipTraceMessage(value: string): string {
  return value.length > 2_000 ? `${value.slice(0, 1_997)}...` : value;
}

function formatRuntimeLaunchError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Runtime launch failed';
}

function readNonEmptyString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readBudgetEnvelope(value: unknown): BudgetEnvelope | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const budget: BudgetEnvelope = {
    ...readFiniteNumberProperty(record, 'maxCostUsd'),
    ...readFiniteNumberProperty(record, 'maxTokens'),
    ...readFiniteNumberProperty(record, 'maxDurationMs'),
    ...(typeof record.hardStop === 'boolean' ? { hardStop: record.hardStop } : {}),
  };

  return Object.keys(budget).length > 0 ? budget : undefined;
}

function readFiniteNumberProperty(
  record: Record<string, unknown>,
  key: 'maxCostUsd' | 'maxTokens' | 'maxDurationMs',
): Pick<BudgetEnvelope, typeof key> {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? { [key]: value } as Pick<BudgetEnvelope, typeof key>
    : {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
