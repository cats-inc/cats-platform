import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreRun,
  upsertCoreTask,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type { EvidenceEvent } from '../src/core/types.ts';
import { readEvidenceEvents } from '../src/platform/persistence/evidence.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
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

function createRuntimeStub(): RuntimeClient & {
  createdSessions: unknown[];
  sentMessages: Array<{ sessionId: string; content: string; input?: unknown }>;
} {
  return {
    createdSessions: [],
    sentMessages: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
      };
    },
    async getSetupState() {
      return {
        status: 'ready',
        providers: [],
        availableCount: 0,
        providerCount: 0,
        providersReadyToApply: [],
        providersNeedingAttention: [],
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
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: null,
        source: 'config',
        cache: null,
        models: [],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: null,
        source: 'config',
        cache: null,
        models: [],
        presets: [],
        controls: [],
        warnings: [],
      };
    },
    async createSession(input) {
      this.createdSessions.push(input);
      return {
        id: 'runtime-session-work-1',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return {
        segments: [{ kind: 'text', text: 'work runtime ok', toolName: null, toolId: null }],
        inputTokens: 10,
        outputTokens: 5,
        tokensUsed: 15,
      };
    },
    async observeSession() {
      return { session: {} };
    },
    async streamSession() {},
    async createWakeup() {
      return {
        request: { id: 'wakeup-work-1' },
        coalesced: false,
      };
    },
    async callMcp() {
      return null;
    },
    async cancelSession() {},
    async closeSession() {},
    async deleteSession(sessionId) {
      return {
        sessionId,
        status: 'deleted',
      };
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
  assert.deepEqual(supervision?.budget, {
    maxTokens: 60_000,
    maxDurationMs: 30 * 60 * 1000,
    hardStop: true,
  });
  assert.equal(supervision?.budgetSource, 'work_supervised_run_launcher');
  assert.equal(runState?.primaryState, 'queued');

  const secondResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/work/tasks/task-supervision-route/supervised-run`,
    { method: 'POST' },
  );
  const secondPayload = await secondResponse.json();
  const secondCore = await coreStore.readCore();
  const supervisedRuns = secondCore.runs.filter((candidate) =>
    candidate.taskId === 'task-supervision-route' &&
    (candidate.metadata.supervision as Record<string, unknown> | undefined)?.source ===
      'work_supervised_run_launcher');

  assert.equal(secondResponse.status, 200);
  assert.equal(secondPayload.created, false);
  assert.equal(secondPayload.run.id, payload.run.id);
  assert.equal(supervisedRuns.length, 1);
});

test('POST /api/work/tasks/:taskId/supervised-run starts supervised runtime session when available', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-work-runtime-route-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const coreStore = createCoreStore();
  const runtimeClient = createRuntimeStub();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeWorkApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore,
        runtimeClient,
        runtimeTarget: {
          provider: 'codex',
          instance: 'native',
          model: 'gpt-5.4',
        },
        evidenceDataDir: tempDir,
        readEvidenceEvents: (conversationId) => readEvidenceEvents(tempDir, conversationId),
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
  const runtimeBridge = supervision?.runtimeBridge as Record<string, unknown> | undefined;
  const evidence = readEvidenceEvents(tempDir, 'conversation-supervision-route');

  assert.equal(response.status, 201);
  assert.equal(payload.created, true);
  assert.equal(payload.run.status, 'running');
  assert.equal(payload.supervision.primaryState, 'running');
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(runtimeBridge?.status, 'started');
  assert.equal(runtimeBridge?.sessionId, 'runtime-session-work-1');
  assert.equal(runtimeBridge?.provider, 'codex');
  assert.equal(runtimeBridge?.instance, 'native');
  assert.equal(runtimeBridge?.tokensUsed, 15);
  assert.deepEqual(runtimeBridge?.runLoopHandoff, {
    kind: 'provider_agent_seam',
    runId: payload.run.id,
    actionId: `${payload.run.id}:runtime-message`,
    observationRef: {
      refId: `${payload.run.id}:runtime-message:provider-response`,
      source: 'provider_response',
      resultStatus: 'applied',
    },
  });
  assert.equal(runtimeClient.sentMessages[0]?.sessionId, 'runtime-session-work-1');
  assert.match(runtimeClient.sentMessages[0]?.content ?? '', /Work task: Route supervised task/u);
  assert.deepEqual(
    evidence.map((event) => event.payload.toolName),
    ['cats.runtime.session.create', 'cats.runtime.message.send'],
  );

  const detailResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/work/tasks/task-supervision-route`,
  );
  const detailPayload = await detailResponse.json();
  const runtimeTrace = detailPayload.timeline.view.items.find(
    (item: { kind: string; summary: string | null }) =>
      item.kind === 'trace' && item.summary?.includes('work runtime ok'),
  );

  assert.equal(detailResponse.status, 200);
  assert.ok(runtimeTrace, 'expected Work task timeline to include the runtime response');

  const secondResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/work/tasks/task-supervision-route/supervised-run`,
    { method: 'POST' },
  );
  const secondPayload = await secondResponse.json();

  assert.equal(secondResponse.status, 200);
  assert.equal(secondPayload.created, false);
  assert.equal(secondPayload.run.id, payload.run.id);
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
});
