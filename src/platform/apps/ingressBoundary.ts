import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

const entries = new WeakMap<IncomingMessage, { origin: string; publicEntry: boolean }>();
export function setPlatformRequestEntry(request: IncomingMessage, origin: string, publicEntry: boolean) {
  entries.set(request, { origin, publicEntry });
}
export function platformRequestEntry(request: IncomingMessage) { return entries.get(request); }

export function canonicalIngressPath(raw: string): string | null {
  const pathname = raw.split('?')[0]!;
  if (!pathname.startsWith('/') || /%2f|%5c|\\|\/\/|[\u0000-\u0020\u007f#]/i.test(pathname)) return null;
  try {
    const decoded = decodeURIComponent(pathname);
    if (/%|[\u0000-\u001f\u007f]/.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..')) return null;
    return decoded;
  } catch { return null; }
}

/** These handlers must never become reachable through a local tunnel peer. */
export function isInternalPlatformRoute(pathname: string, method: string): boolean {
  return pathname === '/api/code/agent-tools' || pathname.startsWith('/api/code/agent-tools/')
    || pathname === '/api/code/knowledge/agent' || pathname.startsWith('/api/code/knowledge/agent/')
    || pathname === '/api/runtime/mcp' || pathname.startsWith('/api/runtime/mcp/')
    || pathname === '/runtime/api/mcp' || pathname.startsWith('/runtime/api/mcp/')
    || (pathname === '/api/platform/ingress' && method !== 'GET')
    || /^\/api\/apps\/(?:validate|install)$/.test(pathname)
    || /^\/api\/apps\/[^/]+\/(?:enable|disable|inspect)$/.test(pathname)
    || (method === 'DELETE' && /^\/api\/apps\/[^/]+$/.test(pathname));
}

/** The single public tunnel terminates here, never on the internal listener. */
export async function createPlatformIngressListener(options: {
  port: number; origin(): string | undefined; ready(): Promise<boolean>;
  dispatch(request: IncomingMessage, response: ServerResponse): Promise<void>;
}) {
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    const reject = (status: number, error: string) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error }));
    };
    void (async () => {
      const pathname = canonicalIngressPath(request.url ?? '/');
      if (!pathname) { reject(400, 'invalid_ingress_path'); return; }
      if (isInternalPlatformRoute(pathname, request.method ?? 'GET')) { reject(403, 'internal_route'); return; }
      const origin = options.origin();
      if (!origin || !await options.ready()) { reject(503, 'public_ingress_unavailable'); return; }
      if (request.headers.host !== new URL(origin).host) { reject(403, 'ingress_host_denied'); return; }
      // Entry identity comes from this listener, not proxy/client headers.
      for (const name of Object.keys(request.headers)) if (name.startsWith('x-forwarded-')
        || name === 'forwarded' || name.startsWith('x-cats-desktop') || name === 'x-cats-component-key') delete request.headers[name];
      setPlatformRequestEntry(request, origin, true);
      await options.dispatch(request, response);
    })().catch(() => { if (!response.headersSent) reject(503, 'public_ingress_unavailable'); else response.destroy(); });
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.headersTimeout = 10_000; server.requestTimeout = 30_000; server.maxHeadersCount = 64;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Public ingress listener unavailable.');
  return { target: `http://127.0.0.1:${address.port}`, async close() {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  } };
}
