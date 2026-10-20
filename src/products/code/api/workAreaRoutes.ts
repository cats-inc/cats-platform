import { matchRoute, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import type { CodeApiDependencies } from './index.js';
import type { RouteContext } from '../../../shared/http.js';
import { CODE_API_CONVERSATION_WORK_AREAS_PATTERN } from '../shared/apiPaths.js';

export async function routeCodeWorkAreasApi(context: RouteContext<Pick<CodeApiDependencies, 'workAreas'>>): Promise<boolean> {
  const match = matchRoute(context.url.pathname, CODE_API_CONVERSATION_WORK_AREAS_PATTERN);
  if (!match) return false;
  if (context.method !== 'GET') { sendMethodNotAllowed(context.response, ['GET']); return true; }
  const service = context.dependencies.workAreas;
  if (!service) {
    sendJson(context.response, 503, { error: { code: 'work_areas_unavailable', message: 'Work areas are unavailable.' } });
    return true;
  }
  const id = match[0];
  if (!id || id.length > 512) {
    sendJson(context.response, 400, { error: { code: 'invalid_conversation_id', message: 'Conversation id is invalid.' } });
    return true;
  }
  if (!(await service.authorized(id))) {
    sendJson(context.response, 404, { error: { code: 'conversation_not_found', message: 'Code conversation not found.' } });
    return true;
  }
  const live = context.request.headers.accept?.split(',').some(value => value.trim().startsWith('text/event-stream'));
  if (!live) {
    const payload = await service.read(id);
    if (payload) sendJson(context.response, 200, payload);
    else sendJson(context.response, 404, { error: { code: 'conversation_not_found', message: 'Code conversation not found.' } });
    return true;
  }
  const { response } = context;
  const abort = new AbortController();
  const close = () => abort.abort();
  response.on('close', close);
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  response.flushHeaders();
  try {
    await service.watch(id, async payload => {
      if (abort.signal.aborted || response.destroyed) return;
      const event = payload ? 'work_areas' : 'work_areas_unavailable';
      if (!response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)) {
        await new Promise<void>(resolve => {
          const finish = () => { response.off('drain', finish); response.off('close', finish); resolve(); };
          response.once('drain', finish); response.once('close', finish);
        });
      }
      if (!payload) abort.abort();
    }, abort.signal);
  } catch {
    if (!response.destroyed && !abort.signal.aborted) response.write('event: work_areas_unavailable\ndata: null\n\n');
  } finally { close(); response.off('close', close); response.end(); }
  return true;
}
