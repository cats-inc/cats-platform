import type { CoreApiRouteContext } from './apiTypes.js';
import { routeCoreControlApi } from './apiControlRoutes.js';
import { routeCoreRecordApi } from './apiRecordRoutes.js';
import { routeCoreTaskApi } from './apiTaskRoutes.js';
import { sendJson, sendMethodNotAllowed } from '../shared/http.js';

async function handleCoreState(
  context: CoreApiRouteContext,
): Promise<void> {
  sendJson(context.response, 200, await context.dependencies.chatStore.readCore());
}

async function handleCoreActors(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { actors: core.actors });
}

async function handleCoreConversations(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
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

  if (await routeCoreTaskApi(context)) {
    return true;
  }

  if (await routeCoreControlApi(context)) {
    return true;
  }

  return false;
}
