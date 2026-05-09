// Mission visibility and promotion classification.
//
// SPEC-062 §FR12-14 / §FR23 require that the platform never surface every
// mission as operator-managed work: a mission only materializes into
// Work-facing records when it is meaningfully operator-visible,
// manageable, prioritizable, or approvable, and Companion-style background
// activity should stay as mission / run by default unless the operator
// must explicitly inspect, approve, or act on the outcome.
//
// This module gives projections and intake adapters one canonical
// classifier for "should this mission appear on the Work surface?" so
// every product (Work boards, Companion review inbox, Code artifact
// surfaces) uses the same rules.

import { isTerminalMission } from './missionStatus.js';
import type { CoreRecordMetadata, MissionRecord } from './types.js';

export type MissionVisibility = 'internal' | 'work_facing' | 'requires_review';

export type MissionPromotionDecision =
  | { promote: true; surface: 'work' | 'review_inbox'; reason: MissionPromotionReason }
  | { promote: false; reason: MissionPromotionReason };

export type MissionPromotionReason =
  | 'work_anchored'
  | 'explicit_visibility_override'
  | 'terminal_failure_requires_review'
  | 'review_metadata_flag'
  | 'background_only'
  | 'pre_launch_internal';

export const MISSION_METADATA_VISIBILITY_KEY = 'visibility' as const;
export const MISSION_METADATA_REQUIRES_REVIEW_KEY = 'requiresOperatorReview' as const;

const TERMINAL_REVIEW_REQUIRING_STATUSES = new Set(['failed']);

function readVisibilityOverride(metadata: CoreRecordMetadata): MissionVisibility | null {
  const value = metadata[MISSION_METADATA_VISIBILITY_KEY];
  if (value === 'internal' || value === 'work_facing' || value === 'requires_review') {
    return value;
  }
  return null;
}

function readRequiresReviewFlag(metadata: CoreRecordMetadata): boolean {
  return metadata[MISSION_METADATA_REQUIRES_REVIEW_KEY] === true;
}

export function classifyMissionVisibility(mission: MissionRecord): MissionVisibility {
  const override = readVisibilityOverride(mission.metadata);
  if (override !== null) {
    return override;
  }
  if (mission.managedWorkId !== null) {
    return 'work_facing';
  }
  if (readRequiresReviewFlag(mission.metadata)) {
    return 'requires_review';
  }
  if (
    isTerminalMission(mission)
    && TERMINAL_REVIEW_REQUIRING_STATUSES.has(mission.status)
  ) {
    return 'requires_review';
  }
  return 'internal';
}

export function suggestMissionPromotion(
  mission: MissionRecord,
): MissionPromotionDecision {
  const override = readVisibilityOverride(mission.metadata);
  if (override === 'work_facing') {
    return {
      promote: true,
      surface: 'work',
      reason: 'explicit_visibility_override',
    };
  }
  if (override === 'requires_review') {
    return {
      promote: true,
      surface: 'review_inbox',
      reason: 'explicit_visibility_override',
    };
  }
  if (override === 'internal') {
    return { promote: false, reason: 'background_only' };
  }
  if (mission.managedWorkId !== null) {
    return {
      promote: true,
      surface: 'work',
      reason: 'work_anchored',
    };
  }
  if (readRequiresReviewFlag(mission.metadata)) {
    return {
      promote: true,
      surface: 'review_inbox',
      reason: 'review_metadata_flag',
    };
  }
  if (
    isTerminalMission(mission)
    && TERMINAL_REVIEW_REQUIRING_STATUSES.has(mission.status)
  ) {
    return {
      promote: true,
      surface: 'review_inbox',
      reason: 'terminal_failure_requires_review',
    };
  }
  if (mission.status === 'draft') {
    return { promote: false, reason: 'pre_launch_internal' };
  }
  return { promote: false, reason: 'background_only' };
}

export function withMissionVisibilityOverride(
  metadata: CoreRecordMetadata,
  visibility: MissionVisibility,
): CoreRecordMetadata {
  return { ...metadata, [MISSION_METADATA_VISIBILITY_KEY]: visibility };
}

export function withMissionRequiresOperatorReview(
  metadata: CoreRecordMetadata,
  requiresReview: boolean,
): CoreRecordMetadata {
  return {
    ...metadata,
    [MISSION_METADATA_REQUIRES_REVIEW_KEY]: requiresReview,
  };
}
