import type {
  CoreTaskControlPlaneAttention,
  CoreTaskControlPlaneListOptions,
  CoreTaskControlPlaneNextAction,
  CoreTaskControlPlaneRuntimeDeliveryIntentView,
  CoreTaskControlPlaneWorkflowContinuationView,
  CoreTaskControlPlaneWorkflowRecommendationView,
  CoreTaskWorkflowShape,
} from './taskControlPlane.js';
import type {
  CoreTaskInspectionFamilyView,
  CoreTaskInspectionPlanningView,
  CoreTaskInspectionRuntimeBridgeView,
} from './taskInspection.js';
import type {
  CoreDeliveryMode,
  CoreRuntimeDeliveryAction,
  CoreTaskRecord,
  CoreWorkflowSummary,
} from './types.js';
import type {
  CoreTaskTimelineCategory,
  CoreTaskTimelineItem,
  CoreTaskTimelineItemKind,
} from './taskTimeline.js';
import type {
  CoreTaskRecoveryReplayPhase,
  CoreTaskRecoveryReplaySource,
  CoreTaskRecoveryReplayTrigger,
  CoreTaskRecoveryResumeReason,
  CoreTaskRecoveryView,
} from './recovery.js';

export interface CoreOperatorInboxItem {
  taskId: string;
  conversationId: string | null;
  taskTitle: string;
  taskStatus: CoreTaskRecord['status'];
  summary: string | null;
  attention: CoreTaskControlPlaneAttention;
  nextActions: CoreTaskControlPlaneNextAction[];
  latestRunId: string | null;
  latestCheckpointId: string | null;
  latestOutcomeId: string | null;
  planning: CoreTaskInspectionPlanningView;
  runtimeBridge: CoreTaskInspectionRuntimeBridgeView;
  workflowSummary: CoreWorkflowSummary | null;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
  workflowContinuation: CoreTaskControlPlaneWorkflowContinuationView | null;
  runtimeDeliveryIntent: CoreTaskControlPlaneRuntimeDeliveryIntentView | null;
  recovery: CoreTaskRecoveryView;
  family: CoreTaskInspectionFamilyView;
  latestTimelineItem: CoreTaskTimelineItem | null;
}

export type CoreOperatorInboxQuery = CoreTaskControlPlaneListOptions;

export interface CoreOperatorInboxSummary {
  totalAvailable: number;
  matching: number;
  returned: number;
  conversationCount: number;
  needsOperatorAttentionCount: number;
  taskStatusCounts: Record<CoreTaskRecord['status'], number>;
  executionProductCounts: Record<'chat' | 'work' | 'code', number>;
  requestedStrategyCounts: Record<string, number>;
  attentionSeverityCounts: Record<CoreTaskControlPlaneAttention['severity'], number>;
  reasonCounts: Record<NonNullable<CoreTaskControlPlaneAttention['reasons'][number]>, number>;
  nextActionCounts: Record<CoreTaskControlPlaneNextAction['kind'], number>;
  deliveryModeCounts: Record<CoreDeliveryMode, number>;
  deliveryActionCounts: Record<CoreRuntimeDeliveryAction, number>;
  workflowStageCounts: Record<string, number>;
  workflowShapeCounts: Record<CoreTaskWorkflowShape, number>;
  workflowReviewRequiredCount: number;
  workflowConvergeTargetCount: number;
  workflowContinuationSourceCounts: Record<
    NonNullable<CoreTaskControlPlaneWorkflowContinuationView['continuationSource']>,
    number
  >;
  withUnresolvedWorkflowTargetsCount: number;
  latestReplaySourceCounts: Record<CoreTaskRecoveryReplaySource, number>;
  latestReplayTriggerCounts: Record<CoreTaskRecoveryReplayTrigger, number>;
  latestReplayPhaseCounts: Record<CoreTaskRecoveryReplayPhase, number>;
  latestReplayResumeReasonCounts: Record<CoreTaskRecoveryResumeReason, number>;
  latestTimelineCategoryCounts: Record<CoreTaskTimelineCategory, number>;
  latestTimelineKindCounts: Record<CoreTaskTimelineItemKind, number>;
  workflowContinuationBlockedReasonCounts: Record<
    NonNullable<CoreTaskControlPlaneWorkflowContinuationView['blockedReason']>,
    number
  >;
  withChildrenCount: number;
  withActiveChildrenCount: number;
}
