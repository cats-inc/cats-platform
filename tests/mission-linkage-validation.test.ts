import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreConversation,
  upsertCoreMission,
  upsertCoreRun,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import {
  findOrphanedMissionLinkages,
  findOrphanedRunLinkages,
  validateCoreMissionRunLinkages,
  validateMissionLinkage,
  validateRunLinkage,
} from '../src/core/missionLinkageValidation.js';

function seedAgent(coreInput: ReturnType<typeof createDefaultCoreState>, id: string)
: ReturnType<typeof createDefaultCoreState> {
  return upsertCoreActor(
    coreInput,
    {
      id,
      name: id,
      kind: 'worker',
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
}

test('validateMissionLinkage accepts a fully unanchored mission', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      title: 'Floating mission',
      status: 'planned',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-1');
  assert.ok(mission);

  assert.deepEqual(validateMissionLinkage(core, mission), []);
});

test('validateMissionLinkage accepts every anchor when records exist', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-cat-a');
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Mission conversation',
      kind: 'work_thread',
      participantActorIds: ['agent-cat-a'],
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Anchored work',
      ownerActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Run for mission',
      status: 'running',
      orchestratorActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:05:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      title: 'Anchored mission',
      managedWorkId: 'work-item-1',
      conversationId: 'conversation-1',
      assignedAgentId: 'agent-cat-a',
      status: 'running',
      metadata: { runId: 'run-1' },
    },
    new Date('2026-04-14T22:10:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-1');
  assert.ok(mission);

  assert.deepEqual(validateMissionLinkage(core, mission), []);
});

test('validateMissionLinkage flags every anchor missing its record', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-broken',
      title: 'Broken mission',
      managedWorkId: 'work-item-missing',
      conversationId: 'conversation-missing',
      sourceTurnId: 'turn-missing',
      sourceLaneId: 'lane-missing',
      assignedAgentId: 'agent-missing',
      status: 'planned',
      metadata: { runId: 'run-missing' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-broken');
  assert.ok(mission);

  const diagnostics = validateMissionLinkage(core, mission);
  const anchors = diagnostics.map((diagnostic) => diagnostic.anchor).sort();
  assert.deepEqual(anchors, [
    'assigned_agent',
    'conversation',
    'managed_work',
    'metadata_run',
    'source_lane',
    'source_turn',
  ]);
  assert.ok(diagnostics.every((diagnostic) =>
    diagnostic.missionId === 'mission-broken'
    && diagnostic.reason === 'missing_record'));
});

test('validateMissionLinkage ignores blank metadata runId values', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-blank-run',
      title: 'Mission with blank metadata runId',
      status: 'draft',
      metadata: { runId: '   ' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-blank-run');
  assert.ok(mission);

  assert.deepEqual(validateMissionLinkage(core, mission), []);
});

test('validateRunLinkage flags missing task / conversation / parent run / orchestrator', () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-broken',
      title: 'Broken run',
      taskId: 'task-missing',
      conversationId: 'conversation-missing',
      parentRunId: 'parent-run-missing',
      orchestratorActorId: 'agent-missing',
      status: 'queued',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const run = core.runs.find((candidate) => candidate.id === 'run-broken');
  assert.ok(run);

  const diagnostics = validateRunLinkage(core, run);
  const anchors = diagnostics.map((diagnostic) => diagnostic.anchor).sort();
  assert.deepEqual(anchors, [
    'conversation',
    'orchestrator_actor',
    'parent_run',
    'task',
  ]);
});

test('validateRunLinkage accepts a fully anchored run', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-cat-a');
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Run conversation',
      kind: 'code_thread',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Anchored task',
      ownerActorId: 'agent-cat-a',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-parent',
      title: 'Parent',
      status: 'completed',
      orchestratorActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-child',
      title: 'Child',
      taskId: 'task-1',
      conversationId: 'conversation-1',
      parentRunId: 'run-parent',
      orchestratorActorId: 'agent-cat-a',
      status: 'running',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  const run = core.runs.find((candidate) => candidate.id === 'run-child');
  assert.ok(run);

  assert.deepEqual(validateRunLinkage(core, run), []);
});

test('validateMissionLinkage flags a broken parentMissionId metadata reference', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-orphan-parent',
      title: 'Orphan parent mission',
      status: 'queued',
      metadata: { parentMissionId: 'mission-missing' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-orphan-parent');
  assert.ok(mission);

  const diagnostics = validateMissionLinkage(core, mission);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.anchor, 'parent_mission');
  assert.equal(diagnostics[0]?.referencedId, 'mission-missing');
});

test('validateMissionLinkage flags broken transport_ingress trigger references', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-transport',
      title: 'Transport-triggered mission',
      status: 'queued',
      metadata: {
        trigger: {
          kind: 'transport_ingress',
          transportBindingId: 'binding-missing',
          conversationId: 'conversation-missing',
          receivedAt: '2026-05-09T01:00:00.000Z',
        },
      },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-transport');
  assert.ok(mission);

  const anchors = validateMissionLinkage(core, mission)
    .map((diagnostic) => diagnostic.anchor)
    .sort();
  assert.deepEqual(anchors, ['trigger_conversation', 'trigger_transport_binding']);
});

test('validateMissionLinkage flags a broken owner_action trigger ownerActorId', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-owner',
      title: 'Owner-triggered mission',
      status: 'queued',
      metadata: {
        trigger: {
          kind: 'owner_action',
          ownerActorId: 'agent-deleted',
          invokedAt: '2026-05-09T01:00:00.000Z',
          reason: null,
        },
      },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-owner');
  assert.ok(mission);

  const diagnostics = validateMissionLinkage(core, mission);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.anchor, 'trigger_owner_actor');
  assert.equal(diagnostics[0]?.referencedId, 'agent-deleted');
});

test('validateMissionLinkage stays silent when owner_action trigger references a real actor', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-owner');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-owner-ok',
      title: 'Owner-triggered mission',
      status: 'queued',
      metadata: {
        trigger: {
          kind: 'owner_action',
          ownerActorId: 'agent-owner',
          invokedAt: '2026-05-09T01:00:00.000Z',
          reason: null,
        },
      },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-owner-ok');
  assert.ok(mission);

  assert.deepEqual(validateMissionLinkage(core, mission), []);
});

test('validateMissionLinkage flags broken workflow_continuation trigger references', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-continued',
      title: 'Workflow-continued mission',
      status: 'queued',
      metadata: {
        trigger: {
          kind: 'workflow_continuation',
          parentMissionId: 'mission-missing',
          parentRunId: 'run-missing',
          continuedAt: '2026-05-09T01:00:00.000Z',
        },
      },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-continued');
  assert.ok(mission);

  const anchors = validateMissionLinkage(core, mission)
    .map((diagnostic) => diagnostic.anchor)
    .sort();
  assert.deepEqual(anchors, ['trigger_parent_mission', 'trigger_parent_run']);
});

test('validateMissionLinkage stays silent when trigger references resolve', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-parent',
      title: 'Parent',
      status: 'completed',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-parent',
      title: 'Parent run',
      status: 'completed',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-continued',
      title: 'Continued mission',
      status: 'queued',
      metadata: {
        trigger: {
          kind: 'workflow_continuation',
          parentMissionId: 'mission-parent',
          parentRunId: 'run-parent',
          continuedAt: '2026-05-09T01:00:00.000Z',
        },
      },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-continued');
  assert.ok(mission);

  assert.deepEqual(validateMissionLinkage(core, mission), []);
});

test('validateRunLinkage flags a broken run.metadata.missionId reference', () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-orphan-mission-claim',
      title: 'Run claiming a deleted mission',
      status: 'queued',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-deleted' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  const run = core.runs.find((candidate) => candidate.id === 'run-orphan-mission-claim');
  assert.ok(run);

  const diagnostics = validateRunLinkage(core, run);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.anchor, 'metadata_mission');
  assert.equal(diagnostics[0]?.reason, 'missing_record');
  assert.equal(diagnostics[0]?.referencedId, 'mission-deleted');
});

test('validateRunLinkage flags cross_mission_conflict when two missions claim the same run', () => {
  let core = createDefaultCoreState();
  // Mission A claims this run via metadata.runId.
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'Mission A',
      status: 'running',
      metadata: { runId: 'run-disputed' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  // Mission B is what the run claims back.
  core = upsertCoreMission(
    core,
    {
      id: 'mission-b',
      title: 'Mission B',
      status: 'running',
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  // Run points at mission-b but mission-a is the one claiming it.
  core = upsertCoreRun(
    core,
    {
      id: 'run-disputed',
      title: 'Disputed run',
      status: 'running',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-b' },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  const run = core.runs.find((candidate) => candidate.id === 'run-disputed');
  assert.ok(run);

  const diagnostics = validateRunLinkage(core, run);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.anchor, 'metadata_mission');
  assert.equal(diagnostics[0]?.reason, 'cross_mission_conflict');
  assert.equal(diagnostics[0]?.referencedId, 'mission-b');
  assert.equal(diagnostics[0]?.conflictingMissionId, 'mission-a');
});

test('validateRunLinkage flags cross_mission_conflict when 2+ missions claim the same run via metadata.runId without run-side metadata', () => {
  let core = createDefaultCoreState();
  // Two missions both nominate run-shared via mission.metadata.runId.
  // The run itself has no metadata.missionId — the previous detection
  // path required that key, so this case slipped through.
  core = upsertCoreMission(
    core,
    {
      id: 'mission-alpha',
      title: 'Mission Alpha',
      status: 'running',
      metadata: { runId: 'run-shared' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-beta',
      title: 'Mission Beta',
      status: 'running',
      metadata: { runId: 'run-shared' },
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-shared',
      title: 'Shared run with no run-side claim',
      status: 'running',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  const run = core.runs.find((candidate) => candidate.id === 'run-shared');
  assert.ok(run);

  const diagnostics = validateRunLinkage(core, run);
  // Exactly one cross_mission_conflict diagnostic, naming both
  // claimants between `referencedId` and `conflictingMissionId`.
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.anchor, 'metadata_mission');
  assert.equal(diagnostics[0]?.reason, 'cross_mission_conflict');
  const namedClaimants = new Set([
    diagnostics[0]?.referencedId,
    diagnostics[0]?.conflictingMissionId,
  ]);
  assert.ok(namedClaimants.has('mission-alpha'));
  assert.ok(namedClaimants.has('mission-beta'));
});

test('validateRunLinkage stays silent when only the claimed mission references the run', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-anchor',
      title: 'Anchor mission',
      status: 'running',
      metadata: { runId: 'run-clean' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-clean',
      title: 'Run with consistent claim',
      status: 'running',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-anchor' },
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  const run = core.runs.find((candidate) => candidate.id === 'run-clean');
  assert.ok(run);

  assert.deepEqual(validateRunLinkage(core, run), []);
});

test('validateCoreMissionRunLinkages aggregates per-record diagnostics', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      title: 'Mission with bad work item',
      managedWorkId: 'work-item-missing',
      status: 'planned',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Run with bad task',
      taskId: 'task-missing',
      orchestratorActorId: null,
      status: 'queued',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const aggregate = validateCoreMissionRunLinkages(core);

  assert.equal(aggregate.missions.length, 1);
  assert.equal(aggregate.missions[0]?.anchor, 'managed_work');
  assert.equal(aggregate.runs.length, 1);
  assert.equal(aggregate.runs[0]?.anchor, 'task');

  const orphans = findOrphanedMissionLinkages(core);
  assert.equal(orphans.length, 1);
  const runOrphans = findOrphanedRunLinkages(core);
  assert.equal(runOrphans.length, 1);
});
