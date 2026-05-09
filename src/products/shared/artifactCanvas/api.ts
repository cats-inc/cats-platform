import type { CoreStore } from '../../../core/store.js';
import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import {
  canvasSurfaceRouteRegistry,
} from './contracts.js';
import {
  buildArtifactCanvasProjection,
} from './projection.js';
import type { ArtifactCanvasPolicyConfig } from './iframePolicy.js';
import {
  ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH,
  ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH,
  type ArtifactCanvasRenderIntentHub,
  getDefaultArtifactCanvasRenderIntentHub,
  parseArtifactCanvasRenderIntentStreamUrl,
  resolveArtifactCanvasRequestSessionId,
  writeArtifactCanvasRenderIntentSseEvent,
  writeArtifactCanvasRenderIntentStreamHeaders,
} from './renderIntent.js';

export interface ArtifactCanvasApiDependencies {
  coreStore: CoreStore;
  policyConfig?: ArtifactCanvasPolicyConfig;
  renderIntentHub?: ArtifactCanvasRenderIntentHub;
}

export type ArtifactCanvasApiRouteContext = RouteContext<ArtifactCanvasApiDependencies>;

export async function routeArtifactCanvasApi(
  context: ArtifactCanvasApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH) {
    await handleArtifactCanvasIntentAck(context);
    return true;
  }

  if (context.url.pathname === ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH) {
    handleArtifactCanvasIntentStream(context);
    return true;
  }

  const route = canvasSurfaceRouteRegistry.parseProjectionApiPath(context.url.pathname);
  if (route === null) {
    return false;
  }
  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const result = buildArtifactCanvasProjection({
    core: await context.dependencies.coreStore.readCore(),
    surface: route.surface,
    artifactId: route.artifactId,
    presentationRequested: route.presentationRequested,
    policyConfig: context.dependencies.policyConfig,
  });
  if (result.status === 'error') {
    sendJson(context.response, result.statusCode, { error: result.error });
    return true;
  }

  sendJson(context.response, 200, result.projection);
  return true;
}

async function handleArtifactCanvasIntentAck(
  context: ArtifactCanvasApiRouteContext,
): Promise<void> {
  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['POST']);
    return;
  }

  let intentId: string | null = null;
  try {
    const body = await readJsonBody<{ intentId?: unknown }>(context.request);
    intentId = typeof body.intentId === 'string' ? body.intentId.trim() : null;
  } catch {
    intentId = null;
  }

  const hub = context.dependencies.renderIntentHub
    ?? getDefaultArtifactCanvasRenderIntentHub();
  hub.acknowledge({
    intentId,
    sessionId: resolveArtifactCanvasRequestSessionId(context.request),
  });
  sendJson(context.response, 200, { status: 'ok' });
}

function handleArtifactCanvasIntentStream(
  context: ArtifactCanvasApiRouteContext,
): void {
  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return;
  }

  const surface = parseArtifactCanvasRenderIntentStreamUrl(context.url);
  if (!surface) {
    sendJson(context.response, 400, {
      error: {
        code: 'invalid_canvas_render_intent_subscription',
        message: 'Expected surfaceKind and surfaceId query parameters.',
      },
    });
    return;
  }

  const hub = context.dependencies.renderIntentHub
    ?? getDefaultArtifactCanvasRenderIntentHub();
  const sessionId = resolveArtifactCanvasRequestSessionId(context.request);
  writeArtifactCanvasRenderIntentStreamHeaders(context.response);
  writeArtifactCanvasRenderIntentSseEvent(context.response, 'connected', {
    type: 'connected',
    surface,
  });

  const unsubscribe = hub.subscribe({
    surface,
    sessionId,
    send: (intent) => {
      if (context.response.writableEnded) {
        return;
      }
      writeArtifactCanvasRenderIntentSseEvent(context.response, 'artifact_canvas_intent', {
        type: 'artifact_canvas_intent',
        intent,
      });
    },
  });
  const heartbeat = setInterval(() => {
    if (!context.response.writableEnded) {
      context.response.write(': ping\n\n');
    }
  }, 15_000);

  context.response.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
