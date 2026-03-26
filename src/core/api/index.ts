import type { CoreApiRouteContext } from './types.js';
import { routeCoreControlApi } from './controlRoutes.js';
import { routeCoreMemoryMaintenanceApi } from './memoryMaintenanceRoutes.js';
import { routeCoreRecordApi } from './recordRoutes.js';
import { routeCoreTaskApi } from './taskRoutes.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreState(
  context: CoreApiRouteContext,
): Promise<void> {
  sendJson(context.response, 200, await context.dependencies.coreStore.readCore());
}

async function handleCoreActors(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { actors: core.actors });
}

async function handleCoreConversations(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { conversations: core.conversations });
}

export async function routeCoreApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreState(context);
    return true;
  }

  if (context.url.pathname === '/api/core/actors') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreActors(context);
    return true;
  }

  if (context.url.pathname === '/api/core/conversations') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreConversations(context);
    return true;
  }

  if (await routeCoreRecordApi(context)) {
    return true;
  }

  if (await routeCoreMemoryMaintenanceApi(context)) {
    return true;
  }

  if (await routeCoreTaskApi(context)) {
    return true;
  }

  if (await routeCoreControlApi(context)) {
    return true;
  }

  return false;
}
