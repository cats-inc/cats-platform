import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readBrowserSdk } from '#cats-app-package';
import type { CatsAppComponents } from '../../shared/catsAppComponents.js';
import type { AppProcess } from './componentProcess.js';

const token = () => randomBytes(32).toString('hex');
const json = (response: ServerResponse, status: number, error: string) => {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error }));
};
export interface AppViewAuthority { subject: string; authorized(): Promise<boolean> }

/** An App-scoped route table, never a listener or tunnel. Platform owns ingress. */
export async function createAppGateway(options: {
  appId: string; version: string; components: CatsAppComponents;
  files: Map<string, Buffer>; processes: Map<string, AppProcess>;
  authorized(): Promise<boolean>;
  ingress?(): unknown;
}) {
  let revoked = false;
  const mount = `/apps/${options.appId}`;
  type Grant = { expires: number; ownerId: string; nonce: string; authority?: AppViewAuthority };
  const grants = new Map<string, Grant>();
  const tickets = new Map<string, { expires: number; access: string; frontend: string; boot: Record<string, string> }>();
  const outbound = new Map<ReturnType<typeof httpRequest>, string | undefined>();
  const sdk = await readBrowserSdk();
  const valid = async (grant: Grant | undefined) => !!grant && grant.expires > Date.now()
    && (!grant.authority || await grant.authority.authorized());
  let checking = false;
  const timer = setInterval(() => {
    if (checking) return;
    checking = true;
    void (async () => {
      for (const [key, grant] of grants) if (!await valid(grant).catch(() => false)) {
        grants.delete(key);
        for (const [request, access] of outbound) if (access === key) request.destroy();
      }
    })().finally(() => { checking = false; });
  }, 1000);
  timer.unref();

  const proxy = (request: IncomingMessage, response: ServerResponse, target: AppProcess,
    servicePath: string, external: boolean, access?: string) => {
    if (!target.url) { json(response, 503, 'app_service_unavailable'); return; }
    const headers: Record<string, string> = { 'x-cats-component-key': target.key };
    for (const name of ['accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id', ...(external ? ['authorization'] : [])]) {
      const value = request.headers[name]; if (typeof value === 'string') headers[name] = value;
    }
    // Excludes cookies, proxy headers, view grants and host authority.
    const upstream = httpRequest(`${target.url}${servicePath}`, { method: request.method, headers }, incoming => {
      const safe: Record<string, string> = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version', 'retry-after']) {
        const value = incoming.headers[name]; if (typeof value === 'string') safe[name] = value;
      }
      // Component API HTML must not execute with the privileged host origin.
      safe['content-security-policy'] = "sandbox; default-src 'none'";
      response.writeHead(incoming.statusCode ?? 502, safe);
      incoming.once('aborted', () => response.destroy());
      incoming.once('error', () => response.destroy());
      incoming.pipe(response);
    });
    outbound.set(upstream, access);
    const timeout = setTimeout(() => upstream.destroy(), 30 * 60_000);
    upstream.once('close', () => { clearTimeout(timeout); outbound.delete(upstream); });
    upstream.once('error', () => { if (!response.headersSent) json(response, 502, 'app_service_unavailable'); else response.destroy(); });
    response.once('close', () => upstream.destroy());
    let bytes = 0;
    request.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) {
        if (!response.headersSent) json(response, 413, 'app_request_too_large');
        request.unpipe(upstream); upstream.destroy(); request.resume();
      }
    });
    request.pipe(upstream);
  };

  return {
    mount,
    async handle(request: IncomingMessage, response: ServerResponse, transportOrigin: string) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      if (revoked || !await options.authorized() || revoked) { json(response, 409, 'app_context_revoked'); return; }
      const relative = (request.url ?? '/').slice(mount.length);
      const url = new URL(relative, transportOrigin);
      const origin = request.headers.origin;
      if (request.method === 'GET' && /^\/ui\/[a-z][a-z0-9-]*$/.test(url.pathname)) {
        const key = url.searchParams.get('ticket') ?? '';
        const ticket = tickets.get(key); tickets.delete(key);
        if (!ticket || ticket.expires < Date.now() || url.pathname !== `/ui/${ticket.frontend}`
          || !await valid(grants.get(ticket.access)) || revoked) { json(response, 403, 'app_launch_expired'); return; }
        const frontend = options.components.frontends.find(item => item.id === ticket.frontend)!;
        const html = options.files.get(frontend.entrypoint)?.toString('utf8');
        if (!html || !/<head\s*>/i.test(html)) { json(response, 503, 'app_frontend_invalid'); return; }
        const serialize = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
        const boot = `globalThis.__CATS_APP_BOOT__=${serialize(ticket.boot)};\nglobalThis.catsAppConnection=Object.freeze(${serialize({ baseUrl: `${mount}/`, headers: { Authorization: `Bearer ${ticket.access}` } })});\n${sdk}`;
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src ${transportOrigin}; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${transportOrigin}`,
          'x-content-type-options': 'nosniff',
        });
        response.end(html.replace(/<head\s*>/i, () => `<head><script>${boot}</script>`)); return;
      }
      const method = (request.method === 'OPTIONS' ? request.headers['access-control-request-method'] : request.method) as 'GET';
      const matches = (route: CatsAppComponents['services'][number]['routes'][number]) =>
        (url.pathname === route.path || url.pathname.startsWith(`${route.path}/`)) && route.methods.includes(method);
      const service = options.components.services.find(item => item.routes.some(matches));
      const declaration = service?.routes.find(matches);
      const hosting = url.pathname === '/_cats/ingress' && ['GET', 'OPTIONS'].includes(request.method ?? '');
      if (!service && !hosting) { json(response, 404, 'app_route_not_found'); return; }
      const external = declaration?.exposure === 'external';
      if (origin && (external || (origin !== 'null' && origin !== transportOrigin))) {
        json(response, 403, 'app_origin_denied'); return;
      }
      if (!external && origin === 'null') {
        response.setHeader('Access-Control-Allow-Origin', 'null');
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        const requested = String(request.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
        if (external || origin !== 'null' || requested.some(x => !['authorization', 'content-type', 'last-event-id'].includes(x))
          || (hosting && request.headers['access-control-request-method'] !== 'GET')) {
          json(response, 403, 'app_preflight_denied'); return;
        }
        response.writeHead(204, { 'access-control-allow-methods': declaration?.methods.join(', ') ?? 'GET',
          'access-control-allow-headers': 'Authorization, Content-Type, Last-Event-ID', 'access-control-max-age': '60' });
        response.end(); return;
      }
      const access = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '')?.[1];
      if (!external && (!await valid(access ? grants.get(access) : undefined) || revoked)) {
        json(response, 401, 'app_auth_required'); return;
      }
      if (external && (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(request.headers.authorization ?? '') || (access && grants.has(access)))) {
        json(response, 401, 'app_connection_auth_required'); return;
      }
      if (hosting) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(options.ingress?.() ?? { state: 'disconnected' })); return;
      }
      const target = service && options.processes.get(service.id);
      if (!target) { json(response, 503, 'app_service_unavailable'); return; }
      proxy(request, response, target, relative, external, external ? undefined : access);
    },
    open(frontend: string | undefined, boot: Record<string, string>, ownerId: string, authority?: AppViewAuthority) {
      if (revoked) throw new Error('App context revoked.');
      const selected = frontend ?? options.components.primaryFrontend;
      if (!options.components.frontends.some(item => item.id === selected)) throw new Error('Unknown App frontend.');
      const now = Date.now();
      for (const [key, value] of tickets) if (value.expires < now) tickets.delete(key);
      for (const [key, value] of grants) if (value.expires < now) grants.delete(key);
      if (tickets.size >= 32 || grants.size >= 128) throw new Error('Too many App views.');
      const access = token(); const ticket = token();
      grants.set(access, { ownerId, nonce: boot.nonce!, authority, expires: now + 12 * 60 * 60_000 });
      tickets.set(ticket, { access, frontend: selected, expires: now + 30_000,
        boot: { ...boot, appId: options.appId, version: options.version } });
      return { url: `${mount}/ui/${selected}?ticket=${ticket}`, origin: 'null' };
    },
    async authorizeBridge(nonce: string) {
      return !revoked && await options.authorized()
        && await Promise.all([...grants.values()].filter(grant => grant.nonce === nonce).map(valid)).then(rows => rows.some(Boolean))
        && !revoked;
    },
    async close() {
      revoked = true; clearInterval(timer); tickets.clear(); grants.clear();
      for (const request of outbound.keys()) request.destroy();
      outbound.clear();
    },
  };
}
