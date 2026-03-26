import type { CoreStore } from '../../../core/store.js';
import {
  buildWorkDashboardProjection,
  buildWorkTaskDetailProjection,
  type WorkDashboardProjection,
  type WorkTaskDetailProjection,
} from './projection.js';
import {
  matchRoute,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';

export const WORK_API_SLICE = 'work';

export interface WorkApiDependencies {
  coreStore: CoreStore;
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

export async function routeWorkApi(
  context: WorkApiRouteContext,
): Promise<boolean> {
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
