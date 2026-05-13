import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import {
  createInMemoryToolEvidenceSink,
  createToolBoundary,
} from '../src/platform/supervision/toolBoundary.js';
import { createSupervisedToolRegistry } from '../src/platform/supervision/toolRegistry.js';
import {
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  createPhaseScopedWorkToolManifests,
} from '../src/products/work/shared/workToolSurface.js';
import {
  createWorkExecutionPreparationDelegate,
  createWorkExecutionPreparationToolExecutors,
  prepareWorkItemExecution,
} from '../src/products/work/state/workExecutionPreparationDelegate.js';

function coreWithExecutionPreparationItems() {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreWorkItem(core, {
    id: 'work-item-ready',
    title: 'Implement Telegram Work intake',
    status: 'ready',
    projectId: 'project-cats-platform',
    ownerActorId: core.ownerProfile.actorId,
    summary: 'Capture owner-spoken todos into Cats Work Items.',
  }, now).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-planned',
    title: 'Review external tracker binding shape',
    status: 'planned',
    ownerActorId: core.ownerProfile.actorId,
    metadata: {
      workTriage: {
        openQuestions: ['Which tracker should be the first pilot target?'],
      },
    },
  }, now).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-blocked',
    title: 'Launch worker execution from Boss Cat',
    status: 'blocked',
    ownerActorId: core.ownerProfile.actorId,
  }, now).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-completed',
    title: 'Already shipped work',
    status: 'completed',
    ownerActorId: core.ownerProfile.actorId,
  }, now).core;

  return core;
}

test('Work execution preparation proposes task-ready payloads without writing Core', () => {
  const core = coreWithExecutionPreparationItems();
  const before = structuredClone(core);
  const result = prepareWorkItemExecution(core, {
    workItemIds: ['work-item-ready', 'work-item-planned', 'work-item-blocked'],
    executionGoal: 'Ship the smallest useful slice.',
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(
    result.result.proposals.map((proposal) => [
      proposal.workItemId,
      proposal.status,
      proposal.readiness,
      proposal.projectId ?? null,
    ]),
    [
      ['work-item-ready', 'ready', 'ready', 'project-cats-platform'],
      ['work-item-planned', 'planned', 'needs_triage', null],
      ['work-item-blocked', 'blocked', 'blocked', null],
    ],
  );
  assert.match(
    result.result.proposals[0]?.proposedTaskSummary ?? '',
    /Owner execution goal: Ship the smallest useful slice\./,
  );
  assert.deepEqual(result.result.proposals[1]?.openQuestions, [
    'Which tracker should be the first pilot target?',
    'Confirm this Work Item is ready before creating an execution Task.',
  ]);
  assert.deepEqual(result.result.proposals[2]?.blockers, [
    'Work Item is blocked; resolve blockers before creating an execution Task.',
  ]);
  assert.deepEqual(core, before);
});

test('Work execution preparation rejects missing or already-executed Work Items', () => {
  const missing = prepareWorkItemExecution(coreWithExecutionPreparationItems(), {
    workItemIds: ['work-item-missing'],
  });
  assert.equal(missing.status, 'rejected');
  assert.equal(missing.error.code, 'E_PRECHECK_FAILED');

  const completed = prepareWorkItemExecution(coreWithExecutionPreparationItems(), {
    workItemIds: ['work-item-completed'],
  });
  assert.equal(completed.status, 'rejected');
  assert.equal(completed.error.code, 'E_PRECHECK_FAILED');
  assert.deepEqual(completed.error.details, {
    invalidStatuses: [
      {
        workItemId: 'work-item-completed',
        status: 'completed',
      },
    ],
  });
});

test('Work execution preparation runs through supervised read-only boundary', async () => {
  const coreStore = new MemoryCoreStore(coreWithExecutionPreparationItems());
  const delegate = createWorkExecutionPreparationDelegate({ coreStore });
  const executors = createWorkExecutionPreparationToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const result = await boundary.invoke({
    toolName: WORK_ITEM_PREPARE_EXECUTION_TOOL,
    input: {
      workItemIds: ['work-item-ready'],
      executionGoal: 'Open the first implementation task.',
    },
    actionId: 'action-work-item-prepare-execution-1',
    runId: 'run-execution-preparation-1',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'read_only', policyToolScope: 'read_only' },
    execute: executors[WORK_ITEM_PREPARE_EXECUTION_TOOL],
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.result.proposals[0]?.workItemId, 'work-item-ready');
  assert.deepEqual(
    evidenceSink.read().map((event) => [event.toolName, event.status]),
    [[WORK_ITEM_PREPARE_EXECUTION_TOOL, 'applied']],
  );

  const after = await coreStore.readCore();
  assert.equal(after.activities.length, 0);
  assert.equal(after.tasks.length, 0);
  assert.equal(after.runs.length, 0);
});
