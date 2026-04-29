import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreMission,
  upsertCoreRun,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type { CatsCoreState, CoreRunRecord } from '../src/core/types.ts';
import {
  cancelMission,
  stopRun,
} from '../src/platform/supervision/runCancellation.ts';
import type {
  CoreCancellationMetadata,
} from '../src/platform/supervision/runCancellationContracts.ts';
import type { RuntimeClient } from '../src/runtime/client.ts';

const FROZEN_NOW = new Date('2026-04-29T12:00:00.000Z');

function nowFn(): Date {
  return FROZEN_NOW;
}

function emptyRuntimeClient(
  cancelImpl: (sessionId: string) => Promise<void>,
): RuntimeClient {
  return {
    cancelSession: cancelImpl,
  } as unknown as RuntimeClient;
}

interface BuildCoreOptions {
  runMetadata?: Record<string, unknown>;
  runStatus?: CoreRunRecord['status'];
  missionStatus?: CatsCoreState['missions'][number]['status'];
}

function buildCoreWithMissionAndRun(
  options: BuildCoreOptions = {},
): { core: CatsCoreState; missionId: string; runId: string } {
  let core = createDefaultCoreState();
  const missionUpsert = upsertCoreMission(
    core,
    {
      id: 'mission-test',
      title: 'Test mission',
      status: options.missionStatus ?? 'running',
      summary: 'Test mission summary',
      createdAt: '2026-04-29T00:00:00.000Z',
    },
    new Date('2026-04-29T00:00:00.000Z'),
  );
  core = missionUpsert.core;
  const runUpsert = upsertCoreRun(
    core,
    {
      id: 'run-test',
      title: 'Test run',
      status: options.runStatus ?? 'running',
      startedAt: '2026-04-29T00:00:00.000Z',
      summary: 'Test run summary',
      metadata: {
        missionId: 'mission-test',
        ...options.runMetadata,
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  );
  core = runUpsert.core;
  return { core, missionId: 'mission-test', runId: 'run-test' };
}

function readCancellationEntries(
  metadata: Record<string, unknown>,
): CoreCancellationMetadata[] {
  const value = metadata.cancellation;
  return Array.isArray(value)
    ? (value as CoreCancellationMetadata[])
    : [];
}

test('stopRun returns null for unknown run id', async () => {
  const coreStore = new MemoryCoreStore();
  const result = await stopRun(
    { coreStore, now: nowFn },
    'run-does-not-exist',
  );
  assert.equal(result, null);
});

test('stopRun returns already_terminal for runs in a terminal state', async () => {
  const { core, runId } = buildCoreWithMissionAndRun({
    runStatus: 'completed',
  });
  const coreStore = new MemoryCoreStore(core);
  const result = await stopRun({ coreStore, now: nowFn }, runId);
  assert.ok(result);
  assert.equal(result.status, 'already_terminal');
  assert.equal(result.run.status, 'completed');
});

test('stopRun stops a queued run without contacting runtime', async () => {
  const { core, runId, missionId } = buildCoreWithMissionAndRun({
    runStatus: 'queued',
  });
  const coreStore = new MemoryCoreStore(core);
  let runtimeCalls = 0;
  const runtimeClient = emptyRuntimeClient(async () => {
    runtimeCalls += 1;
  });
  const result = await stopRun(
    { coreStore, runtimeClient, now: nowFn },
    runId,
    { reason: 'operator' },
  );
  assert.ok(result);
  assert.equal(result.status, 'stopped');
  assert.equal(result.run.status, 'cancelled');
  assert.equal(runtimeCalls, 0);
  assert.equal(result.runtimeAbort.attempted, false);
  assert.equal(result.runtimeAbort.status, 'not_applicable');
  assert.equal(result.mission?.id, missionId);
  const cancellationEntries = readCancellationEntries(result.run.metadata);
  assert.equal(cancellationEntries.length, 1);
  assert.equal(cancellationEntries[0]?.source, 'run_stop');
  assert.equal(cancellationEntries[0]?.reason, 'operator');
});

test('stopRun returns not_stoppable for a running run with no supervised bridge', async () => {
  const { core, runId } = buildCoreWithMissionAndRun({ runStatus: 'running' });
  const coreStore = new MemoryCoreStore(core);
  const result = await stopRun({ coreStore, now: nowFn }, runId);
  assert.ok(result);
  assert.equal(result.status, 'not_stoppable');
  assert.equal(result.run.status, 'running');
  assert.equal(result.runtimeAbort.attempted, false);
});

test('stopRun returns not_stoppable when runtimeClient is unavailable for a running run', async () => {
  const { core, runId } = buildCoreWithMissionAndRun({
    runStatus: 'running',
    runMetadata: {
      supervision: {
        runtimeBridge: {
          sessionId: 'session-abc',
          status: 'started',
        },
      },
    },
  });
  const coreStore = new MemoryCoreStore(core);
  const result = await stopRun({ coreStore, now: nowFn }, runId);
  assert.ok(result);
  assert.equal(result.status, 'not_stoppable');
  assert.equal(result.run.status, 'running');
  assert.equal(result.runtimeAbort.status, 'failed');
  assert.equal(result.runtimeAbort.error, 'runtime_client_unavailable');
});

test('stopRun marks the run cancelled after a successful runtime cancel call', async () => {
  const { core, runId } = buildCoreWithMissionAndRun({
    runStatus: 'running',
    runMetadata: {
      supervision: {
        runtimeBridge: {
          sessionId: 'session-abc',
          status: 'started',
        },
      },
    },
  });
  const coreStore = new MemoryCoreStore(core);
  const sessionsCancelled: string[] = [];
  const runtimeClient = emptyRuntimeClient(async (sessionId) => {
    sessionsCancelled.push(sessionId);
  });
  const result = await stopRun(
    { coreStore, runtimeClient, now: nowFn },
    runId,
  );
  assert.ok(result);
  assert.equal(result.status, 'stopped');
  assert.equal(result.run.status, 'cancelled');
  assert.deepEqual(sessionsCancelled, ['session-abc']);
  assert.equal(result.runtimeAbort.attempted, true);
  assert.equal(result.runtimeAbort.status, 'requested');
  assert.equal(result.runtimeAbort.sessionId, 'session-abc');
  const supervision = (result.run.metadata.supervision ?? null) as
    | Record<string, unknown>
    | null;
  const bridge = supervision?.runtimeBridge as Record<string, unknown> | undefined;
  assert.equal(bridge?.status, 'cancel_requested');
  assert.equal(bridge?.sessionId, 'session-abc');
});

test('stopRun returns not_stoppable and leaves the run running when cancelSession throws', async () => {
  const { core, runId } = buildCoreWithMissionAndRun({
    runStatus: 'running',
    runMetadata: {
      supervision: {
        runtimeBridge: {
          sessionId: 'session-fails',
          status: 'started',
        },
      },
    },
  });
  const coreStore = new MemoryCoreStore(core);
  const runtimeClient = emptyRuntimeClient(async () => {
    throw new Error('runtime offline');
  });
  const result = await stopRun(
    { coreStore, runtimeClient, now: nowFn },
    runId,
  );
  assert.ok(result);
  assert.equal(result.status, 'not_stoppable');
  assert.equal(result.run.status, 'running');
  assert.equal(result.runtimeAbort.status, 'failed');
  assert.equal(result.runtimeAbort.error, 'runtime offline');
  // Persisted state must still show running, not cancelled.
  const persistedCore = await coreStore.readCore();
  const persistedRun = persistedCore.runs.find((run) => run.id === runId);
  assert.equal(persistedRun?.status, 'running');
});

test('stopRun preserves existing scheduleTrigger and supervision metadata', async () => {
  const scheduleTrigger = {
    ruleId: 'rule-a',
    ruleRevision: 1,
    scheduledFireAt: '2026-04-29T08:00:00.000Z',
    actualFireAt: '2026-04-29T08:00:01.000Z',
    idempotencyKey: 'schedule:rule-a:1:2026-04-29T08:00:00.000Z',
    reason: 'due',
  };
  const { core, runId } = buildCoreWithMissionAndRun({
    runStatus: 'queued',
    runMetadata: {
      scheduleTrigger,
      supervision: {
        runtimeBridge: {
          status: 'launching',
          sessionId: null,
          launchedAt: '2026-04-29T08:00:01.000Z',
        },
      },
    },
  });
  const coreStore = new MemoryCoreStore(core);
  const result = await stopRun({ coreStore, now: nowFn }, runId);
  assert.ok(result);
  assert.equal(result.status, 'stopped');
  assert.deepEqual(result.run.metadata.scheduleTrigger, scheduleTrigger);
  const supervision = result.run.metadata.supervision as Record<string, unknown>;
  const bridge = supervision.runtimeBridge as Record<string, unknown>;
  assert.equal(bridge.status, 'cancel_requested');
  assert.equal(bridge.launchedAt, '2026-04-29T08:00:01.000Z');
});

test('cancelMission cancels the mission when every active run is stoppable', async () => {
  const { core, missionId } = buildCoreWithMissionAndRun({
    runStatus: 'queued',
  });
  const coreStore = new MemoryCoreStore(core);
  const result = await cancelMission(
    { coreStore, now: nowFn },
    missionId,
    { reason: 'cleanup' },
  );
  assert.ok(result);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.mission.status, 'cancelled');
  assert.equal(result.runResults.length, 1);
  assert.equal(result.runResults[0]?.status, 'stopped');
  assert.equal(result.blockers.length, 0);
});

test('cancelMission returns blocked when an active run is not stoppable', async () => {
  const { core, missionId } = buildCoreWithMissionAndRun({
    runStatus: 'running',
  });
  const coreStore = new MemoryCoreStore(core);
  const result = await cancelMission({ coreStore, now: nowFn }, missionId);
  assert.ok(result);
  assert.equal(result.status, 'blocked');
  // Mission must NOT have been transitioned to cancelled.
  assert.equal(result.mission.status, 'running');
  assert.equal(result.blockers.length, 1);
  assert.equal(result.blockers[0]?.runId, 'run-test');
});

test('cancelMission is idempotent for missions already in a terminal state', async () => {
  const { core, missionId } = buildCoreWithMissionAndRun({
    missionStatus: 'completed',
    runStatus: 'completed',
  });
  const coreStore = new MemoryCoreStore(core);
  const result = await cancelMission({ coreStore, now: nowFn }, missionId);
  assert.ok(result);
  assert.equal(result.status, 'already_terminal');
});
