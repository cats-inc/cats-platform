import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreArtifact } from '../src/core/model/planningRecords.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { routeArtifactCanvasApi } from '../src/products/shared/artifactCanvas/api.ts';

function createCanvasStore() {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-canvas',
    title: 'Canvas conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-canvas',
    title: 'Canvas task',
    status: 'in_progress',
    conversationId: 'conversation-canvas',
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-preview',
    title: 'Preview',
    kind: 'preview',
    status: 'ready',
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
    path: 'http://127.0.0.1:4321/preview',
    metadata: {
      codeArtifactDeclaration: {
        producerKind: 'agent',
        producerIdentity: 'actor:cat-canvas',
        location: { kind: 'url', value: 'http://127.0.0.1:4321/preview' },
        idempotency: {
          producerKind: 'agent',
          producerIdentity: 'actor:cat-canvas',
        },
      },
    },
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-summary',
    title: 'Summary',
    kind: 'report',
    status: 'ready',
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
    summary: 'No inline viewer yet.',
    metadata: {
      codeArtifactDeclaration: {
        producerKind: 'agent',
        producerIdentity: 'actor:cat-canvas',
        location: { kind: 'inline_summary', value: 'No inline viewer yet.' },
      },
    },
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-credential-url',
    title: 'Credential URL',
    kind: 'preview',
    status: 'ready',
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
    path: 'https://user:pass@example.com/preview',
  }).core;
  return new MemoryCoreStore(core);
}

function createTestServer(store: MemoryCoreStore) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeArtifactCanvasApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: { coreStore: store },
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
}

async function request(server: ReturnType<typeof createServer>, path: string) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) as Record<string, unknown> : null,
  };
}

test('GET /api/canvas returns a surface-scoped preview projection without writing state', async (t) => {
  const store = createCanvasStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const before = await store.readCore();
  const result = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-preview',
  );
  const after = await store.readCore();

  assert.equal(result.status, 200);
  assert.equal(result.payload?.presentationRequested, 'auto');
  assert.equal(result.payload?.presentationResolved, 'iframe');
  assert.equal(result.payload?.safeUrl, 'http://127.0.0.1:4321/preview');
  assert.deepEqual(result.payload?.surface, {
    kind: 'code_task',
    surfaceId: 'task-canvas',
  });
  assert.equal(
    (result.payload?.iframeSandboxProfile as { name?: string } | undefined)?.name,
    'static',
  );
  assert.deepEqual(after.activities, before.activities);
});

test('GET /api/canvas surfaces missing, anchor, presentation, and URL policy errors', async (t) => {
  const store = createCanvasStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const missing = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-missing',
  );
  assert.equal(missing.status, 404);
  assert.equal(
    (missing.payload?.error as { code?: string } | undefined)?.code,
    'artifact_canvas_artifact_not_found',
  );

  const foreignSurface = await request(
    server,
    '/api/canvas/code_task/task-foreign/artifacts/artifact-preview',
  );
  assert.equal(foreignSurface.status, 422);
  assert.equal(
    (foreignSurface.payload?.error as { code?: string } | undefined)?.code,
    'artifact_canvas_artifact_not_anchored',
  );

  const unsupportedPresentation = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-summary/view/iframe',
  );
  assert.equal(unsupportedPresentation.status, 422);
  assert.equal(
    (unsupportedPresentation.payload?.error as { code?: string } | undefined)?.code,
    'artifact_canvas_presentation_unsupported',
  );

  const credentialUrl = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-credential-url',
  );
  assert.equal(credentialUrl.status, 422);
  assert.equal(
    (credentialUrl.payload?.error as { code?: string } | undefined)?.code,
    'artifact_canvas_url_credentials_not_allowed',
  );
});

test('GET /api/canvas auto projection can render an unsupported metadata pane', async (t) => {
  const store = createCanvasStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const result = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-summary',
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload?.presentationRequested, 'auto');
  assert.equal(result.payload?.presentationResolved, 'unsupported');
  assert.equal(result.payload?.safeUrl, null);
  assert.equal(
    (result.payload?.error as { code?: string } | undefined)?.code,
    'artifact_canvas_presentation_unsupported',
  );
});
