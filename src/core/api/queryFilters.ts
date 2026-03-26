import {
  CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS,
  CORE_TASK_CONTROL_PLANE_DELIVERY_MODES,
  CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS,
  CORE_TASK_CONTROL_PLANE_REASONS,
  CORE_TASK_CONTROL_PLANE_SEVERITIES,
  type CoreTaskControlPlaneListOptions,
} from '../taskControlPlane.js';
import {
  CORE_TASK_RECOVERY_ACTION_KINDS,
  CORE_TASK_RECOVERY_DELIVERY_ACTIONS,
  CORE_TASK_RECOVERY_DELIVERY_MODES,
  type CoreTaskRecoveryListOptions,
} from '../recovery.js';
import { CoreValidationError } from '../errors.js';
import { CORE_TASK_VIEW_STATUSES } from '../taskViewQuery.js';
import {
  CORE_TASK_TIMELINE_CATEGORIES,
  CORE_TASK_TIMELINE_ITEM_KINDS,
} from '../taskTimeline.js';

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
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}
