import {
  buildCoreTaskStatusCounts,
  countCoreTaskViewConversations,
} from './taskViewQuery.js';
import type {
  CoreTaskRecoveryReplayPhase,
  CoreTaskRecoveryReplaySource,
  CoreTaskRecoveryReplayTrigger,
  CoreTaskRecoveryResumeReason,
} from './recovery.js';
import type {
  CoreTaskControlPlaneListSummary,
  CoreTaskControlPlaneNextAction,
  CoreTaskControlPlaneReason,
  CoreTaskControlPlaneSeverity,
  CoreTaskControlPlaneView,
  CoreTaskWorkflowShape,
} from './taskControlPlane.js';
import type { CoreTaskTimelineCategory, CoreTaskTimelineItemKind } from './taskTimeline.js';
import type { TaskExecutionProduct } from '../shared/taskPlanning.js';
import type { CoreDeliveryMode, CoreRuntimeDeliveryAction } from './types.js';
import type {
  WorkflowContinuationReplayBlockedReason,
  WorkflowContinuationReplaySource,
} from '../platform/orchestration/workflowContinuationReplay.js';

type WorkflowContinuationSourceInput =
  NonNullable<CoreTaskControlPlaneView['workflowContinuation']>['continuationSource']
  | undefined;

function buildEmptyCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function buildAttentionSeverityCounts(
  views: CoreTaskControlPlaneView[],
  attentionSeverities: readonly CoreTaskControlPlaneSeverity[],
): Record<CoreTaskControlPlaneSeverity, number> {
  const counts = buildEmptyCounts(attentionSeverities);

  for (const view of views) {
    counts[view.attention.severity] += 1;
  }

  return counts;
}

function buildExecutionProductCounts(
  views: CoreTaskControlPlaneView[],
  executionProducts: readonly TaskExecutionProduct[],
  readExecutionProduct: (view: CoreTaskControlPlaneView) => TaskExecutionProduct | null,
): Record<TaskExecutionProduct, number> {
  const counts = buildEmptyCounts(executionProducts);

  for (const view of views) {
    const executionProduct = readExecutionProduct(view);
    if (!executionProduct) {
      continue;
    }
    counts[executionProduct] += 1;
  }

  return counts;
}

function buildRequestedStrategyCounts(
  views: CoreTaskControlPlaneView[],
  readRequestedStrategy: (view: CoreTaskControlPlaneView) => string | null,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const view of views) {
    const requestedStrategy = readRequestedStrategy(view);
    if (!requestedStrategy) {
      continue;
    }
    counts[requestedStrategy] = (counts[requestedStrategy] ?? 0) + 1;
  }

  return counts;
}

function buildReasonCounts(
  views: CoreTaskControlPlaneView[],
  reasons: readonly CoreTaskControlPlaneReason[],
): Record<CoreTaskControlPlaneReason, number> {
  const counts = buildEmptyCounts(reasons);

  for (const view of views) {
    for (const reason of view.attention.reasons) {
      counts[reason] += 1;
    }
  }

  return counts;
}

function buildNextActionCounts(
  views: CoreTaskControlPlaneView[],
  nextActionKinds: readonly CoreTaskControlPlaneNextAction['kind'][],
): Record<CoreTaskControlPlaneNextAction['kind'], number> {
  const counts = buildEmptyCounts(nextActionKinds);

  for (const view of views) {
    for (const action of view.nextActions) {
      counts[action.kind] += 1;
    }
  }

  return counts;
}

function buildDeliveryModeCounts(
  views: CoreTaskControlPlaneView[],
  deliveryModes: readonly CoreDeliveryMode[],
): Record<CoreDeliveryMode, number> {
  const counts = buildEmptyCounts(deliveryModes);

  for (const view of views) {
    if (view.runtimeDeliveryIntent?.mode) {
      counts[view.runtimeDeliveryIntent.mode] += 1;
    }
  }

  return counts;
}

function buildDeliveryActionCounts(
  views: CoreTaskControlPlaneView[],
  deliveryActions: readonly CoreRuntimeDeliveryAction[],
): Record<CoreRuntimeDeliveryAction, number> {
  const counts = buildEmptyCounts(deliveryActions);

  for (const view of views) {
    for (const action of view.runtimeDeliveryIntent?.requestedActions ?? []) {
      counts[action] += 1;
    }
  }

  return counts;
}

function buildWorkflowStageCounts(
  views: CoreTaskControlPlaneView[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const view of views) {
    const stageId = view.workflowContinuation?.stageId
      ?? view.runtimeDeliveryIntent?.workflowStageId
      ?? view.workflowSummary?.stageId
      ?? null;
    if (!stageId) {
      continue;
    }
    counts[stageId] = (counts[stageId] ?? 0) + 1;
  }

  return counts;
}

function buildWorkflowShapeCounts(
  views: CoreTaskControlPlaneView[],
  workflowShapes: readonly CoreTaskWorkflowShape[],
  readEffectiveWorkflowShape: (view: CoreTaskControlPlaneView) => CoreTaskWorkflowShape | null,
): Record<CoreTaskWorkflowShape, number> {
  const counts = buildEmptyCounts(workflowShapes);

  for (const view of views) {
    const shape = readEffectiveWorkflowShape(view);
    if (!shape) {
      continue;
    }
    counts[shape] += 1;
  }

  return counts;
}

function buildWorkflowContinuationBlockedReasonCounts(
  views: CoreTaskControlPlaneView[],
  blockedReasons: readonly WorkflowContinuationReplayBlockedReason[],
): Record<WorkflowContinuationReplayBlockedReason, number> {
  const counts = buildEmptyCounts(blockedReasons);

  for (const view of views) {
    const blockedReason = view.workflowContinuation?.blockedReason;
    if (!blockedReason) {
      continue;
    }
    counts[blockedReason] += 1;
  }

  return counts;
}

function buildWorkflowContinuationSourceCounts(
  views: CoreTaskControlPlaneView[],
  workflowContinuationSources: readonly WorkflowContinuationReplaySource[],
  readContinuationSource: (value: WorkflowContinuationSourceInput) => WorkflowContinuationReplaySource | null,
): Record<WorkflowContinuationReplaySource, number> {
  const counts = buildEmptyCounts(workflowContinuationSources);

  for (const view of views) {
    const source = readContinuationSource(view.workflowContinuation?.continuationSource);
    if (!source) {
      continue;
    }
    counts[source] += 1;
  }

  return counts;
}

function buildReplayCounts<T extends string>(
  views: CoreTaskControlPlaneView[],
  values: readonly T[],
  readValue: (view: CoreTaskControlPlaneView) => T | null,
): Record<T, number> {
  const counts = buildEmptyCounts(values);

  for (const view of views) {
    const value = readValue(view);
    if (!value) {
      continue;
    }
    counts[value] += 1;
  }

  return counts;
}

function buildLatestTimelineCategoryCounts(
  views: CoreTaskControlPlaneView[],
  latestTimelineCategories: readonly CoreTaskTimelineCategory[],
): Record<CoreTaskTimelineCategory, number> {
  const counts = buildEmptyCounts(latestTimelineCategories);

  for (const view of views) {
    if (!view.latestTimelineItem?.category) {
      continue;
    }
    counts[view.latestTimelineItem.category] += 1;
  }

  return counts;
}

function buildLatestTimelineKindCounts(
  views: CoreTaskControlPlaneView[],
  latestTimelineKinds: readonly CoreTaskTimelineItemKind[],
): Record<CoreTaskTimelineItemKind, number> {
  const counts = buildEmptyCounts(latestTimelineKinds);

  for (const view of views) {
    if (!view.latestTimelineItem?.kind) {
      continue;
    }
    counts[view.latestTimelineItem.kind] += 1;
  }

  return counts;
}

export function summarizeCoreTaskControlPlaneViewsWithSupport(input: {
  totalAvailable: number;
  matching: number;
  views: CoreTaskControlPlaneView[];
  attentionSeverities: readonly CoreTaskControlPlaneSeverity[];
  executionProducts: readonly TaskExecutionProduct[];
  reasons: readonly CoreTaskControlPlaneReason[];
  nextActionKinds: readonly CoreTaskControlPlaneNextAction['kind'][];
  deliveryModes: readonly CoreDeliveryMode[];
  deliveryActions: readonly CoreRuntimeDeliveryAction[];
  workflowShapes: readonly CoreTaskWorkflowShape[];
  workflowContinuationBlockedReasons: readonly WorkflowContinuationReplayBlockedReason[];
  workflowContinuationSources: readonly WorkflowContinuationReplaySource[];
  latestReplayPhases: readonly CoreTaskRecoveryReplayPhase[];
  latestReplayTriggers: readonly CoreTaskRecoveryReplayTrigger[];
  latestReplaySources: readonly CoreTaskRecoveryReplaySource[];
  latestReplayResumeReasons: readonly CoreTaskRecoveryResumeReason[];
  latestTimelineCategories: readonly CoreTaskTimelineCategory[];
  latestTimelineKinds: readonly CoreTaskTimelineItemKind[];
  readExecutionProduct: (view: CoreTaskControlPlaneView) => TaskExecutionProduct | null;
  readRequestedStrategy: (view: CoreTaskControlPlaneView) => string | null;
  readEffectiveWorkflowShape: (view: CoreTaskControlPlaneView) => CoreTaskWorkflowShape | null;
  readEffectiveWorkflowReviewRequired: (view: CoreTaskControlPlaneView) => boolean;
  readEffectiveWorkflowConvergeTargetId: (view: CoreTaskControlPlaneView) => string | null;
  readEffectiveWorkflowUnresolvedTargets: (view: CoreTaskControlPlaneView) => string[];
  readContinuationSource: (value: WorkflowContinuationSourceInput) => WorkflowContinuationReplaySource | null;
  readLatestReplayPhase: (view: CoreTaskControlPlaneView) => CoreTaskRecoveryReplayPhase | null;
  readLatestReplayTrigger: (view: CoreTaskControlPlaneView) => CoreTaskRecoveryReplayTrigger | null;
  readLatestReplaySource: (view: CoreTaskControlPlaneView) => CoreTaskRecoveryReplaySource | null;
  readLatestReplayResumeReason: (
    view: CoreTaskControlPlaneView,
  ) => CoreTaskRecoveryResumeReason | null;
}): CoreTaskControlPlaneListSummary {
  return {
    totalAvailable: input.totalAvailable,
    matching: input.matching,
    returned: input.views.length,
    conversationCount: countCoreTaskViewConversations(input.views),
    needsOperatorAttentionCount: input.views.filter((view) => view.attention.needsOperatorAttention)
      .length,
    taskStatusCounts: buildCoreTaskStatusCounts(input.views),
    executionProductCounts: buildExecutionProductCounts(
      input.views,
      input.executionProducts,
      input.readExecutionProduct,
    ),
    requestedStrategyCounts: buildRequestedStrategyCounts(
      input.views,
      input.readRequestedStrategy,
    ),
    attentionSeverityCounts: buildAttentionSeverityCounts(
      input.views,
      input.attentionSeverities,
    ),
    reasonCounts: buildReasonCounts(input.views, input.reasons),
    nextActionCounts: buildNextActionCounts(input.views, input.nextActionKinds),
    deliveryModeCounts: buildDeliveryModeCounts(input.views, input.deliveryModes),
    deliveryActionCounts: buildDeliveryActionCounts(input.views, input.deliveryActions),
    workflowStageCounts: buildWorkflowStageCounts(input.views),
    workflowShapeCounts: buildWorkflowShapeCounts(
      input.views,
      input.workflowShapes,
      input.readEffectiveWorkflowShape,
    ),
    workflowReviewRequiredCount: input.views.filter((view) =>
      input.readEffectiveWorkflowReviewRequired(view)).length,
    workflowConvergeTargetCount: input.views.filter((view) =>
      Boolean(input.readEffectiveWorkflowConvergeTargetId(view))).length,
    workflowContinuationSourceCounts: buildWorkflowContinuationSourceCounts(
      input.views,
      input.workflowContinuationSources,
      input.readContinuationSource,
    ),
    workflowContinuationBlockedReasonCounts: buildWorkflowContinuationBlockedReasonCounts(
      input.views,
      input.workflowContinuationBlockedReasons,
    ),
    withUnresolvedWorkflowTargetsCount: input.views.filter((view) =>
      input.readEffectiveWorkflowUnresolvedTargets(view).length > 0).length,
    latestReplaySourceCounts: buildReplayCounts(
      input.views,
      input.latestReplaySources,
      input.readLatestReplaySource,
    ),
    latestReplayTriggerCounts: buildReplayCounts(
      input.views,
      input.latestReplayTriggers,
      input.readLatestReplayTrigger,
    ),
    latestReplayPhaseCounts: buildReplayCounts(
      input.views,
      input.latestReplayPhases,
      input.readLatestReplayPhase,
    ),
    latestReplayResumeReasonCounts: buildReplayCounts(
      input.views,
      input.latestReplayResumeReasons,
      input.readLatestReplayResumeReason,
    ),
    latestTimelineCategoryCounts: buildLatestTimelineCategoryCounts(
      input.views,
      input.latestTimelineCategories,
    ),
    latestTimelineKindCounts: buildLatestTimelineKindCounts(
      input.views,
      input.latestTimelineKinds,
    ),
    withChildrenCount: input.views.filter((view) => view.family.childCount > 0).length,
    withActiveChildrenCount: input.views.filter((view) =>
      view.family.childCount > 0 && !view.family.allChildrenTerminal).length,
  };
}
