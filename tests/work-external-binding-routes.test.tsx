import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { routeWorkApi } from '../src/products/work/api/index.ts';
import { WORK_API_EXTERNAL_BINDINGS_PATH } from '../src/products/work/shared/apiPaths.ts';
import { EXTERNAL_WORK_BINDING_METADATA_KEY } from '../src/products/work/shared/externalWorkBinding.ts';

const NOW = new Date('2026-05-13T11:00:00.000Z');

function createCoreStore() {
  let core = createDefaultCoreState();
  core = upsertCoreProject(core, {
    id: 'project-route-external',
    title: 'Route external project',
    status: 'active',
    ownerActorId: core.ownerProfile.actorId,
    primaryConversationId: 'conversation-route-external',
  }, NOW).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-route-external',
    title: 'Link route external issue',
    status: 'planned',
    ownerActorId: core.ownerProfile.actorId,
  }, NOW).core;

  return new MemoryCoreStore(core);
}

function createTestServer(store: MemoryCoreStore) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const handled = await routeWorkApi({
        request,
        response,
        url,
        method: request.method ?? 'GET',
        dependencies: {
          coreStore: store,
          now: () => NOW,
        },
      });
      if (!handled) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not found' }));
      }
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  });
}

async function request(
  server: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected listening test server.');
  }
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) as Record<string, unknown> : null,
  };
}

test('POST /api/work/external-bindings links a Work Item to an external issue', async (t) => {
  const store = createCoreStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', WORK_API_EXTERNAL_BINDINGS_PATH, {
    localKind: 'work_item',
    localId: 'work-item-route-external',
    provider: 'github',
    externalType: 'issue',
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    syncDirection: 'pull',
  });
  const core = await store.readCore();
  const workItem = core.workItems.find((candidate) => candidate.id === 'work-item-route-external');
  const metadata = workItem?.metadata[EXTERNAL_WORK_BINDING_METADATA_KEY] as
    | { bindings?: Array<{ externalId?: string; linkedByActorRef?: string }> }
    | undefined;

  assert.equal(status, 200);
  assert.equal(payload?.linked, true);
  assert.equal(payload?.bindingCount, 1);
  assert.equal(metadata?.bindings?.[0]?.externalId, '123');
  assert.equal(metadata?.bindings?.[0]?.linkedByActorRef, core.ownerProfile.actorId);
});

test('POST /api/work/external-bindings links a Project to an external tracker project', async (t) => {
  const store = createCoreStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', WORK_API_EXTERNAL_BINDINGS_PATH, {
    localKind: 'project',
    localId: 'project-route-external',
    provider: 'redmine',
    externalType: 'project',
    externalId: 'cats-platform',
    externalUrl: 'https://redmine.example.test/projects/cats-platform',
    syncDirection: 'pull',
  });
  const core = await store.readCore();
  const project = core.projects.find((candidate) => candidate.id === 'project-route-external');
  const metadata = project?.metadata[EXTERNAL_WORK_BINDING_METADATA_KEY] as
    | { bindings?: Array<{ externalId?: string; linkedByActorRef?: string }> }
    | undefined;
  const activity = core.activities.find((candidate) =>
    candidate.projectId === 'project-route-external'
    && candidate.metadata.workExternalBinding,
  );

  assert.equal(status, 200);
  assert.equal(payload?.linked, true);
  assert.equal(payload?.bindingCount, 1);
  assert.equal(metadata?.bindings?.[0]?.externalId, 'cats-platform');
  assert.equal(metadata?.bindings?.[0]?.linkedByActorRef, core.ownerProfile.actorId);
  assert.equal(activity?.kind, 'note');
  assert.equal(activity?.conversationId, 'conversation-route-external');
});

test('POST /api/work/external-bindings rejects missing local records', async (t) => {
  const store = createCoreStore();
  const server = createTestServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', WORK_API_EXTERNAL_BINDINGS_PATH, {
    localKind: 'work_item',
    localId: 'missing-work-item',
    provider: 'github',
    externalType: 'issue',
    externalId: '123',
    syncDirection: 'pull',
  });

  assert.equal(status, 400);
  assert.equal((payload?.error as { code?: string } | undefined)?.code, 'E_PRECHECK_FAILED');
});
