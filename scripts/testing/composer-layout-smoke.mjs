/**
 * Usage: node scripts/testing/composer-layout-smoke.mjs [--help]
 * Check all three products/presets and drafts in isolated Electron using real
 * composer components/styles. No provider calls or user-profile writes.
 * Results and screenshots: build/composer-layout-smoke/.
 * CATS_TEST_BROWSER_EXECUTABLE optionally selects an existing Electron binary.
 */
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/testing/composer-layout-smoke.mjs\nIsolated Electron composer layout checks; results: build/composer-layout-smoke/.');
  process.exit(0);
}
const output = path.resolve('build/composer-layout-smoke');
const electron = process.env.CATS_TEST_BROWSER_EXECUTABLE ?? (await import('electron')).default;
const temporary = await mkdtemp(path.join(tmpdir(), 'cats-composer-layout-'));
await mkdir(output, { recursive: true });
await build({ entryPoints: ['tests/fixtures/conversationNavigation.ts'], outfile: path.join(output, 'fixture.mjs'),
  platform: 'node', format: 'esm', bundle: true, packages: 'external' });
await build({ entryPoints: ['scripts/testing/composer-layout-smoke-renderer.tsx'], outfile: path.join(output, 'renderer.js'),
  platform: 'browser', format: 'esm', bundle: true, define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'file', '.woff': 'file', '.png': 'file', '.svg': 'file' } });
const { createConversationNavigationFixture } = await import(pathToFileURL(path.join(output, 'fixture.mjs')));
const fixture = await createConversationNavigationFixture(temporary, true);
const ids = fixture.state.channels.map(channel => channel.id);
const body = JSON.stringify({ ids: fixture.ids,
  groupId: fixture.state.channels.find(channel => channel.title === 'group fixture').id,
  directId: fixture.state.channels.find(channel => channel.title === 'direct fixture').id,
  payloads: Object.fromEntries(ids.map(id => [id, fixture.payload(id)])),
  snapshots: Object.fromEntries(ids.map(id => [id, fixture.snapshot(id)])) });
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/fixture.json') { response.setHeader('content-type', 'application/json'); response.end(body); return; }
    const name = path.basename(new URL(request.url, 'http://localhost').pathname);
    if (/\.(?:js|css|woff2?|png|svg)$/u.test(name)) {
      response.setHeader('content-type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream');
      response.end(await readFile(path.join(output, name))); return;
    }
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><html><head><link rel="stylesheet" href="/renderer.css"></head><body><div id="root"></div><script type="module" src="/renderer.js"></script></body></html>');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const env = { ...process.env, CATS_COMPOSER_FIXTURE_URL: `http://127.0.0.1:${server.address().port}`,
  CATS_COMPOSER_FIXTURE_PROFILE: path.join(temporary, 'electron'), CATS_COMPOSER_FIXTURE_OUTPUT: output };
delete env.ELECTRON_RUN_AS_NODE;
try {
  const child = spawn(electron, ['scripts/testing/composer-layout-smoke-electron.cjs'], { windowsHide: true, stdio: 'inherit', env });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Composer browser verification exited ${code}`);
  const result = JSON.parse(await readFile(path.join(output, 'result.json'), 'utf8'));
  console.log(JSON.stringify({ scenarios: result.checks.length, directLane: result.directLane,
    viewports: result.viewports, errors: result.errors, cliCalls: result.cliCalls, output }, null, 2));
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (path.dirname(temporary) !== path.resolve(tmpdir()) || !path.basename(temporary).startsWith('cats-composer-layout-')) {
    throw new Error('Unexpected fixture cleanup path');
  }
  await rm(temporary, { recursive: true, force: true });
}
