import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { sha256, materializeAppSelection } from '#cats-app-package';
import { installBundledApps, installRendererPackage, validateRendererPackage } from '../src/platform/apps/packageInstaller.ts';
import { readAppRenderer } from '../src/platform/apps/renderer.ts';
import { FileCatsAppRegistry } from '../src/platform/apps/registry.ts';
import { resolveCatsAppStoragePathsFromChatState } from '../src/platform/apps/paths.ts';
import { routeAppPackageApi, type AppPackageRouteContext } from '../src/app/server/appPackageRoutes.ts';
import { AppRendererSurface, createAppBridgeNonce, createAppDocument, APP_RENDERER_CSP } from '../src/app/renderer/AppRendererSurface.tsx';
import { classifyPlatformAuthRoute } from '../src/app/server/authGatePolicy.ts';

function fixture(version = '0.1.0', permissions = ['ui.route', 'ui.lobby', 'runtime.telemetry.read']) {
  const manifest = { schemaVersion: 1, id: 'cats.usage', displayName: 'Usage', version, category: 'user-app', trustTier: 'system',
    publisher: { name: 'Test' }, compatibility: { catsPlatform: '^0.2.1', appSdk: '1.x' },
    entrypoints: { renderer: 'renderer/index.html' }, contributions: { lobbyApps: [{ id: 'usage', title: 'Usage', routePath: '/apps/cats.usage' }] }, permissions };
  const bytes = gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'cats-app', manifest,
    files: [{ path: 'renderer/index.html', base64: Buffer.from('<html><head></head><body><h1>Usage</h1></body></html>').toString('base64') }] })));
  return { manifest, bytes, pin: { id: manifest.id, version, sha256: sha256(bytes), artifact: `usage-${version}.catsapp` } };
}

test('App loading chrome follows the host locale', () => {
  const markup = renderToStaticMarkup(<AppRendererSurface appId="cats.usage" version="0.1.0"
    title="Usage" locale="zh-TW" onLobby={() => {}} />);
  assert.match(markup, /載入 Usage/);
  assert.doesNotMatch(markup, /Loading/);
});

test('App bridge uses 128 random bits without requiring secure-context randomUUID', () => {
  const nonce = createAppBridgeNonce({ getRandomValues: ((bytes: Uint8Array) => {
    assert.equal(bytes.byteLength, 16);
    return bytes.fill(0x0a);
  }) as Crypto['getRandomValues'] });
  assert.equal(nonce, '0a'.repeat(16));
  assert.match(createAppBridgeNonce(), /^[0-9a-f]{32}$/);
});

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-app-hosting-'));
  const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
  const paths = resolveCatsAppStoragePathsFromChatState(chatStatePath);
  return { root, chatStatePath, paths, registry: new FileCatsAppRegistry({ registryPath: paths.registryPath }) };
}

async function request(chatStatePath: string, pathname: string, client?: AppPackageRouteContext['dependencies']['runtimeClient'], body?: unknown) {
  const result = { statusCode: 0, headers: {} as Record<string, string>, body: '' };
  const response = { writeHead(status: number, headers: Record<string, string>) { result.statusCode = status; result.headers = headers; }, end(body: string) { result.body = body; } };
  const handled = await routeAppPackageApi({ request: Readable.from(body ? [JSON.stringify(body)] : []) as never, response: response as never,
    url: new URL(`http://localhost${pathname}`), method: body ? 'POST' : 'GET', dependencies: { config: { chatStatePath }, runtimeClient: client } });
  assert.equal(handled, true);
  return { ...result, payload: JSON.parse(result.body) };
}

test('verified source-free install, provenance, immutable versions, update/rollback and data preservation', async () => {
  const state = await setup(); const first = fixture();
  const installed = await installRendererPackage({ ...state, ...first, source: 'local-package', enable: true });
  assert.equal(installed.manifest.trustTier, 'local-user');
  assert.equal(installed.packageSha256, first.pin.sha256);
  assert.notEqual(installed.packagePath, state.root);
  const renderer = await readAppRenderer(installed);
  assert.match(renderer.html, /<h1>Usage/); assert.match(renderer.sdk, /getSnapshot/);
  const dataPath = path.join(state.paths.dataDir, first.pin.id, 'preferences.json');
  await mkdir(path.dirname(dataPath), { recursive: true }); await writeFile(dataPath, '{"keep":true}');
  const changed = fixture('0.1.0', ['ui.route', 'ui.lobby']);
  await assert.rejects(installRendererPackage({ ...state, ...changed, source: 'local-package' }), /different digest/);
  assert.equal((await state.registry.getInstalledApp(first.pin.id))?.packageSha256, first.pin.sha256);
  const next = fixture('0.2.0');
  await assert.rejects(installRendererPackage({ ...state, ...next, pin: { ...next.pin, sha256: '0'.repeat(64) }, source: 'local-package' }), /SHA-256/);
  assert.equal((await state.registry.getInstalledApp(first.pin.id))?.manifest.version, '0.1.0');
  await installRendererPackage({ ...state, ...next, source: 'desktop-bundle', enable: true });
  assert.equal((await state.registry.getInstalledApp(first.pin.id))?.manifest.version, '0.2.0');
  await installRendererPackage({ ...state, ...first, source: 'desktop-bundle', enable: true });
  assert.equal((await state.registry.getInstalledApp(first.pin.id))?.manifest.version, '0.1.0');
  assert.equal(await readFile(dataPath, 'utf8'), '{"keep":true}');
  await state.registry.updateAppState(first.pin.id, { installState: 'disabled' });
  await installRendererPackage({ ...state, ...next, source: 'desktop-bundle', enable: true });
  assert.equal((await state.registry.getInstalledApp(first.pin.id))?.enabled, false);
  await state.registry.uninstallApp(first.pin.id);
  await installRendererPackage({ ...state, ...first, source: 'desktop-bundle', enable: true });
  assert.equal(await state.registry.getInstalledApp(first.pin.id), null);
  assert.equal(await readFile(dataPath, 'utf8'), '{"keep":true}');
});

test('Desktop bundle is offline, validated before activation and idempotent', async () => {
  const state = await setup(); const app = fixture();
  const lock = await materializeAppSelection([{ ...app.pin, bytes: app.bytes, manifest: app.manifest }]);
  await installBundledApps(state.chatStatePath, lock);
  await installBundledApps(state.chatStatePath, lock);
  assert.equal((await state.registry.listInstalledApps()).length, 1);
  assert.equal((await state.registry.getInstalledApp(app.pin.id))?.manifest.trustTier, 'system');
  const bad = path.join(state.root, 'bad.lock.json');
  await writeFile(bad, JSON.stringify({ schemaVersion: 1, apps: [{ ...app.pin, artifact: 'https://github.com/cats-inc/cats-apps/releases/download/usage-v0.1.0/a.catsapp' }] }));
  await assert.rejects(installBundledApps(state.chatStatePath, bad), /network\/path traversal/);
});

test('scoped telemetry is permission/version bound and disabled or in-flight revoked contexts cannot read', async () => {
  const state = await setup(); const app = fixture(); let reads = 0;
  const client = { async getUsageSnapshot() { reads++; return { schemaVersion: 1, marker: 'safe-fixture' }; } };
  await installRendererPackage({ ...state, ...app, source: 'local-package', enable: true });
  const url = '/api/apps/cats.usage/usage?version=0.1.0';
  const success = await request(state.chatStatePath, url, client);
  assert.equal(success.statusCode, 200); assert.equal(success.headers['cache-control'], 'no-store'); assert.equal(reads, 1);
  assert.equal((await request(state.chatStatePath, url.replace('0.1.0', '0.2.0'), client)).statusCode, 409); assert.equal(reads, 1);
  const during = { async getUsageSnapshot() { await state.registry.updateAppState(app.pin.id, { installState: 'disabled' }); return { secret: 'must-not-return' }; } };
  const revoked = await request(state.chatStatePath, url, during);
  assert.equal(revoked.statusCode, 409); assert.doesNotMatch(revoked.body, /must-not-return/);
  assert.equal((await request(state.chatStatePath, url, client)).statusCode, 409); assert.equal(reads, 1);
  const unprivileged = fixture('0.2.0', ['ui.route', 'ui.lobby']);
  await installRendererPackage({ ...state, ...unprivileged, source: 'local-package', enable: true });
  assert.equal((await request(state.chatStatePath, url.replace('0.1.0', '0.2.0'), client)).statusCode, 403); assert.equal(reads, 1);
});

test('local install endpoint requires explicit pins and renderer errors never disclose internal paths', async () => {
  const state = await setup(); const app = fixture(); const artifact = path.join(state.root, 'usage.catsapp');
  await writeFile(artifact, app.bytes);
  assert.equal((await request(state.chatStatePath, '/api/apps/install', undefined, { packagePath: artifact })).statusCode, 400);
  assert.equal((await request(state.chatStatePath, '/api/apps/install', undefined, { packagePath: artifact, ...app.pin, enable: true })).statusCode, 201);
  const installed = (await state.registry.getInstalledApp(app.pin.id))!;
  const healthy = await request(state.chatStatePath, '/api/apps/cats.usage/renderer?version=0.1.0');
  assert.equal(healthy.statusCode, 200); assert.match(healthy.payload.html, /Usage/);
  await writeFile(path.join(installed.packagePath, 'payload.catsapp'), 'corrupted');
  const broken = await request(state.chatStatePath, '/api/apps/cats.usage/renderer?version=0.1.0');
  assert.equal(broken.statusCode, 503); assert.ok(!broken.body.includes(state.root));
});

test('explicit quota refresh needs separate permission, bounded provider targets and live version context', async () => {
  const state = await setup(); let reads = 0;
  const client = { async refreshUsageQuota(target: { provider: string; instance: string }) {
    reads++; assert.ok(['codex', 'copilot', 'claude', 'antigravity'].includes(target.provider));
    assert.equal(target.instance, 'default');
    return { status: 'updated', snapshot: { marker: 'safe' } };
  } };
  const url = '/api/apps/cats.usage/usage/refresh?version=0.1.0';
  const target = { provider: 'codex', instance: 'default' };
  await installRendererPackage({ ...state, ...fixture(), source: 'local-package', enable: true });
  assert.equal((await request(state.chatStatePath, url, client, target)).statusCode, 403);
  assert.equal(reads, 0);
  const app = fixture('0.1.1', ['ui.route', 'ui.lobby', 'runtime.telemetry.read', 'runtime.telemetry.refresh']);
  await installRendererPackage({ ...state, ...app, source: 'local-package', enable: true });
  const active = url.replace('0.1.0', '0.1.1');
  assert.equal((await request(state.chatStatePath, url, client, target)).statusCode, 409);
  assert.equal((await request(state.chatStatePath, active, client)).statusCode, 405);
  for (const invalid of [{ ...target, command: 'PRIVATE' }, { ...target, provider: 'kiro' }, { ...target, instance: 'x'.repeat(2000) }]) {
    assert.equal((await request(state.chatStatePath, active, client, invalid)).statusCode, 400);
  }
  assert.equal(reads, 0);
  const success = await request(state.chatStatePath, active, client, target);
  assert.equal(success.statusCode, 200); assert.equal(success.payload.status, 'updated');
  assert.equal(success.headers['cache-control'], 'no-store'); assert.equal(reads, 1);
  for (const provider of ['copilot', 'claude', 'antigravity']) {
    assert.equal((await request(state.chatStatePath, active, client, { provider, instance: 'default' })).statusCode, 200);
  }
  assert.equal(reads, 4);
  const revoked = await request(state.chatStatePath, active, { async refreshUsageQuota() {
    await state.registry.updateAppState(app.pin.id, { installState: 'disabled' });
    return { secret: 'PRIVATE' };
  } }, target);
  assert.equal(revoked.statusCode, 409); assert.doesNotMatch(revoked.body, /PRIVATE/);
  for (const phase of ['pre_setup', 'post_setup', 'repair'] as const) {
    assert.equal(classifyPlatformAuthRoute({ phase, method: 'POST', pathname: '/api/apps/cats.usage/usage/refresh' }).access, 'protected');
  }
});

test('host places its CSP/SDK before any app markup and does not relax the opaque-origin sandbox', () => {
  const doc = createAppDocument('<script>untrusted()</script><head></head>', '/* trusted SDK */', { nonce: '</script><script>escape()</script>' });
  assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('untrusted()'));
  assert.ok(doc.indexOf('trusted SDK') < doc.indexOf('untrusted()'));
  assert.ok(doc.includes('\\u003c/script>'));
  assert.ok(APP_RENDERER_CSP.includes("connect-src 'none'"));
  assert.ok(APP_RENDERER_CSP.includes("frame-src 'none'"));
  assert.throws(() => createAppDocument('<body>missing head</body>', '', {}), /head/);
});

test('unsupported package capabilities fail closed', () => {
  const app = fixture('0.1.0', ['ui.route', 'ui.lobby', 'core.write']);
  assert.throws(() => validateRendererPackage(app.bytes, app.pin), /capabilities/);
});

test('renderer and usage APIs remain protected before setup, after setup and during repair', () => {
  for (const phase of ['pre_setup', 'post_setup', 'repair'] as const) {
    for (const action of ['renderer', 'usage']) {
      assert.equal(classifyPlatformAuthRoute({ phase, method: 'GET', pathname: `/api/apps/cats.usage/${action}` }).access, 'protected');
    }
  }
});
