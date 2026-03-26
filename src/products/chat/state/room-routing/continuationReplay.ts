import type {
  RoomRoutingTrigger,
  RoomWorkflowShape,
} from '../../../../shared/roomRouting.js';

export const REPLAYABLE_CONTINUATION_GUARD_REASONS = [
  'max_continuations',
  'max_dispatches',
  'max_target_visits',
  'anti_ping_pong',
] as const;

export type ReplayableContinuationGuardReason =
  typeof REPLAYABLE_CONTINUATION_GUARD_REASONS[number];

export function isReplayableContinuationGuardReason(
  value: unknown,
): value is ReplayableContinuationGuardReason {
  return typeof value === 'string'
    && REPLAYABLE_CONTINUATION_GUARD_REASONS.includes(
      value as ReplayableContinuationGuardReason,
    );
}

export function buildContinuationReplayMetadata(input: {
  sourceMessageId: string;
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  workflowStageId: string | null;
  workflowShape: RoomWorkflowShape;
  reviewRequired: boolean;
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  workflowRecommendation: Record<string, unknown> | null;
  unresolvedTargets: string[];
}): Record<string, unknown> {
  return {
    continuationSourceMessageId: input.sourceMessageId,
    mentionNames: structuredClone(input.mentionNames),
    trigger: input.trigger,
    workflowStageId: input.workflowStageId,
    workflowShape: input.workflowShape,
    reviewRequired: input.reviewRequired,
    continuationSource: input.continuationSource,
    workflowRecommendation: input.workflowRecommendation
      ? structuredClone(input.workflowRecommendation)
      : null,
    unresolvedTargets: structuredClone(input.unresolvedTargets),
  };
}
