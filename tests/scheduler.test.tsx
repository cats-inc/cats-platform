import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createCatActorId } from '../src/core/actors.ts';
import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreRun,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type { CatsCoreState, CoreRunRecord } from '../src/core/types.ts';
import {
  computeNextFireAt,
  createScheduleRule,
  createSchedulerService,
  FileBackedScheduleStore,
  MemoryScheduleStore,
  type ScheduleTriggerMetadata,
} from '../src/platform/scheduler/index.ts';
import { resolveScheduleStatePathFromChatState } from '../src/shared/platformPaths.ts';

function dailyScheduleInput() {
  return {
    title: 'Daily scheduled work',
    timezone: 'Asia/Taipei',
    schedule: {
      kind: 'daily',
      time: '08:00',
    },
    missionTemplate: {
      target: { kind: 'cat', id: 'companion' },
      originSurface: 'schedule',
      intent: 'Greet the owner with suitable content.',
      transportTargets: [{ platform: 'telegram', bindingId: 'telegram-binding-1' }],
      resourceScopes: [{ kind: 'companion_content', catId: 'companion' }],
      toolScopes: ['telegram.send'],
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
    createdByActorId: 'actor-owner',
  };
}

function createCoreWithCompanion(): CatsCoreState {
  let core = createDefaultCoreState();
  core = upsertCoreActor(
    core,
    {
      id: createCatActorId('companion'),
      name: 'Companion',
      kind: 'worker',
      source: 'chat_cat',
      sourceId: 'companion',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: null,
        model: null,
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  return core;
}

function createCoreStoreWithCompanion() {
  return new MemoryCoreStore(createCoreWithCompanion());
}

class InterleavedCoreStore extends MemoryCoreStore {
  private insertedExternalRun = false;

  async updateCore(
    mutator: (state: CatsCoreState) => CatsCoreState | Promise<CatsCoreState>,
  ): Promise<CatsCoreState> {
    if (!this.insertedExternalRun) {
      this.insertedExternalRun = true;
      const current = await super.readCore();
      await super.writeCore(upsertCoreRun(
        current,
        {
          id: 'run-external-concurrent',
          title: 'Concurrent external run',
          status: 'queued',
          createdAt: '2026-04-29T00:04:59.000Z',
          metadata: {
            source: 'test_concurrent_writer',
          },
        },
        new Date('2026-04-29T00:04:59.000Z'),
      ).core);
    }
    return super.updateCore(mutator);
  }
}

function readScheduleTrigger(run: CoreRunRecord): ScheduleTriggerMetadata {
  const trigger = run.metadata.scheduleTrigger as ScheduleTriggerMetadata | undefined;
  assert.ok(trigger);
  return trigger;
}

test('scheduler validates v1 schedule shape and computes timezone-aware daily next fire', () => {
  const rule = createScheduleRule(
    dailyScheduleInput(),
    new Date('2026-04-29T23:30:00.000Z'),
  );

  assert.equal(
    computeNextFireAt(rule, new Date('2026-04-29T23:30:00.000Z')),
    '2026-04-30T00:00:00.000Z',
  );
  assert.throws(
    () => createScheduleRule(
      {
        ...dailyScheduleInput(),
        schedule: {
          kind: 'cron',
          expression: '0 8 * * *',
        },
      },
      new Date('2026-04-29T00:00:00.000Z'),
    ),
    /Cron schedule rules are not supported/u,
  );
  assert.equal(
    createScheduleRule(
      {
        ...dailyScheduleInput(),
        executionPolicy: {
          ...dailyScheduleInput().executionPolicy,
          concurrencyPolicy: 'replace',
        },
      },
      new Date('2026-04-29T00:00:00.000Z'),
    ).executionPolicy.concurrencyPolicy,
    'replace',
  );
});

test('daily schedules handle DST spring-forward gaps by rolling to the next valid local minute', () => {
  const rule = createScheduleRule(
    {
      ...dailyScheduleInput(),
      timezone: 'America/New_York',
      schedule: {
        kind: 'daily',
        time: '02:30',
      },
    },
    new Date('2026-03-08T05:00:00.000Z'),
  );

  assert.equal(
    computeNextFireAt(rule, new Date('2026-03-08T05:00:00.000Z')),
    '2026-03-08T07:00:00.000Z',
  );
  assert.equal(
    computeNextFireAt(rule, new Date('2026-03-08T07:01:00.000Z')),
    '2026-03-09T06:30:00.000Z',
  );
});

test('daily schedules handle DST fall-back overlap without double-firing', () => {
  const rule = createScheduleRule(
    {
      ...dailyScheduleInput(),
      timezone: 'America/New_York',
      schedule: {
        kind: 'daily',
        time: '01:30',
      },
    },
    new Date('2026-11-01T04:00:00.000Z'),
  );

  const firstOccurrence = computeNextFireAt(rule, new Date('2026-11-01T04:00:00.000Z'));
  assert.equal(firstOccurrence, '2026-11-01T05:30:00.000Z');
  assert.equal(
    computeNextFireAt(rule, new Date('2026-11-01T05:31:00.000Z')),
    '2026-11-02T06:30:00.000Z',
  );
});

test('FileBackedScheduleStore persists rules and trigger receipts outside chat state', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-scheduler-'));
  try {
    const chatStatePath = path.join(tempDir, 'state', 'chat-state.local.json');
    const scheduleStatePath = resolveScheduleStatePathFromChatState(chatStatePath);
    const store = new FileBackedScheduleStore(scheduleStatePath);
    const rule = createScheduleRule(
      dailyScheduleInput(),
      new Date('2026-04-29T00:00:00.000Z'),
    );

    await store.upsertRule(rule);
    const receipt = await store.claimTriggerReceipt({
      ruleId: rule.id,
      ruleRevision: rule.revision,
      scheduledFireAt: '2026-04-30T00:00:00.000Z',
      actualFireAt: '2026-04-30T00:00:01.000Z',
      idempotencyKey: 'schedule:test-key',
      reason: 'due',
    });
    await store.updateTriggerReceipt(receipt.receipt.id, {
      status: 'skipped',
      message: 'Skipped by test.',
    });

    const reloaded = new FileBackedScheduleStore(scheduleStatePath);
    assert.equal((await reloaded.listRules()).length, 1);
    assert.equal((await reloaded.listTriggerReceipts()).length, 1);

    const stateDirEntries = await readdir(path.join(tempDir, 'state'));
    assert.deepEqual(stateDirEntries, ['scheduler-state.local.json']);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('ScheduleStore uses injected time for deterministic state and receipt updates', async () => {
  let now = new Date('2026-04-29T00:00:00.000Z');
  const store = new MemoryScheduleStore(undefined, () => now);

  assert.equal((await store.readState()).updatedAt, '2026-04-29T00:00:00.000Z');
  const receipt = await store.claimTriggerReceipt({
    ruleId: 'schedule-clock',
    ruleRevision: 1,
    scheduledFireAt: '2026-04-29T00:00:00.000Z',
    actualFireAt: '2026-04-29T00:00:01.000Z',
    idempotencyKey: 'schedule:clock',
    reason: 'due',
  });

  now = new Date('2026-04-29T00:01:00.000Z');
  const updated = await store.updateTriggerReceipt(receipt.receipt.id, {
    status: 'skipped',
    message: 'Clock-controlled update.',
  });

  assert.equal(updated.updatedAt, '2026-04-29T00:01:00.000Z');
  assert.equal((await store.readState()).updatedAt, '2026-04-29T00:01:00.000Z');
});

test('manual test fire admits a Mission and Run with scheduleTrigger originalTargetRef', async () => {
  const scheduleStore = new MemoryScheduleStore();
  const coreStore = createCoreStoreWithCompanion();
  let now = new Date('2026-04-29T00:00:00.000Z');
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => now,
  });
  const rule = await service.createRule(dailyScheduleInput());

  now = new Date('2026-04-29T00:05:00.000Z');
  const admitted = await service.manualTestFire(rule.id);

  assert.equal(admitted.status, 'admitted');
  assert.ok(admitted.mission);
  assert.ok(admitted.run);
  assert.equal(admitted.mission.assignedAgentId, createCatActorId('companion'));
  assert.equal(admitted.mission.metadata.runId, admitted.run.id);
  assert.equal(admitted.run.title, '[TEST] Scheduled run: Daily scheduled work');
  const trigger = readScheduleTrigger(admitted.run);
  assert.equal(trigger.ruleId, rule.id);
  assert.equal(trigger.reason, 'manual_test');
  assert.deepEqual(trigger.originalTargetRef, { kind: 'cat', id: 'companion' });
  assert.equal('kind' in trigger, false);
  assert.equal(admitted.mission.metadata.originalTargetRef, undefined);

  const storedRule = await scheduleStore.getRule(rule.id);
  assert.equal(storedRule?.lastRunId, null);
  assert.equal(storedRule?.lastFireAt, null);
  assert.equal(storedRule?.nextFireAt, rule.nextFireAt);
  assert.deepEqual((await scheduleStore.listTriggerReceipts())[0]?.metadata, {});
});

test('manual test fire uses idempotency and does not create duplicate runs for same test instant', async () => {
  const scheduleStore = new MemoryScheduleStore();
  const coreStore = createCoreStoreWithCompanion();
  const now = new Date('2026-04-29T00:05:00.000Z');
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => now,
  });
  const rule = await service.createRule(dailyScheduleInput());

  const first = await service.manualTestFire(rule.id);
  const second = await service.manualTestFire(rule.id);
  const core = await coreStore.readCore();

  assert.equal(first.status, 'admitted');
  assert.equal(second.status, 'duplicate');
  assert.equal(core.runs.length, 1);
  assert.equal(core.missions.length, 1);
});

test('agent schedule targets do not duplicate assigned agent as originalTargetRef', async () => {
  const scheduleStore = new MemoryScheduleStore();
  let core = createDefaultCoreState();
  core = upsertCoreActor(
    core,
    {
      id: 'agent-direct-schedule',
      name: 'Direct Schedule Agent',
      kind: 'worker',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: null,
        model: null,
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  const coreStore = new MemoryCoreStore(core);
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => new Date('2026-04-29T00:05:00.000Z'),
  });
  const rule = await service.createRule({
    ...dailyScheduleInput(),
    missionTemplate: {
      ...dailyScheduleInput().missionTemplate,
      target: { kind: 'agent', id: 'agent-direct-schedule' },
    },
  });

  const admitted = await service.manualTestFire(rule.id);
  assert.equal(admitted.status, 'admitted');
  assert.ok(admitted.run);
  assert.equal(readScheduleTrigger(admitted.run).originalTargetRef, undefined);
});

test('scheduler admission uses atomic core updates for mission and run materialization', async () => {
  const scheduleStore = new MemoryScheduleStore();
  const coreStore = new InterleavedCoreStore(createCoreWithCompanion());
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => new Date('2026-04-29T00:05:00.000Z'),
  });
  const rule = await service.createRule(dailyScheduleInput());

  const admitted = await service.manualTestFire(rule.id);
  const core = await coreStore.readCore();

  assert.equal(admitted.status, 'admitted');
  assert.equal(core.runs.some((run) => run.id === 'run-external-concurrent'), true);
  assert.equal(core.runs.some((run) => run.id === admitted.run?.id), true);
  assert.equal(core.missions.some((mission) => mission.id === admitted.mission?.id), true);
});

test('scheduler tick skips due fires while an active run exists for skip concurrency', async () => {
  const scheduleStore = new MemoryScheduleStore();
  let core = createDefaultCoreState();
  core = upsertCoreActor(
    core,
    {
      id: 'agent-scheduled',
      name: 'Scheduled Agent',
      kind: 'worker',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: null,
        model: null,
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-active-schedule',
      title: 'Active scheduled run',
      status: 'running',
      createdAt: '2026-04-29T00:00:00.000Z',
      metadata: {
        scheduleTrigger: {
          ruleId: 'schedule-once',
          ruleRevision: 1,
          scheduledFireAt: '2026-04-29T00:00:00.000Z',
          actualFireAt: '2026-04-29T00:00:00.000Z',
          idempotencyKey: 'schedule:schedule-once:1:2026-04-29T00:00:00.000Z',
          reason: 'due',
        },
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  const coreStore = new MemoryCoreStore(core);
  let now = new Date('2026-04-29T00:00:00.000Z');
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => now,
  });
  await service.createRule({
    id: 'schedule-once',
    title: 'One-off scheduled work',
    enabled: true,
    timezone: 'UTC',
    schedule: {
      kind: 'once',
      fireAt: '2026-04-29T00:05:00.000Z',
    },
    missionTemplate: {
      target: { kind: 'agent', id: 'agent-scheduled' },
      originSurface: 'schedule',
      intent: 'Run once.',
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
    createdByActorId: 'actor-owner',
  });

  now = new Date('2026-04-29T00:10:00.000Z');
  const result = await service.tick();
  const after = await coreStore.readCore();

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, 'skipped');
  assert.equal(after.runs.length, 1);
  assert.equal((await scheduleStore.listTriggerReceipts())[0]?.status, 'skipped');
});

test('scheduler tick replaces active scheduled runs through the cancellation boundary', async () => {
  const scheduleStore = new MemoryScheduleStore();
  let core = createDefaultCoreState();
  core = upsertCoreActor(
    core,
    {
      id: 'agent-scheduled',
      name: 'Scheduled Agent',
      kind: 'worker',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: null,
        model: null,
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-active-replace',
      title: 'Active scheduled run',
      status: 'running',
      createdAt: '2026-04-29T00:00:00.000Z',
      metadata: {
        scheduleTrigger: {
          ruleId: 'schedule-replace',
          ruleRevision: 1,
          scheduledFireAt: '2026-04-29T00:00:00.000Z',
          actualFireAt: '2026-04-29T00:00:00.000Z',
          idempotencyKey: 'schedule:schedule-replace:1:2026-04-29T00:00:00.000Z',
          reason: 'due',
        },
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  const coreStore = new MemoryCoreStore(core);
  const replacedRunIds: string[] = [];
  let now = new Date('2026-04-29T00:00:00.000Z');
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => now,
    replaceActiveRun: async (request) => {
      replacedRunIds.push(request.runId);
      await coreStore.updateCore((current) => upsertCoreRun(
        current,
        {
          id: request.runId,
          title: 'Active scheduled run',
          status: 'cancelled',
          completedAt: request.requestedAt,
          metadata: {
            scheduleTrigger: {
              ruleId: request.ruleId,
              ruleRevision: 1,
              scheduledFireAt: '2026-04-29T00:00:00.000Z',
              actualFireAt: '2026-04-29T00:00:00.000Z',
              idempotencyKey: 'schedule:schedule-replace:1:2026-04-29T00:00:00.000Z',
              reason: 'due',
            },
            replacement: {
              triggerReceiptId: request.triggerReceiptId,
            },
          },
        },
        new Date(request.requestedAt),
      ).core);
    },
  });
  await service.createRule({
    id: 'schedule-replace',
    title: 'Replace scheduled work',
    enabled: true,
    timezone: 'UTC',
    schedule: {
      kind: 'once',
      fireAt: '2026-04-29T00:05:00.000Z',
    },
    missionTemplate: {
      target: { kind: 'agent', id: 'agent-scheduled' },
      originSurface: 'schedule',
      intent: 'Run once.',
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'replace',
      misfirePolicy: 'skip',
      retryPolicy: {
        maxAttempts: 0,
        backoff: 'none',
      },
    },
    createdByActorId: 'actor-owner',
  });

  now = new Date('2026-04-29T00:10:00.000Z');
  const result = await service.tick();
  const after = await coreStore.readCore();
  const oldRun = after.runs.find((run) => run.id === 'run-active-replace');
  const replacementRuns = after.runs.filter((run) =>
    readScheduleTrigger(run).ruleId === 'schedule-replace' && run.id !== 'run-active-replace');

  assert.deepEqual(replacedRunIds, ['run-active-replace']);
  assert.equal(result.results[0]?.status, 'admitted');
  assert.equal(oldRun?.status, 'cancelled');
  assert.equal(replacementRuns.length, 1);
  assert.equal((await scheduleStore.listTriggerReceipts())[0]?.status, 'admitted');
});

test('scheduler retries failed fires within the bounded retry policy', async () => {
  const scheduleStore = new MemoryScheduleStore();
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  let now = new Date('2026-04-29T00:00:00.000Z');
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => now,
  });
  await service.createRule({
    id: 'schedule-retry-once',
    title: 'Retry scheduled work',
    enabled: true,
    timezone: 'UTC',
    schedule: {
      kind: 'once',
      fireAt: '2026-04-29T00:05:00.000Z',
    },
    missionTemplate: {
      target: { kind: 'agent', id: 'agent-retry' },
      originSurface: 'schedule',
      intent: 'Retry once agent appears.',
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'skip',
      retryPolicy: {
        maxAttempts: 2,
        backoff: 'none',
        pauseAfterConsecutiveFailures: null,
      },
    },
    createdByActorId: 'actor-owner',
  });

  now = new Date('2026-04-29T00:10:00.000Z');
  const first = await service.tick();
  const afterFailure = await scheduleStore.getRule('schedule-retry-once');

  assert.equal(first.results[0]?.status, 'failed');
  assert.equal(afterFailure?.retryState?.attempt, 1);
  assert.equal(afterFailure?.retryState?.maxAttempts, 2);
  assert.equal(afterFailure?.retryState?.nextRetryAt, '2026-04-29T00:10:00.000Z');
  assert.equal(afterFailure?.nextFireAt, null);

  await coreStore.updateCore((current) => upsertCoreActor(
    current,
    {
      id: 'agent-retry',
      name: 'Retry Agent',
      kind: 'worker',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: null,
        model: null,
      },
    },
    new Date('2026-04-29T00:10:01.000Z'),
  ).core);

  now = new Date('2026-04-29T00:10:01.000Z');
  const second = await service.tick();
  const afterRetry = await scheduleStore.getRule('schedule-retry-once');
  const receipts = await scheduleStore.listTriggerReceipts({ ruleId: 'schedule-retry-once' });
  const retryReceipt = receipts.find((receipt) => receipt.reason === 'retry');

  assert.equal(second.results[0]?.status, 'admitted');
  assert.equal(readScheduleTrigger(second.results[0]!.run!).reason, 'retry');
  assert.equal(afterRetry?.retryState, null);
  assert.equal(afterRetry?.consecutiveFailures, 0);
  assert.equal(afterRetry?.lastRunId, second.results[0]?.run?.id);
  assert.equal(retryReceipt?.status, 'admitted');
  assert.equal(retryReceipt?.metadata.retryAttempt, 1);
});

test('scheduler pauses a rule after repeated failed scheduled fires', async () => {
  const scheduleStore = new MemoryScheduleStore();
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  let now = new Date('2026-04-29T00:00:00.000Z');
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => now,
  });
  await service.createRule({
    id: 'schedule-pause-failures',
    title: 'Pause failing work',
    enabled: true,
    timezone: 'UTC',
    schedule: {
      kind: 'daily',
      time: '00:05',
    },
    missionTemplate: {
      target: { kind: 'agent', id: 'agent-never-present' },
      originSurface: 'schedule',
      intent: 'Pause after repeated failures.',
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'skip',
      retryPolicy: {
        maxAttempts: 0,
        backoff: 'none',
        pauseAfterConsecutiveFailures: 2,
      },
    },
    createdByActorId: 'actor-owner',
  });

  now = new Date('2026-04-29T00:06:00.000Z');
  const first = await service.tick();
  const afterFirstFailure = await scheduleStore.getRule('schedule-pause-failures');

  assert.equal(first.results[0]?.status, 'failed');
  assert.equal(afterFirstFailure?.enabled, true);
  assert.equal(afterFirstFailure?.consecutiveFailures, 1);
  assert.equal(afterFirstFailure?.pausedAt, null);

  now = new Date('2026-04-30T00:06:00.000Z');
  const second = await service.tick();
  const afterSecondFailure = await scheduleStore.getRule('schedule-pause-failures');

  assert.equal(second.results[0]?.status, 'failed');
  assert.equal(afterSecondFailure?.enabled, false);
  assert.equal(afterSecondFailure?.nextFireAt, null);
  assert.equal(afterSecondFailure?.consecutiveFailures, 2);
  assert.equal(afterSecondFailure?.pausedAt, '2026-04-30T00:06:00.000Z');
  assert.equal(
    afterSecondFailure?.pauseReason,
    'Paused after 2 consecutive failed scheduled fires.',
  );
});

test('startup misfire policy skips or admits missed fires deterministically', async () => {
  const scheduleStore = new MemoryScheduleStore();
  let core = createDefaultCoreState();
  core = upsertCoreActor(
    core,
    {
      id: 'agent-misfire',
      name: 'Misfire Agent',
      kind: 'worker',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: null,
        model: null,
      },
    },
    new Date('2026-04-29T00:00:00.000Z'),
  ).core;
  const coreStore = new MemoryCoreStore(core);
  let now = new Date('2026-04-29T00:00:00.000Z');
  const service = createSchedulerService({
    scheduleStore,
    coreStore,
    now: () => now,
  });

  await service.createRule({
    id: 'schedule-misfire-skip',
    title: 'Skip missed fire',
    enabled: true,
    timezone: 'UTC',
    schedule: {
      kind: 'once',
      fireAt: '2026-04-29T00:05:00.000Z',
    },
    missionTemplate: {
      target: { kind: 'agent', id: 'agent-misfire' },
      originSurface: 'schedule',
      intent: 'Skip missed.',
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
    createdByActorId: 'actor-owner',
  });
  await service.createRule({
    id: 'schedule-misfire-fire-once',
    title: 'Fire missed once',
    enabled: true,
    timezone: 'UTC',
    schedule: {
      kind: 'once',
      fireAt: '2026-04-29T00:05:00.000Z',
    },
    missionTemplate: {
      target: { kind: 'agent', id: 'agent-misfire' },
      originSurface: 'schedule',
      intent: 'Fire missed.',
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'fire_once',
      retryPolicy: {
        maxAttempts: 0,
        backoff: 'none',
      },
    },
    createdByActorId: 'actor-owner',
  });

  now = new Date('2026-04-29T00:10:00.000Z');
  const result = await service.tick({ startup: true });
  const after = await coreStore.readCore();
  const receipts = await scheduleStore.listTriggerReceipts();

  assert.equal(result.results.length, 2);
  assert.equal(result.results.filter((item) => item.status === 'skipped').length, 1);
  assert.equal(result.results.filter((item) => item.status === 'admitted').length, 1);
  assert.equal(after.runs.length, 1);
  assert.equal(receipts.filter((receipt) => receipt.reason === 'startup_misfire').length, 2);
});

test('scheduler modules stay behind supervision and tool/content boundaries', async () => {
  const schedulerDir = path.resolve('src/platform/scheduler');
  const fileNames = await readdir(schedulerDir);
  for (const fileName of fileNames.filter((candidate) => candidate.endsWith('.ts'))) {
    const source = await readFile(path.join(schedulerDir, fileName), 'utf-8');
    assert.doesNotMatch(source, /platform\/runtime|RuntimeClient|runtimeClient/u);
    assert.doesNotMatch(source, /transports\/telegram|Telegram/u);
    assert.doesNotMatch(source, /companion-box|products\/chat\/companion|CompanionBox/u);
  }
});
