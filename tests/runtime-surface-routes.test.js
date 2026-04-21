import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import test from 'node:test';

import { createServer as createPlatformServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

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
    let body = '';
    for await (const chunk of request) {
      body += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    }

    if (
      url.pathname === '/'
      || url.pathname === '/setup'
      || url.pathname === '/dashboard'
      || url.pathname === '/playground'
    ) {
      if (
        url.pathname !== '/setup'
        && url.searchParams.get('bootstrap') === '1'
      ) {
        response.writeHead(302, {
          location: '/setup',
        });
        response.end();
        return;
      }

      const label = url.pathname.slice(1) || 'root';
      const html = [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        `  <title>${label}</title>`,
        '</head>',
        '<body>',
        '  <a id="surface-dashboard" href="/dashboard">Dashboard</a>',
        '  <a id="surface-setup-query" href="/setup?welcome=1">Setup</a>',
        "  <a id=\"surface-playground-single\" href='/playground'>Playground</a>",
        '  <a id="home" href="/">Home</a>',
        '  <script>window.surfaceDescriptors = {"href":"/setup"};</script>',
        '</body>',
        '</html>',
      ].join('\n');
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      });
      response.end(html);
      return;
    }

    if (url.pathname === '/setup-state') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({
        upstream: {
          path: `${url.pathname}${url.search}`,
          authorization: request.headers.authorization ?? '',
        },
      }));
      return;
    }

    if (url.pathname === '/setup-scan') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({
        upstream: {
          method: request.method ?? 'GET',
          path: `${url.pathname}${url.search}`,
          authorization: request.headers.authorization ?? '',
          body,
        },
      }));
      return;
    }

    if (url.pathname === '/sessions/session-1/stream') {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      });
      response.write('data: {"type":"ready"}\n\n');
      response.end();
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

async function withSlowSetupScanRuntimeStub(callback) {
  const requestReceived = Promise.withResolvers();
  const requestClosed = Promise.withResolvers();
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/setup-scan' && url.searchParams.get('slow') === '1') {
      requestReceived.resolve();
      response.on('close', () => {
        requestClosed.resolve();
      });
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
    await callback(`http://127.0.0.1:${address.port}`, {
      requestReceived: requestReceived.promise,
      requestClosed: requestClosed.promise,
    });
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
}

async function withPlatformServer(runtimeBaseUrl, runtimeApiKey, callback, configOverrides = {}) {
  const server = createPlatformServer({
    shared: {
      config: {
        host: '127.0.0.1',
        port: 8181,
        runtimeBaseUrl,
        runtimeApiKey,
        chatStatePath: 'unused-for-tests',
        ...configOverrides,
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
  }
}

function rejectAfter(ms, message) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

test('GET /runtime/setup serves a platform-hosted runtime surface', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, '', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/setup`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /text\/html/u);

      const html = await response.text();
      assert.match(html, /data-cats-runtime-platform-proxy/u);
      assert.match(html, /id="surface-dashboard" href="\/runtime\/dashboard"/u);
      assert.match(html, /"href":"\/runtime\/setup"/u);
      assert.match(
        html,
        /id="surface-setup-query" href="\/runtime\/setup\?welcome=1"/u,
      );
      assert.match(
        html,
        /id="surface-playground-single" href='\/runtime\/playground'/u,
      );
      assert.match(html, /id="home" href="\/"/u);
      assert.doesNotMatch(html, /id="home" href="\/runtime"/u);
    });
  });
});

test('GET /runtime serves a platform-hosted runtime root surface', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, '', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /text\/html/u);

      const html = await response.text();
      assert.match(html, /<title>root<\/title>/u);
      assert.match(html, /data-cats-runtime-platform-proxy/u);
      assert.match(html, /id="surface-dashboard" href="\/runtime\/dashboard"/u);
    });
  });
});

test('GET /runtime/dashboard rewrites runtime bootstrap redirects onto platform ingress', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, '', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/dashboard?bootstrap=1`, {
        redirect: 'manual',
      });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/runtime/setup');
    });
  });
});

test('POST /runtime/api/setup-scan forwards body and fallback runtime auth', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, 'platform-secret', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/api/setup-scan?manual=true`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ manual: true }),
      });
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.deepEqual(payload, {
        upstream: {
          method: 'POST',
          path: '/setup-scan?manual=true',
          authorization: 'Bearer platform-secret',
          body: '{"manual":true}',
        },
      });
    });
  });
});

test('POST /runtime/api/setup-scan aborts the upstream runtime request when the caller aborts', async () => {
  await withSlowSetupScanRuntimeStub(async (runtimeBaseUrl, slowRuntime) => {
    await withPlatformServer(runtimeBaseUrl, '', async (platformBaseUrl) => {
      const controller = new AbortController();
      const request = fetch(`${platformBaseUrl}/runtime/api/setup-scan?slow=1`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ manual: true }),
        signal: controller.signal,
      });

      await Promise.race([
        slowRuntime.requestReceived,
        rejectAfter(500, 'runtime did not receive setup-scan'),
      ]);
      controller.abort();

      await assert.rejects(
        request,
        /aborted|AbortError/u,
      );
      await Promise.race([
        slowRuntime.requestClosed,
        rejectAfter(500, 'runtime setup-scan was not aborted'),
      ]);
    });
  });
});

test('POST /runtime/api/setup-scan times out hung upstream runtime requests', async () => {
  await withSlowSetupScanRuntimeStub(async (runtimeBaseUrl, slowRuntime) => {
    await withPlatformServer(runtimeBaseUrl, '', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/api/setup-scan?slow=1`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ manual: true }),
      });

      assert.equal(response.status, 504);
      const payload = await response.json();
      assert.equal(payload.error?.code, 'runtime_proxy_timeout');
      await Promise.race([
        slowRuntime.requestClosed,
        rejectAfter(500, 'runtime setup-scan was not closed after timeout'),
      ]);
    }, {
      runtimeSetupProxyTimeoutMs: 5,
    });
  });
});

test('GET /runtime/api/setup-state preserves caller auth when present', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, 'platform-secret', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/api/setup-state`, {
        headers: {
          authorization: 'Bearer caller-secret',
        },
      });
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.deepEqual(payload, {
        upstream: {
          path: '/setup-state',
          authorization: 'Bearer caller-secret',
        },
      });
    });
  });
});

test('GET /runtime/api streams runtime SSE responses', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, '', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/api/sessions/session-1/stream`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /text\/event-stream/u);
      assert.equal(await response.text(), 'data: {"type":"ready"}\n\n');
    });
  });
});

test('GET /runtime/api rejects paths that are not on the proxy allow-list', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, 'platform-secret', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/api/not-allowlisted`);
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type') || '', /application\/json/u);

      const payload = await response.json();
      assert.equal(payload.error?.code, 'runtime_proxy_path_not_allowed');
    });
  });
});

test('GET /runtime/api rejects the bare prefix without forwarding to the runtime root', async () => {
  await withRuntimeStub(async (runtimeBaseUrl) => {
    await withPlatformServer(runtimeBaseUrl, '', async (platformBaseUrl) => {
      const response = await fetch(`${platformBaseUrl}/runtime/api`);
      assert.equal(response.status, 404);

      const payload = await response.json();
      assert.equal(payload.error?.code, 'runtime_proxy_path_not_allowed');
    });
  });
});
