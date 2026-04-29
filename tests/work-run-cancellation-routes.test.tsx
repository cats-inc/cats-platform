import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreMission,
  upsertCoreRun,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { routeWorkApi } from '../src/products/work/api/index.ts';
import type { RuntimeClient } from '../src/runtime/client.ts';

function createMinimalRuntimeClient(
  cancelImpl: (sessionId: string) => Promise<void>,
): RuntimeClient {
  // Cancellation routes only call cancelSession; the rest of the
  // RuntimeClient surface is unused in these scenarios.
  return {
    cancelSession: cancelImpl,
  } as unknown as RuntimeClient;
}

function buildCoreWithRunningRun(options: {
  bridgeSessionId?: string | null;
  missionStatus?: 'queued' | 'running' | 'completed';
  runStatus?: 'queued' | 'running' | 'completed';
} = {}) {
  let core = createDefaultCoreState();
  const missionUpsert = upsertCoreMission(
    core,
    {
      id: 'mission-route',
      title: 'Route mission',
      status: options.missionStatus ?? 'running',
      summary: 'Mission route summary',
      createdAt: '2026-04-29T00:00:00.000Z',
    },
    new Date('2026-04-29T00:00:00.000Z'),
  );
  core = missionUpsert.core;
  const runUpsert = upsertCoreRun(
    core,
    {
      id: 'run-route',
      title: 'Route run',
      status: options.runStatus ?? 'running',
      startedAt: '2026-04-29T00:00:00.000Z',
      summary: 'Route run summary',
      metadata: {
        missionId: 'mission-route',
        ...(options.bridgeSessionId
          ? {
              supervision: {
                runtimeBridge: {
                  sessionId: options.bridgeSessionId,
                  status: 'started',
                },
              },
            }
          : {}),
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  );
  return new MemoryCoreStore(runUpsert.core);
}

function createTestServer(input: {
  coreStore: MemoryCoreStore;
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
    payload: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

const FROZEN_NOW = new Date('2026-04-29T12:00:00.000Z');

test('POST /api/work/runs/:runId/stop returns 200 with stopped status for queued runs', async (t) => {
  const coreStore = buildCoreWithRunningRun({ runStatus: 'queued' });
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(server, 'POST', '/api/work/runs/run-route/stop', {
    requestedByActorId: 'actor-tester',
    reason: 'integration-test',
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload?.status, 'stopped');
  const runRecord = response.payload?.run as { status: string };
  assert.equal(runRecord.status, 'cancelled');
});

test('POST /api/work/runs/:runId/stop returns 409 for a running run without a runtime bridge', async (t) => {
  const coreStore = buildCoreWithRunningRun({
    runStatus: 'running',
    bridgeSessionId: null,
  });
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(server, 'POST', '/api/work/runs/run-route/stop');

  assert.equal(response.status, 409);
  assert.equal(response.payload?.status, 'not_stoppable');
});

test('POST /api/work/runs/:runId/stop returns 200 after a successful runtime cancel', async (t) => {
  const coreStore = buildCoreWithRunningRun({
    runStatus: 'running',
    bridgeSessionId: 'session-route-1',
  });
  const cancelled: string[] = [];
  const runtimeClient = createMinimalRuntimeClient(async (sessionId) => {
    cancelled.push(sessionId);
  });
  const server = createTestServer({ coreStore, runtimeClient, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(server, 'POST', '/api/work/runs/run-route/stop');

  assert.equal(response.status, 200);
  assert.equal(response.payload?.status, 'stopped');
  assert.deepEqual(cancelled, ['session-route-1']);
});

test('POST /api/work/runs/:runId/stop returns 404 for an unknown run id', async (t) => {
  const coreStore = buildCoreWithRunningRun();
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(server, 'POST', '/api/work/runs/run-missing/stop');

  assert.equal(response.status, 404);
  const error = response.payload?.error as { code?: string } | undefined;
  assert.equal(error?.code, 'run_not_found');
});

test('POST /api/work/runs/:runId/stop only accepts POST', async (t) => {
  const coreStore = buildCoreWithRunningRun();
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(server, 'GET', '/api/work/runs/run-route/stop');
  assert.equal(response.status, 405);
});

test('POST /api/work/missions/:missionId/cancel returns 200 with cancelled status when all runs stoppable', async (t) => {
  const coreStore = buildCoreWithRunningRun({
    runStatus: 'queued',
  });
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(
    server,
    'POST',
    '/api/work/missions/mission-route/cancel',
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload?.status, 'cancelled');
  const mission = response.payload?.mission as { status: string };
  assert.equal(mission.status, 'cancelled');
});

test('POST /api/work/missions/:missionId/cancel returns 409 when an active run is not stoppable', async (t) => {
  const coreStore = buildCoreWithRunningRun({
    runStatus: 'running',
    bridgeSessionId: null,
  });
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(
    server,
    'POST',
    '/api/work/missions/mission-route/cancel',
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload?.status, 'blocked');
  const mission = response.payload?.mission as { status: string };
  // Mission must remain non-terminal because a blocker exists.
  assert.equal(mission.status, 'running');
  const blockers = response.payload?.blockers as Array<{ runId: string }>;
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0]?.runId, 'run-route');
});

test('POST /api/work/missions/:missionId/cancel returns 200 already_terminal for terminal missions', async (t) => {
  const coreStore = buildCoreWithRunningRun({
    runStatus: 'completed',
    missionStatus: 'completed',
  });
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(
    server,
    'POST',
    '/api/work/missions/mission-route/cancel',
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload?.status, 'already_terminal');
});

test('POST /api/work/missions/:missionId/cancel returns 404 for an unknown mission id', async (t) => {
  const coreStore = buildCoreWithRunningRun();
  const server = createTestServer({ coreStore, now: () => FROZEN_NOW });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await request(
    server,
    'POST',
    '/api/work/missions/mission-missing/cancel',
  );

  assert.equal(response.status, 404);
  const error = response.payload?.error as { code?: string } | undefined;
  assert.equal(error?.code, 'mission_not_found');
});
