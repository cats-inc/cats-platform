import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer as createPlatformServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { probePlatformIngress } from '../scripts/testing/check-platform-ingress.mjs';

function createRuntimeClientStub(runtimeBaseUrl) {
  return {
    async getHealth() {
      return {
        baseUrl: runtimeBaseUrl,
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

async function withRuntimeStub(callback) {
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/health') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({
        status: 'ok',
        service: 'cats-runtime',
      }));
      return;
    }

    if (
      url.pathname === '/'
      || url.pathname === '/setup'
      || url.pathname === '/dashboard'
    ) {
      if (url.pathname === '/dashboard' && url.searchParams.get('bootstrap') === '1') {
        response.writeHead(302, {
          location: '/setup',
        });
        response.end();
        return;
      }

      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      });
      response.end([
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head><title>runtime</title></head>',
        '<body><a href="/dashboard">Dashboard</a></body>',
        '</html>',
      ].join('\n'));
      return;
    }

    response.writeHead(404, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({
      error: {
        code: 'not_found',
      },
    }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve runtime stub address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function withPlatformServer(runtimeBaseUrl, callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'cats-platform-ingress-smoke-'));
  const chatStatePath = path.join(tempRoot, 'platform', 'state', 'chat-state.local.json');
  const server = createPlatformServer({
    shared: {
      config: {
        host: '127.0.0.1',
        port: 8181,
        runtimeBaseUrl,
        runtimeApiKey: '',
        chatStatePath,
      },
      runtimeClient: createRuntimeClientStub(runtimeBaseUrl),
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
    throw new Error('Failed to resolve platform test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test('platform ingress smoke helper verifies the same-origin runtime seam', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, async (baseUrl) => {
      const result = await probePlatformIngress({ baseUrl });

      assert.equal(result.baseUrl, baseUrl);
      assert.equal(result.ingress.runtimeIngress.rootPath, '/runtime');
      assert.equal(result.ingress.runtimeIngress.apiBasePath, '/runtime/api');
      assert.deepEqual(
        result.checks.map((check) => check.label),
        [
          'GET /health',
          'GET /api/platform/ingress',
          'GET /runtime',
          'GET /runtime/setup',
          'GET /runtime/dashboard?bootstrap=1',
          'GET /runtime/api/health',
        ],
      );
      assert.deepEqual(
        result.checks.map((check) => check.status),
        [200, 200, 200, 200, 302, 200],
      );
      assert.equal(result.checks[4]?.location, '/runtime/setup');
    });
  });
});
