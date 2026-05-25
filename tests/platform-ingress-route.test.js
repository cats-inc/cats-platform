import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

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
    async getProviderDiagnostics() {
      return {
        probe: 'light',
        providers: [],
      };
    },
  };
}

async function withServer(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'cats-platform-ingress-route-'));
  const chatStatePath = path.join(tempRoot, 'platform', 'state', 'chat-state.local.json');
  const server = createServer({
    shared: {
      config: {
        host: '127.0.0.1',
        port: 8181,
        runtimeBaseUrl: 'http://127.0.0.1:3110',
        runtimeApiKey: '',
        chatStatePath,
      },
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-04-20T00:00:00.000Z'),
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
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test('GET /api/platform/ingress returns a machine-readable trusted ingress summary', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/ingress`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.trustedAccessOnly, true);
    assert.deepEqual(payload.binding, {
      host: '127.0.0.1',
      port: 8181,
      mode: 'loopback',
      canReachFromLan: false,
    });
    assert.equal(payload.runtimeIngress.rootPath, '/runtime');
    assert.equal(payload.runtimeIngress.apiBasePath, '/runtime/api');
    assert.deepEqual(payload.urls.localUrls, ['http://127.0.0.1:8181']);
    assert.deepEqual(payload.urls.lanUrls, []);
    assert.deepEqual(payload.urls.overlayUrls, []);
  });
});
