import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreMission,
  upsertCoreRun,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import {
  MISSION_METADATA_REQUIRES_REVIEW_KEY,
  MISSION_METADATA_VISIBILITY_KEY,
} from '../src/core/missionVisibility.js';
import {
  buildWorkMissionDetailProjection,
  buildWorkMissionListProjection,
} from '../src/products/work/api/projection.js';

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

test('buildWorkMissionListProjection classifies missions across all three visibility lanes', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-cat-a');
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-anchor',
      title: 'Anchored work',
      ownerActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  // work_facing: anchored to managed work
  core = upsertCoreMission(
    core,
    {
      id: 'mission-anchored',
      title: 'Anchored mission',
      managedWorkId: 'work-item-anchor',
      assignedAgentId: 'agent-cat-a',
      status: 'running',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  // requires_review: terminal failure
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

  // requires_review: explicit review flag, still in flight
  core = upsertCoreMission(
    core,
    {
      id: 'mission-review-flag',
      title: 'Background mission flagged for owner review',
      assignedAgentId: 'agent-cat-a',
      status: 'planned',
      metadata: { [MISSION_METADATA_REQUIRES_REVIEW_KEY]: true },
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;

  // internal: completed background sweep with no managed work / review flag
  core = upsertCoreMission(
    core,
    {
      id: 'mission-internal',
      title: 'Companion sweep',
      assignedAgentId: 'agent-cat-a',
      status: 'completed',
    },
    new Date('2026-04-14T22:04:00.000Z'),
  ).core;

  // internal override even though work-anchored
  core = upsertCoreMission(
    core,
    {
      id: 'mission-explicit-internal',
      title: 'Anchored but explicitly hidden',
      managedWorkId: 'work-item-anchor',
      assignedAgentId: 'agent-cat-a',
      status: 'running',
      metadata: { [MISSION_METADATA_VISIBILITY_KEY]: 'internal' },
    },
    new Date('2026-04-14T22:05:00.000Z'),
  ).core;

  // Default behavior: internal missions are hidden from the rendered
  // list, but the summary still reports the full lane breakdown.
  const projection = buildWorkMissionListProjection(core);
  const byId = new Map(projection.missions.map((mission) => [mission.id, mission]));

  assert.equal(byId.get('mission-anchored')?.visibility, 'work_facing');
  assert.equal(byId.get('mission-failed')?.visibility, 'requires_review');
  assert.equal(byId.get('mission-review-flag')?.visibility, 'requires_review');
  assert.equal(byId.has('mission-internal'), false);
  assert.equal(byId.has('mission-explicit-internal'), false);
  assert.equal(projection.summary.returned, 3);

  assert.equal(projection.summary.workFacingCount, 1);
  assert.equal(projection.summary.requiresReviewCount, 2);
  assert.equal(projection.summary.internalCount, 2);
  assert.equal(
    projection.summary.totalAvailable,
    projection.summary.workFacingCount
      + projection.summary.requiresReviewCount
      + projection.summary.internalCount,
  );

  // includeInternal: true surfaces the hidden lane for explicit
  // debug / internal-view consumers.
  const fullProjection = buildWorkMissionListProjection(core, { includeInternal: true });
  const fullById = new Map(fullProjection.missions.map((mission) => [mission.id, mission]));
  assert.equal(fullById.get('mission-internal')?.visibility, 'internal');
  assert.equal(fullById.get('mission-explicit-internal')?.visibility, 'internal');
  assert.equal(fullProjection.summary.returned, 5);
});

test('buildWorkMissionListProjection surfaces a promotion decision matching the visibility', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, 'agent-cat-a');
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-anchor',
      title: 'Anchored work',
      ownerActorId: 'agent-cat-a',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-anchored',
      title: 'Anchored',
      managedWorkId: 'work-item-anchor',
      status: 'running',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-failed',
      title: 'Failed',
      status: 'failed',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-internal',
      title: 'Internal',
      status: 'completed',
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;

  const projection = buildWorkMissionListProjection(core, { includeInternal: true });
  const byId = new Map(projection.missions.map((mission) => [mission.id, mission]));

  const anchored = byId.get('mission-anchored')?.promotion;
  assert.equal(anchored?.promote, true);
  if (anchored?.promote) {
    assert.equal(anchored.surface, 'work');
    assert.equal(anchored.reason, 'work_anchored');
  }

  const failed = byId.get('mission-failed')?.promotion;
  assert.equal(failed?.promote, true);
  if (failed?.promote) {
    assert.equal(failed.surface, 'review_inbox');
    assert.equal(failed.reason, 'terminal_failure_requires_review');
  }

  const internal = byId.get('mission-internal')?.promotion;
  assert.equal(internal?.promote, false);
});

test('buildWorkMissionDetailProjection surfaces direct mission runs even without managed work', () => {
  // Mission has no managed work, but a run back-references it via
  // run.metadata.missionId. The detail projection must still expose
  // the run so the Work mission detail page does not silently report
  // "no linked work item / no run".
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-direct',
      title: 'Mission with no managed work',
      status: 'running',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-back-ref',
      title: 'Run anchored only by metadata.missionId',
      status: 'running',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-direct' },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const detail = buildWorkMissionDetailProjection(core, 'mission-direct');
  assert.ok(detail);
  assert.equal(detail?.mission.id, 'mission-direct');
  assert.equal(detail?.runs.length, 1);
  assert.equal(detail?.runs[0]?.id, 'run-back-ref');
  assert.equal(detail?.activeRunCount, 1);
  assert.equal(detail?.terminalRunCount, 0);
  assert.deepEqual(detail?.linkageDiagnostics, []);
});

test('buildWorkMissionDetailProjection returns null for an unknown mission id', () => {
  const detail = buildWorkMissionDetailProjection(createDefaultCoreState(), 'mission-never');
  assert.equal(detail, null);
});

test('buildWorkMissionDetailProjection exposes provenance and parent-chain lineage', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-grandparent',
      title: 'Grandparent',
      status: 'completed',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-parent',
      title: 'Parent',
      status: 'completed',
      metadata: { parentMissionId: 'mission-grandparent' },
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-child',
      title: 'Child',
      status: 'queued',
      metadata: { parentMissionId: 'mission-parent' },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const detail = buildWorkMissionDetailProjection(core, 'mission-child');
  assert.ok(detail);
  assert.equal(detail?.provenance.parentMissionId, 'mission-parent');
  // ancestorMissionIds excludes the focal mission itself, oldest at end.
  assert.deepEqual(detail?.ancestorMissionIds, ['mission-parent', 'mission-grandparent']);
  assert.equal(detail?.lineageBrokenAt, null);
  assert.equal(detail?.lineageCycleDetected, false);
});

test('buildWorkMissionListProjection summary visibility counts agree with the per-status counts', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    { id: 'mission-1', title: 'M1', status: 'planned' },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    { id: 'mission-2', title: 'M2', status: 'failed' },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const projection = buildWorkMissionListProjection(core);
  // The two summary axes (status and visibility) are independent
  // counts of the same set, so totalAvailable should equal both sums.
  const statusSum = projection.summary.draftCount
    + projection.summary.plannedCount
    + projection.summary.queuedCount
    + projection.summary.runningCount
    + projection.summary.completedCount
    + projection.summary.failedCount
    + projection.summary.cancelledCount;
  const visibilitySum = projection.summary.workFacingCount
    + projection.summary.requiresReviewCount
    + projection.summary.internalCount;
  assert.equal(statusSum, projection.summary.totalAvailable);
  assert.equal(visibilitySum, projection.summary.totalAvailable);
});
