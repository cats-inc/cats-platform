/**
 * Usage: node scripts/testing/conversation-navigation-smoke.mjs [--help]
 * Builds an isolated production Chat renderer and verifies navigation in hidden
 * Electron/Chromium. All records and services are synthetic; user data is untouched.
 * Writes build/conversation-navigation-smoke/result.json and a screenshot.
 */
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import electron from 'electron';

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/testing/conversation-navigation-smoke.mjs\nSynthetic Chat navigation verification in hidden Electron. Results: build/conversation-navigation-smoke/.');
  process.exit(0);
}
const out = path.resolve('build/conversation-navigation-smoke');
const temporary = await mkdtemp(path.join(tmpdir(), 'cats-navigation-browser-'));
await mkdir(out, { recursive: true });
await build({ entryPoints: ['tests/fixtures/conversationNavigation.ts'], outfile: path.join(out, 'fixture.mjs'),
  platform: 'node', format: 'esm', bundle: true, packages: 'external' });
await build({ entryPoints: ['scripts/testing/conversation-navigation-smoke-renderer.tsx'], outfile: path.join(out, 'renderer.js'),
  platform: 'browser', format: 'esm', bundle: true, define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'file', '.woff': 'file', '.png': 'file', '.svg': 'file' } });
const { createConversationNavigationFixture } = await import(pathToFileURL(path.join(out, 'fixture.mjs')));
const fixture = await createConversationNavigationFixture(temporary, true);
const allIds = fixture.state.channels.map((channel) => channel.id);
const body = JSON.stringify({ ids: fixture.ids, payloads: Object.fromEntries(allIds.map((id) => [id, fixture.payload(id)])),
  snapshots: Object.fromEntries(allIds.map((id) => [id, fixture.snapshot(id)])), core: await fixture.store.readCore() });
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/fixture.json') { response.setHeader('content-type', 'application/json'); response.end(body); return; }
    const name = path.basename(new URL(request.url, 'http://localhost').pathname);
    if (/\.(?:js|css|woff2?|png|svg)$/u.test(name)) {
      response.setHeader('content-type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream');
      response.end(await readFile(path.join(out, name))); return;
    }
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><html><head><link rel="stylesheet" href="/renderer.css"></head><body><div id="root"></div><script type="module" src="/renderer.js"></script></body></html>');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}/chat/chats/${fixture.ids[0]}`;
const childEnv = { ...process.env, CATS_NAV_SMOKE_URL: url,
  CATS_NAV_SMOKE_PROFILE: path.join(temporary, 'electron'), CATS_NAV_SMOKE_OUTPUT: out };
delete childEnv.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/testing/conversation-navigation-smoke-electron.cjs'], {
  windowsHide: true, stdio: 'inherit', env: childEnv,
});
try {
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Navigation browser verification exited ${code}`);
  const result = JSON.parse(await readFile(path.join(out, 'result.json'), 'utf8'));
  console.log(JSON.stringify({ timings: result.timings,
    checks: result.checks.map((check) => typeof check === 'string' ? check : check.mode), errors: result.errors }, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (path.dirname(path.resolve(temporary)) !== path.resolve(tmpdir())
    || !path.basename(temporary).startsWith('cats-navigation-browser-')) throw new Error('Unexpected smoke cleanup path');
  await rm(temporary, { recursive: true, force: true });
}
