import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreRun,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import {
  SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL,
  createInMemoryToolEvidenceSink,
  createSupervisedLifecycleTools,
  createSupervisedToolRegistry,
  createToolBoundary,
  type AsyncLifecycleRequestResult,
} from '../src/platform/supervision/index.ts';

test('supervised lifecycle spawn creates a bounded queued child run', async () => {
  const coreStore = new MemoryCoreStore(
    upsertCoreRun(
      createDefaultCoreState(),
      {
        id: 'run-parent-lifecycle',
        title: 'Parent lifecycle run',
        status: 'running',
        conversationId: 'conversation-lifecycle',
        taskId: 'task-lifecycle',
        createdAt: '2026-04-25T14:00:00.000Z',
        metadata: {
          supervision: {
            budget: {
              maxTokens: 10_000,
              maxDurationMs: 60_000,
              hardStop: true,
            },
          },
        },
      },
      new Date('2026-04-25T14:00:00.000Z'),
    ).core,
  );
  const lifecycleTools = createSupervisedLifecycleTools({
    coreStore,
    now: () => new Date('2026-04-25T14:01:00.000Z'),
  });
  const registry = createSupervisedToolRegistry();
  lifecycleTools.register(registry);
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-04-25T14:01:00.000Z',
  });

  const result = await boundary.invoke({
    toolName: SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL,
    input: {
      title: 'Child lifecycle run',
      target: {
        kind: 'durable_agent',
        agentId: 'agent:worker',
        projection: 'work',
      },
      requestedBudget: {
        maxTokens: 20_000,
        maxDurationMs: 10_000,
        hardStop: false,
      },
    },
    actionId: 'action-spawn-child',
    runId: 'run-parent-lifecycle',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'narrow_write',
      policyToolScope: 'narrow_write',
    },
    execute: lifecycleTools.executors[SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL],
  });

  assert.equal(result.status, 'applied');
  const applied = result as Extract<AsyncLifecycleRequestResult, { status: 'applied' }>;
  assert.equal(applied.result.kind, 'run');
  assert.equal(applied.result.parentRunId, 'run-parent-lifecycle');

  const core = await coreStore.readCore();
  const childRun = core.runs.find((candidate) => candidate.id === applied.result.runId);
  const supervision = childRun?.metadata.supervision as Record<string, unknown> | undefined;
  const runState = supervision?.runState as Record<string, unknown> | undefined;

  assert.equal(childRun?.status, 'queued');
  assert.equal(childRun?.parentRunId, 'run-parent-lifecycle');
  assert.equal(childRun?.conversationId, 'conversation-lifecycle');
  assert.equal(childRun?.taskId, null);
  assert.deepEqual(supervision?.budget, {
    maxTokens: 10_000,
    maxDurationMs: 10_000,
    hardStop: true,
  });
  assert.equal(supervision?.budgetSource, 'parent_run_cap');
  assert.deepEqual(supervision?.delegation, {
    requestedByRunId: 'run-parent-lifecycle',
    parentRunId: 'run-parent-lifecycle',
    ancestryDepth: 0,
  });
  assert.deepEqual(supervision?.toolScope, {
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
    effectiveToolScope: 'narrow_write',
  });
  assert.equal(runState?.primaryState, 'queued');
  assert.deepEqual(evidenceSink.read().map((event) => event.status), ['applied']);
});

test('supervised lifecycle spawn rejects parent runs outside the delegating run tree', async () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-delegating',
      title: 'Delegating run',
      status: 'running',
      createdAt: '2026-04-25T14:10:00.000Z',
      metadata: { supervision: { budget: { maxTokens: 5_000 } } },
    },
    new Date('2026-04-25T14:10:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-sibling',
      title: 'Sibling run',
      status: 'running',
      createdAt: '2026-04-25T14:10:00.000Z',
      metadata: { supervision: { budget: { maxTokens: 5_000 } } },
    },
    new Date('2026-04-25T14:10:00.000Z'),
  ).core;
  const coreStore = new MemoryCoreStore(core);
  const lifecycleTools = createSupervisedLifecycleTools({
    coreStore,
    now: () => new Date('2026-04-25T14:11:00.000Z'),
  });

  const result = await lifecycleTools.executors[SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL](
    {
      title: 'Invalid child',
      parentRunId: 'run-sibling',
      target: { kind: 'durable_agent', agentId: 'agent:worker' },
    },
    {
      actionId: 'action-spawn-invalid-parent',
      runId: 'run-delegating',
      actorRef: 'agent:boss',
      manifest: lifecycleTools.manifests[0]!,
      grant: {
        parentToolScope: 'narrow_write',
        policyToolScope: 'narrow_write',
      },
      effectiveToolScope: 'narrow_write',
    },
  );

  assert.equal(result.status, 'rejected');
  assert.match(
    result.status === 'rejected' ? result.error.message : '',
    /outside the delegating run tree/u,
  );
});

test('supervised lifecycle spawn rejects existing run ancestry cycles', async () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-cycle-a',
      title: 'Cycle A',
      status: 'running',
      parentRunId: 'run-cycle-b',
      createdAt: '2026-04-25T14:12:00.000Z',
      metadata: { supervision: { budget: { maxTokens: 5_000 } } },
    },
    new Date('2026-04-25T14:12:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-cycle-b',
      title: 'Cycle B',
      status: 'running',
      parentRunId: 'run-cycle-a',
      createdAt: '2026-04-25T14:12:00.000Z',
      metadata: { supervision: { budget: { maxTokens: 5_000 } } },
    },
    new Date('2026-04-25T14:12:00.000Z'),
  ).core;
  const coreStore = new MemoryCoreStore(core);
  const lifecycleTools = createSupervisedLifecycleTools({
    coreStore,
    now: () => new Date('2026-04-25T14:13:00.000Z'),
  });

  const result = await lifecycleTools.executors[SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL](
    {
      title: 'Cycle child',
      parentRunId: 'run-cycle-a',
      target: { kind: 'durable_agent', agentId: 'agent:worker' },
    },
    {
      actionId: 'action-spawn-cycle',
      runId: 'run-cycle-a',
      actorRef: 'agent:boss',
      manifest: lifecycleTools.manifests[0]!,
      grant: {
        parentToolScope: 'narrow_write',
        policyToolScope: 'narrow_write',
      },
      effectiveToolScope: 'narrow_write',
    },
  );

  assert.equal(result.status, 'rejected');
  assert.match(
    result.status === 'rejected' ? result.error.message : '',
    /delegation cycle/u,
  );
});

test('supervised lifecycle spawn rejects parent runs without a supervision budget', async () => {
  const coreStore = new MemoryCoreStore(
    upsertCoreRun(
      createDefaultCoreState(),
      {
        id: 'run-parent-without-budget',
        title: 'Parent without budget',
        status: 'running',
        conversationId: 'conversation-lifecycle',
        createdAt: '2026-04-25T14:05:00.000Z',
      },
      new Date('2026-04-25T14:05:00.000Z'),
    ).core,
  );
  const lifecycleTools = createSupervisedLifecycleTools({
    coreStore,
    now: () => new Date('2026-04-25T14:06:00.000Z'),
  });
  const registry = createSupervisedToolRegistry();
  lifecycleTools.register(registry);
  const boundary = createToolBoundary({
    registry,
    evidenceSink: createInMemoryToolEvidenceSink(),
    now: () => '2026-04-25T14:06:00.000Z',
  });

  const result = await boundary.invoke({
    toolName: SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL,
    input: {
      title: 'Child should not spawn',
      target: {
        kind: 'durable_agent',
        agentId: 'agent:worker',
      },
    },
    actionId: 'action-spawn-without-budget',
    runId: 'run-parent-without-budget',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'narrow_write',
      policyToolScope: 'narrow_write',
    },
    execute: lifecycleTools.executors[SUPERVISED_LIFECYCLE_RUN_SPAWN_TOOL],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(
    result.status === 'rejected' ? result.error.code : null,
    'E_BUDGET_EXCEEDED',
  );
  assert.equal((await coreStore.readCore()).runs.length, 1);
});
