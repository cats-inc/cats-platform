import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import { readPlatformPreferences, writePlatformPreferences } from '../../../shared/platformPreferences.js';
import {
  CODE_API_LIVE_PREVIEWS_PATH,
  CODE_API_PREVIEW_SETTINGS_PATH,
  CODE_API_LIVE_PREVIEW_DETAIL_PATTERN,
  CODE_API_LIVE_PREVIEW_LOGS_PATTERN,
  CODE_API_LIVE_PREVIEW_STOP_PATTERN,
} from '../shared/apiPaths.js';
import type { CodeApiRouteContext } from './index.js';
import {
  buildLivePreviewDetailProjection,
  buildLivePreviewListProjection,
  livePreviewErrorHttpStatus,
} from '../livePreview/projection.js';
import {
  ARTIFACT_CANVAS_SURFACE_KINDS,
  type CanvasSurfaceKind,
} from '../../shared/artifactCanvas/contracts.js';

export async function routeCodeLivePreviewApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === CODE_API_PREVIEW_SETTINGS_PATH) {
    await routePreviewSettings(context);
    return true;
  }
  if (context.url.pathname === CODE_API_LIVE_PREVIEWS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    const store = context.dependencies.livePreviewStore;
    if (!store) {
      sendUnavailable(context);
      return true;
    }
    sendJson(
      context.response,
      200,
      buildLivePreviewListProjection(store.listLeases(), {
        surfaceKind: readSurfaceKind(context.url.searchParams.get('surfaceKind')),
        surfaceId: context.url.searchParams.get('surfaceId'),
      }),
    );
    return true;
  }

  const detailMatch = matchRoute(context.url.pathname, CODE_API_LIVE_PREVIEW_DETAIL_PATTERN);
  if (detailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    const store = context.dependencies.livePreviewStore;
    if (!store) {
      sendUnavailable(context);
      return true;
    }
    const previewId = detailMatch[0];
    if (!previewId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_preview_id', message: 'Preview id is required.' },
      });
      return true;
    }
    const lease = store.getLease(previewId);
    if (!lease) {
      sendJson(context.response, 404, {
        error: { code: 'live_preview_not_found', message: `No live preview ${previewId}.` },
      });
      return true;
    }
    sendJson(
      context.response,
      200,
      buildLivePreviewDetailProjection(lease, store.readLogs(previewId)),
    );
    return true;
  }

  const logsMatch = matchRoute(context.url.pathname, CODE_API_LIVE_PREVIEW_LOGS_PATTERN);
  if (logsMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    const store = context.dependencies.livePreviewStore;
    if (!store) {
      sendUnavailable(context);
      return true;
    }
    const previewId = logsMatch[0];
    const lease = previewId ? store.getLease(previewId) : null;
    if (!previewId || !lease) {
      sendJson(context.response, 404, {
        error: { code: 'live_preview_not_found', message: 'Live preview was not found.' },
      });
      return true;
    }
    sendJson(context.response, 200, {
      previewId,
      logs: store.readLogs(previewId) ?? '',
    });
    return true;
  }

  const stopMatch = matchRoute(context.url.pathname, CODE_API_LIVE_PREVIEW_STOP_PATTERN);
  if (stopMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    const stopLivePreview = context.dependencies.stopLivePreview;
    if (!stopLivePreview) {
      sendUnavailable(context);
      return true;
    }
    const previewId = stopMatch[0];
    if (!previewId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_preview_id', message: 'Preview id is required.' },
      });
      return true;
    }
    const result = await stopLivePreview(previewId, 'api_stop');
    if (result.status === 'rejected') {
      sendJson(context.response, livePreviewErrorHttpStatus(result.error), {
        error: result.error,
      });
      return true;
    }
    sendJson(context.response, 200, result);
    return true;
  }

  return false;
}

/**
 * Settings > Code "Cats may run preview servers" (SPEC-123 CAP-08). Turning it
 * off also stops every running dev preview.
 */
async function routePreviewSettings(context: CodeApiRouteContext): Promise<void> {
  const statePath = context.dependencies.config.chatStatePath;
  if (context.method === 'GET') {
    const prefs = await readPlatformPreferences(statePath);
    sendJson(context.response, 200, { previewServersEnabled: prefs.codePreviewServersEnabled });
    return;
  }
  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return;
  }
  let body: { previewServersEnabled?: unknown };
  try {
    body = await readJsonBody(context.request);
  } catch {
    body = {};
  }
  if (typeof body.previewServersEnabled !== 'boolean') {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: 'previewServersEnabled must be a boolean.' },
    });
    return;
  }
  const prefs = await readPlatformPreferences(statePath);
  await writePlatformPreferences(statePath, { ...prefs, codePreviewServersEnabled: body.previewServersEnabled });
  const stoppedPreviewIds = body.previewServersEnabled
    ? []
    : await context.dependencies.livePreviewSupervisor?.stopProcessPreviews('preview_servers_disabled') ?? [];
  sendJson(context.response, 200, {
    previewServersEnabled: body.previewServersEnabled,
    stoppedPreviewIds,
  });
}

function sendUnavailable(context: CodeApiRouteContext): void {
  sendJson(context.response, 503, {
    error: {
      code: 'live_preview_unavailable',
      message: 'Cats Code live preview supervisor is not available.',
    },
  });
}

function readSurfaceKind(input: string | null): CanvasSurfaceKind | null {
  return ARTIFACT_CANVAS_SURFACE_KINDS.includes(input as CanvasSurfaceKind)
    ? input as CanvasSurfaceKind
    : null;
}
