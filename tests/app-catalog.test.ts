import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sha256 } from '#cats-app-package';
import { encodeAppPackage } from '#cats-app-encode';
import {
  createAppCatalogClient,
  parseAppCatalogPayload,
  resolveAppCatalogStatePath,
  verifyAppCatalogEnvelope,
  type AppCatalogPayload,
} from '../src/platform/apps/catalog.ts';
import { AppCatalogError, fetchAppCatalogBytes } from '../src/platform/apps/catalogFetch.ts';
import { APP_CATALOG_TRUSTED_KEYS, APP_CATALOG_URL, type AppCatalogTrustedKey } from '../src/platform/apps/catalogTrust.ts';
import { installFromAppMarket, readAppMarket } from '../src/platform/apps/market.ts';
import { installRendererPackage } from '../src/platform/apps/packageInstaller.ts';
import { FileCatsAppRegistry } from '../src/platform/apps/registry.ts';
import { resolveCatsAppStoragePathsFromChatState } from '../src/platform/apps/paths.ts';

const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures', 'app-catalog');
const readFixture = async (name: string) => JSON.parse(await readFile(path.join(fixtureDir, name), 'utf8'));
const vectorKey = await readFixture('test-public-key.json') as AppCatalogTrustedKey;
const vectorEnvelope = await readFixture('envelope.json');
const vectorPayload = await readFixture('payload.json');
const NOW = new Date('2026-10-21T00:00:00.000Z');

function marketKey(keyId = 'test-market') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const trusted: AppCatalogTrustedKey = { keyId, algorithm: 'ed25519', publicKey: publicKey.export({ format: 'jwk' }).x! };
  return { privateKey, trusted };
}

function signPayload(payload: unknown, privateKey: KeyObject, keyId = 'test-market') {
  const bytes = Buffer.from(JSON.stringify(payload));
  return { algorithm: 'ed25519', keyId, payload: bytes.toString('base64'), signature: sign(null, bytes, privateKey).toString('base64') };
}

const releaseUrl = (slug: string, version: string) =>
  `https://github.com/cats-inc/cats-apps/releases/download/${slug}-v${version}/${slug}-${version}.catsapp`;

function studioArtifact(version: string, permissions = ['ui.route', 'ui.lobby', 'media.images']) {
  const manifest = { schemaVersion: 1, id: 'cats.studio', displayName: 'Studio', version, category: 'user-app', trustTier: 'local-user',
    publisher: { name: 'sammykenny2' }, compatibility: { catsPlatform: '^0.6.0', appSdk: '^1.3.0' },
    entrypoints: { renderer: 'renderer/index.html' },
    contributions: { lobbyApps: [{ id: 'studio', title: 'Studio', routePath: '/apps/cats.studio', icon: 'image' }] }, permissions };
  const bytes = encodeAppPackage({ manifest, files: [{ path: 'renderer/index.html', data: Buffer.from(`<html><body>Studio ${version}</body></html>`) }] });
  return { bytes, sha256: sha256(bytes), url: releaseUrl('studio', version) };
}

function catalogPayload(entries: Array<{ version: string; artifact: ReturnType<typeof studioArtifact>; permissions?: string[]; appSdk?: string }>,
  revision = 1792540800, expiresAt = '2026-11-20T00:00:00.000Z'): AppCatalogPayload {
  return {
    schemaVersion: 1, revision, issuedAt: '2026-10-20T00:00:00.000Z', expiresAt,
    publisher: { name: 'sammykenny2' },
    apps: [{
      id: 'cats.studio', displayName: 'Studio', description: 'Image studio', icon: 'image',
      channels: { stable: entries.at(-1)!.version },
      versions: entries.map((entry) => ({
        version: entry.version,
        artifact: { url: entry.artifact.url, size: entry.artifact.bytes.length, sha256: entry.artifact.sha256 },
        compatibility: { catsPlatform: '^0.6.0', appSdk: entry.appSdk ?? '^1.3.0' },
        permissions: entry.permissions ?? ['ui.route', 'ui.lobby', 'media.images'],
        publisher: { name: 'sammykenny2' },
        notes: `Studio ${entry.version}`,
      })),
    }],
  };
}

function fakeFetch(routes: Map<string, () => Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return routes.get(url)?.() ?? new Response('missing', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function profile() {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-app-catalog-'));
  return path.join(root, 'state', 'chat-state.local.json');
}

test('the cats-apps contract vector verifies to its payload', () => {
  assert.deepEqual(verifyAppCatalogEnvelope(vectorEnvelope, [vectorKey]), vectorPayload);
  assert.ok(!APP_CATALOG_TRUSTED_KEYS.some((key) => key.publicKey === vectorKey.publicKey), 'The test-only key must never be trusted.');
  assert.equal(APP_CATALOG_URL, 'https://cats-inc.github.io/cats-apps/catalog/v1/catalog.json');
});

test('signatures fail closed before any payload field is read', () => {
  const tampered = Buffer.from(JSON.stringify({ ...vectorPayload, revision: vectorPayload.revision + 1 })).toString('base64');
  const cases: Array<[unknown, RegExp]> = [
    [{ ...vectorEnvelope, payload: tampered }, /signature is invalid/],
    [{ ...vectorEnvelope, keyId: 'cats-apps-catalog-2026-10' }, /signature is invalid/],
    [{ ...vectorEnvelope, keyId: 'unknown' }, /unknown key/],
    [{ ...vectorEnvelope, algorithm: 'rsa-sha256' }, /Unsupported catalog signature algorithm/],
    [{ ...vectorEnvelope, payload: 'not base64!' }, /malformed/],
    [{ ...vectorEnvelope, signature: Buffer.alloc(10).toString('base64') }, /signature is invalid/],
    [[], /must be an object/],
  ];
  for (const [envelope, message] of cases) {
    assert.throws(() => verifyAppCatalogEnvelope(envelope, [vectorKey, ...APP_CATALOG_TRUSTED_KEYS]), message);
  }
  const { privateKey, trusted } = marketKey();
  assert.throws(() => verifyAppCatalogEnvelope(signPayload({ ...vectorPayload, schemaVersion: 2 }, privateKey), [trusted]),
    (error: unknown) => error instanceof AppCatalogError && error.code === 'catalog_unsupported');
});

test('the payload schema rejects unsafe selections and drops unknown fields', () => {
  const studio = vectorPayload.apps[1];
  const withApp = (app: unknown) => ({ ...vectorPayload, apps: [app] });
  assert.deepEqual(parseAppCatalogPayload({ ...vectorPayload, future: true, apps: [{ ...studio, rating: 5 }] }).apps[0], studio);
  const rejected: Array<[unknown, RegExp]> = [
    [withApp({ ...studio, channels: { stable: '0.2.0' } }), /listed, current version/],
    [withApp({ ...studio, channels: { stable: '9.9.9' } }), /listed, current version/],
    [withApp({ ...studio, versions: [studio.versions[1], studio.versions[1]] }), /repeats a version/],
    [withApp({ ...studio, versions: [{ ...studio.versions[1], artifact: { ...studio.versions[1].artifact, url: 'https://example.com/studio-v0.2.1/studio-0.2.1.catsapp' } }] }), /official release asset/],
    [withApp({ ...studio, versions: [{ ...studio.versions[1], artifact: { ...studio.versions[1].artifact, size: 9 * 1024 * 1024 } }] }), /bytes/],
    [{ ...vectorPayload, apps: [studio, studio] }, /repeats an App ID/],
    [{ ...vectorPayload, expiresAt: vectorPayload.issuedAt }, /must follow issuedAt/],
  ];
  for (const [payload, message] of rejected) assert.throws(() => parseAppCatalogPayload(payload), message);
});

test('downloads follow only HTTPS redirects to GitHub asset hosts within the byte limit', async () => {
  const source = releaseUrl('studio', '0.2.1');
  const asset = 'https://release-assets.githubusercontent.com/github-production-release-asset/1?sig=x';
  const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });
  const ok = fakeFetch(new Map([[source, redirect(asset)], [asset, () => new Response(Buffer.from('package'))]]));
  assert.equal(Buffer.from(await fetchAppCatalogBytes('artifact', source, { maxBytes: 7, timeoutMs: 1000, fetch: ok.fetchImpl })).toString(), 'package');
  assert.deepEqual(ok.calls, [source, asset]);

  const reject = async (kind: 'catalog' | 'artifact', url: string, routes: Map<string, () => Response>, code: string, maxBytes = 100) => {
    await assert.rejects(fetchAppCatalogBytes(kind, url, { maxBytes, timeoutMs: 1000, fetch: fakeFetch(routes).fetchImpl }),
      (error: unknown) => error instanceof AppCatalogError && error.code === code);
  };
  await reject('artifact', source, new Map([[source, redirect('https://evil.example/studio.catsapp')]]), 'download_rejected');
  await reject('artifact', source, new Map([[source, redirect('http://objects.githubusercontent.com/x')]]), 'download_rejected');
  await reject('catalog', APP_CATALOG_URL, new Map([[APP_CATALOG_URL, redirect(asset)]]), 'download_rejected');
  await reject('artifact', source, new Map([[source, () => new Response(Buffer.alloc(101))]]), 'download_rejected');
  await reject('artifact', source, new Map([[source, () => new Response('gone', { status: 404 })]]), 'download_failed');
  await reject('artifact', 'https://github.com/other/repo/releases/download/x-v1.0.0/x-1.0.0.catsapp', new Map(), 'download_rejected');
  await reject('artifact', 'http://github.com/cats-inc/cats-apps/releases/download/studio-v0.2.1/studio-0.2.1.catsapp', new Map(), 'download_rejected');
  await reject('catalog', 'https://localhost/cats-apps/catalog/v1/catalog.json', new Map(), 'download_rejected');
  const loop = new Map<string, () => Response>([[source, redirect(source)]]);
  await reject('artifact', source, loop, 'download_rejected');
});

test('the client caches a verified catalog, refuses rollback and reports expiry', async () => {
  const chatStatePath = await profile();
  const { privateKey, trusted } = marketKey();
  const artifact = studioArtifact('0.2.1');
  let served = signPayload(catalogPayload([{ version: '0.2.1', artifact }], 200), privateKey);
  let failing = false;
  const fetchImpl = (async () => (failing ? Promise.reject(new Error('offline')) : new Response(JSON.stringify(served)))) as typeof fetch;
  let now = NOW;
  const client = createAppCatalogClient({ trustedKeys: [trusted], fetch: fetchImpl, now: () => now });

  const first = await client.load({ chatStatePath });
  assert.equal(first.status, 'fresh');
  assert.equal(first.catalog?.revision, 200);
  assert.equal(first.keyId, 'test-market');
  const state = JSON.parse(await readFile(resolveAppCatalogStatePath(chatStatePath), 'utf8'));
  assert.equal(state.highestRevision, 200);

  served = signPayload(catalogPayload([{ version: '0.2.1', artifact }], 199), privateKey);
  const rollback = await client.load({ chatStatePath, refresh: true });
  assert.equal(rollback.status, 'cached');
  assert.equal(rollback.catalog?.revision, 200);
  assert.equal(rollback.error?.code, 'catalog_rollback');

  failing = true;
  const offline = await client.load({ chatStatePath, refresh: true });
  assert.deepEqual([offline.status, offline.catalog?.revision, offline.error?.message], ['cached', 200, 'Download failed: offline']);

  now = new Date('2026-12-01T00:00:00.000Z');
  assert.equal((await client.load({ chatStatePath })).status, 'expired');

  // A cache that no longer verifies is ignored rather than trusted.
  await writeFile(resolveAppCatalogStatePath(chatStatePath), JSON.stringify({ ...state, envelope: { ...state.envelope, keyId: 'unknown' } }));
  assert.equal((await client.load({ chatStatePath })).status, 'unavailable');
  assert.equal((await createAppCatalogClient({ trustedKeys: [], fetch: fetchImpl, now: () => NOW }).load({ chatStatePath: await profile() })).status, 'unavailable');
});

async function marketSetup(entries: Parameters<typeof catalogPayload>[0]) {
  const chatStatePath = await profile();
  const { privateKey, trusted } = marketKey();
  const routes = new Map<string, () => Response>([[APP_CATALOG_URL, () => new Response(JSON.stringify(signPayload(catalogPayload(entries), privateKey)))]]);
  for (const entry of entries) routes.set(entry.artifact.url, () => new Response(Buffer.from(entry.artifact.bytes)));
  const { fetchImpl, calls } = fakeFetch(routes);
  const client = createAppCatalogClient({ trustedKeys: [trusted], fetch: fetchImpl, now: () => NOW });
  const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
  return { chatStatePath, client, calls, registry };
}

test('the market installs and updates from the verified catalog only', async () => {
  const older = studioArtifact('0.2.0');
  const newer = studioArtifact('0.2.1');
  const { chatStatePath, client, calls, registry } = await marketSetup([{ version: '0.2.0', artifact: older }, { version: '0.2.1', artifact: newer }]);

  assert.deepEqual((await readAppMarket({ chatStatePath, client })).apps.map((app) => [app.id, app.version, app.action, app.installedVersion]),
    [['cats.studio', '0.2.1', 'install', null]]);

  // A local Studio at an older version is offered an update and keeps its enabled state.
  await installRendererPackage({ chatStatePath, bytes: older.bytes, pin: { id: 'cats.studio', version: '0.2.0', sha256: older.sha256 }, source: 'local-package', enable: false });
  assert.equal((await readAppMarket({ chatStatePath, client })).apps[0]!.action, 'update');
  const updated = await installFromAppMarket({ chatStatePath, client, appId: 'cats.studio', now: () => NOW });
  assert.deepEqual([updated.manifest.version, updated.enabled, updated.packageSource, updated.manifest.trustTier], ['0.2.1', false, 'local-package', 'local-user']);
  assert.ok(calls.includes(newer.url));
  const provenance = JSON.parse(await readFile(resolveAppCatalogStatePath(chatStatePath), 'utf8')).installs['cats.studio'];
  assert.deepEqual(provenance, { version: '0.2.1', sha256: newer.sha256, revision: 1792540800, keyId: 'test-market', installedAt: NOW.toISOString() });

  assert.equal((await readAppMarket({ chatStatePath, client })).apps[0]!.action, 'installed');
  await assert.rejects(installFromAppMarket({ chatStatePath, client, appId: 'cats.studio' }), /already installed/);
  await assert.rejects(installFromAppMarket({ chatStatePath, client, appId: 'cats.unknown' }), /not in the App catalog/);

  await registry.uninstallApp('cats.studio');
  const reinstalled = await installFromAppMarket({ chatStatePath, client, appId: 'cats.studio' });
  assert.deepEqual([reinstalled.installState, reinstalled.enabled], ['enabled', true]);
});

test('the market leaves Desktop-bundled Apps and incompatible or mismatched packages alone', async () => {
  const bundled = studioArtifact('0.2.0');
  const current = studioArtifact('0.2.1');
  const managed = await marketSetup([{ version: '0.2.1', artifact: current }]);
  await installRendererPackage({ chatStatePath: managed.chatStatePath, bytes: bundled.bytes, pin: { id: 'cats.studio', version: '0.2.0', sha256: bundled.sha256 }, source: 'desktop-bundle', enable: true });
  await managed.registry.uninstallApp('cats.studio');
  assert.equal((await readAppMarket(managed)).apps[0]!.action, 'managed-by-desktop');
  await assert.rejects(installFromAppMarket({ ...managed, appId: 'cats.studio' }), /provided and updated by Cats Desktop/);

  const future = await marketSetup([{ version: '0.2.1', artifact: current, appSdk: '^9.0.0' }]);
  assert.equal((await readAppMarket(future)).apps[0]!.action, 'incompatible');
  await assert.rejects(installFromAppMarket({ ...future, appId: 'cats.studio' }), /needs a newer Cats Desktop/);
  assert.ok(!future.calls.includes(current.url), 'An incompatible App is never downloaded.');

  const mismatch = await marketSetup([{ version: '0.2.1', artifact: current, permissions: ['ui.route', 'ui.lobby'] }]);
  await assert.rejects(installFromAppMarket({ ...mismatch, appId: 'cats.studio' }), /does not match its catalog entry/);
  assert.equal(await mismatch.registry.getInstalledApp('cats.studio'), null);

  const swapped = await marketSetup([{ version: '0.2.1', artifact: { ...current, bytes: studioArtifact('0.2.1', ['ui.route']).bytes } }]);
  await assert.rejects(installFromAppMarket({ ...swapped, appId: 'cats.studio' }), /size|SHA-256/);
});
