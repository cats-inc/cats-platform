import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreArtifact } from '../src/core/model/planningRecords.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createParallelChatGroup } from '../src/products/chat/state/model/index.ts';
import { FileChatStore, MemoryChatStore } from '../src/products/chat/state/store.ts';
import {
  buildArtifactSubscriptionPatches,
  buildArtifactSubscriptionState,
} from '../src/platform/orchestration/entitySubscriptions/artifact.ts';
import {
  SUPPORTED_ENTITY_SUBSCRIPTION_KINDS,
} from '../src/platform/orchestration/entitySubscriptions/index.ts';
import { routeEntitySubscriptionApi } from '../src/app/server/subscribeRoutes.ts';

function createArtifactStore(
  diagnosticReporter?: (scope: string, details: Record<string, unknown>) => void,
): MemoryCoreStore {
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
  return new MemoryCoreStore(core, diagnosticReporter);
}

function createChatStateWithProjectedCoreChange() {
  return createParallelChatGroup(createDefaultChatState(), {
    title: 'Projected core change',
    originSurface: 'code',
    repoPath: 'C:/repo/main',
    targets: [
      {
        provider: 'claude',
        instance: null,
        model: 'claude-opus-4-6',
        modelSelection: null,
      },
      {
        provider: 'codex',
        instance: null,
        model: 'gpt-5.4',
        modelSelection: null,
      },
    ],
  }, new Date('2026-05-10T00:00:00.000Z'));
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
  assert.match(patch, /"artifactId":"artifact-1"/u);

  await store.updateCore((core) => upsertCoreArtifact(core, {
    id: 'artifact-1',
    title: 'Updated through stream again',
    kind: 'document',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    path: 'http://127.0.0.1:4321/output.txt',
    mimeType: 'text/plain',
    summary: 'Second updated summary',
  }).core);

  const secondPatch = await readUntil(reader, '"artifact.updated"');
  assert.match(secondPatch, /event: patch/u);
  assert.match(secondPatch, /"artifact\.updated"/u);
});

test('MemoryCoreStore core listener failures do not abort writes', async () => {
  const diagnostics: Array<{ scope: string; details: Record<string, unknown> }> = [];
  const store = createArtifactStore((scope, details) => {
    diagnostics.push({ scope, details });
  });
  store.subscribeCore(() => {
    throw new Error('listener failed');
  });

  const nextCore = await store.updateCore((core) => upsertCoreArtifact(core, {
    ...core.artifacts[0]!,
    title: 'Updated despite listener failure',
  }).core);

  assert.equal(nextCore.artifacts[0]?.title, 'Updated despite listener failure');
  assert.equal(diagnostics[0]?.scope, 'core_listener_failed');
  assert.equal(diagnostics[0]?.details.message, 'listener failed');
});

test('MemoryChatStore notifies core subscribers only when chat writes change projected core', async () => {
  const store = new MemoryChatStore();
  let notifications = 0;
  store.subscribeCore(() => {
    notifications += 1;
  });

  await store.write(await store.read());
  assert.equal(notifications, 0);

  await store.write(createChatStateWithProjectedCoreChange());
  assert.equal(notifications, 1);

  await store.write(await store.read());
  assert.equal(notifications, 1);
});

test('FileChatStore notifies core subscribers only when chat writes change projected core', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cats-platform-chat-store-'));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const store = new FileChatStore(path.join(directory, 'chat.json'));
  await store.read();
  let notifications = 0;
  store.subscribeCore(() => {
    notifications += 1;
  });

  await store.write(await store.read());
  assert.equal(notifications, 0);

  await store.write(createChatStateWithProjectedCoreChange());
  assert.equal(notifications, 1);

  await store.write(await store.read());
  assert.equal(notifications, 1);
});

test('MemoryCoreStore writeCore and updateCore only notify on substantive change', async () => {
  const store = createArtifactStore();
  let notifications = 0;
  store.subscribeCore(() => {
    notifications += 1;
  });

  await store.writeCore(await store.readCore());
  assert.equal(notifications, 0);

  await store.updateCore((core) => core);
  assert.equal(notifications, 0);

  await store.updateCore((core) => upsertCoreArtifact(core, {
    ...core.artifacts[0]!,
    title: 'Substantive update',
  }).core);
  assert.equal(notifications, 1);

  await store.updateCore((core) => core);
  assert.equal(notifications, 1);
});

test('GET /api/subscribe emits artifact removal patch before closing', async (t) => {
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

  await store.updateCore((core) => ({
    ...core,
    artifacts: core.artifacts.filter((artifact) => artifact.id !== 'artifact-1'),
  }));

  const close = await readUntil(reader, 'event: close');
  assert.match(close, /event: patch/u);
  assert.match(close, /"artifact\.removed"/u);
  assert.match(close, /Artifact not found: artifact-1/u);
});

test('GET /api/subscribe rejects missing artifact subscriptions', async (t) => {
  const store = createArtifactStore();
  const server = createArtifactSubscriptionServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await fetch(`${baseUrl(server)}/api/subscribe?kind=artifact&id=missing`);
  const payload = await response.json() as {
    error?: {
      code?: string;
      message?: string;
    };
  };

  assert.equal(response.status, 404);
  assert.equal(payload.error?.code, 'subscription_entity_not_found');
  assert.match(payload.error?.message ?? '', /Artifact not found: missing/u);
});

test('GET /api/subscribe rejects unsupported entity subscription kinds', async (t) => {
  const store = createArtifactStore();
  const server = createArtifactSubscriptionServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await fetch(`${baseUrl(server)}/api/subscribe?kind=project&id=project-1`);
  const payload = await response.json() as {
    error?: {
      code?: string;
      message?: string;
    };
  };

  assert.equal(response.status, 400);
  assert.equal(payload.error?.code, 'invalid_subscription');
  assert.match(
    payload.error?.message ?? '',
    new RegExp(`kind=<${SUPPORTED_ENTITY_SUBSCRIPTION_KINDS.join('\\|')}>`, 'u'),
  );
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
