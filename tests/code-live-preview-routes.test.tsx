import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { routeCodeLivePreviewApi } from '../src/products/code/api/livePreviewRoutes.ts';
import type { LivePreviewLease } from '../src/products/code/livePreview/contracts.ts';
import { InMemoryLivePreviewLeaseStore } from '../src/products/code/livePreview/leaseStore.ts';

test('Code live-preview API lists and filters lease projections', async (t) => {
  const store = createStore();
  const server = createTestServer({ livePreviewStore: store });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const all = await request(server, '/api/code/live-previews');
  assert.equal(all.status, 200);
  assert.deepEqual(
    (all.payload?.previews as Array<{ previewId: string }>).map((preview) => preview.previewId),
    ['preview-2', 'preview-1'],
  );

  const filtered = await request(
    server,
    '/api/code/live-previews?surfaceKind=code_task&surfaceId=task-1',
  );
  assert.equal(filtered.status, 200);
  assert.deepEqual(
    (filtered.payload?.previews as Array<{ previewId: string }>).map((preview) => preview.previewId),
    ['preview-1'],
  );
});

test('Code live-preview API reads detail and bounded logs', async (t) => {
  const store = createStore();
  const server = createTestServer({ livePreviewStore: store });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const detail = await request(server, '/api/code/live-previews/preview-1');
  assert.equal(detail.status, 200);
  assert.equal(detail.payload?.previewId, 'preview-1');
  assert.equal(detail.payload?.status, 'ready');
  assert.equal(detail.payload?.logs, 'ready\n');

  const logs = await request(server, '/api/code/live-previews/preview-1/logs');
  assert.equal(logs.status, 200);
  assert.deepEqual(logs.payload, { previewId: 'preview-1', logs: 'ready\n' });
});

test('Code live-preview API stops previews through product-owned dependency', async (t) => {
  const store = createStore();
  const server = createTestServer({
    livePreviewStore: store,
    stopLivePreview: async (previewId, reason) => {
      const stoppedAt = '2026-05-09T00:00:10.000Z';
      store.updateLease(previewId, (lease) => ({
        ...lease,
        status: 'stopped',
        stopReason: reason ?? 'api_stop',
        stoppedAt,
      }));
      return {
        status: 'accepted',
        previewId,
        stopReason: reason ?? 'api_stop',
      };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const stopped = await request(server, '/api/code/live-previews/preview-1/stop', 'POST');
  assert.equal(stopped.status, 200);
  assert.deepEqual(stopped.payload, {
    status: 'accepted',
    previewId: 'preview-1',
    stopReason: 'api_stop',
  });
  assert.equal(store.getLease('preview-1')?.status, 'stopped');
});

test('Code live-preview API handles unavailable and not-found cases', async (t) => {
  const unavailable = createTestServer({});
  await new Promise<void>((resolve) => unavailable.listen(0, resolve));
  t.after(() => unavailable.close());

  const missingStore = await request(unavailable, '/api/code/live-previews');
  assert.equal(missingStore.status, 503);
  assert.equal(
    (missingStore.payload?.error as { code?: string } | undefined)?.code,
    'live_preview_unavailable',
  );

  const store = createStore();
  const server = createTestServer({ livePreviewStore: store });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const missing = await request(server, '/api/code/live-previews/missing');
  assert.equal(missing.status, 404);

  const method = await request(server, '/api/code/live-previews/preview-1', 'POST');
  assert.equal(method.status, 405);
});

function createStore(): InMemoryLivePreviewLeaseStore {
  const store = new InMemoryLivePreviewLeaseStore();
  store.upsertLease(createLease('preview-1', 'code_task', 'task-1', '2026-05-09T00:00:00.000Z'));
  store.upsertLease(createLease('preview-2', 'code_codespace', 'space-1', '2026-05-09T00:00:01.000Z'));
  store.setLogs('preview-1', 'ready\n');
  return store;
}

function createLease(
  previewId: string,
  surfaceKind: LivePreviewLease['surface']['kind'],
  surfaceId: string,
  createdAt: string,
): LivePreviewLease {
  return {
    previewId,
    commandProfileId: 'vite',
    surface: { kind: surfaceKind, surfaceId },
    workspaceRef: {
      kind: 'code_workspace',
      id: 'workspace-1',
      rootPath: 'C:/repo/app',
    },
    origin: 'http://127.0.0.1:47100',
    host: '127.0.0.1',
    port: 47_100,
    processId: 123,
    status: 'ready',
    logPath: `live-preview/${previewId}.log`,
    artifactId: null,
    createdAt,
    readyAt: createdAt,
    expiresAt: '2026-05-09T00:30:00.000Z',
    stoppedAt: null,
    stopReason: null,
  };
}

function createTestServer(dependencies: Record<string, unknown>) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeCodeLivePreviewApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: dependencies as never,
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
}

async function request(
  server: ReturnType<typeof createServer>,
  path: string,
  method = 'GET',
) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method });
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) as Record<string, unknown> : null,
  };
}
