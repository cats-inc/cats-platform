import { matchRoute, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import type { CodeApiRouteContext } from './index.js';

export async function routeCodeRuntimeBridgeApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  // GET /api/code/runtime/sessions/{sessionId}/observe
  const observeMatch = matchRoute(
    context.url.pathname,
    /^\/api\/code\/runtime\/sessions\/([^/]+)\/observe$/u,
  );
  if (observeMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const sessionId = observeMatch[0];
    if (!sessionId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_session_id', message: 'Session id is required.' },
      });
      return true;
    }

    try {
      const payload = await context.dependencies.runtimeClient.observeSession(sessionId);
      sendJson(context.response, 200, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session observation failed.';
      sendJson(context.response, 502, {
        error: { code: 'observation_failed', message },
      });
    }
    return true;
  }

  return false;
}
