import type { CoreStore } from '../../../core/store.js';
import type { EvidenceEvent } from '../../../core/types.js';
import { CoreNotFoundError } from '../../../core/errors.js';
import { upsertCoreRun } from '../../../core/model/index.js';
import { handleCoreError } from '../../../core/api/shared.js';
import {
  buildSupervisedRunInspectionProjection,
  deriveChildBudgetEnvelope,
  deriveRunState,
  writeRunStateMetadata,
  type BudgetEnvelope,
} from '../../../platform/supervision/index.js';
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

export interface WorkApiDependencies {
  coreStore: CoreStore;
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
      sendJson(
        context.response,
        201,
        await createWorkSupervisedRunPayload(context.dependencies, taskId),
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
