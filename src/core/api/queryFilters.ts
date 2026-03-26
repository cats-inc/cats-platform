import {
  CORE_MEMORY_MAINTENANCE_PHASES,
  CORE_MEMORY_MAINTENANCE_STATUSES,
  CORE_MEMORY_MAINTENANCE_TRIGGERS,
  type CoreMemoryMaintenanceQuery,
} from '../memoryMaintenance.js';
import {
  CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS,
  CORE_TASK_CONTROL_PLANE_DELIVERY_MODES,
  CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS,
  CORE_TASK_CONTROL_PLANE_REASONS,
  CORE_TASK_CONTROL_PLANE_SEVERITIES,
  CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS,
  CORE_TASK_WORKFLOW_SHAPES,
  type CoreTaskControlPlaneListOptions,
} from '../taskControlPlane.js';
import {
  CORE_TASK_RECOVERY_ACTION_KINDS,
  CORE_TASK_RECOVERY_DELIVERY_ACTIONS,
  CORE_TASK_RECOVERY_DELIVERY_MODES,
  CORE_TASK_RECOVERY_REPLAY_PHASES,
  CORE_TASK_RECOVERY_REPLAY_SOURCES,
  CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
  CORE_TASK_RECOVERY_RESUME_REASONS,
  CORE_TASK_DISPATCH_REPLAY_STATES,
  CORE_TASK_PENDING_DISPATCH_REPLAY_STATES,
  CORE_TASK_RECOVERY_WORKFLOW_SHAPES,
  CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS as CORE_TASK_RECOVERY_WORKFLOW_CONTINUATION_BLOCKED_REASONS,
  CORE_TASK_WORKFLOW_CONTINUATION_REPLAY_STATES,
  type CoreTaskRecoveryListOptions,
} from '../recovery.js';
import { CoreValidationError } from '../errors.js';
import { CORE_TASK_VIEW_STATUSES } from '../taskViewQuery.js';
import {
  CORE_TASK_TIMELINE_CATEGORIES,
  CORE_TASK_TIMELINE_ITEM_KINDS,
  type CoreTaskTimelineQuery,
} from '../taskTimeline.js';
import {
  WORKFLOW_CONTINUATION_REPLAY_SOURCES,
} from '../../platform/orchestration/workflowContinuationReplay.js';
import type { TaskExecutionProduct } from '../../shared/taskPlanning.js';

const TASK_EXECUTION_PRODUCTS = [
  'chat',
  'work',
  'code',
] as const satisfies readonly TaskExecutionProduct[];

function readQueryValues(
  searchParams: URLSearchParams,
  key: string,
): string[] {
  const values = searchParams.getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(values));
}

function readEnumQueryValues<T extends string>(
  searchParams: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] | undefined {
  const values = readQueryValues(searchParams, key);
  if (values.length === 0) {
    return undefined;
  }

  const invalid = values.find((value) => !allowed.includes(value as T));
  if (invalid) {
    throw new CoreValidationError(
      `${key} must be one of: ${allowed.join(', ')}`,
      'bad_request',
    );
  }

  return values as T[];
}

function readBooleanQuery(
  searchParams: URLSearchParams,
  key: string,
): boolean | undefined {
  const value = searchParams.get(key);
  if (value === null) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw new CoreValidationError(
    `${key} must be "true" or "false"`,
    'bad_request',
  );
}

function readPositiveIntegerQuery(
  searchParams: URLSearchParams,
  key: string,
): number | undefined {
  const value = searchParams.get(key);
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CoreValidationError(
      `${key} must be a positive integer`,
      'bad_request',
    );
  }

  return parsed;
}

function readConversationIds(
  searchParams: URLSearchParams,
): string[] | undefined {
  const values = readQueryValues(searchParams, 'conversationId');
  return values.length > 0 ? values : undefined;
}

export function readTaskAttentionListOptions(
  searchParams: URLSearchParams,
): CoreTaskControlPlaneListOptions {
  return {
    conversationIds: readConversationIds(searchParams),
    taskStatuses: readEnumQueryValues(searchParams, 'taskStatus', CORE_TASK_VIEW_STATUSES),
    executionProducts: readEnumQueryValues(
      searchParams,
      'executionProduct',
      TASK_EXECUTION_PRODUCTS,
    ),
    requestedStrategies: readQueryValues(searchParams, 'requestedStrategy'),
    severities: readEnumQueryValues(searchParams, 'severity', CORE_TASK_CONTROL_PLANE_SEVERITIES),
    reasons: readEnumQueryValues(searchParams, 'reason', CORE_TASK_CONTROL_PLANE_REASONS),
    nextActions: readEnumQueryValues(
      searchParams,
      'nextAction',
      CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS,
    ),
    deliveryModes: readEnumQueryValues(
      searchParams,
      'deliveryMode',
      CORE_TASK_CONTROL_PLANE_DELIVERY_MODES,
    ),
    deliveryActions: readEnumQueryValues(
      searchParams,
      'deliveryAction',
      CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS,
    ),
    workflowStageIds: readQueryValues(searchParams, 'workflowStageId'),
    workflowShapes: readEnumQueryValues(
      searchParams,
      'workflowShape',
      CORE_TASK_WORKFLOW_SHAPES,
    ),
    workflowReviewRequired: readBooleanQuery(searchParams, 'workflowReviewRequired'),
    workflowConvergeTargetIds: readQueryValues(searchParams, 'workflowConvergeTargetId'),
    workflowContinuationSources: readEnumQueryValues(
      searchParams,
      'workflowContinuationSource',
      WORKFLOW_CONTINUATION_REPLAY_SOURCES,
    ),
    workflowUnresolvedTargets: readQueryValues(searchParams, 'workflowUnresolvedTarget'),
    hasUnresolvedWorkflowTargets: readBooleanQuery(searchParams, 'hasUnresolvedWorkflowTargets'),
    workflowContinuationBlockedReasons: readEnumQueryValues(
      searchParams,
      'workflowContinuationBlockedReason',
      CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS,
    ),
    latestReplaySources: readEnumQueryValues(
      searchParams,
      'latestReplaySource',
      CORE_TASK_RECOVERY_REPLAY_SOURCES,
    ),
    latestReplayTriggers: readEnumQueryValues(
      searchParams,
      'latestReplayTrigger',
      CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
    ),
    latestReplayPhases: readEnumQueryValues(
      searchParams,
      'latestReplayPhase',
      CORE_TASK_RECOVERY_REPLAY_PHASES,
    ),
    latestReplayResumeReasons: readEnumQueryValues(
      searchParams,
      'latestReplayResumeReason',
      CORE_TASK_RECOVERY_RESUME_REASONS,
    ),
    latestTimelineCategories: readEnumQueryValues(
      searchParams,
      'latestTimelineCategory',
      CORE_TASK_TIMELINE_CATEGORIES,
    ),
    latestTimelineKinds: readEnumQueryValues(
      searchParams,
      'latestTimelineKind',
      CORE_TASK_TIMELINE_ITEM_KINDS,
    ),
    rootTaskIds: readQueryValues(searchParams, 'rootTaskId'),
    parentTaskIds: readQueryValues(searchParams, 'parentTaskId'),
    hasChildren: readBooleanQuery(searchParams, 'hasChildren'),
    hasActiveChildren: readBooleanQuery(searchParams, 'hasActiveChildren'),
    needsOperatorAttention: readBooleanQuery(searchParams, 'needsOperatorAttention'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readTaskRecoveryListOptions(
  searchParams: URLSearchParams,
): CoreTaskRecoveryListOptions {
  return {
    conversationIds: readConversationIds(searchParams),
    taskStatuses: readEnumQueryValues(searchParams, 'taskStatus', CORE_TASK_VIEW_STATUSES),
    canRetry: readBooleanQuery(searchParams, 'canRetry'),
    canResumeViaApproval: readBooleanQuery(searchParams, 'canResumeViaApproval'),
    hasPendingDispatch: readBooleanQuery(searchParams, 'hasPendingDispatch'),
    hasDispatchReplay: readBooleanQuery(searchParams, 'hasDispatchReplay'),
    hasWorkflowContinuationReplay: readBooleanQuery(
      searchParams,
      'hasWorkflowContinuationReplay',
    ),
    pendingDispatchReplayStates: readEnumQueryValues(
      searchParams,
      'pendingDispatchReplayState',
      CORE_TASK_PENDING_DISPATCH_REPLAY_STATES,
    ),
    dispatchReplayStates: readEnumQueryValues(
      searchParams,
      'dispatchReplayState',
      CORE_TASK_DISPATCH_REPLAY_STATES,
    ),
    workflowContinuationReplayStates: readEnumQueryValues(
      searchParams,
      'workflowContinuationReplayState',
      CORE_TASK_WORKFLOW_CONTINUATION_REPLAY_STATES,
    ),
    workflowContinuationBlockedReasons: readEnumQueryValues(
      searchParams,
      'workflowContinuationBlockedReason',
      CORE_TASK_RECOVERY_WORKFLOW_CONTINUATION_BLOCKED_REASONS,
    ),
    actionKinds: readEnumQueryValues(searchParams, 'actionKind', CORE_TASK_RECOVERY_ACTION_KINDS),
    deliveryModes: readEnumQueryValues(
      searchParams,
      'deliveryMode',
      CORE_TASK_RECOVERY_DELIVERY_MODES,
    ),
    deliveryActions: readEnumQueryValues(
      searchParams,
      'deliveryAction',
      CORE_TASK_RECOVERY_DELIVERY_ACTIONS,
    ),
    workflowStageIds: readQueryValues(searchParams, 'workflowStageId'),
    workflowShapes: readEnumQueryValues(
      searchParams,
      'workflowShape',
      CORE_TASK_RECOVERY_WORKFLOW_SHAPES,
    ),
    workflowReviewRequired: readBooleanQuery(searchParams, 'workflowReviewRequired'),
    workflowConvergeTargetIds: readQueryValues(searchParams, 'workflowConvergeTargetId'),
    workflowContinuationSources: readEnumQueryValues(
      searchParams,
      'workflowContinuationSource',
      WORKFLOW_CONTINUATION_REPLAY_SOURCES,
    ),
    workflowUnresolvedTargets: readQueryValues(searchParams, 'workflowUnresolvedTarget'),
    hasUnresolvedWorkflowTargets: readBooleanQuery(searchParams, 'hasUnresolvedWorkflowTargets'),
    latestReplaySources: readEnumQueryValues(
      searchParams,
      'latestReplaySource',
      CORE_TASK_RECOVERY_REPLAY_SOURCES,
    ),
    latestReplayTriggers: readEnumQueryValues(
      searchParams,
      'latestReplayTrigger',
      CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
    ),
    latestReplayPhases: readEnumQueryValues(
      searchParams,
      'latestReplayPhase',
      CORE_TASK_RECOVERY_REPLAY_PHASES,
    ),
    latestReplayResumeReasons: readEnumQueryValues(
      searchParams,
      'latestReplayResumeReason',
      CORE_TASK_RECOVERY_RESUME_REASONS,
    ),
    rootTaskIds: readQueryValues(searchParams, 'rootTaskId'),
    parentTaskIds: readQueryValues(searchParams, 'parentTaskId'),
    hasChildren: readBooleanQuery(searchParams, 'hasChildren'),
    hasActiveChildren: readBooleanQuery(searchParams, 'hasActiveChildren'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readTaskTimelineQuery(
  searchParams: URLSearchParams,
): CoreTaskTimelineQuery {
  return {
    categories: readEnumQueryValues(
      searchParams,
      'category',
      CORE_TASK_TIMELINE_CATEGORIES,
    ),
    kinds: readEnumQueryValues(
      searchParams,
      'kind',
      CORE_TASK_TIMELINE_ITEM_KINDS,
    ),
    actorIds: readQueryValues(searchParams, 'actorId'),
    runIds: readQueryValues(searchParams, 'runId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readMemoryMaintenanceQuery(
  searchParams: URLSearchParams,
): CoreMemoryMaintenanceQuery {
  return {
    triggers: readEnumQueryValues(
      searchParams,
      'trigger',
      CORE_MEMORY_MAINTENANCE_TRIGGERS,
    ),
    statuses: readEnumQueryValues(
      searchParams,
      'status',
      CORE_MEMORY_MAINTENANCE_STATUSES,
    ),
    phases: readEnumQueryValues(
      searchParams,
      'phase',
      CORE_MEMORY_MAINTENANCE_PHASES,
    ),
    subjectKeys: readQueryValues(searchParams, 'subjectKey'),
    sourceScopeKeys: readQueryValues(searchParams, 'sourceScopeKey'),
    replacementGroups: readQueryValues(searchParams, 'replacementGroup'),
    removedRecordIds: readQueryValues(searchParams, 'removedRecordId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}
