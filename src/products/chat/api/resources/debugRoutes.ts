import { sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { readServerLiveTrace } from '../../../../shared/liveTrace.js';
import { inspectCrossSurfaceNavigationHandoffTelemetry } from '../../../shared/renderer/crossSurfaceNavigationHandoff.js';
import { inspectOriginSurfaceCompatibilityTelemetry } from '../originSurfaceCompatibilityTelemetry.js';
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

async function handleRestGetOriginSurfaceCompatibilityTelemetry(
  context: ChatApiRouteContext,
): Promise<void> {
  if (!context.dependencies.config.debugLiveTrace) {
    sendJson(context.response, 404, {
      error: 'origin_surface_compatibility_debug_disabled',
    });
    return;
  }

  sendJson(context.response, 200, {
    enabled: true,
    compatibility: inspectOriginSurfaceCompatibilityTelemetry(),
  });
}

export async function routeChatDebugResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (
    context.url.pathname !== '/api/debug/live-trace'
    && context.url.pathname !== '/api/debug/navigation-handoff'
    && context.url.pathname !== '/api/debug/origin-surface-compatibility'
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

  if (context.url.pathname === '/api/debug/origin-surface-compatibility') {
    await handleRestGetOriginSurfaceCompatibilityTelemetry(context);
    return true;
  }

  await handleRestGetLiveTrace(context);
  return true;
}
