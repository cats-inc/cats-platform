import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_METADATA_REQUIRES_REVIEW_KEY,
  MISSION_METADATA_VISIBILITY_KEY,
  classifyMissionVisibility,
  suggestMissionPromotion,
  withMissionRequiresOperatorReview,
  withMissionVisibilityOverride,
} from '../src/core/missionVisibility.js';
import type { MissionRecord, MissionRecordStatus, CoreRecordMetadata } from '../src/core/types.js';

function makeMission(overrides: {
  status?: MissionRecordStatus;
  managedWorkId?: string | null;
  metadata?: CoreRecordMetadata;
}): MissionRecord {
  return {
    id: 'mission-1',
    managedWorkId: overrides.managedWorkId ?? null,
    conversationId: null,
    sourceTurnId: null,
    sourceLaneId: null,
    assignedAgentId: null,
    title: 'Mission',
    status: overrides.status ?? 'planned',
    summary: null,
    createdAt: '2026-04-14T22:00:00.000Z',
    updatedAt: '2026-04-14T22:00:00.000Z',
    metadata: overrides.metadata ?? {},
  };
}

test('classifyMissionVisibility surfaces missions linked to managed work as work_facing', () => {
  const mission = makeMission({ managedWorkId: 'work-item-1' });
  assert.equal(classifyMissionVisibility(mission), 'work_facing');
});

test('classifyMissionVisibility honors an explicit visibility override above other rules', () => {
  const internal = makeMission({
    managedWorkId: 'work-item-1',
    metadata: { [MISSION_METADATA_VISIBILITY_KEY]: 'internal' },
  });
  assert.equal(classifyMissionVisibility(internal), 'internal');

  const review = makeMission({
    metadata: { [MISSION_METADATA_VISIBILITY_KEY]: 'requires_review' },
  });
  assert.equal(classifyMissionVisibility(review), 'requires_review');
});

test('classifyMissionVisibility flags terminal failures and explicit review requests as requires_review', () => {
  const failed = makeMission({ status: 'failed' });
  assert.equal(classifyMissionVisibility(failed), 'requires_review');

  const flagged = makeMission({
    metadata: { [MISSION_METADATA_REQUIRES_REVIEW_KEY]: true },
  });
  assert.equal(classifyMissionVisibility(flagged), 'requires_review');
});

test('classifyMissionVisibility leaves background activity as internal', () => {
  const draft = makeMission({ status: 'draft' });
  assert.equal(classifyMissionVisibility(draft), 'internal');

  const completed = makeMission({ status: 'completed' });
  assert.equal(classifyMissionVisibility(completed), 'internal');

  const cancelled = makeMission({ status: 'cancelled' });
  assert.equal(classifyMissionVisibility(cancelled), 'internal');
});

test('suggestMissionPromotion routes work-anchored missions to the Work surface', () => {
  const decision = suggestMissionPromotion(makeMission({ managedWorkId: 'work-item-1' }));
  assert.deepEqual(decision, {
    promote: true,
    surface: 'work',
    reason: 'work_anchored',
  });
});

test('suggestMissionPromotion routes failures to the review inbox', () => {
  const decision = suggestMissionPromotion(makeMission({ status: 'failed' }));
  assert.deepEqual(decision, {
    promote: true,
    surface: 'review_inbox',
    reason: 'terminal_failure_requires_review',
  });
});

test('suggestMissionPromotion respects explicit overrides over inferred rules', () => {
  const internal = suggestMissionPromotion(
    makeMission({
      managedWorkId: 'work-item-1',
      metadata: { [MISSION_METADATA_VISIBILITY_KEY]: 'internal' },
    }),
  );
  assert.deepEqual(internal, { promote: false, reason: 'background_only' });

  const reviewOverride = suggestMissionPromotion(
    makeMission({
      managedWorkId: 'work-item-1',
      metadata: { [MISSION_METADATA_VISIBILITY_KEY]: 'requires_review' },
    }),
  );
  assert.deepEqual(reviewOverride, {
    promote: true,
    surface: 'review_inbox',
    reason: 'explicit_visibility_override',
  });
});

test('suggestMissionPromotion routes review-flagged missions to the review inbox', () => {
  const decision = suggestMissionPromotion(
    makeMission({
      status: 'planned',
      metadata: { [MISSION_METADATA_REQUIRES_REVIEW_KEY]: true },
    }),
  );
  assert.deepEqual(decision, {
    promote: true,
    surface: 'review_inbox',
    reason: 'review_metadata_flag',
  });
});

test('suggestMissionPromotion keeps drafts and completed background missions internal', () => {
  assert.deepEqual(
    suggestMissionPromotion(makeMission({ status: 'draft' })),
    { promote: false, reason: 'pre_launch_internal' },
  );
  assert.deepEqual(
    suggestMissionPromotion(makeMission({ status: 'completed' })),
    { promote: false, reason: 'background_only' },
  );
});

test('withMissionVisibilityOverride / withMissionRequiresOperatorReview keep other metadata intact', () => {
  const initial = { source: 'cron' };
  const withOverride = withMissionVisibilityOverride(initial, 'requires_review');
  assert.equal(withOverride[MISSION_METADATA_VISIBILITY_KEY], 'requires_review');
  assert.equal(withOverride.source, 'cron');

  const withFlag = withMissionRequiresOperatorReview(withOverride, true);
  assert.equal(withFlag[MISSION_METADATA_REQUIRES_REVIEW_KEY], true);
  assert.equal(withFlag[MISSION_METADATA_VISIBILITY_KEY], 'requires_review');
});
