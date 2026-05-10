import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../src/app/server/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';

const BASE_CONFIG = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: 'runtime-api-secret-that-must-not-leak',
  chatStatePath: 'private-chat-state-path-that-must-not-leak',
  mobilePairingEnabled: true,
  mobileBundleRoot: 'unused-for-tests',
};

test('mobile manifest and bundle routes do not append product data or credentials', async () => {
  await withServer(async (baseUrl, { mobileBundleRoot }) => {
    await seedMobileBundle(mobileBundleRoot);

    const diagnosticResponse = await fetch(`${baseUrl}/api/mobile/manifest`, {
      headers: { 'expo-platform': 'ios' },
    });
    const diagnosticManifest = await diagnosticResponse.json();
    const expoResponse = await fetch(`${baseUrl}/`, {
      headers: {
        accept: 'application/expo+json',
        'expo-platform': 'ios',
      },
    });
    const expoManifest = await expoResponse.json();
    const bundleResponse = await fetch(diagnosticManifest.bundle.url);
    const combined = [
      JSON.stringify(diagnosticManifest),
      JSON.stringify(expoManifest),
      await bundleResponse.text(),
    ].join('\n');

    assert.equal(diagnosticResponse.status, 200);
    assert.equal(expoResponse.status, 200);
    assert.equal(bundleResponse.status, 200);
    assert.doesNotMatch(combined, /runtime-api-secret-that-must-not-leak/u);
    assert.doesNotMatch(combined, /private-chat-state-path-that-must-not-leak/u);
    assert.doesNotMatch(combined, /auth-state\.local\.json/u);
    assert.doesNotMatch(combined, /auth-recovery-token\.local\.txt/u);
    assert.doesNotMatch(combined, /cats_session/u);
    assert.doesNotMatch(combined, /bearer/i);
    assert.doesNotMatch(combined, /owner@example\.test/u);
    assert.doesNotMatch(combined, /conversation-private/u);
  });
});

async function seedMobileBundle(root: string): Promise<void> {
  const iosBundlePath = path.join(root, '_expo', 'static', 'js', 'ios', 'entry-ios.hbc');
  await mkdir(path.dirname(iosBundlePath), { recursive: true });
  await writeFile(iosBundlePath, Buffer.from('console.log("cats mobile shell");'));
  await writeFile(
    path.join(root, 'metadata.json'),
    `${JSON.stringify({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        ios: {
          bundle: '_expo/static/js/ios/entry-ios.hbc',
          assets: [],
        },
      },
    })}\n`,
    'utf8',
  );
}

async function withServer(
  callback: (baseUrl: string, paths: { mobileBundleRoot: string }) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'cats-mobile-security-'));
  const mobileBundleRoot = path.join(tempRoot, 'mobile');
  const server = createServer({
    shared: {
      config: {
        ...BASE_CONFIG,
        mobileBundleRoot,
      } as never,
      runtimeClient: createRuntimeStub() as never,
      now: () => new Date('2026-05-10T00:00:00.000Z'),
    },
    chat: {
      chatStore: new MemoryChatStore(),
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address.');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`, { mobileBundleRoot });
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempRoot, { recursive: true, force: true });
  }
}

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
