import {
  CORE_MEMORY_MAINTENANCE_PHASES,
  CORE_MEMORY_MAINTENANCE_STATUSES,
  CORE_MEMORY_MAINTENANCE_TRIGGERS,
  type CoreMemoryMaintenanceQuery,
} from '../memoryMaintenance.js';
import type { CoreActorWorkloadProjectionQuery } from '../actorWorkloadProjection.js';
import type { CoreManagedWorkProjectionQuery } from '../managedWorkProjection.js';
import type { CoreMissionRunProjectionQuery } from '../missionRunProjection.js';
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
import type { CoreTransportStateProjectionQuery } from '../transportStateProjection.js';
import type { CoreTransportBindingListQuery } from '../transportBindingList.js';
import type { CoreSessionListQuery } from '../sessionList.js';
import type { CoreActorListQuery } from '../actorList.js';
import type { CoreApprovalBindingListQuery } from '../governanceRecordList.js';
import type {
  CoreLaneListQuery,
  CoreSegmentListQuery,
  CoreTurnListQuery,
} from '../interactionRecordLists.js';
import type { CoreMissionListQuery } from '../missionList.js';
import type {
  CoreActivityListQuery,
  CoreCheckpointListQuery,
  CoreOutcomeListQuery,
  CoreRunListQuery,
  CoreTraceListQuery,
} from '../executionRecordLists.js';
import type {
  CoreArtifactListQuery,
  CoreProjectListQuery,
  CoreWorkItemListQuery,
} from '../planningRecordLists.js';
import type {
  CoreContainerListQuery,
  CoreConversationListQuery,
  CoreParticipantListQuery,
} from '../structuralRecordLists.js';
import type { CoreTaskListQuery } from '../taskList.js';
import { CoreValidationError } from '../errors.js';
import { CORE_TASK_VIEW_STATUSES } from '../taskViewQuery.js';
import {
  CORE_TASK_TIMELINE_CATEGORIES,
  CORE_TASK_TIMELINE_ITEM_KINDS,
  type CoreTaskTimelineQuery,
} from '../taskTimeline.js';
import {
  CORE_ACTIVITY_KINDS,
  CORE_APPROVAL_ACTIONS,
  CORE_APPROVAL_BINDING_KINDS,
  CORE_APPROVAL_BINDING_SUBJECT_KINDS,
  CORE_APPROVAL_STATUSES,
  CORE_CHECKPOINT_STATUSES,
  CORE_ACTOR_KINDS,
  CORE_ACTOR_SOURCES,
  CORE_ACTOR_STATUSES,
  CORE_ARTIFACT_KINDS,
  CORE_ARTIFACT_STATUSES,
  CORE_CONTAINER_KINDS,
  CORE_CONTAINER_STATUSES,
  CORE_CONVERSATION_KINDS,
  CORE_CONVERSATION_STATUSES,
  CORE_MISSION_STATUSES,
  CORE_OUTCOME_STATUSES,
  CORE_PROJECT_STATUSES,
  CORE_RUN_STATUSES,
  CORE_LANE_STATUSES,
  CORE_PARTICIPANT_STATUSES,
  CORE_SEGMENT_KINDS,
  CORE_SEGMENT_STATUSES,
  CORE_SESSION_STATUSES,
  CORE_TRANSPORT_BINDING_DIRECTIONS,
  CORE_TRANSPORT_BINDING_PLATFORMS,
  CORE_TRANSPORT_BINDING_STATUSES,
  CORE_TURN_KINDS,
  CORE_TURN_STATUSES,
  CORE_TASK_STATUSES,
  CORE_WORK_ITEM_STATUSES,
  CORE_TRACE_KINDS,
} from './constants.js';
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

function readOptionalQueryValues(
  searchParams: URLSearchParams,
  key: string,
): string[] | undefined {
  const values = readQueryValues(searchParams, key);
  return values.length > 0 ? values : undefined;
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

export function readManagedWorkProjectionQuery(
  searchParams: URLSearchParams,
): CoreManagedWorkProjectionQuery {
  return {
    workItemIds: readOptionalQueryValues(searchParams, 'workItemId'),
    workItemStatuses: readEnumQueryValues(
      searchParams,
      'workItemStatus',
      CORE_WORK_ITEM_STATUSES,
    ),
    projectIds: readOptionalQueryValues(searchParams, 'projectId'),
    conversationIds: readConversationIds(searchParams),
    ownerActorIds: readOptionalQueryValues(searchParams, 'ownerActorId'),
    assignedActorIds: readOptionalQueryValues(searchParams, 'assignedActorId'),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    missionStatuses: readEnumQueryValues(
      searchParams,
      'missionStatus',
      CORE_MISSION_STATUSES,
    ),
    runStatuses: readEnumQueryValues(searchParams, 'runStatus', CORE_RUN_STATUSES),
    hasTask: readBooleanQuery(searchParams, 'hasTask'),
    hasMission: readBooleanQuery(searchParams, 'hasMission'),
    hasRun: readBooleanQuery(searchParams, 'hasRun'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readActorWorkloadProjectionQuery(
  searchParams: URLSearchParams,
): CoreActorWorkloadProjectionQuery {
  return {
    actorIds: readOptionalQueryValues(searchParams, 'actorId'),
    actorKinds: readEnumQueryValues(searchParams, 'actorKind', CORE_ACTOR_KINDS),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_ACTOR_STATUSES),
    sources: readEnumQueryValues(searchParams, 'source', CORE_ACTOR_SOURCES),
    missionStatuses: readEnumQueryValues(
      searchParams,
      'missionStatus',
      CORE_MISSION_STATUSES,
    ),
    platforms: readEnumQueryValues(
      searchParams,
      'platform',
      CORE_TRANSPORT_BINDING_PLATFORMS,
    ),
    hasActiveParticipant: readBooleanQuery(searchParams, 'hasActiveParticipant'),
    hasManagedWork: readBooleanQuery(searchParams, 'hasManagedWork'),
    hasMission: readBooleanQuery(searchParams, 'hasMission'),
    hasTransport: readBooleanQuery(searchParams, 'hasTransport'),
    hasActiveSession: readBooleanQuery(searchParams, 'hasActiveSession'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readMissionRunProjectionQuery(
  searchParams: URLSearchParams,
): CoreMissionRunProjectionQuery {
  return {
    missionIds: readOptionalQueryValues(searchParams, 'missionId'),
    missionStatuses: readEnumQueryValues(
      searchParams,
      'missionStatus',
      CORE_MISSION_STATUSES,
    ),
    conversationIds: readConversationIds(searchParams),
    assignedAgentIds: readOptionalQueryValues(searchParams, 'assignedAgentId'),
    managedWorkIds: readOptionalQueryValues(searchParams, 'managedWorkId'),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    runIds: readOptionalQueryValues(searchParams, 'runId'),
    hasRun: readBooleanQuery(searchParams, 'hasRun'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readTransportStateProjectionQuery(
  searchParams: URLSearchParams,
): CoreTransportStateProjectionQuery {
  return {
    transportBindingIds: readOptionalQueryValues(searchParams, 'transportBindingId'),
    platforms: readEnumQueryValues(
      searchParams,
      'platform',
      CORE_TRANSPORT_BINDING_PLATFORMS,
    ),
    statuses: readEnumQueryValues(
      searchParams,
      'status',
      CORE_TRANSPORT_BINDING_STATUSES,
    ),
    conversationIds: readConversationIds(searchParams),
    participantIds: readOptionalQueryValues(searchParams, 'participantId'),
    agentIds: readOptionalQueryValues(searchParams, 'agentId'),
    hasSession: readBooleanQuery(searchParams, 'hasSession'),
    activeSession: readBooleanQuery(searchParams, 'activeSession'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readTransportBindingListQuery(
  searchParams: URLSearchParams,
): CoreTransportBindingListQuery {
  return {
    platforms: readEnumQueryValues(
      searchParams,
      'platform',
      CORE_TRANSPORT_BINDING_PLATFORMS,
    ),
    directions: readEnumQueryValues(
      searchParams,
      'direction',
      CORE_TRANSPORT_BINDING_DIRECTIONS,
    ),
    statuses: readEnumQueryValues(
      searchParams,
      'status',
      CORE_TRANSPORT_BINDING_STATUSES,
    ),
    conversationIds: readConversationIds(searchParams),
    participantIds: readOptionalQueryValues(searchParams, 'participantId'),
    agentIds: readOptionalQueryValues(searchParams, 'agentId'),
    externalThreadKeys: readOptionalQueryValues(searchParams, 'externalThreadKey'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readApprovalBindingListQuery(
  searchParams: URLSearchParams,
): CoreApprovalBindingListQuery {
  return {
    ids: readOptionalQueryValues(searchParams, 'id'),
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_APPROVAL_BINDING_KINDS),
    subjectKinds: readEnumQueryValues(
      searchParams,
      'subjectKind',
      CORE_APPROVAL_BINDING_SUBJECT_KINDS,
    ),
    approvalTaskIds: readOptionalQueryValues(searchParams, 'approvalTaskId'),
    subjectIds: readOptionalQueryValues(searchParams, 'subjectId'),
    projectIds: readOptionalQueryValues(searchParams, 'projectId'),
    workItemIds: readOptionalQueryValues(searchParams, 'workItemId'),
    conversationIds: readConversationIds(searchParams),
    requestedByActorIds: readOptionalQueryValues(searchParams, 'requestedByActorId'),
    requestedForActorIds: readOptionalQueryValues(searchParams, 'requestedForActorId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readSessionListQuery(
  searchParams: URLSearchParams,
): CoreSessionListQuery {
  return {
    conversationIds: readConversationIds(searchParams),
    turnIds: readOptionalQueryValues(searchParams, 'turnId'),
    laneIds: readOptionalQueryValues(searchParams, 'laneId'),
    participantIds: readOptionalQueryValues(searchParams, 'participantId'),
    agentIds: readOptionalQueryValues(searchParams, 'agentId'),
    transportBindingIds: readOptionalQueryValues(searchParams, 'transportBindingId'),
    runtimeKeys: readOptionalQueryValues(searchParams, 'runtimeKey'),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_SESSION_STATUSES),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readContainerListQuery(
  searchParams: URLSearchParams,
): CoreContainerListQuery {
  return {
    ids: readOptionalQueryValues(searchParams, 'id'),
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_CONTAINER_KINDS),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_CONTAINER_STATUSES),
    parentContainerIds: readOptionalQueryValues(searchParams, 'parentContainerId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readConversationListQuery(
  searchParams: URLSearchParams,
): CoreConversationListQuery {
  return {
    ids: readOptionalQueryValues(searchParams, 'id'),
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_CONVERSATION_KINDS),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_CONVERSATION_STATUSES),
    containerIds: readOptionalQueryValues(searchParams, 'containerId'),
    participantActorIds: readOptionalQueryValues(searchParams, 'participantActorId'),
    sourceChannelIds: readOptionalQueryValues(searchParams, 'sourceChannelId'),
    repoPaths: readOptionalQueryValues(searchParams, 'repoPath'),
    responseLanguages: readOptionalQueryValues(searchParams, 'responseLanguage'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readParticipantListQuery(
  searchParams: URLSearchParams,
): CoreParticipantListQuery {
  return {
    ids: readOptionalQueryValues(searchParams, 'id'),
    conversationIds: readConversationIds(searchParams),
    agentIds: readOptionalQueryValues(searchParams, 'agentId'),
    roles: readOptionalQueryValues(searchParams, 'role'),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_PARTICIPANT_STATUSES),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readActorListQuery(
  searchParams: URLSearchParams,
): CoreActorListQuery {
  return {
    actorKinds: readEnumQueryValues(searchParams, 'actorKind', CORE_ACTOR_KINDS),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_ACTOR_STATUSES),
    sources: readEnumQueryValues(searchParams, 'source', CORE_ACTOR_SOURCES),
    sourceIds: readOptionalQueryValues(searchParams, 'sourceId'),
    roles: readOptionalQueryValues(searchParams, 'role'),
    hasDefaultExecutionTarget: readBooleanQuery(searchParams, 'hasDefaultExecutionTarget'),
    hasMemory: readBooleanQuery(searchParams, 'hasMemory'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readMissionListQuery(
  searchParams: URLSearchParams,
): CoreMissionListQuery {
  return {
    managedWorkIds: readOptionalQueryValues(searchParams, 'managedWorkId'),
    conversationIds: readConversationIds(searchParams),
    sourceTurnIds: readOptionalQueryValues(searchParams, 'sourceTurnId'),
    sourceLaneIds: readOptionalQueryValues(searchParams, 'sourceLaneId'),
    assignedAgentIds: readOptionalQueryValues(searchParams, 'assignedAgentId'),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_MISSION_STATUSES),
    runIds: readOptionalQueryValues(searchParams, 'runId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readProjectListQuery(
  searchParams: URLSearchParams,
): CoreProjectListQuery {
  return {
    statuses: readEnumQueryValues(searchParams, 'status', CORE_PROJECT_STATUSES),
    ownerActorIds: readOptionalQueryValues(searchParams, 'ownerActorId'),
    primaryConversationIds: readOptionalQueryValues(searchParams, 'primaryConversationId'),
    repoPaths: readOptionalQueryValues(searchParams, 'repoPath'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readWorkItemListQuery(
  searchParams: URLSearchParams,
): CoreWorkItemListQuery {
  return {
    statuses: readEnumQueryValues(searchParams, 'status', CORE_WORK_ITEM_STATUSES),
    projectIds: readOptionalQueryValues(searchParams, 'projectId'),
    conversationIds: readConversationIds(searchParams),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    parentWorkItemIds: readOptionalQueryValues(searchParams, 'parentWorkItemId'),
    ownerActorIds: readOptionalQueryValues(searchParams, 'ownerActorId'),
    assignedActorIds: readOptionalQueryValues(searchParams, 'assignedActorId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readArtifactListQuery(
  searchParams: URLSearchParams,
): CoreArtifactListQuery {
  return {
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_ARTIFACT_KINDS),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_ARTIFACT_STATUSES),
    projectIds: readOptionalQueryValues(searchParams, 'projectId'),
    workItemIds: readOptionalQueryValues(searchParams, 'workItemId'),
    conversationIds: readConversationIds(searchParams),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    runIds: readOptionalQueryValues(searchParams, 'runId'),
    mimeTypes: readOptionalQueryValues(searchParams, 'mimeType'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readRunListQuery(
  searchParams: URLSearchParams,
): CoreRunListQuery {
  return {
    statuses: readEnumQueryValues(searchParams, 'status', CORE_RUN_STATUSES),
    conversationIds: readConversationIds(searchParams),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    parentRunIds: readOptionalQueryValues(searchParams, 'parentRunId'),
    orchestratorActorIds: readOptionalQueryValues(searchParams, 'orchestratorActorId'),
    traceIds: readOptionalQueryValues(searchParams, 'traceId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readTraceListQuery(
  searchParams: URLSearchParams,
): CoreTraceListQuery {
  return {
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_TRACE_KINDS),
    conversationIds: readConversationIds(searchParams),
    runIds: readOptionalQueryValues(searchParams, 'runId'),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    actorIds: readOptionalQueryValues(searchParams, 'actorId'),
    traceIds: readOptionalQueryValues(searchParams, 'traceId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readCheckpointListQuery(
  searchParams: URLSearchParams,
): CoreCheckpointListQuery {
  return {
    statuses: readEnumQueryValues(searchParams, 'status', CORE_CHECKPOINT_STATUSES),
    conversationIds: readConversationIds(searchParams),
    runIds: readOptionalQueryValues(searchParams, 'runId'),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    sourceTraceIds: readOptionalQueryValues(searchParams, 'sourceTraceId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readOutcomeListQuery(
  searchParams: URLSearchParams,
): CoreOutcomeListQuery {
  return {
    statuses: readEnumQueryValues(searchParams, 'status', CORE_OUTCOME_STATUSES),
    conversationIds: readConversationIds(searchParams),
    runIds: readOptionalQueryValues(searchParams, 'runId'),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readActivityListQuery(
  searchParams: URLSearchParams,
): CoreActivityListQuery {
  return {
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_ACTIVITY_KINDS),
    actorIds: readOptionalQueryValues(searchParams, 'actorId'),
    projectIds: readOptionalQueryValues(searchParams, 'projectId'),
    workItemIds: readOptionalQueryValues(searchParams, 'workItemId'),
    conversationIds: readConversationIds(searchParams),
    taskIds: readOptionalQueryValues(searchParams, 'taskId'),
    runIds: readOptionalQueryValues(searchParams, 'runId'),
    artifactIds: readOptionalQueryValues(searchParams, 'artifactId'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readTurnListQuery(
  searchParams: URLSearchParams,
): CoreTurnListQuery {
  return {
    conversationIds: readConversationIds(searchParams),
    sourceParticipantIds: readOptionalQueryValues(searchParams, 'sourceParticipantId'),
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_TURN_KINDS),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_TURN_STATUSES),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readLaneListQuery(
  searchParams: URLSearchParams,
): CoreLaneListQuery {
  return {
    conversationIds: readConversationIds(searchParams),
    turnIds: readOptionalQueryValues(searchParams, 'turnId'),
    participantIds: readOptionalQueryValues(searchParams, 'participantId'),
    agentIds: readOptionalQueryValues(searchParams, 'agentId'),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_LANE_STATUSES),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readSegmentListQuery(
  searchParams: URLSearchParams,
): CoreSegmentListQuery {
  return {
    conversationIds: readConversationIds(searchParams),
    turnIds: readOptionalQueryValues(searchParams, 'turnId'),
    laneIds: readOptionalQueryValues(searchParams, 'laneId'),
    sessionIds: readOptionalQueryValues(searchParams, 'sessionId'),
    kinds: readEnumQueryValues(searchParams, 'kind', CORE_SEGMENT_KINDS),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_SEGMENT_STATUSES),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

export function readTaskListQuery(
  searchParams: URLSearchParams,
): CoreTaskListQuery {
  return {
    ids: readOptionalQueryValues(searchParams, 'id'),
    statuses: readEnumQueryValues(searchParams, 'status', CORE_TASK_STATUSES),
    conversationIds: readConversationIds(searchParams),
    parentTaskIds: readOptionalQueryValues(searchParams, 'parentTaskId'),
    ownerActorIds: readOptionalQueryValues(searchParams, 'ownerActorId'),
    orchestratorActorIds: readOptionalQueryValues(searchParams, 'orchestratorActorId'),
    assignedActorIds: readOptionalQueryValues(searchParams, 'assignedActorId'),
    approvalStatuses: readEnumQueryValues(
      searchParams,
      'approvalStatus',
      CORE_APPROVAL_STATUSES,
    ),
    approvalDecisionActions: readEnumQueryValues(
      searchParams,
      'approvalDecisionAction',
      CORE_APPROVAL_ACTIONS,
    ),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}
