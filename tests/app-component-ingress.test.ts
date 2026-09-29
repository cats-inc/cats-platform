import assert from 'node:assert/strict';
import test from 'node:test';
import { ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import fsPromises, { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PlatformIngress } from '../src/platform/apps/platformIngress.ts';
import { PlatformIngressSettingsStore, emptyIngressSettings } from '../src/platform/apps/ingressSettings.ts';
import { createPlatformIngressListener, platformRequestEntry } from '../src/platform/apps/ingressBoundary.ts';
import type { startAppProcess } from '../src/platform/apps/componentProcess.ts';

const secret = 'fixture-token-'.repeat(3);
async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-ingress-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new PlatformIngressSettingsStore(path.join(root, 'config', 'ingress.local.json'), path.join(root, 'apps', 'ingress'));
  const options = { platformDir: root, ready: async () => true, dispatch: async () => {} };
  return { root, store, options };
}

test('host ingress keeps credentials private, persists assigned origin and closes a late connection', async t => {
  const { store, options } = await fixture(t);
  await store.save({ ...emptyIngressSettings, enabled: true, authtoken: secret });
  let stops = 0; let complete: (() => void) | undefined; const urls: (string | undefined)[] = [];
  const start = (async () => {
    await new Promise<void>(resolve => { complete = resolve; });
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://fixture.ngrok.app', stop: async () => { stops++; } };
  }) as typeof startAppProcess;
  const ingress = new PlatformIngress({ ...options, start, onOrigin: url => urls.push(url) });
  const restoring = ingress.restore();
  while (!complete) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(ingress.snapshot().state, 'connecting');
  const closing = ingress.close(); complete(); await restoring; await closing;
  assert.equal(stops, 1); assert.equal(ingress.snapshot().url, null);
  assert.ok(!JSON.stringify(ingress.snapshot()).includes(secret)); assert.ok(!urls.includes('https://fixture.ngrok.app'));
  const connected = new PlatformIngress({ ...options,
    start: (async () => ({ key: 'fixture', child: new ChildProcess(), publicUrl: 'https://fixture.ngrok.app', stop: async () => {} })) as typeof startAppProcess });
  await connected.restore(); assert.equal(connected.snapshot().state, 'connected');
  assert.equal((await store.read())?.publicOrigin, 'https://fixture.ngrok.app');
  await connected.close();
});

test('legacy configuration migrates once with backups; conflicting App settings require selection', async t => {
  const { store, options } = await fixture(t);
  await mkdir(store.legacyDirectory, { recursive: true });
  const legacy = { schemaVersion: 1, enabled: false, authtoken: secret, url: 'https://one.example' };
  await writeFile(path.join(store.legacyDirectory, 'test.one.json'), JSON.stringify(legacy));
  let ingress = new PlatformIngress(options); await ingress.restore(); await ingress.close();
  assert.equal((await store.read())?.publicOrigin, legacy.url);
  assert.equal((await readdir(path.dirname(store.filename))).filter(name => name.includes('.legacy-')).length, 1);
  ingress = new PlatformIngress(options); await ingress.restore(); await ingress.close();
  assert.equal((await readdir(path.dirname(store.filename))).filter(name => name.includes('.legacy-')).length, 1);
  await rm(store.filename);
  await writeFile(path.join(store.legacyDirectory, 'test.two.json'), JSON.stringify({ ...legacy, url: 'https://two.example' }));
  ingress = new PlatformIngress(options); await ingress.restore();
  assert.equal(ingress.snapshot().state, 'migration_required'); assert.equal(await store.read(), null);
  await assert.rejects(ingress.configure({ enabled: false }), /Select/);
  await ingress.configure({ enabled: false, migrationSource: 'test.two' }); await ingress.close();
  assert.equal((await store.read())?.publicOrigin, 'https://two.example');
});

test('a worker exiting immediately after readiness cannot publish a connected origin', async t => {
  const { store, options } = await fixture(t); const origins: (string | undefined)[] = [];
  await store.save({ ...emptyIngressSettings, enabled: true, authtoken: secret });
  const ingress = new PlatformIngress({ ...options, onOrigin: origin => origins.push(origin),
    start: (async input => {
      queueMicrotask(() => input.onExit?.());
      return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://dead.example', stop: async () => {} };
    }) as typeof startAppProcess });
  await ingress.restore(); assert.equal(ingress.snapshot().state, 'unavailable');
  assert.equal(ingress.snapshot().url, null); assert.ok(!origins.includes('https://dead.example'));
  await ingress.close();
});

test('host close waits for cleanup already started by worker exit', async t => {
  const { store, options } = await fixture(t);
  await store.save({ ...emptyIngressSettings, enabled: true, authtoken: secret });
  let exited: (() => void) | undefined; let stopped: (() => void) | undefined;
  const ingress = new PlatformIngress({ ...options, start: (async input => {
    exited = input.onExit;
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://fixture.example',
      stop: () => new Promise<void>(resolve => { stopped = resolve; }) };
  }) as typeof startAppProcess });
  await ingress.restore(); exited!(); assert.ok(stopped);
  let closed = false; const closing = ingress.close().then(() => { closed = true; });
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(closed, false);
  stopped(); await closing; assert.equal(closed, true);
});

test('invalid or unready configuration preserves existing file and never starts ingress', async t => {
  const { store, options } = await fixture(t);
  await store.save(emptyIngressSettings);
  const before = await readFile(store.filename, 'utf8');
  const ingress = new PlatformIngress({ ...options, ready: async () => false });
  await ingress.restore();
  await assert.rejects(ingress.configure({ enabled: true, authtoken: secret }), /authentication/);
  await assert.rejects(ingress.configure({ enabled: false, publicOrigin: 'http://bad.example' }));
  assert.equal(await readFile(store.filename, 'utf8'), before);
  await ingress.close();
  await writeFile(store.filename, '{"schemaVersion":999}');
  const invalid = new PlatformIngress(options); await invalid.restore();
  assert.equal(invalid.snapshot().state, 'unavailable'); assert.equal(invalid.snapshot().target, null);
  await invalid.close();
});

test('failed atomic replacement retains the prior config and backup; restart ignores incomplete staging', async t => {
  const { store, options } = await fixture(t);
  await store.save(emptyIngressSettings);
  const before = await readFile(store.filename, 'utf8');
  const replacement = t.mock.method(fsPromises, 'rename', async () => { throw new Error('fixture disk failure'); });
  syncBuiltinESMExports();
  try { await assert.rejects(store.save({ ...emptyIngressSettings, publicOrigin: 'https://next.example' }), /disk failure/); }
  finally { replacement.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await readFile(store.filename, 'utf8'), before);
  const files = await readdir(path.dirname(store.filename));
  const backup = files.find(name => name.endsWith('.bak')); assert.ok(backup);
  assert.equal(await readFile(path.join(path.dirname(store.filename), backup), 'utf8'), before);
  assert.ok(!files.some(name => name.endsWith('.tmp')));
  await writeFile(store.filename + '.interrupted.tmp', '{"incomplete":');
  const restarted = new PlatformIngress(options); await restarted.restore();
  assert.equal(restarted.snapshot().state, 'disconnected'); await restarted.close();
  await store.save({ ...emptyIngressSettings, publicOrigin: 'https://next.example' });
  assert.equal((await store.read())?.publicOrigin, 'https://next.example');
});

test('single public listener routes Apps and Mobile but denies internal MCP with a valid grant and forged headers', async t => {
  const seen: string[] = [];
  const ingress = await createPlatformIngressListener({ port: 0, origin: () => 'https://cats.example', ready: async () => true,
    dispatch: async (request, response) => {
      seen.push(request.url!);
      assert.equal(platformRequestEntry(request)?.publicEntry, true);
      assert.equal(request.headers['x-cats-desktop-key'], undefined);
      assert.equal(request.headers['x-forwarded-host'], undefined);
      response.end(request.url);
    } });
  t.after(() => ingress.close());
  const headers = { Host: 'cats.example', Authorization: 'Bearer valid-code-session-grant', 'x-cats-desktop-key': 'valid-desktop-key', 'x-forwarded-host': 'localhost' };
  const send = (route: string, requestHeaders: Record<string, string> = headers, method = 'GET') => new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = httpRequest(ingress.target + route, { headers: requestHeaders, method }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, text }));
    });
    request.on('error', reject); request.end();
  });
  for (const route of ['/api/code/agent-tools/mcp', '/api/code/knowledge/agent', '/api/runtime/mcp', '/runtime/api/mcp',
    '/api/%63ode/agent-tools/mcp']) {
    assert.equal((await send(route, headers, 'POST')).status, 403);
  }
  assert.deepEqual(seen, []);
  for (const route of ['/api/auth/session', '/apps/test.one/mcp?query=a', '/apps/test.two/mcp']) {
    const response = await send(route); assert.equal(response.status, 200, response.text); assert.equal(response.text, route);
  }
  assert.equal((await send('/apps/test.one/mcp', {})).status, 403);
  assert.equal((await send('/apps/test.one%2fmcp')).status, 400);
});
