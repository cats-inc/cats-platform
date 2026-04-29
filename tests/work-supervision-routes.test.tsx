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
  resumedSessions: string[];
  canceledSessions: string[];
} {
  return {
    createdSessions: [],
    sentMessages: [],
    resumedSessions: [],
    canceledSessions: [],
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
    async resumeSession(sessionId) {
      this.resumedSessions.push(sessionId);
      return {
        id: sessionId,
        provider: 'codex',
        model: 'gpt-5.4',
        status: 'ready',
        cwd: null,
      };
    },
    async createWakeup() {
      return {
        request: { id: 'wakeup-work-1' },
        coalesced: false,
      };
    },
    async callMcp() {
      return null;
    },
    async cancelSession(sessionId) {
      this.canceledSessions.push(sessionId);
    },
    async closeSession() {},
    async deleteSession(sessionId) {
      return {
        sessionId,
        status: 'deleted',
      };
    },
  };
}

async function writeBlockedSupervisedRun(coreStore: MemoryCoreStore): Promise<void> {
  const core = await coreStore.readCore();
  await coreStore.writeCore(
    upsertCoreRun(
      core,
      {
        id: 'run-supervision-route',
        title: 'Route supervised run',
        status: 'blocked',
        summary: 'Blocked for lifecycle action test.',
        metadata: {
          supervision: {
            source: 'work_supervised_run_launcher',
            runtimeBridge: {
              status: 'started',
              sessionId: 'runtime-session-existing',
            },
            runState: {
              blockers: [
                {
                  code: 'TEST_BLOCKER',
                  message: 'Blocked before operator action.',
                },
              ],
            },
          },
        },
      },
      new Date('2026-04-25T12:04:00.000Z'),
    ).core,
  );
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
  const providerAgentRunLoop = supervision?.providerAgentRunLoop as
    | Record<string, unknown>
    | undefined;
  const observations = providerAgentRunLoop?.observations as Record<string, unknown>[] | undefined;
  const outcomes = providerAgentRunLoop?.outcomes as Record<string, unknown>[] | undefined;
  const evidence = readEvidenceEvents(tempDir, 'conversation-supervision-route');
  const toolBoundaryEvidence = evidence.filter(
    (event) => event.payload.source === 'supervision_tool_boundary',
  );
  const runLoopEvidence = evidence.find(
    (event) => event.payload.source === 'provider_agent_run_loop',
  );

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
  assert.deepEqual(providerAgentRunLoop?.latestHandoff, runtimeBridge?.runLoopHandoff);
  assert.deepEqual(observations?.[0], {
    observationId: `${payload.run.id}:runtime-message:observation`,
    actionId: `${payload.run.id}:runtime-message`,
    observedAt: '2026-04-25T12:05:00.000Z',
    refId: `${payload.run.id}:runtime-message:provider-response`,
    source: 'provider_response',
    resultStatus: 'applied',
  });
  assert.deepEqual(outcomes?.[0], {
    outcomeId: `${payload.run.id}:runtime-message:outcome`,
    actionId: `${payload.run.id}:runtime-message`,
    kind: 'runtime_message',
    status: 'applied',
    sessionId: 'runtime-session-work-1',
    tokensUsed: 15,
    recordedAt: '2026-04-25T12:05:00.000Z',
    handoff: runtimeBridge?.runLoopHandoff,
  });
  assert.deepEqual(
    payload.supervision.providerAgentRunLoop.latestHandoff,
    runtimeBridge?.runLoopHandoff,
  );
  assert.equal(runtimeClient.sentMessages[0]?.sessionId, 'runtime-session-work-1');
  assert.match(runtimeClient.sentMessages[0]?.content ?? '', /Work task: Route supervised task/u);
  assert.deepEqual(
    toolBoundaryEvidence.map((event) => event.payload.toolName),
    ['cats.runtime.session.create', 'cats.runtime.message.send'],
  );
  assert.equal(runLoopEvidence?.payload.actionId, `${payload.run.id}:runtime-message`);
  assert.equal(runLoopEvidence?.payload.status, 'applied');
  assert.equal(runLoopEvidence?.payload.sessionId, 'runtime-session-work-1');

  const detailResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/work/tasks/task-supervision-route`,
  );
  const detailPayload = await detailResponse.json();
  const runtimeTrace = detailPayload.timeline.view.items.find(
    (item: { kind: string; summary: string | null }) =>
      item.kind === 'trace' && item.summary?.includes('work runtime ok'),
  );
  const evidenceTimelineItems = detailPayload.timeline.view.items.filter(
    (item: { kind: string }) => item.kind === 'evidence',
  );

  assert.equal(detailResponse.status, 200);
  assert.ok(runtimeTrace, 'expected Work task timeline to include the runtime response');
  assert.equal(
    evidenceTimelineItems.some(
      (item: { title: string; status: string | null; runId: string | null }) =>
        item.title === 'Evidence: cats.runtime.session.create' &&
        item.status === 'applied' &&
        item.runId === payload.run.id,
    ),
    true,
  );
  assert.equal(
    evidenceTimelineItems.some(
      (item: { title: string; status: string | null; runId: string | null }) =>
        item.title === 'Evidence: cats.runtime.message.send' &&
        item.status === 'applied' &&
        item.runId === payload.run.id,
    ),
    true,
  );
  assert.equal(
    evidenceTimelineItems.some(
      (item: { title: string; status: string | null; runId: string | null }) =>
        item.title === 'Evidence: provider-agent run loop' &&
        item.status === 'applied' &&
        item.runId === payload.run.id,
    ),
    true,
  );
  assert.equal(detailPayload.supervision.counts.evidence, 3);
  assert.equal(
    detailPayload.supervision.evidence.find(
      (event: { source: string }) => event.source === 'provider_agent_run_loop',
    )?.actionId,
    `${payload.run.id}:runtime-message`,
  );
  assert.deepEqual(
    detailPayload.supervision.providerAgentRunLoop.outcomes[0],
    outcomes?.[0],
  );

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

test('POST /api/work/tasks/:taskId/supervised-run/:action applies lifecycle actions', async (t) => {
  const coreStore = createCoreStore();
  await writeBlockedSupervisedRun(coreStore);
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
        now: () => new Date('2026-04-25T12:06:00.000Z'),
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const resumeResponse = await fetch(
    `${baseUrl}/api/work/tasks/task-supervision-route/supervised-run/resume`,
    { method: 'POST' },
  );
  const resumePayload = await resumeResponse.json();

  assert.equal(resumeResponse.status, 200);
  assert.equal(resumePayload.run.status, 'running');
  assert.equal(resumePayload.supervision.primaryState, 'running');
  assert.deepEqual(resumePayload.supervision.blockers, []);
  assert.deepEqual(runtimeClient.resumedSessions, ['runtime-session-existing']);
  assert.equal(
    resumePayload.run.metadata.supervision.lifecycleAction.action,
    'resume',
  );

  await writeBlockedSupervisedRun(coreStore);
  const retryResponse = await fetch(
    `${baseUrl}/api/work/tasks/task-supervision-route/supervised-run/retry`,
    { method: 'POST' },
  );
  const retryPayload = await retryResponse.json();

  assert.equal(retryResponse.status, 200);
  assert.equal(retryPayload.run.status, 'running');
  assert.equal(retryPayload.supervision.primaryState, 'running');
  assert.deepEqual(retryPayload.run.metadata.supervision.lifecycleRetry, {
    reason: 'operator requested retry',
  });
  assert.equal(
    retryPayload.run.metadata.supervision.lifecycleAction.action,
    'retry',
  );

  // Cancellation now flows through the canonical Run stop endpoint
  // (SPEC-096 / PLAN-085); the legacy task-scoped cancel branch has
  // been removed.
  const runId = retryPayload.run.id as string;
  const cancelResponse = await fetch(
    `${baseUrl}/api/work/runs/${runId}/stop`,
    { method: 'POST' },
  );
  const cancelPayload = await cancelResponse.json();

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelPayload.status, 'stopped');
  assert.equal(cancelPayload.run.status, 'cancelled');
  assert.deepEqual(runtimeClient.canceledSessions, ['runtime-session-existing']);
  assert.equal(
    cancelPayload.run.metadata.supervision.runtimeBridge.status,
    'cancel_requested',
  );
  const cancellationEntries = cancelPayload.run.metadata.cancellation as Array<{
    source: string;
  }>;
  assert.equal(cancellationEntries.length, 1);
  assert.equal(cancellationEntries[0].source, 'run_stop');
});

test('legacy /api/work/tasks/:taskId/supervised-run/cancel route is no longer routable', async (t) => {
  const coreStore = createCoreStore();
  await writeBlockedSupervisedRun(coreStore);
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
        now: () => new Date('2026-04-25T12:06:00.000Z'),
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const response = await fetch(
    `${baseUrl}/api/work/tasks/task-supervision-route/supervised-run/cancel`,
    { method: 'POST' },
  );

  // Falls through to the outer 404 handler because the action regex
  // is now narrowed to `(resume|retry)`.
  assert.equal(response.status, 404);
});
