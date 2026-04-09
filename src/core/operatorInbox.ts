import {
  listCoreTaskControlPlaneViews,
  type CoreTaskControlPlaneListOptions,
  type CoreTaskControlPlaneAttention,
  type CoreTaskControlPlaneNextAction,
  type CoreTaskControlPlaneRuntimeDeliveryIntentView,
  type CoreTaskWorkflowShape,
  type CoreTaskControlPlaneWorkflowContinuationView,
  type CoreTaskControlPlaneWorkflowRecommendationView,
} from './taskControlPlane.js';
import type {
  CoreTaskInspectionPlanningView,
  CoreTaskInspectionRuntimeBridgeView,
} from './taskInspection.js';
import type {
  CatsCoreState,
  CoreWorkflowSummary,
} from './types.js';
import {
  type CoreTaskTimelineItem,
} from './taskTimeline.js';
import {
  type CoreTaskRecoveryView,
} from './recovery.js';
import {
  applyCoreTaskViewLimit,
  matchesCoreTaskViewCommonQuery,
} from './taskViewQuery.js';
import type {
  CoreOperatorInboxItem,
  CoreOperatorInboxQuery,
  CoreOperatorInboxSummary,
} from './operatorInboxContracts.js';
import {
  readEffectiveWorkflowContinuationSource,
  readEffectiveWorkflowConvergeTargetId,
  readEffectiveWorkflowReviewRequired,
  readEffectiveWorkflowShape,
  readEffectiveWorkflowUnresolvedTargets,
  readExecutionProduct,
  readLatestReplayPhase,
  readLatestReplayResumeReason,
  readLatestReplaySource,
  readLatestReplayTrigger,
  readRequestedStrategy,
  summarizeCoreOperatorInboxItems,
} from './operatorInboxSummary.js';

export type {
  CoreOperatorInboxItem,
  CoreOperatorInboxQuery,
  CoreOperatorInboxSummary,
} from './operatorInboxContracts.js';

function compareInboxItems(left: CoreOperatorInboxItem, right: CoreOperatorInboxItem): number {
  const severityRank = (value: CoreTaskControlPlaneAttention['severity']): number => {
    switch (value) {
      case 'error':
        return 4;
      case 'attention':
        return 3;
      case 'progress':
        return 2;
      case 'success':
        return 1;
      case 'muted':
      default:
        return 0;
    }
  };

  const severityDiff = severityRank(right.attention.severity) - severityRank(left.attention.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  const leftTimestamp = left.latestTimelineItem?.timestamp ?? '';
  const rightTimestamp = right.latestTimelineItem?.timestamp ?? '';
  const timestampDiff = rightTimestamp.localeCompare(leftTimestamp);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return left.taskId.localeCompare(right.taskId);
}

function hasOperatorActionableSignal(item: CoreOperatorInboxItem): boolean {
  return item.attention.needsOperatorAttention
    || item.nextActions.some((action) => action.action !== null)
    || item.recovery.recoveryRequired;
}

function matchesOperatorInboxQuery(
  item: CoreOperatorInboxItem,
  query: CoreOperatorInboxQuery,
): boolean {
  if (!matchesCoreTaskViewCommonQuery(item, query)) {
    return false;
  }

  if (
    query.executionProducts?.length
    && (!readExecutionProduct(item)
      || !query.executionProducts.includes(readExecutionProduct(item)!))
  ) {
    return false;
  }

  if (
    query.requestedStrategies?.length
    && (!readRequestedStrategy(item)
      || !query.requestedStrategies.includes(readRequestedStrategy(item)!))
  ) {
    return false;
  }

  if (
    query.severities?.length
    && !query.severities.includes(item.attention.severity)
  ) {
    return false;
  }

  if (
    query.reasons?.length
    && !item.attention.reasons.some((reason) => query.reasons?.includes(reason))
  ) {
    return false;
  }

  if (
    query.needsOperatorAttention !== undefined
    && query.needsOperatorAttention !== null
    && item.attention.needsOperatorAttention !== query.needsOperatorAttention
  ) {
    return false;
  }

  if (
    query.nextActions?.length
    && !item.nextActions.some((action) => query.nextActions?.includes(action.kind))
  ) {
    return false;
  }

  if (
    query.deliveryModes?.length
    && (!item.runtimeDeliveryIntent?.mode || !query.deliveryModes.includes(item.runtimeDeliveryIntent.mode))
  ) {
    return false;
  }

  if (
    query.deliveryActions?.length
    && !item.runtimeDeliveryIntent?.requestedActions.some((action) =>
      query.deliveryActions?.includes(action))
  ) {
    return false;
  }

  if (
    query.workflowStageIds?.length
    && !query.workflowStageIds.includes(
      item.workflowContinuation?.stageId
      ?? item.runtimeDeliveryIntent?.workflowStageId
      ?? item.workflowSummary?.stageId
      ?? '',
    )
  ) {
    return false;
  }

  if (
    query.workflowShapes?.length
    && (!readEffectiveWorkflowShape(item)
      || !query.workflowShapes.includes(readEffectiveWorkflowShape(item)!))
  ) {
    return false;
  }

  if (
    query.workflowReviewRequired !== undefined
    && query.workflowReviewRequired !== null
    && readEffectiveWorkflowReviewRequired(item) !== query.workflowReviewRequired
  ) {
    return false;
  }

  if (
    query.workflowConvergeTargetIds?.length
    && !query.workflowConvergeTargetIds.includes(
      readEffectiveWorkflowConvergeTargetId(item) ?? '',
    )
  ) {
    return false;
  }

  if (
    query.workflowContinuationSources?.length
    && (!readEffectiveWorkflowContinuationSource(item)
      || !query.workflowContinuationSources.includes(
        readEffectiveWorkflowContinuationSource(item)!,
      ))
  ) {
    return false;
  }

  if (
    query.workflowContinuationBlockedReasons?.length
    && (!item.workflowContinuation?.blockedReason
      || !query.workflowContinuationBlockedReasons.includes(
        item.workflowContinuation.blockedReason,
      ))
  ) {
    return false;
  }

  const unresolvedTargets = readEffectiveWorkflowUnresolvedTargets(item);
  if (
    query.workflowUnresolvedTargets?.length
    && !unresolvedTargets.some((target) => query.workflowUnresolvedTargets?.includes(target))
  ) {
    return false;
  }

  if (
    query.hasUnresolvedWorkflowTargets !== undefined
    && query.hasUnresolvedWorkflowTargets !== null
    && (unresolvedTargets.length > 0) !== query.hasUnresolvedWorkflowTargets
  ) {
    return false;
  }

  if (
    query.latestReplaySources?.length
    && (!readLatestReplaySource(item)
      || !query.latestReplaySources.includes(readLatestReplaySource(item)!))
  ) {
    return false;
  }

  if (
    query.latestReplayTriggers?.length
    && (!readLatestReplayTrigger(item)
      || !query.latestReplayTriggers.includes(readLatestReplayTrigger(item)!))
  ) {
    return false;
  }

  if (
    query.latestReplayPhases?.length
    && (!readLatestReplayPhase(item)
      || !query.latestReplayPhases.includes(readLatestReplayPhase(item)!))
  ) {
    return false;
  }

  if (
    query.latestReplayResumeReasons?.length
    && (!readLatestReplayResumeReason(item)
      || !query.latestReplayResumeReasons.includes(readLatestReplayResumeReason(item)!))
  ) {
    return false;
  }

  if (
    query.latestTimelineCategories?.length
    && (!item.latestTimelineItem?.category
      || !query.latestTimelineCategories.includes(item.latestTimelineItem.category))
  ) {
    return false;
  }

  if (
    query.latestTimelineKinds?.length
    && (!item.latestTimelineItem?.kind
      || !query.latestTimelineKinds.includes(item.latestTimelineItem.kind))
  ) {
    return false;
  }

  if (
    query.rootTaskIds?.length
    && !query.rootTaskIds.includes(item.family.rootTaskId)
  ) {
    return false;
  }

  if (
    query.parentTaskIds?.length
    && !query.parentTaskIds.includes(item.family.parent?.taskId ?? '')
  ) {
    return false;
  }

  if (
    query.hasChildren !== undefined
    && query.hasChildren !== null
    && (item.family.childCount > 0) !== query.hasChildren
  ) {
    return false;
  }

  if (
    query.hasActiveChildren !== undefined
    && query.hasActiveChildren !== null
    && (item.family.childCount > 0 && !item.family.allChildrenTerminal) !== query.hasActiveChildren
  ) {
    return false;
  }

  return true;
}

export { summarizeCoreOperatorInboxItems } from './operatorInboxSummary.js';

export function listCoreOperatorInboxItems(
  core: CatsCoreState,
): CoreOperatorInboxItem[] {
  const items: CoreOperatorInboxItem[] = [];

  for (const controlPlane of listCoreTaskControlPlaneViews(core)) {
    const task = core.tasks.find((candidate) => candidate.id === controlPlane.taskId);
    if (!task) {
      continue;
    }

    items.push({
      taskId: task.id,
      conversationId: task.conversationId,
      taskTitle: task.title,
      taskStatus: task.status,
      summary: controlPlane.latestTimelineItem?.summary ?? task.summary,
      attention: controlPlane.attention,
      nextActions: controlPlane.nextActions,
      latestRunId: controlPlane.latestRunId,
      latestCheckpointId: controlPlane.latestCheckpointId,
      latestOutcomeId: controlPlane.latestOutcomeId,
      planning: controlPlane.planning,
      runtimeBridge: controlPlane.runtimeBridge,
      workflowSummary: controlPlane.workflowSummary,
      latestWorkflowRecommendation: controlPlane.latestWorkflowRecommendation,
      workflowContinuation: controlPlane.workflowContinuation,
      runtimeDeliveryIntent: controlPlane.runtimeDeliveryIntent,
      recovery: controlPlane.recovery,
      family: controlPlane.family,
      latestTimelineItem: controlPlane.latestTimelineItem,
    });
  }

  return items
    .filter(hasOperatorActionableSignal)
    .sort(compareInboxItems);
}

export function queryCoreOperatorInboxItems(
  core: CatsCoreState,
  query: CoreOperatorInboxQuery = {},
): {
  tasks: CoreOperatorInboxItem[];
  summary: CoreOperatorInboxSummary;
} {
  const tasks = listCoreOperatorInboxItems(core);
  const matching = tasks.filter((item) => matchesOperatorInboxQuery(item, query));
  const returned = applyCoreTaskViewLimit(matching, query.limit);

  return {
    tasks: returned,
    summary: summarizeCoreOperatorInboxItems({
      totalAvailable: tasks.length,
      matching: matching.length,
      items: returned,
    }),
  };
}
