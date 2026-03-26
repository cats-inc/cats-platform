import { CoreNotFoundError } from '../errors.js';
import {
  buildCoreTaskRecoveryView,
  listCoreTaskRecoveryViews,
} from '../recovery.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreRecoveryTasks(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, {
    recoveries: listCoreTaskRecoveryViews(core),
  });
}

async function handleCoreTaskRecovery(
  context: CoreApiRouteContext,
  taskId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  if (!task) {
    throw new CoreNotFoundError(`Task not found: ${taskId}`, 'task_not_found');
  }

  sendJson(context.response, 200, {
    recovery: buildCoreTaskRecoveryView(core, task),
  });
}

export async function routeCoreTaskRecoveryApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/recovery/tasks') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    try {
      await handleCoreRecoveryTasks(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  const taskRecoveryMatch = matchRoute(
    context.url.pathname,
    /^\/api\/core\/tasks\/([^/]+)\/recovery$/u,
  );
  if (!taskRecoveryMatch) {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleCoreTaskRecovery(context, taskRecoveryMatch[0]!);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
