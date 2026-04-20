import { sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { readServerLiveTrace } from '../../../../shared/liveTrace.js';
import { inspectCrossSurfaceNavigationHandoffTelemetry } from '../../../shared/renderer/crossSurfaceNavigationHandoff.js';
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

async function handleRestGetNavigationHandoffTelemetry(
  context: ChatApiRouteContext,
): Promise<void> {
  if (!context.dependencies.config.debugLiveTrace) {
    sendJson(context.response, 404, {
      error: 'navigation_handoff_debug_disabled',
    });
    return;
  }

  sendJson(context.response, 200, {
    enabled: true,
    handoff: inspectCrossSurfaceNavigationHandoffTelemetry(),
  });
}

export async function routeChatDebugResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (
    context.url.pathname !== '/api/debug/live-trace'
    && context.url.pathname !== '/api/debug/navigation-handoff'
  ) {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  if (context.url.pathname === '/api/debug/navigation-handoff') {
    await handleRestGetNavigationHandoffTelemetry(context);
    return true;
  }

  await handleRestGetLiveTrace(context);
  return true;
}
