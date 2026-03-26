import {
  CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS,
  CORE_TASK_CONTROL_PLANE_DELIVERY_MODES,
  CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS,
  CORE_TASK_CONTROL_PLANE_REASONS,
  CORE_TASK_CONTROL_PLANE_SEVERITIES,
  listCoreTaskControlPlaneViews,
  type CoreTaskControlPlaneListOptions,
  type CoreTaskControlPlaneAttention,
  type CoreTaskControlPlaneNextAction,
  type CoreTaskControlPlaneRuntimeDeliveryIntentView,
  type CoreTaskControlPlaneWorkflowContinuationView,
  type CoreTaskControlPlaneWorkflowRecommendationView,
} from './taskControlPlane.js';
import type {
  CatsCoreState,
  CoreDeliveryMode,
  CoreRuntimeDeliveryAction,
  CoreTaskRecord,
  CoreWorkflowSummary,
} from './types.js';
import { buildCoreTaskTimelineView, type CoreTaskTimelineItem } from './taskTimeline.js';
import type { CoreTaskRecoveryView } from './recovery.js';
import {
  applyCoreTaskViewLimit,
  buildCoreTaskStatusCounts,
  countCoreTaskViewConversations,
  matchesCoreTaskViewCommonQuery,
} from './taskViewQuery.js';

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
  workflowSummary: CoreWorkflowSummary | null;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
  workflowContinuation: CoreTaskControlPlaneWorkflowContinuationView | null;
  runtimeDeliveryIntent: CoreTaskControlPlaneRuntimeDeliveryIntentView | null;
  recovery: CoreTaskRecoveryView;
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
  attentionSeverityCounts: Record<CoreTaskControlPlaneAttention['severity'], number>;
  reasonCounts: Record<NonNullable<CoreTaskControlPlaneAttention['reasons'][number]>, number>;
  nextActionCounts: Record<CoreTaskControlPlaneNextAction['kind'], number>;
  deliveryModeCounts: Record<CoreDeliveryMode, number>;
  deliveryActionCounts: Record<CoreRuntimeDeliveryAction, number>;
  workflowStageCounts: Record<string, number>;
}

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

  return true;
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

function buildWorkflowStageCounts(
  items: CoreOperatorInboxItem[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const stageId = item.workflowContinuation?.stageId
      ?? item.runtimeDeliveryIntent?.workflowStageId
      ?? item.workflowSummary?.stageId
      ?? null;
    if (!stageId) {
      continue;
    }
    counts[stageId] = (counts[stageId] ?? 0) + 1;
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
    attentionSeverityCounts: buildAttentionSeverityCounts(input.items),
    reasonCounts: buildReasonCounts(input.items),
    nextActionCounts: buildNextActionCounts(input.items),
    deliveryModeCounts: buildDeliveryModeCounts(input.items),
    deliveryActionCounts: buildDeliveryActionCounts(input.items),
    workflowStageCounts: buildWorkflowStageCounts(input.items),
  };
}

export function listCoreOperatorInboxItems(
  core: CatsCoreState,
): CoreOperatorInboxItem[] {
  const items: CoreOperatorInboxItem[] = [];

  for (const controlPlane of listCoreTaskControlPlaneViews(core)) {
    const task = core.tasks.find((candidate) => candidate.id === controlPlane.taskId);
    if (!task) {
      continue;
    }

    const timeline = buildCoreTaskTimelineView(core, task);
    const latestTimelineItem = timeline.items[0] ?? null;

    items.push({
      taskId: task.id,
      conversationId: task.conversationId,
      taskTitle: task.title,
      taskStatus: task.status,
      summary: latestTimelineItem?.summary ?? task.summary,
      attention: controlPlane.attention,
      nextActions: controlPlane.nextActions,
      latestRunId: controlPlane.latestRunId,
      latestCheckpointId: controlPlane.latestCheckpointId,
      latestOutcomeId: controlPlane.latestOutcomeId,
      workflowSummary: controlPlane.workflowSummary,
      latestWorkflowRecommendation: controlPlane.latestWorkflowRecommendation,
      workflowContinuation: controlPlane.workflowContinuation,
      runtimeDeliveryIntent: controlPlane.runtimeDeliveryIntent,
      recovery: controlPlane.recovery,
      latestTimelineItem,
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
