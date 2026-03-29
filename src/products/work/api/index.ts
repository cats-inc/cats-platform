import type { CoreStore } from '../../../core/store.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { TaskExecutionLocator } from '../../../core/taskExecutionLocator.js';
import {
  buildWorkDashboardProjection,
  buildWorkProjectDetailProjection,
  buildWorkProjectListProjection,
  buildWorkTaskDetailProjection,
  buildWorkWorkItemDetailProjection,
  buildWorkWorkItemListProjection,
  type WorkDashboardProjection,
  type WorkProjectDetailProjection,
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

export const WORK_API_SLICE = 'work';

export interface WorkApiDependencies {
  coreStore: CoreStore;
  runtimeClient?: RuntimeClient;
  taskExecutionLocator?: TaskExecutionLocator;
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
): WorkTaskDetailProjection | null {
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  return task ? buildWorkTaskDetailProjection(core, task) : null;
}

export function createWorkProjectListPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
) {
  return buildWorkProjectListProjection(core);
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

  const projectDetailMatch = matchRoute(context.url.pathname, /^\/api\/work\/projects\/([^/]+)$/u);
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

  if (context.url.pathname === '/api/work/projects') {
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

  const workItemDetailMatch = matchRoute(context.url.pathname, /^\/api\/work\/work-items\/([^/]+)$/u);
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

  if (context.url.pathname === '/api/work/work-items') {
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

  const detailMatch = matchRoute(context.url.pathname, /^\/api\/work\/tasks\/([^/]+)$/u);
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

    const payload = createWorkTaskDetailPayload(
      await context.dependencies.coreStore.readCore(),
      taskId,
    );
    if (!payload) {
      sendJson(context.response, 404, {
        error: { code: 'task_not_found', message: `No task found for id ${taskId}.` },
      });
      return true;
    }

    sendJson(context.response, 200, payload);
    return true;
  }

  if (context.url.pathname === '/api/work') {
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
