import type { CoreRecordMetadata } from '../../core/types.js';
import type {
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowShape,
} from '../../shared/roomRouting.js';

const WORKFLOW_CONTINUATION_REPLAY_METADATA_KEY = 'workflowContinuationReplay';

export type WorkflowContinuationReplayState = 'ready' | 'in_progress' | 'failed';
export type WorkflowContinuationReplayTrigger = 'retry';
export type WorkflowContinuationReplaySource =
  | 'explicit_mentions'
  | 'workflow_recommendation';

export interface WorkflowContinuationReplayRequest {
  channelId: string;
  checkpointId: string;
  sourceMessageId: string;
  sourceParticipant: RoomRoutingParticipantRef;
  targets: RoomRoutingParticipantRef[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  workflowStageId: string | null;
  workflowShape: RoomWorkflowShape;
  reviewRequired: boolean;
  continuationSource: WorkflowContinuationReplaySource | null;
  workflowRecommendation: Record<string, unknown> | null;
  unresolvedTargets: string[];
  recordedAt: string;
}

export interface WorkflowContinuationReplayMetadataOptions {
  replayState?: WorkflowContinuationReplayState;
  replayTrigger?: WorkflowContinuationReplayTrigger;
  replayAttemptAt?: string | null;
  replayError?: string | null;
}

export interface WorkflowContinuationReplayResult {
  channelId: string;
  sourceMessageId: string;
  status: 'dispatched';
  blockedReason: string | null;
  results: Array<unknown>;
  executionState: 'running' | 'completed' | 'blocked' | 'failed';
}

export interface WorkflowContinuationReplaySnapshot
  extends WorkflowContinuationReplayRequest {
  replayState: WorkflowContinuationReplayState;
  replayTrigger: WorkflowContinuationReplayTrigger;
  replayAttemptAt: string | null;
  replayError: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return readNonEmptyString(value);
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readTrigger(value: unknown): RoomRoutingTrigger | null {
  return value === 'explicit_mention'
    || value === 'continuation_mention'
    || value === 'room_default'
    ? value
    : null;
}

function readWorkflowShape(value: unknown): RoomWorkflowShape | null {
  return value === 'sequential' || value === 'parallel' || value === 'converge'
    ? value
    : null;
}

function readBranchStrategy(value: unknown): RoomWorkflowBranchStrategy | null {
  return value === 'fork_if_possible'
    || value === 'transplant_context'
    || value === 'fresh_no_parent'
    ? value
    : null;
}

function readReplayState(value: unknown): WorkflowContinuationReplayState | null {
  return value === 'ready' || value === 'in_progress' || value === 'failed'
    ? value
    : null;
}

function readReplayTrigger(value: unknown): WorkflowContinuationReplayTrigger | null {
  return value === 'retry' ? value : null;
}

function readContinuationSource(value: unknown): WorkflowContinuationReplaySource | null {
  return value === 'explicit_mentions' || value === 'workflow_recommendation'
    ? value
    : null;
}

function readParticipantRef(value: unknown): RoomRoutingParticipantRef | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const participantKind = record.participantKind === 'orchestrator' || record.participantKind === 'cat'
    ? record.participantKind
    : null;
  const participantId = readNonEmptyString(record.participantId);
  const participantName = readNonEmptyString(record.participantName);
  if (!participantKind || !participantId || !participantName) {
    return null;
  }

  return {
    participantKind,
    participantId,
    participantName,
  };
}

function readParticipantRefArray(value: unknown): RoomRoutingParticipantRef[] {
  return Array.isArray(value)
    ? value
        .map((item) => readParticipantRef(item))
        .filter((item): item is RoomRoutingParticipantRef => item !== null)
    : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function buildWorkflowContinuationReplayRequest(input: {
  channelId: string;
  checkpointId: string;
  sourceMessageId: string;
  sourceParticipant: RoomRoutingParticipantRef;
  targets: RoomRoutingParticipantRef[];
  mentionNames?: string[];
  trigger?: RoomRoutingTrigger;
  branchStrategy?: RoomWorkflowBranchStrategy | null;
  workflowStageId?: string | null;
  workflowShape: RoomWorkflowShape;
  reviewRequired?: boolean;
  continuationSource?: WorkflowContinuationReplaySource | null;
  workflowRecommendation?: Record<string, unknown> | null;
  unresolvedTargets?: string[];
  recordedAt: string;
}): WorkflowContinuationReplayRequest {
  return {
    channelId: input.channelId,
    checkpointId: input.checkpointId,
    sourceMessageId: input.sourceMessageId,
    sourceParticipant: structuredClone(input.sourceParticipant),
    targets: input.targets.map((target) => structuredClone(target)),
    mentionNames: [...(input.mentionNames ?? [])],
    trigger: input.trigger ?? 'continuation_mention',
    branchStrategy: input.branchStrategy ?? null,
    workflowStageId: input.workflowStageId ?? null,
    workflowShape: input.workflowShape,
    reviewRequired: input.reviewRequired ?? false,
    continuationSource: input.continuationSource ?? null,
    workflowRecommendation: input.workflowRecommendation
      ? structuredClone(input.workflowRecommendation)
      : null,
    unresolvedTargets: [...(input.unresolvedTargets ?? [])],
    recordedAt: input.recordedAt,
  };
}

export function readWorkflowContinuationReplay(
  metadata: CoreRecordMetadata | null | undefined,
  options: {
    includeInProgress?: boolean;
  } = {},
): WorkflowContinuationReplaySnapshot | null {
  const record = asRecord(metadata?.[WORKFLOW_CONTINUATION_REPLAY_METADATA_KEY]);
  if (!record) {
    return null;
  }

  const channelId = readNonEmptyString(record.channelId);
  const checkpointId = readNonEmptyString(record.checkpointId);
  const sourceMessageId = readNonEmptyString(record.sourceMessageId);
  const sourceParticipant = readParticipantRef(record.sourceParticipant);
  const targets = readParticipantRefArray(record.targets);
  const trigger = readTrigger(record.trigger);
  const workflowShape = readWorkflowShape(record.workflowShape);
  const recordedAt = readNonEmptyString(record.recordedAt);
  const replayState = readReplayState(record.replayState);
  const replayTrigger = readReplayTrigger(record.replayTrigger);
  if (
    !channelId
    || !checkpointId
    || !sourceMessageId
    || !sourceParticipant
    || targets.length === 0
    || !trigger
    || !workflowShape
    || !recordedAt
    || !replayState
    || !replayTrigger
  ) {
    return null;
  }
  if (replayState === 'in_progress' && !options.includeInProgress) {
    return null;
  }

  return {
    channelId,
    checkpointId,
    sourceMessageId,
    sourceParticipant,
    targets,
    mentionNames: readStringArray(record.mentionNames),
    trigger,
    branchStrategy: readBranchStrategy(record.branchStrategy),
    workflowStageId: readNullableString(record.workflowStageId),
    workflowShape,
    reviewRequired: readBoolean(record.reviewRequired),
    continuationSource: readContinuationSource(record.continuationSource),
    workflowRecommendation: asRecord(record.workflowRecommendation),
    unresolvedTargets: readStringArray(record.unresolvedTargets),
    recordedAt,
    replayState,
    replayTrigger,
    replayAttemptAt: readNullableString(record.replayAttemptAt),
    replayError: readNullableString(record.replayError),
  };
}

export function writeWorkflowContinuationReplayMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  request: WorkflowContinuationReplayRequest | null,
  options: WorkflowContinuationReplayMetadataOptions = {},
): CoreRecordMetadata {
  const nextMetadata: CoreRecordMetadata = metadata
    ? structuredClone(metadata)
    : {};

  if (!request) {
    delete nextMetadata[WORKFLOW_CONTINUATION_REPLAY_METADATA_KEY];
    return nextMetadata;
  }

  nextMetadata[WORKFLOW_CONTINUATION_REPLAY_METADATA_KEY] = {
    channelId: request.channelId,
    checkpointId: request.checkpointId,
    sourceMessageId: request.sourceMessageId,
    sourceParticipant: structuredClone(request.sourceParticipant),
    targets: request.targets.map((target) => structuredClone(target)),
    mentionNames: [...request.mentionNames],
    trigger: request.trigger,
    branchStrategy: request.branchStrategy,
    workflowStageId: request.workflowStageId,
    workflowShape: request.workflowShape,
    reviewRequired: request.reviewRequired,
    continuationSource: request.continuationSource,
    workflowRecommendation: request.workflowRecommendation
      ? structuredClone(request.workflowRecommendation)
      : null,
    unresolvedTargets: [...request.unresolvedTargets],
    recordedAt: request.recordedAt,
    replayState: options.replayState ?? 'ready',
    replayTrigger: options.replayTrigger ?? 'retry',
    replayAttemptAt: options.replayAttemptAt ?? null,
    replayError: options.replayError ?? null,
  };
  return nextMetadata;
}
