import { randomUUID } from 'node:crypto';

import type {
  ChatMessageSenderKind,
  RoomAssistantTurnDelivery,
  RoomRouteResolution,
  RoomRoutingCheckpoint,
  RoomRoutingDispatch,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingState,
  RoomWorkflowEvent,
  RoomWorkflowState,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
  RoomWakeRequest,
} from '../../../../shared/roomRouting.js';
import {
  createDefaultRoomRoutingState,
  createDefaultRoomWorkflowState,
  DEFAULT_WAKE_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT,
  normalizeRoomRouteBlockedReason,
  normalizeRoomRouteDefaultTargetReason,
  normalizeRoomRouteResolutionMode,
  normalizeRoomRouteSelectionKind,
  normalizeRoomRoutingCheckpointKind,
  normalizeRoomRoutingDispatchStatus,
  normalizeRoomRoutingGuardReason,
  normalizeRoomRoutingMode,
  normalizeRoomRoutingTrigger,
  normalizeRoomRoutingTurnStatus,
  normalizeRoomWakeReason,
  normalizeRoomWakeRequestStatus,
  normalizeRoomWakeTrigger,
  normalizeRoomWorkflowBranchStrategy,
  normalizeRoomWorkflowEventKind,
  normalizeRoomWorkflowHandoffReason,
  normalizeRoomWorkflowShape,
  normalizeRoomWorkflowStatus,
  normalizeRoomWorkflowTargetStatus,
} from './index.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeMessageSenderKind(rawSenderKind: unknown): ChatMessageSenderKind {
  const senderKind = readString(rawSenderKind, 'system');
  return (
    senderKind === 'user'
    || senderKind === 'agent'
    || senderKind === 'orchestrator'
    || senderKind === 'system'
  )
    ? senderKind
    : 'system';
}

function normalizeRoomRoutingParticipant(rawParticipant: unknown): RoomRoutingParticipantRef | null {
  const participantRecord = asRecord(rawParticipant);
  if (!participantRecord) {
    return null;
  }

  const rawKind = readString(participantRecord.participantKind);
  const participantKind = rawKind === 'cat'
    ? 'cat'
    : rawKind === 'orchestrator'
      ? 'orchestrator'
      : null;

  if (!participantKind) {
    return null;
  }

  const participantId = readString(participantRecord.participantId);
  const participantName = readString(participantRecord.participantName);
  if (!participantId || !participantName) {
    return null;
  }

  return {
    participantKind,
    participantId,
    participantName,
  };
}

function normalizeRoomAssistantTurnDelivery(rawDelivery: unknown): RoomAssistantTurnDelivery | null {
  const deliveryRecord = asRecord(rawDelivery);
  if (!deliveryRecord) {
    return null;
  }

  const assistantTurnId = readNullableString(deliveryRecord.assistantTurnId);
  const messageIds = readStringArray(deliveryRecord.messageIds);
  if (!assistantTurnId || messageIds.length === 0) {
    return null;
  }

  const storedSegmentCount = readNumber(deliveryRecord.segmentCount, messageIds.length);
  return {
    assistantTurnId,
    messageIds,
    fullText: readString(deliveryRecord.fullText, ''),
    segmentCount: storedSegmentCount > 0 ? storedSegmentCount : messageIds.length,
  };
}

function normalizeRoomRouteResolution(rawResolution: unknown): RoomRouteResolution {
  const resolutionRecord = asRecord(rawResolution);
  return {
    routingMode: normalizeRoomRouteResolutionMode(resolutionRecord?.routingMode, 'room_default'),
    selectionKind: normalizeRoomRouteSelectionKind(
      resolutionRecord?.selectionKind,
      'blocked',
    ),
    defaultTarget: resolutionRecord?.defaultTarget
      ? normalizeRoomRoutingParticipant(resolutionRecord.defaultTarget)
      : null,
    defaultTargetReason: normalizeRoomRouteDefaultTargetReason(
      resolutionRecord?.defaultTargetReason,
    ),
    fallbackTarget: resolutionRecord?.fallbackTarget
      ? normalizeRoomRoutingParticipant(resolutionRecord.fallbackTarget)
      : null,
    blockedReason: normalizeRoomRouteBlockedReason(resolutionRecord?.blockedReason),
    note: readNullableString(resolutionRecord?.note),
  };
}

function normalizeRoomWakeRequest(rawWakeRequest: unknown): RoomWakeRequest | null {
  const wakeRequestRecord = asRecord(rawWakeRequest);
  if (!wakeRequestRecord) {
    return null;
  }

  const participant = normalizeRoomRoutingParticipant(wakeRequestRecord.participant);
  if (!participant) {
    return null;
  }

  return {
    id: readString(wakeRequestRecord.id, randomUUID()),
    participant,
    trigger: normalizeRoomWakeTrigger(wakeRequestRecord.trigger, 'route_target'),
    reason: normalizeRoomWakeReason(wakeRequestRecord.reason, 'room_default'),
    sourceMessageId: readNullableString(wakeRequestRecord.sourceMessageId),
    status: normalizeRoomWakeRequestStatus(wakeRequestRecord.status, 'completed'),
    createdAt: readString(wakeRequestRecord.createdAt, new Date().toISOString()),
    completedAt: readNullableString(wakeRequestRecord.completedAt),
    error: readNullableString(wakeRequestRecord.error),
  };
}

function normalizeRoomRoutingDispatch(rawDispatch: unknown): RoomRoutingDispatch | null {
  const dispatchRecord = asRecord(rawDispatch);
  if (!dispatchRecord) {
    return null;
  }

  const target = normalizeRoomRoutingParticipant(dispatchRecord.target);
  if (!target) {
    return null;
  }

  return {
    id: readString(dispatchRecord.id, randomUUID()),
    sourceMessageId: readString(dispatchRecord.sourceMessageId),
    source: normalizeRoomRoutingParticipant(dispatchRecord.source),
    target,
    trigger: normalizeRoomRoutingTrigger(dispatchRecord.trigger, 'continuation_mention'),
    status: normalizeRoomRoutingDispatchStatus(dispatchRecord.status, 'completed'),
    mentionNames: readStringArray(dispatchRecord.mentionNames),
    response: normalizeRoomAssistantTurnDelivery(dispatchRecord.response),
    startedAt: readString(dispatchRecord.startedAt, new Date().toISOString()),
    completedAt: readNullableString(dispatchRecord.completedAt),
    error: readNullableString(dispatchRecord.error),
  };
}

function normalizeRoomRoutingCheckpoint(rawCheckpoint: unknown): RoomRoutingCheckpoint | null {
  const checkpointRecord = asRecord(rawCheckpoint);
  if (!checkpointRecord) {
    return null;
  }

  return {
    id: readString(checkpointRecord.id, randomUUID()),
    kind: normalizeRoomRoutingCheckpointKind(checkpointRecord.kind, 'turn_started'),
    message: readString(checkpointRecord.message),
    actor: normalizeRoomRoutingParticipant(checkpointRecord.actor),
    sourceMessageId: readNullableString(checkpointRecord.sourceMessageId),
    targets: Array.isArray(checkpointRecord.targets)
      ? checkpointRecord.targets
          .map((target) => normalizeRoomRoutingParticipant(target))
          .filter((target): target is RoomRoutingParticipantRef => target !== null)
      : [],
    createdAt: readString(checkpointRecord.createdAt, new Date().toISOString()),
  };
}

function normalizeRoomRoutingOutcome(rawOutcome: unknown): RoomRoutingOutcome | null {
  const outcomeRecord = asRecord(rawOutcome);
  if (!outcomeRecord) {
    return null;
  }

  return {
    turnId: readString(outcomeRecord.turnId, randomUUID()),
    mode: normalizeRoomRoutingMode(outcomeRecord.mode, 'boss_chat'),
    sourceMessageId: readString(outcomeRecord.sourceMessageId),
    sourceSenderKind: normalizeMessageSenderKind(outcomeRecord.sourceSenderKind),
    sourceSenderName: readString(outcomeRecord.sourceSenderName, 'Chat'),
    status: normalizeRoomRoutingTurnStatus(outcomeRecord.status, 'idle'),
    resolution: normalizeRoomRouteResolution(outcomeRecord.resolution),
    resolvedTargets: Array.isArray(outcomeRecord.resolvedTargets)
      ? outcomeRecord.resolvedTargets
          .map((target) => normalizeRoomRoutingParticipant(target))
          .filter((target): target is RoomRoutingParticipantRef => target !== null)
      : [],
    unresolvedMentions: readStringArray(outcomeRecord.unresolvedMentions),
    dispatches: Array.isArray(outcomeRecord.dispatches)
      ? outcomeRecord.dispatches
          .map((dispatch) => normalizeRoomRoutingDispatch(dispatch))
          .filter((dispatch): dispatch is RoomRoutingDispatch => dispatch !== null)
      : [],
    checkpoints: Array.isArray(outcomeRecord.checkpoints)
      ? outcomeRecord.checkpoints
          .map((checkpoint) => normalizeRoomRoutingCheckpoint(checkpoint))
          .filter((checkpoint): checkpoint is RoomRoutingCheckpoint => checkpoint !== null)
      : [],
    continuationCount: readNumber(outcomeRecord.continuationCount),
    totalDispatchCount: readNumber(outcomeRecord.totalDispatchCount),
    guard: normalizeRoomRoutingGuardReason(outcomeRecord.guard),
    startedAt: readString(outcomeRecord.startedAt, new Date().toISOString()),
    completedAt: readNullableString(outcomeRecord.completedAt),
  };
}

function normalizeRoomWorkflowTarget(rawTarget: unknown): RoomWorkflowTargetState | null {
  const targetRecord = asRecord(rawTarget);
  if (!targetRecord) {
    return null;
  }

  const participant = normalizeRoomRoutingParticipant(targetRecord.participant);
  if (!participant) {
    return null;
  }

  return {
    id: readString(targetRecord.id, randomUUID()),
    dispatchId: readNullableString(targetRecord.dispatchId),
    participant,
    source: normalizeRoomRoutingParticipant(targetRecord.source),
    sourceMessageId: readString(targetRecord.sourceMessageId),
    trigger: normalizeRoomRoutingTrigger(targetRecord.trigger, 'continuation_mention'),
    mentionNames: readStringArray(targetRecord.mentionNames),
    depth: readNumber(targetRecord.depth),
    parentCheckpointId: readNullableString(targetRecord.parentCheckpointId),
    branchStrategy: normalizeRoomWorkflowBranchStrategy(targetRecord.branchStrategy),
    handoffReason: normalizeRoomWorkflowHandoffReason(targetRecord.handoffReason),
    wakeRequestId: readNullableString(targetRecord.wakeRequestId),
    status: normalizeRoomWorkflowTargetStatus(targetRecord.status, 'pending'),
    queuedAt: readString(targetRecord.queuedAt, new Date().toISOString()),
    startedAt: readNullableString(targetRecord.startedAt),
    completedAt: readNullableString(targetRecord.completedAt),
    response: normalizeRoomAssistantTurnDelivery(targetRecord.response),
    error: readNullableString(targetRecord.error),
  };
}

function normalizeRoomWorkflowEvent(rawEvent: unknown): RoomWorkflowEvent | null {
  const eventRecord = asRecord(rawEvent);
  if (!eventRecord) {
    return null;
  }

  return {
    id: readString(eventRecord.id, randomUUID()),
    turnId: readString(eventRecord.turnId),
    kind: normalizeRoomWorkflowEventKind(eventRecord.kind, 'turn_started'),
    status: normalizeRoomWorkflowStatus(eventRecord.status, 'running'),
    message: readString(eventRecord.message),
    actor: normalizeRoomRoutingParticipant(eventRecord.actor),
    sourceMessageId: readNullableString(eventRecord.sourceMessageId),
    targets: Array.isArray(eventRecord.targets)
      ? eventRecord.targets
          .map((target) => normalizeRoomRoutingParticipant(target))
          .filter((target): target is RoomRoutingParticipantRef => target !== null)
      : [],
    dispatchId: readNullableString(eventRecord.dispatchId),
    checkpointId: readNullableString(eventRecord.checkpointId),
    outcomeId: readNullableString(eventRecord.outcomeId),
    createdAt: readString(eventRecord.createdAt, new Date().toISOString()),
    metadata: asRecord(eventRecord.metadata) ?? {},
  };
}

function normalizeRoomWorkflowTurn(rawTurn: unknown): RoomWorkflowTurn | null {
  const turnRecord = asRecord(rawTurn);
  if (!turnRecord) {
    return null;
  }

  return {
    id: readString(turnRecord.id, randomUUID()),
    status: normalizeRoomWorkflowStatus(turnRecord.status, 'idle'),
    sourceMessageId: readString(turnRecord.sourceMessageId),
    sourceSenderKind: normalizeMessageSenderKind(turnRecord.sourceSenderKind),
    sourceSenderName: readString(turnRecord.sourceSenderName, 'Chat'),
    guard: normalizeRoomRoutingGuardReason(turnRecord.guard),
    stageId: readString(turnRecord.stageId, 'dispatch'),
    workflowShape: normalizeRoomWorkflowShape(turnRecord.workflowShape, 'sequential'),
    reviewRequired: readBoolean(turnRecord.reviewRequired),
    lastCheckpointId: readNullableString(turnRecord.lastCheckpointId),
    convergeTargetId: readNullableString(turnRecord.convergeTargetId),
    continuationCount: readNumber(turnRecord.continuationCount),
    dispatchCount: readNumber(turnRecord.dispatchCount),
    targetStatuses: Array.isArray(turnRecord.targetStatuses)
      ? turnRecord.targetStatuses
          .map((target) => normalizeRoomWorkflowTarget(target))
          .filter((target): target is RoomWorkflowTargetState => target !== null)
      : [],
    events: Array.isArray(turnRecord.events)
      ? turnRecord.events
          .map((event) => normalizeRoomWorkflowEvent(event))
          .filter((event): event is RoomWorkflowEvent => event !== null)
      : [],
    startedAt: readString(turnRecord.startedAt, new Date().toISOString()),
    updatedAt: readString(
      turnRecord.updatedAt,
      readString(turnRecord.startedAt, new Date().toISOString()),
    ),
    completedAt: readNullableString(turnRecord.completedAt),
  };
}

function normalizeRoomWorkflow(rawWorkflow: unknown): RoomWorkflowState {
  const workflowRecord = asRecord(rawWorkflow);
  const fallback = createDefaultRoomWorkflowState();

  return {
    activeTurn: normalizeRoomWorkflowTurn(workflowRecord?.activeTurn),
    turnHistory: Array.isArray(workflowRecord?.turnHistory)
      ? workflowRecord.turnHistory
          .map((turn) => normalizeRoomWorkflowTurn(turn))
          .filter((turn): turn is RoomWorkflowTurn => turn !== null)
          .slice(0, DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT)
      : fallback.turnHistory,
    eventHistory: Array.isArray(workflowRecord?.eventHistory)
      ? workflowRecord.eventHistory
          .map((event) => normalizeRoomWorkflowEvent(event))
          .filter((event): event is RoomWorkflowEvent => event !== null)
          .slice(0, DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT)
      : fallback.eventHistory,
    lastCheckpointEvent: normalizeRoomWorkflowEvent(workflowRecord?.lastCheckpointEvent),
    lastOutcomeEvent: normalizeRoomWorkflowEvent(workflowRecord?.lastOutcomeEvent),
  };
}

export function normalizeRoomRouting(rawRoomRouting: unknown): RoomRoutingState {
  const roomRoutingRecord = asRecord(rawRoomRouting);
  const fallback = createDefaultRoomRoutingState();

  return {
    mode: normalizeRoomRoutingMode(roomRoutingRecord?.mode, fallback.mode),
    defaultRecipientId: readNullableString(roomRoutingRecord?.defaultRecipientId)
      ?? readNullableString(roomRoutingRecord?.leadParticipantId),
    maxContinuations: readNumber(
      roomRoutingRecord?.maxContinuations,
      fallback.maxContinuations,
    ),
    maxDispatchesPerTurn: readNumber(
      roomRoutingRecord?.maxDispatchesPerTurn,
      fallback.maxDispatchesPerTurn,
    ),
    maxTargetVisitsPerTurn: readNumber(
      roomRoutingRecord?.maxTargetVisitsPerTurn,
      fallback.maxTargetVisitsPerTurn,
    ),
    lastOutcome: normalizeRoomRoutingOutcome(roomRoutingRecord?.lastOutcome),
    lastCheckpoint: normalizeRoomRoutingCheckpoint(roomRoutingRecord?.lastCheckpoint),
    lastWakeRequest: normalizeRoomWakeRequest(roomRoutingRecord?.lastWakeRequest),
    wakeHistory: Array.isArray(roomRoutingRecord?.wakeHistory)
      ? roomRoutingRecord.wakeHistory
          .map((wakeRequest) => normalizeRoomWakeRequest(wakeRequest))
          .filter((wakeRequest): wakeRequest is RoomWakeRequest => wakeRequest !== null)
          .slice(0, DEFAULT_WAKE_HISTORY_LIMIT)
      : fallback.wakeHistory,
    workflow: normalizeRoomWorkflow(roomRoutingRecord?.workflow),
  };
}
