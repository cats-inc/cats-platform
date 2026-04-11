import { sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { readServerLiveTrace } from '../../../../shared/liveTrace.js';
import type { ChatApiRouteContext } from '../routeSupport.js';

async function handleRestGetLiveTrace(
  context: ChatApiRouteContext,
): Promise<void> {
  if (!context.dependencies.config.debugLiveTrace) {
    sendJson(context.response, 404, {
      error: 'live_trace_disabled',
    });
    return;
  }

  sendJson(context.response, 200, {
    enabled: true,
    entries: readServerLiveTrace(),
  });
}

export async function routeChatDebugResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/debug/live-trace') {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  await handleRestGetLiveTrace(context);
  return true;
}
