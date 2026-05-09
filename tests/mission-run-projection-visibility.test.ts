import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreMission,
  upsertCoreRun,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import { buildMissionRunProjection } from '../src/core/missionRunProjection.js';
import {
  MISSION_METADATA_REQUIRES_REVIEW_KEY,
  MISSION_METADATA_VISIBILITY_KEY,
} from '../src/core/missionVisibility.js';

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

test('buildMissionRunProjection classifies each mission with the canonical visibility', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-cat-a');
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Anchored work',
      ownerActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-anchored',
      title: 'Work-anchored mission',
      managedWorkId: 'work-item-1',
      assignedAgentId: 'agent-cat-a',
      status: 'running',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-failed',
      title: 'Failed background mission',
      assignedAgentId: 'agent-cat-a',
      status: 'failed',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-internal',
      title: 'Internal companion sweep',
      assignedAgentId: 'agent-cat-a',
      status: 'completed',
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-review-flagged',
      title: 'Background sweep flagged for review',
      assignedAgentId: 'agent-cat-a',
      status: 'planned',
      metadata: { [MISSION_METADATA_REQUIRES_REVIEW_KEY]: true },
    },
    new Date('2026-04-14T22:04:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-explicit-internal',
      title: 'Explicit-internal even though anchored',
      managedWorkId: 'work-item-1',
      assignedAgentId: 'agent-cat-a',
      status: 'running',
      metadata: { [MISSION_METADATA_VISIBILITY_KEY]: 'internal' },
    },
    new Date('2026-04-14T22:05:00.000Z'),
  ).core;

  const projection = buildMissionRunProjection(core);
  const byId = new Map(projection.items.map((item) => [item.mission.id, item]));

  assert.equal(byId.get('mission-anchored')?.visibility, 'work_facing');
  assert.equal(byId.get('mission-failed')?.visibility, 'requires_review');
  assert.equal(byId.get('mission-internal')?.visibility, 'internal');
  assert.equal(byId.get('mission-review-flagged')?.visibility, 'requires_review');
  assert.equal(byId.get('mission-explicit-internal')?.visibility, 'internal');
});

test('buildMissionRunProjection taskIds filter matches both linkedTask and runs[].taskId', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-cat-a');
  // Mission A: linked through managed work -> task-via-work
  core = upsertCoreTask(
    core,
    {
      id: 'task-via-work',
      title: 'Task linked through managed work',
      ownerActorId: 'agent-cat-a',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-via-run',
      title: 'Task only surfaced through run',
      ownerActorId: 'agent-cat-a',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Work A',
      ownerActorId: 'agent-cat-a',
      taskId: 'task-via-work',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-with-linked-task',
      title: 'Mission with managed-work task',
      managedWorkId: 'work-item-1',
      status: 'running',
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  // Mission B: only run-side back-reference points at task-via-run.
  core = upsertCoreRun(
    core,
    {
      id: 'run-on-task-via-run',
      title: 'Run',
      status: 'running',
      taskId: 'task-via-run',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-via-run-task' },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-via-run-task',
      title: 'Mission whose task only surfaces via run',
      status: 'running',
    },
    new Date('2026-04-14T22:01:30.000Z'),
  ).core;

  const linkedHit = buildMissionRunProjection(core, { taskIds: ['task-via-work'] });
  assert.deepEqual(
    linkedHit.items.map((item) => item.mission.id),
    ['mission-with-linked-task'],
  );

  const runHit = buildMissionRunProjection(core, { taskIds: ['task-via-run'] });
  assert.deepEqual(
    runHit.items.map((item) => item.mission.id),
    ['mission-via-run-task'],
  );

  const both = buildMissionRunProjection(core, {
    taskIds: ['task-via-work', 'task-via-run'],
  });
  assert.equal(both.items.length, 2);
});

test('buildMissionRunProjection linkedTask falls back to runs[].taskId when managed work has none', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTask(
    core,
    {
      id: 'task-from-run',
      title: 'Task surfaced through the run',
      ownerActorId: 'actor-owner',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-no-managed-work',
      title: 'Mission without managed work',
      status: 'running',
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-task-anchor',
      title: 'Run',
      status: 'running',
      taskId: 'task-from-run',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-no-managed-work' },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const projection = buildMissionRunProjection(core);
  const item = projection.items.find((candidate) => candidate.mission.id === 'mission-no-managed-work');
  assert.ok(item);
  assert.equal(item?.linkedTask?.id, 'task-from-run');
});

test('buildMissionRunProjection filters by visibilities query', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-cat-a');
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Anchored work',
      ownerActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-work',
      title: 'Work-facing',
      managedWorkId: 'work-item-1',
      status: 'running',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-internal',
      title: 'Internal',
      status: 'completed',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-failed',
      title: 'Failed',
      status: 'failed',
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;

  const workOnly = buildMissionRunProjection(core, { visibilities: ['work_facing'] });
  assert.deepEqual(
    workOnly.items.map((item) => item.mission.id),
    ['mission-work'],
  );

  const reviewOnly = buildMissionRunProjection(core, {
    visibilities: ['requires_review'],
  });
  assert.deepEqual(
    reviewOnly.items.map((item) => item.mission.id),
    ['mission-failed'],
  );

  const both = buildMissionRunProjection(core, {
    visibilities: ['work_facing', 'requires_review'],
  });
  assert.equal(both.items.length, 2);
});
