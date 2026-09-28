import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagedPluginManager } from '../../platform/plugins/manager.js';
import { sendJson } from '../../shared/http.js';

export async function routePluginApi(request: IncomingMessage, response: ServerResponse, url: URL, manager?: ManagedPluginManager): Promise<boolean> {
  if (!url.pathname.startsWith('/api/plugins')) return false;
  response.setHeader('Cache-Control', 'no-store');
  if (!manager) { sendJson(response, 503, { error: { message: 'Plugin manager unavailable.' } }); return true; }
  try {
    if (request.method === 'GET' && url.pathname === '/api/plugins') { sendJson(response, 200, manager.inventory()); return true; }
    if (request.method !== 'POST') { sendJson(response, 405, { error: { message: 'Method not allowed.' } }); return true; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) {
      size += Buffer.byteLength(chunk);
      if (size > 80_000) { sendJson(response, 413, { error: { message: 'Package request too large.' } }); return true; }
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    let result: unknown;
    switch (url.pathname) {
      case '/api/plugins/inspect':
      case '/api/plugins/install': {
        if (typeof body.archive !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(body.archive)) throw new Error('Choose a .catsplugin file.');
        const bytes = Buffer.from(body.archive, 'base64');
        result = url.pathname.endsWith('/inspect') ? manager.inspect(bytes) : await manager.install(bytes, Number(body.revision)); break;
      }
      case '/api/plugins/enable': result = await manager.enable(Number(body.revision)); break;
      case '/api/plugins/impact': result = await manager.impact(); break;
      case '/api/plugins/disable':
      case '/api/plugins/uninstall': {
        if (!Array.isArray(body.confirmedSessions) || !body.confirmedSessions.every(id => typeof id === 'string')
          || !Array.isArray(body.confirmedRuns) || !body.confirmedRuns.every(id => typeof id === 'string')) throw new Error('Confirm the affected sessions and runs first.');
        result = await manager.disable({ revision: Number(body.revision), remove: url.pathname.endsWith('/uninstall'), confirmedSessions: body.confirmedSessions, confirmedRuns: body.confirmedRuns }); break;
      }
      default: sendJson(response, 404, { error: { message: 'Unknown Plugin action.' } }); return true;
    }
    sendJson(response, 200, result);
  } catch (error) { sendJson(response, 409, { error: { message: error instanceof Error ? error.message : String(error) } }); }
  return true;
}
