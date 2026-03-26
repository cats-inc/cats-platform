import { CoreNotFoundError } from '../errors.js';
import { buildCoreTaskInspectionView } from '../taskInspection.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreTaskDetail(
  context: CoreApiRouteContext,
  taskId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  if (!task) {
    throw new CoreNotFoundError(`Task not found: ${taskId}`, 'task_not_found');
  }

  sendJson(context.response, 200, {
    task,
    inspection: buildCoreTaskInspectionView(core, task),
  });
}

export async function routeCoreTaskInspectionApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  const taskMatch = matchRoute(
    context.url.pathname,
    /^\/api\/core\/tasks\/([^/]+)$/u,
  );
  if (!taskMatch) {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleCoreTaskDetail(context, taskMatch[0]!);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
