import { CoreNotFoundError } from '../errors.js';
import { buildCoreTaskTimelineView } from '../taskTimeline.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreTaskTimeline(
  context: CoreApiRouteContext,
  taskId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  if (!task) {
    throw new CoreNotFoundError(`Task not found: ${taskId}`, 'task_not_found');
  }

  sendJson(context.response, 200, {
    taskId,
    timeline: buildCoreTaskTimelineView(core, task),
  });
}

export async function routeCoreTaskTimelineApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  const match = matchRoute(
    context.url.pathname,
    /^\/api\/core\/tasks\/([^/]+)\/timeline$/u,
  );
  if (!match) {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleCoreTaskTimeline(context, match[0]!);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
