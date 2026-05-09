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
    id: 'artifact-text-url',
    title: 'Server text',
    kind: 'document',
    status: 'ready',
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
    path: 'http://127.0.0.1:4321/output.txt',
    mimeType: 'text/plain',
    metadata: {
      codeArtifactDeclaration: {
        producerKind: 'agent',
        producerIdentity: 'actor:cat-canvas',
        location: {
          kind: 'url',
          value: 'http://127.0.0.1:4321/output.txt',
        },
      },
    },
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-empty',
    title: 'Empty artifact',
    kind: 'report',
    status: 'ready',
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-image',
    title: 'Screenshot',
    kind: 'attachment',
    status: 'ready',
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
    path: 'http://127.0.0.1:4321/screenshot.png',
    mimeType: 'image/png',
    metadata: {
      codeArtifactDeclaration: {
        producerKind: 'agent',
        producerIdentity: 'actor:cat-canvas',
        location: {
          kind: 'url',
          value: 'http://127.0.0.1:4321/screenshot.png',
        },
      },
    },
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-pdf',
    title: 'Report PDF',
    kind: 'report',
    status: 'ready',
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
    path: 'http://127.0.0.1:4321/report.pdf',
    mimeType: 'application/pdf',
    metadata: {
      codeArtifactDeclaration: {
        producerKind: 'agent',
        producerIdentity: 'actor:cat-canvas',
        location: {
          kind: 'url',
          value: 'http://127.0.0.1:4321/report.pdf',
        },
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

test('GET /api/canvas resolves image and PDF media to dedicated presentations', async (t) => {
  const store = createCanvasStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const imageAuto = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-image',
  );
  assert.equal(imageAuto.status, 200);
  assert.equal(imageAuto.payload?.presentationRequested, 'auto');
  assert.equal(imageAuto.payload?.presentationResolved, 'image');
  assert.equal(
    imageAuto.payload?.safeUrl,
    'http://127.0.0.1:4321/screenshot.png',
  );

  const imageExplicit = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-image/view/image',
  );
  assert.equal(imageExplicit.status, 200);
  assert.equal(imageExplicit.payload?.presentationRequested, 'image');
  assert.equal(imageExplicit.payload?.presentationResolved, 'image');

  const pdfAuto = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-pdf',
  );
  assert.equal(pdfAuto.status, 200);
  assert.equal(pdfAuto.payload?.presentationRequested, 'auto');
  assert.equal(pdfAuto.payload?.presentationResolved, 'pdf');
  assert.equal(pdfAuto.payload?.safeUrl, 'http://127.0.0.1:4321/report.pdf');

  const pdfExplicit = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-pdf/view/pdf',
  );
  assert.equal(pdfExplicit.status, 200);
  assert.equal(pdfExplicit.payload?.presentationRequested, 'pdf');
  assert.equal(pdfExplicit.payload?.presentationResolved, 'pdf');
});

test('GET /api/canvas resolves inline and server-served text as code', async (t) => {
  const store = createCanvasStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const inline = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-summary',
  );
  assert.equal(inline.status, 200);
  assert.equal(inline.payload?.presentationRequested, 'auto');
  assert.equal(inline.payload?.presentationResolved, 'code');
  assert.equal(inline.payload?.safeUrl, null);
  assert.equal(inline.payload?.textContent, 'No inline viewer yet.');
  assert.equal(inline.payload?.iframeSandboxProfile, null);

  const textUrl = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-text-url',
  );
  assert.equal(textUrl.status, 200);
  assert.equal(textUrl.payload?.presentationRequested, 'auto');
  assert.equal(textUrl.payload?.presentationResolved, 'code');
  assert.equal(textUrl.payload?.safeUrl, 'http://127.0.0.1:4321/output.txt');
  assert.equal(textUrl.payload?.textContent, null);
  assert.equal(textUrl.payload?.iframeSandboxProfile, null);

  const explicitCode = await request(
    server,
    '/api/canvas/code_task/task-canvas/artifacts/artifact-text-url/view/code',
  );
  assert.equal(explicitCode.status, 200);
  assert.equal(explicitCode.payload?.presentationRequested, 'code');
  assert.equal(explicitCode.payload?.presentationResolved, 'code');
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
    '/api/canvas/code_task/task-canvas/artifacts/artifact-empty',
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
