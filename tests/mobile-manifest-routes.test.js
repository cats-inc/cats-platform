import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
  mobilePairingEnabled: true,
  mobileBundleRoot: 'unused-for-tests',
};

function createRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {};
    },
  };
}

async function seedMobileBundle(root) {
  const iosBundlePath = path.join(root, '_expo', 'static', 'js', 'ios', 'entry-ios.hbc');
  const androidBundlePath = path.join(root, '_expo', 'static', 'js', 'android', 'entry-android.hbc');
  const iosAssetPath = path.join(root, 'assets', 'assetioshash');
  const androidAssetPath = path.join(root, 'assets', 'assetandroidhash');

  await mkdir(path.dirname(iosBundlePath), { recursive: true });
  await mkdir(path.dirname(androidBundlePath), { recursive: true });
  await mkdir(path.dirname(iosAssetPath), { recursive: true });
  await writeFile(iosBundlePath, Buffer.from('ios-bundle'));
  await writeFile(androidBundlePath, Buffer.from('android-bundle'));
  await writeFile(iosAssetPath, Buffer.from('ios-asset'));
  await writeFile(androidAssetPath, Buffer.from('android-asset'));
  await writeFile(
    path.join(root, 'metadata.json'),
    `${JSON.stringify({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        ios: {
          bundle: '_expo\\static\\js\\ios\\entry-ios.hbc',
          assets: [{ path: 'assets\\assetioshash', ext: 'png' }],
        },
        android: {
          bundle: '_expo\\static\\js\\android\\entry-android.hbc',
          assets: [{ path: 'assets\\assetandroidhash', ext: 'png' }],
        },
      },
    })}\n`,
    'utf8',
  );
}

async function withServer(configOverrides, callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'cats-mobile-routes-'));
  const mobileBundleRoot = path.join(tempRoot, 'mobile');
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        ...configOverrides,
        mobileBundleRoot: configOverrides.mobileBundleRoot ?? mobileBundleRoot,
      },
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-04-30T00:00:00.000Z'),
    },
    chat: {
      chatStore: new MemoryChatStore(),
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`, { mobileBundleRoot });
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test('mobile pairing routes are hidden when the feature flag is off', async () => {
  await withServer({ mobilePairingEnabled: false }, async (baseUrl) => {
    const manifest = await fetch(`${baseUrl}/api/mobile/manifest`, {
      headers: { 'expo-platform': 'ios' },
    });
    const bundle = await fetch(`${baseUrl}/api/mobile/bundle/ios/entry-ios.hbc`);

    assert.equal(manifest.status, 404);
    assert.equal(bundle.status, 404);
  });
});

test('mobile manifest diagnostics echo Expo headers and request-host asset URLs', async () => {
  await withServer({}, async (baseUrl, { mobileBundleRoot }) => {
    await seedMobileBundle(mobileBundleRoot);

    const manifestResponse = await fetch(`${baseUrl}/api/mobile/manifest`, {
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '54.0.0',
        'expo-protocol-version': '1',
      },
    });
    const manifest = await manifestResponse.json();

    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get('cache-control'), 'no-store');
    assert.equal(manifest.schema, 'cats.mobilePairing.diagnostic.v1');
    assert.equal(manifest.generatedAt, '2026-04-30T00:00:00.000Z');
    assert.equal(manifest.platform, 'ios');
    assert.equal(manifest.requestHeaders.expoRuntimeVersion, '54.0.0');
    assert.equal(manifest.bundle.fileName, 'entry-ios.hbc');
    assert.equal(manifest.bundle.url, `${baseUrl}/api/mobile/bundle/ios/entry-ios.hbc`);
    assert.equal(manifest.assets[0].url, `${baseUrl}/api/mobile/assets/assetioshash`);

    const bundleResponse = await fetch(manifest.bundle.url);
    assert.equal(bundleResponse.status, 200);
    assert.equal(bundleResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(bundleResponse.headers.get('content-type'), 'application/octet-stream');
    assert.equal(await bundleResponse.text(), 'ios-bundle');

    const assetResponse = await fetch(manifest.assets[0].url);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(assetResponse.headers.get('content-type'), 'image/png');
    assert.equal(await assetResponse.text(), 'ios-asset');
  });
});

test('mobile manifest diagnostics require an Expo platform header', async () => {
  await withServer({}, async (baseUrl, { mobileBundleRoot }) => {
    await seedMobileBundle(mobileBundleRoot);

    const response = await fetch(`${baseUrl}/api/mobile/manifest`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(payload.error.code, 'unsupported_mobile_platform');
  });
});

test('mobile pairing routes 404 cleanly when the mobile export is absent', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/manifest`, {
      headers: { 'expo-platform': 'ios' },
    });
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.error.code, 'mobile_bundle_not_found');
  });
});
