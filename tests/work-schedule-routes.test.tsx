import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createCatActorId } from '../src/core/actors.ts';
import {
  createDefaultCoreState,
  upsertCoreActor,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { MemoryScheduleStore, type ScheduleTriggerMetadata } from '../src/platform/scheduler/index.ts';
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
        now: input.now,
      },
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
}

async function request(server: ReturnType<typeof createServer>, method: string, path: string, body?: unknown) {
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
