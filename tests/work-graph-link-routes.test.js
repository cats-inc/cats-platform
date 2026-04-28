import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import { routeWorkApi } from '../build/server/products/work/api/index.js';

const NOW = new Date('2026-04-28T12:00:00.000Z');

function seedCoreWithPwt() {
  let state = createDefaultCoreState();
  state = upsertCoreProject(
    state,
    { id: 'project-a', title: 'Project A', ownerActorId: 'actor-owner' },
    NOW,
  ).core;
  state = upsertCoreProject(
    state,
    { id: 'project-b', title: 'Project B', ownerActorId: 'actor-owner' },
    NOW,
  ).core;
  state = upsertCoreTask(
    state,
    {
      id: 'task-1',
      title: 'Task 1',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
    },
    NOW,
  ).core;
  state = upsertCoreTask(
    state,
    {
      id: 'task-2',
      title: 'Task 2',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
    },
    NOW,
  ).core;
  return state;
}

function createMemoryStore(seed = seedCoreWithPwt()) {
  let state = seed;
  return {
    readCore() {
      return Promise.resolve(state);
    },
    writeCore(next) {
      state = next;
      return Promise.resolve();
    },
    get current() {
      return state;
    },
  };
}

function createTestServer(store) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
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
    } catch (err) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: err.message }));
    }
  });
}

async function request(server, method, path, body) {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}${path}`;
  const init = {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: response.status, payload };
}

test('POST /api/work/links creates a blocks row', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/links', {
    kind: 'blocks',
    source: { recordFamily: 'task', recordId: 'task-1' },
    target: { recordFamily: 'task', recordId: 'task-2' },
    note: 'task-1 must finish first.',
  });
  assert.equal(status, 201);
  assert.equal(payload.created, true);
  assert.equal(payload.link.kind, 'blocks');
  assert.equal(payload.link.sourceRecordId, 'task-1');
  assert.equal(payload.link.targetRecordId, 'task-2');
  assert.equal(store.current.workGraphLinks.length, 1);
});

test('POST /api/work/links coerces blocked_by into blocks at the API surface', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/links', {
    kind: 'blocked_by',
    source: { recordFamily: 'task', recordId: 'task-1' },
    target: { recordFamily: 'task', recordId: 'task-2' },
  });
  assert.equal(status, 201);
  assert.equal(payload.link.kind, 'blocks');
  assert.equal(payload.link.sourceRecordId, 'task-2');
  assert.equal(payload.link.targetRecordId, 'task-1');
});

test('POST /api/work/links is idempotent on the canonical form (returns 200, created=false)', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const first = await request(server, 'POST', '/api/work/links', {
    kind: 'related_to',
    source: { recordFamily: 'project', recordId: 'project-a' },
    target: { recordFamily: 'project', recordId: 'project-b' },
  });
  assert.equal(first.status, 201);

  const second = await request(server, 'POST', '/api/work/links', {
    kind: 'related_to',
    source: { recordFamily: 'project', recordId: 'project-b' },
    target: { recordFamily: 'project', recordId: 'project-a' },
  });
  assert.equal(second.status, 200);
  assert.equal(second.payload.created, false);
  assert.equal(second.payload.link.id, first.payload.link.id);
  assert.equal(store.current.workGraphLinks.length, 1);
});

test('POST /api/work/links rejects self-link attempts with the typed error code', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/links', {
    kind: 'related_to',
    source: { recordFamily: 'task', recordId: 'task-1' },
    target: { recordFamily: 'task', recordId: 'task-1' },
  });
  assert.equal(status, 400);
  assert.equal(payload.error.code, 'work_graph_link_self_link');
});

test('POST /api/work/links rejects unresolved endpoints with the typed error code', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/links', {
    kind: 'blocks',
    source: { recordFamily: 'task', recordId: 'task-1' },
    target: { recordFamily: 'task', recordId: 'task-deleted' },
  });
  assert.equal(status, 400);
  assert.equal(payload.error.code, 'work_graph_link_endpoint_unresolved');
});

test('POST /api/work/links returns 400 for malformed body', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/links', {
    kind: 'invalid',
    source: { recordFamily: 'task', recordId: 'task-1' },
    target: { recordFamily: 'task', recordId: 'task-2' },
  });
  assert.equal(status, 400);
  assert.equal(payload.error.code, 'invalid_link_input');
});

test('GET /api/work/links lists existing rows and supports filters', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  await request(server, 'POST', '/api/work/links', {
    kind: 'blocks',
    source: { recordFamily: 'task', recordId: 'task-1' },
    target: { recordFamily: 'task', recordId: 'task-2' },
  });
  await request(server, 'POST', '/api/work/links', {
    kind: 'related_to',
    source: { recordFamily: 'project', recordId: 'project-a' },
    target: { recordFamily: 'project', recordId: 'project-b' },
  });

  const all = await request(server, 'GET', '/api/work/links');
  assert.equal(all.status, 200);
  assert.equal(all.payload.links.length, 2);

  const byKind = await request(server, 'GET', '/api/work/links?kind=blocks');
  assert.equal(byKind.payload.links.length, 1);
  assert.equal(byKind.payload.links[0].kind, 'blocks');

  const byEndpoint = await request(
    server,
    'GET',
    '/api/work/links?recordFamily=project&recordId=project-a',
  );
  assert.equal(byEndpoint.payload.links.length, 1);
  assert.equal(byEndpoint.payload.links[0].sourceRecordId, 'project-a');
});

test('GET /api/work/links?kind=blocked_by returns 400 (derived view, not stored)', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'GET', '/api/work/links?kind=blocked_by');
  assert.equal(status, 400);
  assert.equal(payload.error.code, 'invalid_link_query');
});

test('DELETE /api/work/links/:linkId removes the row', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const created = await request(server, 'POST', '/api/work/links', {
    kind: 'blocks',
    source: { recordFamily: 'task', recordId: 'task-1' },
    target: { recordFamily: 'task', recordId: 'task-2' },
  });
  const linkId = created.payload.link.id;

  const removed = await request(server, 'DELETE', `/api/work/links/${linkId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.payload.removed, true);
  assert.equal(store.current.workGraphLinks.length, 0);
});

test('DELETE /api/work/links/:linkId returns 404 for unknown id', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'DELETE', '/api/work/links/missing-id');
  assert.equal(status, 404);
  assert.equal(payload.error.code, 'link_not_found');
});
