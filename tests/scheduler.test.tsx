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
import type { CoreRunRecord } from '../src/core/types.ts';
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
    title: 'Daily greeting',
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

function createCoreStoreWithCompanion() {
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
  return new MemoryCoreStore(core);
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
  const trigger = readScheduleTrigger(admitted.run);
  assert.equal(trigger.ruleId, rule.id);
  assert.equal(trigger.reason, 'manual_test');
  assert.deepEqual(trigger.originalTargetRef, { kind: 'cat', id: 'companion' });
  assert.equal('kind' in trigger, false);
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

test('scheduler modules stay behind the supervision boundary and do not import runtime or Telegram', async () => {
  const schedulerDir = path.resolve('src/platform/scheduler');
  const fileNames = await readdir(schedulerDir);
  for (const fileName of fileNames.filter((candidate) => candidate.endsWith('.ts'))) {
    const source = await readFile(path.join(schedulerDir, fileName), 'utf-8');
    assert.doesNotMatch(source, /platform\/runtime|RuntimeClient|runtimeClient/u);
    assert.doesNotMatch(source, /transports\/telegram|Telegram/u);
  }
});
