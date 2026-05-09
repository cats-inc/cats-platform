import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreArtifact } from '../src/core/model/planningRecords.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import {
  buildArtifactSubscriptionPatches,
  buildArtifactSubscriptionState,
} from '../src/platform/orchestration/entitySubscriptions/artifact.ts';
import { routeEntitySubscriptionApi } from '../src/app/server/subscribeRoutes.ts';

function createArtifactStore(): MemoryCoreStore {
  const core = upsertCoreArtifact(createDefaultCoreState(), {
    id: 'artifact-1',
    title: 'Initial artifact',
    kind: 'document',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    path: 'http://127.0.0.1:4321/output.txt',
    mimeType: 'text/plain',
    summary: 'Initial summary',
  }).core;
  return new MemoryCoreStore(core);
}

test('buildArtifactSubscriptionState projects the subscribed artifact', async () => {
  const store = createArtifactStore();

  const state = await buildArtifactSubscriptionState(store, 'artifact-1');

  assert.equal(state.artifact.id, 'artifact-1');
  assert.equal(state.artifact.title, 'Initial artifact');
});

test('buildArtifactSubscriptionPatches emits artifact.updated for changed records', async () => {
  const store = createArtifactStore();
  const previous = await buildArtifactSubscriptionState(store, 'artifact-1');
  const nextCore = await store.updateCore((core) => upsertCoreArtifact(core, {
    ...previous.artifact,
    title: 'Updated artifact',
    summary: 'Updated summary',
  }).core);
  const next = {
    artifact: nextCore.artifacts.find((artifact) => artifact.id === 'artifact-1')!,
  };

  const patches = buildArtifactSubscriptionPatches(previous, next);

  assert.equal(patches.length, 1);
  assert.equal(patches[0].kind, 'artifact.updated');
  assert.equal(patches[0].artifactId, 'artifact-1');
  assert.equal(patches[0].state.artifact.title, 'Updated artifact');
});

test('buildArtifactSubscriptionPatches emits artifact.removed for missing records', async () => {
  const store = createArtifactStore();
  const previous = await buildArtifactSubscriptionState(store, 'artifact-1');

  const patches = buildArtifactSubscriptionPatches(previous, null);

  assert.deepEqual(patches, [{
    kind: 'artifact.removed',
    artifactId: 'artifact-1',
  }]);
});

test('GET /api/subscribe streams artifact snapshots and update patches', async (t) => {
  const store = createArtifactStore();
  const server = createArtifactSubscriptionServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await fetch(`${baseUrl(server)}/api/subscribe?kind=artifact&id=artifact-1`);
  assert.equal(response.status, 200);
  assert.ok(response.body);
  const reader = response.body.getReader();
  t.after(() => {
    void reader.cancel();
  });

  const snapshot = await readUntil(reader, '"kind":"artifact"');
  assert.match(snapshot, /event: snapshot/u);
  assert.match(snapshot, /Initial artifact/u);

  await store.updateCore((core) => upsertCoreArtifact(core, {
    id: 'artifact-1',
    title: 'Updated through stream',
    kind: 'document',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    path: 'http://127.0.0.1:4321/output.txt',
    mimeType: 'text/plain',
    summary: 'Updated summary',
  }).core);

  const patch = await readUntil(reader, '"artifact.updated"');
  assert.match(patch, /event: patch/u);
  assert.match(patch, /Updated through stream/u);
});

function createArtifactSubscriptionServer(store: MemoryCoreStore) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeEntitySubscriptionApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore: store,
      } as unknown as Parameters<typeof routeEntitySubscriptionApi>[0]['dependencies'],
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
}

function baseUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + 3_000;
  while (!buffer.includes(needle)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${needle}. Buffer: ${buffer}`);
    }
    const next = await reader.read();
    if (next.done) {
      break;
    }
    buffer += decoder.decode(next.value, { stream: true });
  }
  return buffer;
}
