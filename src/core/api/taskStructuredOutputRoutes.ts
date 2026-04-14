import { CoreNotFoundError } from '../errors.js';
import { buildCoreTaskStructuredOutputView } from '../taskStructuredOutputs.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreTaskStructuredOutputs(
  context: CoreApiRouteContext,
  taskId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  if (!task) {
    throw new CoreNotFoundError(`Task not found: ${taskId}`, 'task_not_found');
  }

  sendJson(context.response, 200, buildCoreTaskStructuredOutputView(core, task));
}

export async function routeCoreTaskStructuredOutputApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  const match = matchRoute(
    context.url.pathname,
    /^\/api\/core\/tasks\/([^/]+)\/structured-outputs$/u,
  );
  if (!match) {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleCoreTaskStructuredOutputs(context, match[0]!);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
