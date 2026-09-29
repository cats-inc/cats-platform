// Private host resource, launched with IPC by the App supervisor. No command/shell hooks.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const config = JSON.parse(process.env.CATS_APP_COMPONENT ?? 'null');
delete process.env.CATS_APP_COMPONENT;
if (!config || !process.send) throw new Error('A supervised App component context is required.');
let closing = false;
let server;
let component;
const stop = async () => {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 3000);
  deadline.unref();
  server?.closeAllConnections();
  server?.close();
  try { await component?.close?.(); } finally { process.exit(0); }
};
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('message', message => { if (message?.type === 'stop') void stop(); });

try {
  const module = await import(pathToFileURL(config.entrypoint).href);
  if (config.kind === 'migration') {
    if (typeof module.migrate !== 'function') throw new Error('Missing App migration export.');
    await module.migrate(Object.freeze(config.context));
    process.send({ type: 'migrated' }, () => process.exit(0));
  } else {
    if (typeof module.start !== 'function') throw new Error('Missing App component start export.');
    component = await module.start(Object.freeze(config.context));
    if (config.kind === 'service') {
      if (typeof component?.handle !== 'function') throw new Error('Missing App HTTP handler.');
      const expected = Buffer.from(config.key);
      let active = 0;
      server = createServer((request, response) => {
        const supplied = Buffer.from(String(request.headers['x-cats-component-key'] ?? ''));
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)
          || request.headers.host !== `127.0.0.1:${server.address().port}`) {
          response.writeHead(403).end(); request.resume(); return;
        }
        delete request.headers['x-cats-component-key'];
        if (active >= 16) { response.writeHead(429).end(); request.resume(); return; }
        active++;
        response.once('close', () => active--);
        Promise.resolve().then(() => component.handle(request, response)).catch(() => {
          if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
          response.end('{"error":"app_service_failed"}');
        });
      });
      server.requestTimeout = 30_000;
      server.headersTimeout = 10_000;
      server.maxHeadersCount = 64;
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      process.send({ type: 'ready', port: server.address().port });
    } else {
      process.send({ type: 'ready', ...(config.kind === 'ingress' ? { publicUrl: component.publicUrl } : {}) });
    }
  }
} catch {
  // App exceptions can contain question text or credentials. Do not forward them to host logs.
  process.send?.({ type: 'failed' });
  await stop();
}
