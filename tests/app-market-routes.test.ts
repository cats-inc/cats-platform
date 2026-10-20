import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { sha256 } from '#cats-app-package';
import { encodeAppPackage } from '#cats-app-encode';
import { routeAppPackageApi, type AppPackageApiDependencies } from '../src/app/server/appPackageRoutes.ts';
import { createAppCatalogClient } from '../src/platform/apps/catalog.ts';
import { APP_CATALOG_URL } from '../src/platform/apps/catalogTrust.ts';
import { FileCatsAppRegistry } from '../src/platform/apps/registry.ts';
import { resolveCatsAppStoragePathsFromChatState } from '../src/platform/apps/paths.ts';

const desktopAppsKey = 'a'.repeat(64);
const artifactUrl = 'https://github.com/cats-inc/cats-apps/releases/download/studio-v0.2.1/studio-0.2.1.catsapp';

function catalogClient() {
  const manifest = { schemaVersion: 1, id: 'cats.studio', displayName: 'Studio', version: '0.2.1', category: 'user-app', trustTier: 'local-user',
    publisher: { name: 'sammykenny2' }, compatibility: { catsPlatform: '^0.6.0', appSdk: '^1.3.0' }, entrypoints: { renderer: 'renderer/index.html' },
    contributions: { lobbyApps: [{ id: 'studio', title: 'Studio', routePath: '/apps/cats.studio' }] }, permissions: ['ui.route', 'ui.lobby', 'media.images'] };
  const bytes = encodeAppPackage({ manifest, files: [{ path: 'renderer/index.html', data: Buffer.from('<html><body>Studio</body></html>') }] });
  const payload = Buffer.from(JSON.stringify({
    schemaVersion: 1, revision: 10, issuedAt: '2026-10-20T00:00:00.000Z', expiresAt: '2026-11-19T00:00:00.000Z', publisher: { name: 'sammykenny2' },
    apps: [{ id: 'cats.studio', displayName: 'Studio', description: 'Image studio', icon: 'image', channels: { stable: '0.2.1' },
      versions: [{ version: '0.2.1', artifact: { url: artifactUrl, size: bytes.length, sha256: sha256(bytes) },
        compatibility: manifest.compatibility, permissions: manifest.permissions, publisher: manifest.publisher, notes: 'Grok images' }] }],
  }));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const envelope = { algorithm: 'ed25519', keyId: 'route-test', payload: payload.toString('base64'), signature: sign(null, payload, privateKey).toString('base64') };
  const served = new Map<string, () => Response>([
    [APP_CATALOG_URL, () => new Response(JSON.stringify(envelope))],
    [artifactUrl, () => new Response(Buffer.from(bytes))],
  ]);
  return createAppCatalogClient({
    trustedKeys: [{ keyId: 'route-test', algorithm: 'ed25519', publicKey: publicKey.export({ format: 'jwk' }).x! }],
    fetch: (async (input: string | URL | Request) => served.get(String(input))?.() ?? new Response('missing', { status: 404 })) as typeof fetch,
    now: () => new Date('2026-10-21T00:00:00.000Z'),
  });
}

async function request(dependencies: AppPackageApiDependencies, pathname: string, method: string, body?: unknown, desktopAuthority = true) {
  const result = { statusCode: 0, body: '' };
  const response = { writeHead(status: number) { result.statusCode = status; }, end(text: string) { result.body = text; } };
  const incoming = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(incoming, { headers: desktopAuthority ? { 'x-cats-desktop-apps': desktopAppsKey } : {}, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(await routeAppPackageApi({ request: incoming as never, response: response as never,
    url: new URL(`http://localhost${pathname}`), method, dependencies }), true);
  return { status: result.statusCode, payload: JSON.parse(result.body) };
}

test('the App Market is Desktop-only and installs from the signed catalog', async () => {
  const chatStatePath = path.join(await mkdtemp(path.join(tmpdir(), 'cats-app-market-')), 'state', 'chat-state.local.json');
  const dependencies: AppPackageApiDependencies = { config: { chatStatePath }, desktopAppsKey, appCatalog: catalogClient() };

  for (const [pathname, method] of [['/api/apps/_market', 'GET'], ['/api/apps/_market/install', 'POST']] as const) {
    const denied = await request(dependencies, pathname, method, method === 'POST' ? { id: 'cats.studio' } : undefined, false);
    assert.deepEqual([denied.status, denied.payload.error.code], [403, 'desktop_app_management_required']);
  }

  const listed = await request(dependencies, '/api/apps/_market?refresh=1', 'GET');
  assert.equal(listed.status, 200);
  assert.deepEqual([listed.payload.status, listed.payload.revision], ['fresh', 10]);
  assert.deepEqual(listed.payload.apps.map((app: { id: string; action: string; permissions: string[] }) => [app.id, app.action, app.permissions]),
    [['cats.studio', 'install', ['ui.route', 'ui.lobby', 'media.images']]]);

  assert.equal((await request(dependencies, '/api/apps/_market', 'POST', { id: 'cats.studio' })).status, 405);
  assert.deepEqual((await request(dependencies, '/api/apps/_market/install', 'POST', { id: 'cats.unknown' })).payload.error.code, 'app_not_in_catalog');
  assert.equal((await request(dependencies, '/api/apps/_market/install', 'POST', {})).status, 400);

  const installed = await request(dependencies, '/api/apps/_market/install', 'POST', { id: 'cats.studio' });
  assert.equal(installed.status, 201);
  assert.deepEqual([installed.payload.app.id, installed.payload.app.version, installed.payload.app.enabled], ['cats.studio', '0.2.1', true]);
  const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
  assert.equal((await registry.getInstalledApp('cats.studio'))?.packageSource, 'local-package');

  const again = await request(dependencies, '/api/apps/_market/install', 'POST', { id: 'cats.studio' });
  assert.deepEqual([again.status, again.payload.error.code], [409, 'app_already_installed']);
  assert.equal((await request(dependencies, '/api/apps/_market', 'GET')).payload.apps[0].action, 'installed');
});
