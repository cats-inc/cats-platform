import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreMission,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import {
  MISSION_METADATA_REQUIRES_REVIEW_KEY,
  MISSION_METADATA_VISIBILITY_KEY,
} from '../src/core/missionVisibility.js';
import { buildWorkMissionListProjection } from '../src/products/work/api/projection.js';

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

  const projection = buildWorkMissionListProjection(core);
  const byId = new Map(projection.missions.map((mission) => [mission.id, mission]));

  assert.equal(byId.get('mission-anchored')?.visibility, 'work_facing');
  assert.equal(byId.get('mission-failed')?.visibility, 'requires_review');
  assert.equal(byId.get('mission-review-flag')?.visibility, 'requires_review');
  assert.equal(byId.get('mission-internal')?.visibility, 'internal');
  assert.equal(byId.get('mission-explicit-internal')?.visibility, 'internal');

  assert.equal(projection.summary.workFacingCount, 1);
  assert.equal(projection.summary.requiresReviewCount, 2);
  assert.equal(projection.summary.internalCount, 2);
  assert.equal(
    projection.summary.totalAvailable,
    projection.summary.workFacingCount
      + projection.summary.requiresReviewCount
      + projection.summary.internalCount,
  );
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

  const projection = buildWorkMissionListProjection(core);
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
