import { CoreNotFoundError } from '../errors.js';
import {
  buildCoreTaskControlPlaneView,
  listCoreTaskControlPlaneViews,
} from '../taskControlPlane.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleTaskControlPlaneList(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, {
    tasks: listCoreTaskControlPlaneViews(core),
  });
}

async function handleTaskControlPlaneDetail(
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
    controlPlane: buildCoreTaskControlPlaneView(core, task),
  });
}

export async function routeCoreTaskControlPlaneApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/control-plane/tasks') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    try {
      await handleTaskControlPlaneList(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  const match = matchRoute(
    context.url.pathname,
    /^\/api\/core\/tasks\/([^/]+)\/control-plane$/u,
  );
  if (!match) {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleTaskControlPlaneDetail(context, match[0]!);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
