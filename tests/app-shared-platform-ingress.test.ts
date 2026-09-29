import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodeAppPackage } from '../packages/app-sdk/encode.js';
import { sha256 } from '../packages/app-sdk/format.js';
import { createServer } from '../src/app/server/index.ts';
import { loadConfig } from '../src/config.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { createEmptyPlatformAuthState, createFirstAdminLocalAuthState, issueMobileDeviceSession, MemoryPlatformAuthStore } from '../src/platform/auth/index.ts';
import { AppComponentHost } from '../src/platform/apps/componentHost.ts';
import { installRendererPackage } from '../src/platform/apps/packageInstaller.ts';

test('Platform shutdown waits for Code preview cleanup and shares completion with the close event', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-hosted-shutdown-'));
  const config = loadConfig({ HOME: root, CATS_PLATFORM_DIR: path.join(root, 'platform') });
  let releasePreview!: () => void;
  const previewCleanup = new Promise<void>(resolve => { releasePreview = resolve; });
  let stops = 0;
  const server = createServer({ shared: { config, coreStore: new MemoryCoreStore(), desktopAppsKey: 'disabled-in-fixture',
    runtimeClient: { getHealth: async () => ({ reachable: false, baseUrl: 'http://127.0.0.1:1' }) } as never },
    chat: { chatStore: new MemoryChatStore() },
    code: { livePreviewSupervisor: { async stopAll(reason: string) {
      assert.equal(reason, 'platform_shutdown'); stops++; await previewCleanup;
    }, async expireLeases() {} } as never } });
  t.after(async () => {
    releasePreview(); await server.closeAppHosting(); await server.startupRecovery;
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let finished = false;
  const closing = server.closeAppHosting();
  void closing.then(() => { finished = true; });
  assert.equal(server.closeAppHosting(), closing);
  await new Promise<void>(resolve => server.close(() => resolve()));
  assert.equal(stops, 1);
  assert.equal(finished, false);
  releasePreview(); await closing;
  assert.equal(finished, true);
  assert.equal(stops, 1);
});

test('real Platform router shares one public entry for Mobile and two Apps with separate MCP credentials', { timeout: 90_000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-shared-platform-'));
  const secret = 'fixture-session-secret-at-least-sixteen';
  const config = loadConfig({ HOME: root, CATS_PLATFORM_DIR: path.join(root, 'platform'), CATS_AUTH_SESSION_SECRET: secret });
  const now = new Date();
  const owner = await createFirstAdminLocalAuthState({ state: createEmptyPlatformAuthState(now), displayName: 'Fixture owner',
    identifier: 'fixture@example.test', password: 'fixture-password', sessionSecret: secret, sessionTtlMs: 600_000, now });
  const mobile = issueMobileDeviceSession({ accountId: owner.account.id, sessionSecret: secret, ttlMs: 600_000, now, deviceLabel: 'Fixture', devicePlatform: 'ios' });
  const authStore = new MemoryPlatformAuthStore({ ...owner.state, sessions: [...owner.state.sessions, mobile.session] });
  const coreStore = new MemoryCoreStore(); await coreStore.updateCore(core => ({ ...core, setupCompleteAt: now.toISOString() }));
  const host = new AppComponentHost({ chatStatePath: config.chatStatePath, ownerId: 'desktop-owner' });
  const desktopKey = 'd'.repeat(64);
  const server = createServer({ shared: { config, authStore, coreStore, appComponents: host, desktopAppsKey: desktopKey,
    runtimeClient: { getHealth: async () => ({ reachable: false, baseUrl: 'http://127.0.0.1:1' }) } as never },
    chat: { chatStore: new MemoryChatStore() } });
  t.after(async () => {
    await server.closeAppHosting(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); await server.appHostingReady();
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const local = `http://127.0.0.1:${address.port}`;
  for (const [id, credential] of [['test.one', '1'.repeat(64)], ['test.two', '2'.repeat(64)]]) {
    const manifest = { schemaVersion: 1, id, displayName: id, version: '0.1.0', category: 'user-app', trustTier: 'local-user',
      publisher: { name: 'Fixture' }, compatibility: { catsPlatform: '^0.6.0', appSdk: '^1.3.0' },
      permissions: ['ui.route', 'ui.lobby', 'storage.appData'], contributions: { lobbyApps: [{ id: 'main', title: id, routePath: `/apps/${id}` }] },
      components: { schemaVersion: 1, primaryFrontend: 'main', frontends: [{ id: 'main', entrypoint: 'main.html' }],
        services: [{ id: 'service', entrypoint: 'service.mjs', routes: [
          { path: '/api', methods: ['GET'], exposure: 'private' }, { path: '/mcp', methods: ['POST'], exposure: 'external' }] }],
        workers: [], data: { schemaVersion: 1 } } };
    const bytes = encodeAppPackage({ manifest, files: [
      { path: 'main.html', data: Buffer.from('<html><head></head><body>Fixture</body></html>') },
      { path: 'service.mjs', data: Buffer.from(`export async function start(){return{handle(req,res){
        if(req.url.startsWith('/mcp')&&req.headers.authorization!=='Bearer ${credential}'){res.writeHead(401).end();return;}
        res.setHeader('mcp-session-id','fixture-session');res.end(req.url);
      }}}`) },
    ] });
    await installRendererPackage({ chatStatePath: config.chatStatePath, bytes, pin: { id, version: '0.1.0', sha256: sha256(bytes) },
      source: 'local-package', enable: true, componentHost: host });
  }
  const probe = createHttpServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const free = probe.address(); assert.ok(free && typeof free !== 'string');
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const configured = await fetch(local + '/api/platform/ingress', { method: 'POST',
    headers: { 'x-cats-desktop-apps': desktopKey, 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, provider: 'external', listenPort: free.port, publicOrigin: 'https://cats.example' }) });
  assert.equal(configured.status, 200, await configured.clone().text());
  const status = await configured.json(); assert.equal(status.remoteAccess.state, 'configured');
  const publicTarget = status.remoteAccess.target as string; assert.ok(publicTarget);
  const send = (route: string, token?: string, method = 'GET') => new Promise<{ status: number; text: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const request = httpRequest(publicTarget + route, { method, headers: { Host: 'cats.example', ...(token ? { Authorization: 'Bearer ' + token } : {}) } },
      response => { let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
        response.on('end', () => resolve({ status: response.statusCode!, text, headers: response.headers })); });
    request.on('error', reject); request.end();
  });
  const mobileStatus = await send('/api/mobile/auth/status', mobile.token);
  assert.equal(mobileStatus.status, 200); assert.equal(JSON.parse(mobileStatus.text).authenticated, true);
  assert.equal((await send('/api/channels', '1'.repeat(64))).status, 401, 'an App credential cannot authorize Platform');
  const open = await send('/api/apps/test.two/renderer?version=0.1.0&nonce=' + 'a'.repeat(32), mobile.token);
  assert.equal(open.status, 200, open.text); const launch = JSON.parse(open.text);
  assert.ok(launch.url.startsWith('/apps/test.two/ui/'));
  const document = await send(launch.url); assert.equal(document.status, 200);
  assert.match(String(document.headers['content-security-policy']), /sandbox allow-scripts/);
  const grant = /Bearer ([a-f0-9]{64})/.exec(document.text)?.[1]; assert.ok(grant);
  assert.equal((await send('/apps/test.two/api?nested=1', grant)).text, '/api?nested=1');
  assert.equal((await send('/apps/test.one/api', grant)).status, 401);
  assert.equal((await send('/apps/test.two/api', mobile.token)).status, 401);
  assert.equal((await send('/apps/test.one/mcp', '2'.repeat(64), 'POST')).status, 401);
  for (const [id, credential] of [['test.one', '1'.repeat(64)], ['test.two', '2'.repeat(64)]]) {
    const result = await send(`/apps/${id}/mcp?test=1`, credential, 'POST');
    assert.equal(result.status, 200); assert.equal(result.text, '/mcp?test=1'); assert.equal(result.headers['mcp-session-id'], 'fixture-session');
  }
  assert.equal((await send('/api/code/agent-tools/mcp', 'valid-internal-grant', 'POST')).status, 403);
  await host.setEnabled('test.one', false);
  assert.equal((await send('/apps/test.one/mcp', '1'.repeat(64), 'POST')).status, 404);
  assert.equal((await send('/apps/test.two/mcp', '2'.repeat(64), 'POST')).status, 200);
  assert.equal(JSON.parse((await send('/api/mobile/auth/status', mobile.token)).text).authenticated, true);
  await authStore.updateState(state => ({ ...state, sessions: state.sessions.map(session =>
    session.id === mobile.session.id ? { ...session, revokedAt: new Date().toISOString() } : session) }));
  assert.equal((await send('/apps/test.two/api', grant)).status, 401, 'logout revokes the owner-bound App view');
});
