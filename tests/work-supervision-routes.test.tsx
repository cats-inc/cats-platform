import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreRun,
  upsertCoreTask,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type { EvidenceEvent } from '../src/core/types.ts';
import { routeWorkApi } from '../src/products/work/api/index.ts';

function createCoreStore() {
  let core = createDefaultCoreState();
  core = upsertCoreTask(
    core,
    {
      id: 'task-supervision-route',
      title: 'Route supervised task',
      status: 'in_progress',
      conversationId: 'conversation-supervision-route',
      createdAt: '2026-04-25T12:00:00.000Z',
    },
    new Date('2026-04-25T12:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-supervision-route',
      title: 'Route supervised run',
      status: 'running',
      conversationId: 'conversation-supervision-route',
      taskId: 'task-supervision-route',
      createdAt: '2026-04-25T12:01:00.000Z',
    },
    new Date('2026-04-25T12:01:00.000Z'),
  ).core;

  return new MemoryCoreStore(core);
}

function evidenceEvent(): EvidenceEvent {
  return {
    id: 'evidence-supervision-route',
    conversationId: 'conversation-supervision-route',
    sessionId: null,
    layer: 'evidence',
    actorId: 'agent:boss',
    kind: 'system_event',
    timestamp: '2026-04-25T12:02:00.000Z',
    payload: {
      source: 'supervision_tool_boundary',
      runId: 'run-supervision-route',
      actionId: 'action-supervision-route',
      toolName: 'work.context.lookup',
      status: 'applied',
    },
  };
}

test('GET /api/work/tasks/:taskId includes supervision evidence from route dependency', async (t) => {
  const coreStore = createCoreStore();
  let evidenceConversationId: string | null = null;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeWorkApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore,
        now: () => new Date('2026-04-25T12:05:00.000Z'),
        readEvidenceEvents(conversationId) {
          evidenceConversationId = conversationId;
          return [evidenceEvent()];
        },
      },
    });

    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/work/tasks/task-supervision-route`,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(evidenceConversationId, 'conversation-supervision-route');
  assert.equal(payload.supervision.run.id, 'run-supervision-route');
  assert.equal(payload.supervision.counts.evidence, 1);
  assert.equal(payload.supervision.evidence[0].eventId, 'evidence-supervision-route');
});

test('POST /api/work/tasks/:taskId/supervised-run creates a queued supervised run', async (t) => {
  const coreStore = createCoreStore();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeWorkApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore,
        now: () => new Date('2026-04-25T12:05:00.000Z'),
      },
    });

    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/work/tasks/task-supervision-route/supervised-run`,
    { method: 'POST' },
  );
  const payload = await response.json();
  const core = await coreStore.readCore();
  const persistedRun = core.runs.find((candidate) => candidate.id === payload.run.id);
  const supervision = persistedRun?.metadata.supervision as Record<string, unknown> | undefined;
  const runState = supervision?.runState as Record<string, unknown> | undefined;

  assert.equal(response.status, 201);
  assert.equal(payload.created, true);
  assert.equal(payload.run.status, 'queued');
  assert.equal(payload.run.taskId, 'task-supervision-route');
  assert.equal(payload.supervision.primaryState, 'queued');
  assert.equal(supervision?.source, 'work_supervised_run_launcher');
  assert.equal(runState?.primaryState, 'queued');
});
