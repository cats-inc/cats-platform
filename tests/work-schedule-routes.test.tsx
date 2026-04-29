import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createCatActorId } from '../src/core/actors.ts';
import {
  createDefaultCoreState,
  upsertCoreActor,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  MemoryScheduleStore,
  type ScheduleTriggerMetadata,
} from '../src/platform/scheduler/index.ts';
import { routeWorkApi } from '../src/products/work/api/index.ts';

function createCoreStoreWithCompanion() {
  let core = createDefaultCoreState();
  core = upsertCoreActor(
    core,
    {
      id: createCatActorId('companion-route'),
      name: 'Companion Route',
      kind: 'worker',
      source: 'chat_cat',
      sourceId: 'companion-route',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: null,
        model: null,
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  return new MemoryCoreStore(core);
}

function schedulePayload() {
  return {
    title: 'Route daily greeting',
    timezone: 'Asia/Taipei',
    schedule: {
      kind: 'daily',
      time: '08:00',
    },
    missionTemplate: {
      target: { kind: 'cat', id: 'companion-route' },
      originSurface: 'schedule',
      intent: 'Greet through a schedule route.',
      transportTargets: [{ platform: 'telegram', bindingId: 'telegram-route' }],
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'skip',
      retryPolicy: {
        maxAttempts: 0,
        backoff: 'none',
      },
    },
  };
}

function createTestServer(input: {
  coreStore: MemoryCoreStore;
  scheduleStore: MemoryScheduleStore;
  runtimeClient?: RuntimeClient;
  now: () => Date;
}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeWorkApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore: input.coreStore,
        scheduleStore: input.scheduleStore,
        runtimeClient: input.runtimeClient,
        now: input.now,
      },
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
}

function createRuntimeStub(): RuntimeClient & {
  createdSessions: unknown[];
  sentMessages: Array<{ sessionId: string; content: string; input?: unknown }>;
  canceledSessions: string[];
} {
  return {
    createdSessions: [],
    sentMessages: [],
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
        id: 'runtime-session-schedule-route',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return {
        segments: [{ kind: 'text', text: 'scheduled runtime ok', toolName: null, toolId: null }],
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
        request: { id: 'wakeup-schedule-route' },
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

async function request(
  server: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: unknown,
) {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
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

test('Work schedule routes create a generic rule and admit manual test fire', async (t) => {
  const coreStore = createCoreStoreWithCompanion();
  const scheduleStore = new MemoryScheduleStore();
  let now = new Date('2026-04-29T00:00:00.000Z');
  const server = createTestServer({
    coreStore,
    scheduleStore,
    now: () => now,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const created = await request(server, 'POST', '/api/work/schedules', schedulePayload());
  assert.equal(created.status, 201);
  const rule = created.payload?.rule as { id: string; revision: number } | undefined;
  assert.ok(rule?.id);
  assert.equal(rule.revision, 1);

  now = new Date('2026-04-29T00:05:00.000Z');
  const fired = await request(server, 'POST', `/api/work/schedules/${rule.id}/test-fire`);
  assert.equal(fired.status, 201);
  assert.equal((fired.payload?.run as { status: string } | undefined)?.status, 'queued');

  const core = await coreStore.readCore();
  assert.equal(core.missions.length, 1);
  assert.equal(core.runs.length, 1);
  const trigger = core.runs[0]?.metadata.scheduleTrigger as ScheduleTriggerMetadata | undefined;
  assert.equal(trigger?.ruleId, rule.id);
  assert.deepEqual(trigger?.originalTargetRef, { kind: 'cat', id: 'companion-route' });
});

test('Work manual schedule test fire launches through supervision runtime boundary', async (t) => {
  const coreStore = createCoreStoreWithCompanion();
  const scheduleStore = new MemoryScheduleStore();
  const runtimeClient = createRuntimeStub();
  let now = new Date('2026-04-29T00:00:00.000Z');
  const server = createTestServer({
    coreStore,
    scheduleStore,
    runtimeClient,
    now: () => now,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const created = await request(server, 'POST', '/api/work/schedules', schedulePayload());
  const rule = created.payload?.rule as { id: string } | undefined;
  assert.ok(rule?.id);

  now = new Date('2026-04-29T00:05:00.000Z');
  const fired = await request(server, 'POST', `/api/work/schedules/${rule.id}/test-fire`);
  assert.equal(fired.status, 201);
  assert.equal((fired.payload?.run as { status: string } | undefined)?.status, 'running');
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);

  const sessionInput = runtimeClient.createdSessions[0] as {
    context?: { metadata?: Record<string, unknown> };
  };
  assert.equal(
    sessionInput.context?.metadata?.supervisionBoundary,
    'cats-supervision-runtime-boundary',
  );
  assert.equal(sessionInput.context?.metadata?.scheduleRuleId, rule.id);
  assert.equal(sessionInput.context?.metadata?.supervisionSurface, 'schedule-rule-run-loop');
  assert.match(
    runtimeClient.sentMessages[0]?.content ?? '',
    /Scheduled mission: Route daily greeting/u,
  );

  const core = await coreStore.readCore();
  const run = core.runs[0];
  assert.equal(run?.status, 'running');
  assert.equal(run?.metadata.supervision && typeof run.metadata.supervision, 'object');
  const supervision = run?.metadata.supervision as {
    runtimeBridge?: { status?: string; sessionId?: string };
    providerAgentRunLoop?: { outcomes?: unknown[] };
  } | undefined;
  assert.equal(supervision?.runtimeBridge?.status, 'started');
  assert.equal(supervision?.runtimeBridge?.sessionId, 'runtime-session-schedule-route');
  assert.equal(Array.isArray(supervision?.providerAgentRunLoop?.outcomes), true);
  assert.equal(core.missions[0]?.status, 'running');
});

test('Work schedule replace cancels the previous supervised runtime run', async (t) => {
  const coreStore = createCoreStoreWithCompanion();
  const scheduleStore = new MemoryScheduleStore();
  const runtimeClient = createRuntimeStub();
  let now = new Date('2026-04-29T00:00:00.000Z');
  const server = createTestServer({
    coreStore,
    scheduleStore,
    runtimeClient,
    now: () => now,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const payload = schedulePayload();
  const created = await request(server, 'POST', '/api/work/schedules', {
    ...payload,
    executionPolicy: {
      ...payload.executionPolicy,
      concurrencyPolicy: 'replace',
    },
  });
  const rule = created.payload?.rule as { id: string } | undefined;
  assert.ok(rule?.id);

  now = new Date('2026-04-29T00:05:00.000Z');
  const firstFire = await request(server, 'POST', `/api/work/schedules/${rule.id}/test-fire`);
  assert.equal(firstFire.status, 201);

  now = new Date('2026-04-29T00:06:00.000Z');
  const secondFire = await request(server, 'POST', `/api/work/schedules/${rule.id}/test-fire`);
  assert.equal(secondFire.status, 201);
  assert.equal((secondFire.payload?.run as { status: string } | undefined)?.status, 'running');
  assert.deepEqual(runtimeClient.canceledSessions, ['runtime-session-schedule-route']);
  assert.equal(runtimeClient.createdSessions.length, 2);

  const core = await coreStore.readCore();
  const cancelledRuns = core.runs.filter((run) => run.status === 'cancelled');
  const runningRuns = core.runs.filter((run) => run.status === 'running');
  assert.equal(cancelledRuns.length, 1);
  assert.equal(runningRuns.length, 1);
  const cancelledBridge = cancelledRuns[0]?.metadata.supervision as {
    runtimeBridge?: { status?: string; cancelRequestedAt?: string };
  } | undefined;
  assert.equal(cancelledBridge?.runtimeBridge?.status, 'cancel_requested');
  assert.equal(cancelledBridge?.runtimeBridge?.cancelRequestedAt, '2026-04-29T00:06:00.000Z');
});
