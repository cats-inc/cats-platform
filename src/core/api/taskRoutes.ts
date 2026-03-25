import { upsertCoreTask } from '../model/index.js';
import {
  applyTaskAssignmentLifecycle,
  checkoutTaskExecution,
  startTaskRunWatcher,
} from '../taskLifecycle.js';
import { buildTaskRuntimeExecutionRequest } from '../../shared/taskExecutionBridge.js';
import {
  asRecord,
  handleCoreError,
  readEnumValue,
  readMetadata,
  readNullableString,
  readObjectBody,
  readOptionalString,
  readRequiredString,
  readStringArray,
  readWrappedBody,
} from './shared.js';
import {
  CORE_APPROVAL_ACTIONS,
  CORE_APPROVAL_STATUSES,
  CORE_TASK_STATUSES,
} from './constants.js';
import type { CoreApiRouteContext } from './types.js';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreTasks(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { tasks: core.tasks });
}

async function handleCoreTaskWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const task = await readWrappedBody(context, 'task');
    const approval = asRecord(task.approval);
    const now = context.dependencies.now?.() ?? new Date();
    const initialCore = await context.dependencies.coreStore.readCore();
    const taskId = readOptionalString(task.id, 'task.id') ?? null;
    const previousTask = taskId
      ? initialCore.tasks.find((candidate) => candidate.id === taskId) ?? null
      : null;
    let next = upsertCoreTask(
      initialCore,
      {
        id: taskId ?? undefined,
        title: readRequiredString(task.title, 'task.title'),
        status: readEnumValue(task.status, 'task.status', CORE_TASK_STATUSES),
        conversationId: readNullableString(task.conversationId, 'task.conversationId'),
        parentTaskId: readNullableString(task.parentTaskId, 'task.parentTaskId'),
        ownerActorId: readOptionalString(task.ownerActorId, 'task.ownerActorId'),
        orchestratorActorId: readNullableString(
          task.orchestratorActorId,
          'task.orchestratorActorId',
        ),
        assignedActorIds: readStringArray(task.assignedActorIds, 'task.assignedActorIds'),
        summary: readNullableString(task.summary, 'task.summary'),
        approval: approval
          ? {
              status: readEnumValue(
                approval.status,
                'task.approval.status',
                CORE_APPROVAL_STATUSES,
              ),
              requestedAt: readNullableString(
                approval.requestedAt,
                'task.approval.requestedAt',
              ),
              decidedAt: readNullableString(
                approval.decidedAt,
                'task.approval.decidedAt',
              ),
              decidedByActorId: readNullableString(
                approval.decidedByActorId,
                'task.approval.decidedByActorId',
              ),
              decisionAction: readEnumValue(
                approval.decisionAction,
                'task.approval.decisionAction',
                CORE_APPROVAL_ACTIONS,
              ),
              notes: readNullableString(approval.notes, 'task.approval.notes'),
            }
          : undefined,
        createdAt: readOptionalString(task.createdAt, 'task.createdAt'),
        metadata: readMetadata(task.metadata, 'task.metadata'),
      },
      now,
    );
    let wakeups = [] as Array<{ request: { id: string }; coalesced: boolean }>;
    let lifecycleActivities = [] as Array<{ id: string }>;

    if (context.dependencies.runtimeClient) {
      const executionRequest = buildTaskRuntimeExecutionRequest({
        core: next.core,
        task: next.task,
      });
      const lifecycle = await applyTaskAssignmentLifecycle({
        core: next.core,
        previousTask,
        task: next.task,
        executionRequest,
        executionLocator: context.dependencies.taskExecutionLocator,
        runtimeClient: context.dependencies.runtimeClient,
        now,
      });
      next = {
        ...next,
        core: lifecycle.core,
        task: lifecycle.task,
      };
      wakeups = lifecycle.wakeups;
      lifecycleActivities = lifecycle.activities;
    }

    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedTask = persisted.tasks.find((candidate) => candidate.id === next.task.id);
    const persistedActivities = lifecycleActivities.map((activity) =>
      persisted.activities.find((candidate) => candidate.id === activity.id) ?? activity);

    sendJson(
      context.response,
      next.created ? 201 : 200,
      {
        task: persistedTask ?? next.task,
        created: next.created,
        ...(wakeups.length > 0 ? { wakeups } : {}),
        ...(persistedActivities.length > 0 ? { activities: persistedActivities } : {}),
      },
    );
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreTaskCheckout(
  context: CoreApiRouteContext,
  taskId: string,
): Promise<void> {
  try {
    const body = await readObjectBody(context);
    const now = context.dependencies.now?.() ?? new Date();
    const actorId = readRequiredString(body.actorId, 'actorId');
    const sessionId = readRequiredString(body.sessionId, 'sessionId');
    const core = await context.dependencies.coreStore.readCore();
    const task = core.tasks.find((candidate) => candidate.id === taskId);
    const executionRequest = task
      ? buildTaskRuntimeExecutionRequest({
          core,
          task,
        })
      : undefined;
    const result = checkoutTaskExecution({
      core,
      taskId,
      actorId,
      sessionId,
      executionRequest,
      now,
    });
    const persisted = await context.dependencies.coreStore.writeCore(result.core);
    const persistedTask = persisted.tasks.find((candidate) => candidate.id === result.task.id)
      ?? result.task;
    const persistedRun = persisted.runs.find((candidate) => candidate.id === result.run.id)
      ?? result.run;
    const persistedActivity = persisted.activities.find(
      (candidate) => candidate.id === result.activity.id,
    ) ?? result.activity;
    const watcherStarted = context.dependencies.runtimeClient
      ? startTaskRunWatcher({
          coreStore: context.dependencies.coreStore,
          runtimeClient: context.dependencies.runtimeClient,
          taskId: persistedTask.id,
          runId: persistedRun.id,
          sessionId,
          actorId,
          now: context.dependencies.now,
        })
      : false;

    sendJson(context.response, 200, {
      task: persistedTask,
      run: persistedRun,
      activity: persistedActivity,
      watcherStarted,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreTaskApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  const taskCheckoutMatch = matchRoute(
    context.url.pathname,
    /^\/api\/core\/tasks\/([^/]+)\/checkout$/u,
  );
  if (taskCheckoutMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleCoreTaskCheckout(context, taskCheckoutMatch[0]!);
    return true;
  }

  if (context.url.pathname === '/api/core/tasks') {
    if (context.method === 'GET') {
      await handleCoreTasks(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreTaskWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}
