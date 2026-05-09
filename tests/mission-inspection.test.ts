import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreMission,
  upsertCoreRun,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import { inspectMission } from '../src/core/missionInspection.js';
import { MISSION_METADATA_PARENT_MISSION_KEY } from '../src/core/missionProvenance.js';

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

test('inspectMission returns null for an unknown mission id', () => {
  const core = createDefaultCoreState();
  assert.equal(inspectMission(core, 'mission-never-seeded'), null);
});

test('inspectMission consolidates linkage / visibility / provenance / runs / lineage', () => {
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
      id: 'mission-parent',
      title: 'Parent mission',
      status: 'completed',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      title: 'Child mission',
      managedWorkId: 'work-item-1',
      assignedAgentId: 'agent-cat-a',
      status: 'running',
      metadata: {
        [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-parent',
        runId: 'run-1',
      },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Mission run',
      status: 'running',
      orchestratorActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;

  const inspection = inspectMission(core, 'mission-1');
  assert.ok(inspection);
  assert.equal(inspection?.mission.id, 'mission-1');
  assert.equal(inspection?.visibility, 'work_facing');
  assert.equal(inspection?.provenance.parentMissionId, 'mission-parent');
  assert.deepEqual(inspection?.linkageDiagnostics, []);
  assert.equal(inspection?.managedWork?.id, 'work-item-1');
  assert.equal(inspection?.runs.length, 1);
  assert.equal(inspection?.runs[0]?.id, 'run-1');
  assert.equal(inspection?.activeRuns.length, 1);
  assert.equal(inspection?.terminalRuns.length, 0);
  assert.equal(inspection?.promotion.promote, true);
  assert.deepEqual(
    inspection?.lineage.entries.map((entry) => entry.mission.id),
    ['mission-1', 'mission-parent'],
  );
});

test('inspectMission surfaces linkage diagnostics and broken-link lineage for unanchored missions', () => {
  let core = createDefaultCoreState();
  // No managedWorkId here so the failed-mission visibility rule, not the
  // work-anchored shortcut, drives the classification.
  core = upsertCoreMission(
    core,
    {
      id: 'mission-broken',
      title: 'Broken mission',
      conversationId: 'conversation-missing',
      status: 'failed',
      metadata: {
        [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-also-missing',
        runId: 'run-missing',
      },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const inspection = inspectMission(core, 'mission-broken');
  assert.ok(inspection);
  const anchors = inspection?.linkageDiagnostics
    .map((diagnostic) => diagnostic.anchor)
    .sort();
  assert.deepEqual(anchors, ['conversation', 'metadata_run']);
  assert.equal(inspection?.visibility, 'requires_review');
  assert.equal(inspection?.runs.length, 0);
  assert.equal(inspection?.lineage.brokenLinkAt, 'mission-also-missing');
  assert.equal(inspection?.promotion.promote, true);
  if (inspection?.promotion.promote) {
    assert.equal(inspection.promotion.surface, 'review_inbox');
  }
});

test('inspectMission also discovers runs anchored back via metadata.missionId', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-with-back-ref',
      title: 'Mission with back-referenced runs',
      status: 'queued',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-back-ref',
      title: 'Run back-referenced',
      status: 'completed',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-with-back-ref' },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const inspection = inspectMission(core, 'mission-with-back-ref');
  assert.ok(inspection);
  assert.equal(inspection?.runs.length, 1);
  assert.equal(inspection?.runs[0]?.id, 'run-back-ref');
  assert.equal(inspection?.terminalRuns.length, 1);
  assert.equal(inspection?.activeRuns.length, 0);
});
