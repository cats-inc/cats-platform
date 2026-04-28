import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { routeWorkApi } from '../build/server/products/work/api/index.js';

const NOW = new Date('2026-04-28T12:00:00.000Z');

function createMemoryStore(seed = createDefaultCoreState()) {
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

test('POST /api/work/projects creates a Core project', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/projects', {
    title: 'Black Friday landing',
    summary: 'Refresh hero copy ahead of BF.',
    status: 'active',
  });
  assert.equal(status, 201);
  assert.equal(payload.created, true);
  assert.equal(payload.project.title, 'Black Friday landing');
  assert.equal(payload.project.status, 'active');
  assert.equal(store.current.projects.length, 1);
});

test('POST /api/work/projects rejects empty title', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/projects', {
    title: '',
  });
  assert.equal(status, 400);
  assert.equal(payload.error.code, 'invalid_project_input');
});

test('DELETE /api/work/projects/:id removes the project', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const created = await request(server, 'POST', '/api/work/projects', {
    title: 'Throwaway',
  });
  const projectId = created.payload.project.id;

  const removed = await request(server, 'DELETE', `/api/work/projects/${projectId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.payload.removed, true);
  assert.equal(store.current.projects.length, 0);
});

test('DELETE /api/work/projects/:id returns 404 when id is missing', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(
    server,
    'DELETE',
    '/api/work/projects/nope',
  );
  assert.equal(status, 404);
  assert.equal(payload.error.code, 'project_not_found');
});

test('POST /api/work/work-items creates a Core work item linked to a project', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const project = await request(server, 'POST', '/api/work/projects', {
    title: 'Demo project',
  });
  const projectId = project.payload.project.id;

  const { status, payload } = await request(server, 'POST', '/api/work/work-items', {
    title: 'Hero copy revision',
    projectId,
    status: 'in_progress',
  });
  assert.equal(status, 201);
  assert.equal(payload.created, true);
  assert.equal(payload.workItem.projectId, projectId);
  assert.equal(payload.workItem.status, 'in_progress');
});

test('DELETE /api/work/work-items/:id removes the work item', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const created = await request(server, 'POST', '/api/work/work-items', {
    title: 'Throwaway WI',
  });
  const workItemId = created.payload.workItem.id;
  const removed = await request(server, 'DELETE', `/api/work/work-items/${workItemId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.payload.removed, true);
  assert.equal(store.current.workItems.length, 0);
});

test('POST /api/work/tasks creates a Core task with optional parent task', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const parent = await request(server, 'POST', '/api/work/tasks', {
    title: 'Parent task',
  });
  const parentTaskId = parent.payload.task.id;

  const { status, payload } = await request(server, 'POST', '/api/work/tasks', {
    title: 'Child task',
    parentTaskId,
    status: 'in_progress',
  });
  assert.equal(status, 201);
  assert.equal(payload.created, true);
  assert.equal(payload.task.parentTaskId, parentTaskId);
  assert.equal(payload.task.status, 'in_progress');
});

test('DELETE /api/work/tasks/:id removes the task', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const created = await request(server, 'POST', '/api/work/tasks', {
    title: 'Throwaway task',
  });
  const taskId = created.payload.task.id;

  const removed = await request(server, 'DELETE', `/api/work/tasks/${taskId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.payload.removed, true);
  assert.equal(store.current.tasks.length, 0);
});

test('POST /api/work/tasks rejects an invalid status enum', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/tasks', {
    title: 'Task',
    status: 'totally-invalid',
  });
  assert.equal(status, 400);
  assert.equal(payload.error.code, 'invalid_task_input');
});

test('GET /api/work/projects still works alongside POST/DELETE on the same path', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  await request(server, 'POST', '/api/work/projects', { title: 'Visible' });
  const list = await request(server, 'GET', '/api/work/projects');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.payload.projects));
  assert.equal(list.payload.projects.length, 1);
  assert.equal(list.payload.projects[0].title, 'Visible');
});
