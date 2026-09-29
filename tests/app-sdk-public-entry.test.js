import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import * as sdk from '@cats-inc/cats-platform/app-sdk';
import { APP_SDK_VERSION as HOST_SDK_VERSION, PLATFORM_VERSION, sha256 } from '#cats-app-package';
import { validateRendererPackage } from '../build/server/platform/apps/packageInstaller.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const PUBLIC_NAMES = [
  'APP_SDK_VERSION', 'CATS_APP_CATEGORIES', 'CATS_APP_MANIFEST_SCHEMA_VERSION', 'CATS_APP_PERMISSIONS',
  'CATS_APP_TRUST_TIERS', 'MAX_PACKAGE_BYTES', 'decodeAppPackage', 'encodeAppPackage',
  'parseCatsAppManifestV1', 'supportsVersion', 'validateRendererAppPackage',
];

const appManifest = (overrides = {}) => ({
  schemaVersion: 1, id: 'cats.example', displayName: 'Example', version: '0.1.0',
  category: 'user-app', trustTier: 'local-user', publisher: { name: 'Test' },
  compatibility: { catsPlatform: PLATFORM_VERSION, appSdk: HOST_SDK_VERSION },
  entrypoints: { renderer: 'renderer/index.html' },
  contributions: { lobbyApps: [{ id: 'example', title: 'Example', routePath: '/apps/cats.example' }] },
  permissions: ['ui.route', 'ui.lobby'],
  ...overrides,
});
const appFiles = () => [
  { path: 'renderer/index.html', data: Buffer.from('<html><head></head><body>Example</body></html>') },
  { path: 'LICENSE', data: Buffer.from('MIT') },
];

test('the ./app-sdk subpath exposes exactly the allowlisted contract', () => {
  assert.deepEqual(Object.keys(sdk).sort(), PUBLIC_NAMES);
  for (const hostOnly of ['PLATFORM_VERSION', 'readBrowserSdk', 'parseAppLock', 'resolveAppLock', 'materializeAppSelection', 'sha256']) {
    assert.equal(hostOnly in sdk, false, hostOnly);
  }
});

test('exports allow only the SDK entry, the manifest and the existing main', () => {
  const { exports } = manifestJson;
  // Adding a public path is a feature; removing one needs a minor release (ADR-123).
  assert.deepEqual(Object.keys(exports), ['.', './package.json', './app-sdk']);
  assert.equal(exports['.'], `./${manifestJson.main}`);
  assert.equal(exports['./package.json'], './package.json');
  assert.deepEqual(exports['./app-sdk'], { types: './build/server/app-sdk/index.d.ts', default: './build/server/app-sdk/index.js' });
  // cats-one locates the Platform bin through the package manifest.
  const requireFromHere = createRequire(import.meta.url);
  assert.equal(requireFromHere.resolve('@cats-inc/cats-platform/package.json'), path.join(root, 'package.json'));
  assert.throws(() => requireFromHere.resolve('@cats-inc/cats-platform/packages/app-sdk/package.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});

test('the public entry loads only the package format, encoder and manifest validation', async () => {
  const allowedBare = new Set(['fflate']);
  const expected = [
    'build/server/app-sdk/index.js', 'build/server/app-sdk/packageValidation.js',
    'build/server/shared/catsAppManifest.js', 'build/server/shared/catsAppValidation.js',
    'packages/app-sdk/encode.js', 'packages/app-sdk/format.js',
  ];
  const seen = new Set();
  const pending = [path.join(root, 'build/server/app-sdk/index.js')];
  while (pending.length > 0) {
    const file = pending.pop();
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (seen.has(relative)) continue;
    seen.add(relative);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bimport\s*\(/u, `${relative} must not load modules dynamically`);
    const specifiers = [...source.matchAll(/(?:\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]/gu)].map((match) => match[1]);
    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) continue;
      if (specifier.startsWith('#')) pending.push(path.join(root, manifestJson.imports[specifier]));
      else if (specifier.startsWith('.')) pending.push(path.resolve(path.dirname(file), specifier));
      else assert.ok(allowedBare.has(specifier), `${relative} imports ${specifier}`);
    }
  }
  assert.deepEqual([...seen].sort(), expected);
});

test('the SDK version has one value across the format, its package and the browser typings', async () => {
  const sdkPackage = JSON.parse(await readFile(path.join(root, 'packages/app-sdk/package.json'), 'utf8'));
  const browserTypes = await readFile(path.join(root, 'packages/app-sdk/browser.d.ts'), 'utf8');
  assert.equal(sdk.APP_SDK_VERSION, sdkPackage.version);
  assert.equal(HOST_SDK_VERSION, sdkPackage.version);
  assert.match(browserTypes, new RegExp(`readonly sdkVersion: '${sdkPackage.version.replace(/\./g, '\\.')}';`, 'u'));
});

test('the encoder is canonical, deterministic across hosts and accepted by the installer', () => {
  const golden = sdk.encodeAppPackage({
    manifest: { id: 'cats.golden', version: '1.0.0', entrypoints: { renderer: 'index.html' } },
    files: [{ path: 'index.html', data: Buffer.from('<html><head></head><body>Golden</body></html>') }],
  });
  // A pure-JS deflate at the pinned fflate version; any change here changes every App's bytes.
  assert.equal(sha256(golden), 'e20ebbae12021e0a048d192390852c162f865bfed84be5a9b58e09966a2041bf');
  assert.equal(golden.subarray(0, 10).toString('hex'), '1f8b0800000000000203', 'gzip header carries no time or OS');

  const reverseKeys = (value) => (Array.isArray(value) ? value.map(reverseKeys)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reverseKeys(value[key])]))
      : value);
  const bytes = sdk.encodeAppPackage({ manifest: appManifest(), files: appFiles() });
  assert.equal(bytes.equals(sdk.encodeAppPackage({ manifest: reverseKeys(appManifest()), files: appFiles().reverse() })), true);
  const envelope = JSON.parse(gunzipSync(bytes).toString('utf8'));
  assert.deepEqual(envelope.files.map((file) => file.path), ['LICENSE', 'renderer/index.html']);
  assert.deepEqual(Object.keys(envelope.manifest), Object.keys(appManifest()).sort());

  const decoded = sdk.decodeAppPackage(bytes, { id: 'cats.example', version: '0.1.0', sha256: sha256(bytes) });
  assert.equal(decoded.files.find((file) => file.path === 'LICENSE').data.toString(), 'MIT');
  const pin = { id: 'cats.example', version: '0.1.0', sha256: sha256(bytes) };
  assert.equal(validateRendererPackage(bytes, pin).manifest.id, 'cats.example');
  assert.equal(sdk.validateRendererAppPackage(bytes, { platformVersion: PLATFORM_VERSION, pin }).manifest.id, 'cats.example');
});

test('the encoder and public validator reject what the installer rejects', () => {
  const files = appFiles();
  assert.throws(() => sdk.encodeAppPackage({ manifest: appManifest(), files: [...files, { path: 'Renderer/index.html', data: Buffer.from('x') }] }), /duplicate/);
  assert.throws(() => sdk.encodeAppPackage({ manifest: appManifest(), files: [...files, { path: '../escape', data: Buffer.from('x') }] }), /Unsafe/);
  assert.throws(() => sdk.encodeAppPackage({ manifest: appManifest({ extra: undefined }), files }), /JSON values/);
  assert.throws(() => sdk.encodeAppPackage({ manifest: appManifest({ extra: Number.NaN }), files }), /finite/);
  assert.throws(() => sdk.encodeAppPackage({ manifest: appManifest(), files: [{ path: 'renderer/index.html', data: 'text' }] }), /Uint8Array/);

  const denied = sdk.encodeAppPackage({ manifest: appManifest({ permissions: ['ui.route', 'ui.lobby', 'core.write'] }), files });
  const deniedPin = { id: 'cats.example', version: '0.1.0', sha256: sha256(denied) };
  assert.throws(() => validateRendererPackage(denied, deniedPin), /capabilities/);
  assert.throws(() => sdk.validateRendererAppPackage(denied, { platformVersion: PLATFORM_VERSION }), /capabilities/);
  const bytes = sdk.encodeAppPackage({ manifest: appManifest(), files });
  assert.throws(() => sdk.validateRendererAppPackage(bytes, { platformVersion: '0.0.1' }), /Incompatible/);
  assert.throws(() => sdk.validateRendererAppPackage(bytes, { platformVersion: PLATFORM_VERSION, appSdkVersion: '0.0.1' }), /Incompatible/);
});
