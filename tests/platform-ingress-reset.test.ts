import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.ts';
import { createServer } from '../src/app/server/index.ts';
import { FileChatStore } from '../src/products/chat/state/store.ts';
import { PlatformIngress } from '../src/platform/apps/platformIngress.ts';
import type { startAppProcess } from '../src/platform/apps/componentProcess.ts';
import { fixtureIngressSecrets } from './fixtures/ingressSecrets.ts';

for (const failureMode of ['cleanup', 'settings']) test(`failed ingress ${failureMode} blocks reset before erasing account and conversation files`, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-ingress-reset-'));
  const config = loadConfig({ HOME: root, CATS_PLATFORM_DIR: path.join(root, 'platform'),
    CATS_AUTH_SESSION_SECRET: 'isolated-ingress-reset-session-secret' });
  let release!: () => void;
  const pendingStop = new Promise<void>(resolve => { release = resolve; });
  const ingress = new PlatformIngress({ platformDir: config.platformDir, ready: async () => true,
    dispatch: async () => {}, secrets: fixtureIngressSecrets(), cleanupTimeoutMs: 20,
    start: (async () => ({ key: 'fixture', child: new ChildProcess(),
      publicUrl: 'https://reset.example', stop: () => failureMode === 'cleanup' ? pendingStop : Promise.resolve() })) as typeof startAppProcess });
  const server = createServer({ shared: { config, platformIngress: ingress,
    desktopAppsKey: 'a'.repeat(64), runtimeClient: {
      async getHealth() { return { reachable: false, status: 'unavailable' }; },
    } as never }, chat: { chatStore: new FileChatStore(config.chatStatePath) } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let restoreWrite = () => {};
  t.after(async () => {
    restoreWrite(); release(); await ingress.resetForDataReset(); await server.closeAppHosting();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  await server.startupRecovery; await server.appHostingReady();
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const setup = await fetch(base + '/api/platform/setup/complete', { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify({ ownerDisplayName: 'Owner', createGuideCat: false,
      adminIdentifier: 'owner@example.test', adminPassword: 'fixture-password' }) });
  assert.equal(setup.status, 200, await setup.clone().text());
  const cookie = setup.headers.get('set-cookie')!.split(';')[0]!;
  const status = await (await fetch(base + '/api/auth/status', { headers: { cookie } })).json() as { csrfToken: string };
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: 'fixture-ngrok-token-1234567890' });
  const chatBefore = await readFile(config.chatStatePath, 'utf8');
  const authBefore = await readFile(config.auth.authStatePath, 'utf8');
  if (failureMode === 'settings') {
    const rename = fs.rename;
    const failure = t.mock.method(fs, 'rename', async (...args: Parameters<typeof rename>) => {
      if (args[1] === path.join(config.platformDir, 'config', 'ingress.local.json')) throw new Error('fixture disk failure');
      return rename(...args);
    });
    syncBuiltinESMExports();
    restoreWrite = () => { failure.mock.restore(); syncBuiltinESMExports(); };
  }
  const reset = await fetch(base + '/api/setup/reset', { method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'x-cats-csrf-token': status.csrfToken },
    body: JSON.stringify({ confirmation: 'RESET', resetRuntime: false }) });
  assert.equal(reset.status, 500);
  assert.equal(ingress.snapshot().state, failureMode === 'cleanup' ? 'cleanup_pending' : 'unavailable');
  assert.equal(ingress.publicOrigin(), undefined);
  assert.equal(await readFile(config.chatStatePath, 'utf8'), chatBefore);
  assert.equal(await readFile(config.auth.authStatePath, 'utf8'), authBefore);
  const saved = JSON.parse(await readFile(path.join(config.platformDir, 'config', 'ingress.local.json'), 'utf8'));
  assert.equal(saved.enabled, failureMode === 'settings'); assert.equal(saved.autoConnect, failureMode === 'settings');
});
