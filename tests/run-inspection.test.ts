import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreTrace,
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreConversation,
  upsertCoreMission,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
} from '../src/core/model/index.js';
import { inspectRun } from '../src/core/runInspection.js';

function seedAgent(coreInput: ReturnType<typeof createDefaultCoreState>, id: string)
: ReturnType<typeof createDefaultCoreState> {
  return upsertCoreActor(
    coreInput,
    {
      id,
      name: id,
      kind: 'orchestrator',
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
}

test('inspectRun returns null for an unknown run id', () => {
  const core = createDefaultCoreState();
  assert.equal(inspectRun(core, 'run-missing'), null);
});

test('inspectRun bundles task / conversation / parent / child runs / orchestrator', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-orchestrator');
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Run conversation',
      kind: 'work_thread',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Anchored task',
      ownerActorId: 'agent-orchestrator',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-parent',
      title: 'Parent run',
      status: 'completed',
      orchestratorActorId: 'agent-orchestrator',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-target',
      title: 'Target run',
      status: 'running',
      taskId: 'task-1',
      conversationId: 'conversation-1',
      parentRunId: 'run-parent',
      orchestratorActorId: 'agent-orchestrator',
      metadata: { idempotencyKey: 'task-1:attempt-2', missionId: 'mission-1' },
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-child',
      title: 'Child of target',
      status: 'queued',
      parentRunId: 'run-target',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      title: 'Owner mission',
      status: 'running',
      metadata: { runId: 'run-target' },
    },
    new Date('2026-04-14T22:01:30.000Z'),
  ).core;

  const inspection = inspectRun(core, 'run-target');
  assert.ok(inspection);
  assert.equal(inspection?.run.id, 'run-target');
  assert.equal(inspection?.classification, 'active');
  assert.equal(inspection?.idempotencyKey, 'task-1:attempt-2');
  assert.deepEqual(inspection?.linkageDiagnostics, []);
  assert.equal(inspection?.task?.id, 'task-1');
  assert.equal(inspection?.conversation?.id, 'conversation-1');
  assert.equal(inspection?.parentRun?.id, 'run-parent');
  assert.equal(inspection?.childRuns.length, 1);
  assert.equal(inspection?.childRuns[0]?.id, 'run-child');
  assert.equal(inspection?.orchestratorActor?.id, 'agent-orchestrator');
  assert.equal(inspection?.owningMission?.id, 'mission-1');
  assert.equal(inspection?.referencingMissions.length, 1);
});

test('inspectRun aggregates traces / checkpoints / outcomes / artifacts attached to the run', () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-with-evidence',
      title: 'Run with evidence',
      status: 'completed',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-1',
      traceId: 'trace-1',
      kind: 'note',
      runId: 'run-with-evidence',
      message: 'Run started',
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-1',
      label: 'Mid-run checkpoint',
      runId: 'run-with-evidence',
    },
    new Date('2026-04-14T22:00:45.000Z'),
  ).core;
  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-1',
      title: 'Run outcome',
      status: 'succeeded',
      runId: 'run-with-evidence',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-1',
      title: 'Run artifact',
      kind: 'build',
      runId: 'run-with-evidence',
    },
    new Date('2026-04-14T22:01:30.000Z'),
  ).core;
  // Sibling records that should NOT be associated.
  core = upsertCoreRun(
    core,
    {
      id: 'run-other',
      title: 'Other run',
      status: 'queued',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-other',
      traceId: 'trace-other',
      kind: 'note',
      runId: 'run-other',
      message: 'Should not appear',
    },
    new Date('2026-04-14T22:02:30.000Z'),
  ).core;

  const inspection = inspectRun(core, 'run-with-evidence');
  assert.ok(inspection);
  assert.equal(inspection?.classification, 'terminal');
  assert.equal(inspection?.traces.length, 1);
  assert.equal(inspection?.traces[0]?.id, 'trace-1');
  assert.equal(inspection?.checkpoints.length, 1);
  assert.equal(inspection?.outcomes.length, 1);
  assert.equal(inspection?.artifacts.length, 1);
});

test('inspectRun classification surfaces blocked runs separately from active and terminal', () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-blocked',
      title: 'Blocked run',
      status: 'blocked',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const inspection = inspectRun(core, 'run-blocked');
  assert.equal(inspection?.classification, 'blocked');
});

test('inspectRun reports linkage diagnostics for missing references', () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-broken',
      title: 'Run with broken anchors',
      status: 'queued',
      taskId: 'task-missing',
      conversationId: 'conversation-missing',
      orchestratorActorId: 'agent-missing',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const inspection = inspectRun(core, 'run-broken');
  assert.ok(inspection);
  const anchors = inspection?.linkageDiagnostics
    .map((diagnostic) => diagnostic.anchor)
    .sort();
  assert.deepEqual(anchors, ['conversation', 'orchestrator_actor', 'task']);
});
