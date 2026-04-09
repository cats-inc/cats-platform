import {
  CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS,
  CORE_TASK_CONTROL_PLANE_DELIVERY_MODES,
  CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS,
  CORE_TASK_CONTROL_PLANE_REASONS,
  CORE_TASK_CONTROL_PLANE_SEVERITIES,
  CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS,
  CORE_TASK_WORKFLOW_SHAPES,
  type CoreTaskControlPlaneAttention,
  type CoreTaskControlPlaneNextAction,
  type CoreTaskControlPlaneWorkflowContinuationView,
  type CoreTaskWorkflowShape,
} from './taskControlPlane.js';
import type {
  CoreDeliveryMode,
  CoreRuntimeDeliveryAction,
} from './types.js';
import {
  CORE_TASK_TIMELINE_CATEGORIES,
  CORE_TASK_TIMELINE_ITEM_KINDS,
  type CoreTaskTimelineCategory,
  type CoreTaskTimelineItemKind,
} from './taskTimeline.js';
import {
  CORE_TASK_RECOVERY_REPLAY_PHASES,
  CORE_TASK_RECOVERY_REPLAY_SOURCES,
  CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
  CORE_TASK_RECOVERY_RESUME_REASONS,
  type CoreTaskRecoveryReplayPhase,
  type CoreTaskRecoveryReplaySource,
  type CoreTaskRecoveryReplayTrigger,
  type CoreTaskRecoveryResumeReason,
} from './recovery.js';
import {
  buildCoreTaskStatusCounts,
  countCoreTaskViewConversations,
} from './taskViewQuery.js';
import type {
  CoreOperatorInboxItem,
  CoreOperatorInboxSummary,
} from './operatorInboxContracts.js';

function readWorkflowShape(value: unknown): CoreTaskWorkflowShape | null {
  return value === 'sequential' || value === 'concurrent' || value === 'converge'
    ? (value as CoreTaskWorkflowShape)
    : value === 'parallel'
      ? ('concurrent' as CoreTaskWorkflowShape)
      : null;
}

export function readEffectiveWorkflowShape(item: Pick<
  CoreOperatorInboxItem,
  'workflowContinuation' | 'runtimeDeliveryIntent' | 'workflowSummary'
>): CoreTaskWorkflowShape | null {
  return item.workflowContinuation?.workflowShape
    ?? readWorkflowShape(item.runtimeDeliveryIntent?.workflowShape)
    ?? readWorkflowShape(item.workflowSummary?.shape)
    ?? null;
}

export function readEffectiveWorkflowReviewRequired(
  item: Pick<CoreOperatorInboxItem, 'workflowContinuation' | 'workflowSummary'>,
): boolean {
  return item.workflowContinuation?.reviewRequired
    ?? item.workflowSummary?.reviewRequired
    ?? false;
}

export function readEffectiveWorkflowConvergeTargetId(
  item: Pick<CoreOperatorInboxItem, 'workflowContinuation' | 'workflowSummary'>,
): string | null {
  return item.workflowContinuation?.convergeTargetId
    ?? item.workflowSummary?.convergeTargetId
    ?? null;
}

export function readEffectiveWorkflowUnresolvedTargets(
  item: Pick<CoreOperatorInboxItem, 'workflowContinuation'>,
): string[] {
  return item.workflowContinuation?.unresolvedTargets.length
    ? [...item.workflowContinuation.unresolvedTargets]
    : [];
}

export function readEffectiveWorkflowContinuationSource(
  item: Pick<CoreOperatorInboxItem, 'workflowContinuation'>,
): NonNullable<CoreTaskControlPlaneWorkflowContinuationView['continuationSource']> | null {
  return item.workflowContinuation?.continuationSource === 'explicit_mentions'
    || item.workflowContinuation?.continuationSource === 'workflow_recommendation'
    ? item.workflowContinuation.continuationSource
    : null;
}

export function readExecutionProduct(
  item: Pick<CoreOperatorInboxItem, 'runtimeBridge'>,
): 'chat' | 'work' | 'code' | null {
  return item.runtimeBridge.product ?? null;
}

export function readRequestedStrategy(
  item: Pick<CoreOperatorInboxItem, 'runtimeBridge'>,
): string | null {
  const requestedStrategy = item.runtimeBridge.request.requestedStrategy;
  return typeof requestedStrategy === 'string' && requestedStrategy.trim().length > 0
    ? requestedStrategy
    : null;
}

export function readLatestReplayPhase(
  item: Pick<CoreOperatorInboxItem, 'recovery'>,
): CoreTaskRecoveryReplayPhase | null {
  const phase = item.recovery.latestActivity?.phase;
  return typeof phase === 'string'
    && CORE_TASK_RECOVERY_REPLAY_PHASES.includes(phase as CoreTaskRecoveryReplayPhase)
    ? phase as CoreTaskRecoveryReplayPhase
    : null;
}

export function readLatestReplaySource(
  item: Pick<CoreOperatorInboxItem, 'recovery'>,
): CoreTaskRecoveryReplaySource | null {
  const source = item.recovery.latestActivity?.source;
  return typeof source === 'string'
    && CORE_TASK_RECOVERY_REPLAY_SOURCES.includes(source as CoreTaskRecoveryReplaySource)
    ? source as CoreTaskRecoveryReplaySource
    : null;
}

export function readLatestReplayTrigger(
  item: Pick<CoreOperatorInboxItem, 'recovery'>,
): CoreTaskRecoveryReplayTrigger | null {
  const trigger = item.recovery.latestActivity?.trigger;
  return typeof trigger === 'string'
    && CORE_TASK_RECOVERY_REPLAY_TRIGGERS.includes(trigger as CoreTaskRecoveryReplayTrigger)
    ? trigger as CoreTaskRecoveryReplayTrigger
    : null;
}

export function readLatestReplayResumeReason(
  item: Pick<CoreOperatorInboxItem, 'recovery'>,
): CoreTaskRecoveryResumeReason | null {
  const reason = item.recovery.latestActivity?.resumeReason;
  return typeof reason === 'string'
    && CORE_TASK_RECOVERY_RESUME_REASONS.includes(reason as CoreTaskRecoveryResumeReason)
    ? reason as CoreTaskRecoveryResumeReason
    : null;
}

function buildAttentionSeverityCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskControlPlaneAttention['severity'], number> {
  const counts = Object.fromEntries(
    CORE_TASK_CONTROL_PLANE_SEVERITIES.map((severity) => [severity, 0]),
  ) as Record<CoreTaskControlPlaneAttention['severity'], number>;
  for (const item of items) {
    counts[item.attention.severity] += 1;
  }
  return counts;
}

function buildExecutionProductCounts(
  items: CoreOperatorInboxItem[],
): Record<'chat' | 'work' | 'code', number> {
  const counts = { chat: 0, work: 0, code: 0 };
  for (const item of items) {
    const executionProduct = readExecutionProduct(item);
    if (executionProduct) {
      counts[executionProduct] += 1;
    }
  }
  return counts;
}

function buildRequestedStrategyCounts(items: CoreOperatorInboxItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const requestedStrategy = readRequestedStrategy(item);
    if (requestedStrategy) {
      counts[requestedStrategy] = (counts[requestedStrategy] ?? 0) + 1;
    }
  }
  return counts;
}

function buildReasonCounts(
  items: CoreOperatorInboxItem[],
): Record<NonNullable<CoreTaskControlPlaneAttention['reasons'][number]>, number> {
  const counts = Object.fromEntries(
    CORE_TASK_CONTROL_PLANE_REASONS.map((reason) => [reason, 0]),
  ) as Record<NonNullable<CoreTaskControlPlaneAttention['reasons'][number]>, number>;
  for (const item of items) {
    for (const reason of item.attention.reasons) {
      counts[reason] += 1;
    }
  }
  return counts;
}

function buildNextActionCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskControlPlaneNextAction['kind'], number> {
  const counts = Object.fromEntries(
    CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS.map((kind) => [kind, 0]),
  ) as Record<CoreTaskControlPlaneNextAction['kind'], number>;
  for (const item of items) {
    for (const action of item.nextActions) {
      counts[action.kind] += 1;
    }
  }
  return counts;
}

function buildDeliveryModeCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreDeliveryMode, number> {
  const counts = Object.fromEntries(
    CORE_TASK_CONTROL_PLANE_DELIVERY_MODES.map((mode) => [mode, 0]),
  ) as Record<CoreDeliveryMode, number>;
  for (const item of items) {
    if (item.runtimeDeliveryIntent?.mode) {
      counts[item.runtimeDeliveryIntent.mode] += 1;
    }
  }
  return counts;
}

function buildDeliveryActionCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreRuntimeDeliveryAction, number> {
  const counts = Object.fromEntries(
    CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS.map((action) => [action, 0]),
  ) as Record<CoreRuntimeDeliveryAction, number>;
  for (const item of items) {
    for (const action of item.runtimeDeliveryIntent?.requestedActions ?? []) {
      counts[action] += 1;
    }
  }
  return counts;
}

function buildWorkflowStageCounts(items: CoreOperatorInboxItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const stageId = item.workflowContinuation?.stageId
      ?? item.runtimeDeliveryIntent?.workflowStageId
      ?? item.workflowSummary?.stageId
      ?? null;
    if (stageId) {
      counts[stageId] = (counts[stageId] ?? 0) + 1;
    }
  }
  return counts;
}

function buildWorkflowShapeCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskWorkflowShape, number> {
  const counts = Object.fromEntries(
    CORE_TASK_WORKFLOW_SHAPES.map((shape) => [shape, 0]),
  ) as Record<CoreTaskWorkflowShape, number>;
  for (const item of items) {
    const shape = readEffectiveWorkflowShape(item);
    if (shape) {
      counts[shape] += 1;
    }
  }
  return counts;
}

function buildLatestTimelineCategoryCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskTimelineCategory, number> {
  const counts = Object.fromEntries(
    CORE_TASK_TIMELINE_CATEGORIES.map((category) => [category, 0]),
  ) as Record<CoreTaskTimelineCategory, number>;
  for (const item of items) {
    if (item.latestTimelineItem?.category) {
      counts[item.latestTimelineItem.category] += 1;
    }
  }
  return counts;
}

function buildWorkflowContinuationBlockedReasonCounts(
  items: CoreOperatorInboxItem[],
): Record<NonNullable<CoreTaskControlPlaneWorkflowContinuationView['blockedReason']>, number> {
  const counts = Object.fromEntries(
    CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS.map((reason) => [reason, 0]),
  ) as Record<NonNullable<CoreTaskControlPlaneWorkflowContinuationView['blockedReason']>, number>;
  for (const item of items) {
    const blockedReason = item.workflowContinuation?.blockedReason;
    if (blockedReason) {
      counts[blockedReason] += 1;
    }
  }
  return counts;
}

function buildWorkflowContinuationSourceCounts(
  items: CoreOperatorInboxItem[],
): Record<NonNullable<CoreTaskControlPlaneWorkflowContinuationView['continuationSource']>, number> {
  const counts = { explicit_mentions: 0, workflow_recommendation: 0 };
  for (const item of items) {
    const source = readEffectiveWorkflowContinuationSource(item);
    if (source) {
      counts[source] += 1;
    }
  }
  return counts;
}

function buildLatestReplayPhaseCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskRecoveryReplayPhase, number> {
  const counts = Object.fromEntries(
    CORE_TASK_RECOVERY_REPLAY_PHASES.map((phase) => [phase, 0]),
  ) as Record<CoreTaskRecoveryReplayPhase, number>;
  for (const item of items) {
    const phase = readLatestReplayPhase(item);
    if (phase) {
      counts[phase] += 1;
    }
  }
  return counts;
}

function buildLatestReplayTriggerCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskRecoveryReplayTrigger, number> {
  const counts = Object.fromEntries(
    CORE_TASK_RECOVERY_REPLAY_TRIGGERS.map((trigger) => [trigger, 0]),
  ) as Record<CoreTaskRecoveryReplayTrigger, number>;
  for (const item of items) {
    const trigger = readLatestReplayTrigger(item);
    if (trigger) {
      counts[trigger] += 1;
    }
  }
  return counts;
}

function buildLatestReplaySourceCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskRecoveryReplaySource, number> {
  const counts = Object.fromEntries(
    CORE_TASK_RECOVERY_REPLAY_SOURCES.map((source) => [source, 0]),
  ) as Record<CoreTaskRecoveryReplaySource, number>;
  for (const item of items) {
    const source = readLatestReplaySource(item);
    if (source) {
      counts[source] += 1;
    }
  }
  return counts;
}

function buildLatestReplayResumeReasonCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskRecoveryResumeReason, number> {
  const counts = Object.fromEntries(
    CORE_TASK_RECOVERY_RESUME_REASONS.map((reason) => [reason, 0]),
  ) as Record<CoreTaskRecoveryResumeReason, number>;
  for (const item of items) {
    const reason = readLatestReplayResumeReason(item);
    if (reason) {
      counts[reason] += 1;
    }
  }
  return counts;
}

function buildLatestTimelineKindCounts(
  items: CoreOperatorInboxItem[],
): Record<CoreTaskTimelineItemKind, number> {
  const counts = Object.fromEntries(
    CORE_TASK_TIMELINE_ITEM_KINDS.map((kind) => [kind, 0]),
  ) as Record<CoreTaskTimelineItemKind, number>;
  for (const item of items) {
    if (item.latestTimelineItem?.kind) {
      counts[item.latestTimelineItem.kind] += 1;
    }
  }
  return counts;
}

export function summarizeCoreOperatorInboxItems(input: {
  totalAvailable: number;
  matching: number;
  items: CoreOperatorInboxItem[];
}): CoreOperatorInboxSummary {
  return {
    totalAvailable: input.totalAvailable,
    matching: input.matching,
    returned: input.items.length,
    conversationCount: countCoreTaskViewConversations(input.items),
    needsOperatorAttentionCount: input.items.filter((item) => item.attention.needsOperatorAttention)
      .length,
    taskStatusCounts: buildCoreTaskStatusCounts(input.items),
    executionProductCounts: buildExecutionProductCounts(input.items),
    requestedStrategyCounts: buildRequestedStrategyCounts(input.items),
    attentionSeverityCounts: buildAttentionSeverityCounts(input.items),
    reasonCounts: buildReasonCounts(input.items),
    nextActionCounts: buildNextActionCounts(input.items),
    deliveryModeCounts: buildDeliveryModeCounts(input.items),
    deliveryActionCounts: buildDeliveryActionCounts(input.items),
    workflowStageCounts: buildWorkflowStageCounts(input.items),
    workflowShapeCounts: buildWorkflowShapeCounts(input.items),
    workflowReviewRequiredCount: input.items.filter((item) => readEffectiveWorkflowReviewRequired(item))
      .length,
    workflowConvergeTargetCount: input.items.filter((item) =>
      Boolean(readEffectiveWorkflowConvergeTargetId(item))).length,
    workflowContinuationSourceCounts: buildWorkflowContinuationSourceCounts(input.items),
    withUnresolvedWorkflowTargetsCount: input.items.filter((item) =>
      readEffectiveWorkflowUnresolvedTargets(item).length > 0).length,
    latestReplaySourceCounts: buildLatestReplaySourceCounts(input.items),
    latestReplayTriggerCounts: buildLatestReplayTriggerCounts(input.items),
    latestReplayPhaseCounts: buildLatestReplayPhaseCounts(input.items),
    latestReplayResumeReasonCounts: buildLatestReplayResumeReasonCounts(input.items),
    latestTimelineCategoryCounts: buildLatestTimelineCategoryCounts(input.items),
    latestTimelineKindCounts: buildLatestTimelineKindCounts(input.items),
    workflowContinuationBlockedReasonCounts:
      buildWorkflowContinuationBlockedReasonCounts(input.items),
    withChildrenCount: input.items.filter((item) => item.family.childCount > 0).length,
    withActiveChildrenCount: input.items.filter((item) =>
      item.family.childCount > 0 && !item.family.allChildrenTerminal).length,
  };
}
