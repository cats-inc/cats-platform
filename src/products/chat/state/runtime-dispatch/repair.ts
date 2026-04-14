import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type {
  ChatChannelState,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  CatsCoreState,
  LaneRecord,
  SegmentRecord,
} from '../../../../core/types.js';
import type {
  RoomRouteDefaultTargetReason,
  RoomAssistantTurnDelivery,
  RoomRoutingDispatch,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowHandoffReason,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import { resolveVisibleOrchestratorLabel } from '../../../../shared/orchestratorLabel.js';
import { ORCHESTRATOR_NAME, requireChannel } from '../model/index.js';
import {
  appendWorkflowEvent,
  createWorkflowEvent,
} from '../room-routing/workflow.js';
import {
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../room-routing/index.js';
import { finalizeDispatchTurn } from './finalize.js';
import { formatSessionStartedMessage } from '../runtimeMessages.js';
import {
  buildAssistantTurnDeliveryFromChannel,
  findTerminalAssistantTurnSegmentForTurn,
  isAssistantTurnSegmentMessage,
  readAssistantTurnId,
  readAssistantTurnTargetStateId,
} from '../assistantTurnSegments.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import {
  buildCanonicalChatMessage,
  compareChatCoreSegmentsAscending,
  compareChatCoreSegmentsDescending,
  readChatCoreMetadataNumber,
  readChatCoreMetadataString,
  resolveRawChatParticipantId,
} from '../chatCoreInterop.js';
import {
  sameParticipantRef,
} from '../core-projection/entityMetadata.js';
import {
  readLatestWorkflowContinuationContext,
} from '../room-routing/continuationContext.js';

function describeGuardReason(): string {
  return 'a routing guard';
}

function readRuntimeResponseForTurn(
  channel: ChatChannelState,
  channelId: string,
  turnId: string,
  core?: CatsCoreState,
): {
  message: ChatMessage;
  response: RoomAssistantTurnDelivery;
} | null {
  const terminalSegment = findTerminalAssistantTurnSegmentForTurn(channel, turnId);
  if (terminalSegment) {
    const assistantTurnId = readAssistantTurnId(terminalSegment);
    if (!assistantTurnId) {
      return null;
    }
    const response = buildAssistantTurnDeliveryFromChannel(channel, assistantTurnId);
    if (!response) {
      return null;
    }
    const transcriptResponse = {
      message: terminalSegment,
      response,
    };
    if (!core) {
      return transcriptResponse;
    }
    const canonicalResponse = buildCanonicalRuntimeResponseForTurn(channelId, turnId, core);
    if (shouldPreferCanonicalRuntimeResponse(transcriptResponse, canonicalResponse)) {
      return canonicalResponse;
    }
    return {
      message: terminalSegment,
      response,
    };
  }

  if (!core) {
    return null;
  }

  return buildCanonicalRuntimeResponseForTurn(channelId, turnId, core);
}

function shouldPreferCanonicalRuntimeResponse(
  transcriptResponse: {
    message: ChatMessage;
    response: RoomAssistantTurnDelivery;
  },
  canonicalResponse: {
    message: ChatMessage;
    response: RoomAssistantTurnDelivery;
  } | null,
): canonicalResponse is {
  message: ChatMessage;
  response: RoomAssistantTurnDelivery;
} {
  if (!canonicalResponse) {
    return false;
  }

  const transcriptAssistantTurnId = readAssistantTurnId(transcriptResponse.message);
  const canonicalAssistantTurnId = readAssistantTurnId(canonicalResponse.message);
  if (!transcriptAssistantTurnId || transcriptAssistantTurnId !== canonicalAssistantTurnId) {
    return false;
  }

  if (canonicalResponse.response.segmentCount > transcriptResponse.response.segmentCount) {
    return true;
  }

  const transcriptText = transcriptResponse.response.fullText.trim();
  const canonicalText = canonicalResponse.response.fullText.trim();
  return canonicalText.length > transcriptText.length && canonicalText.includes(transcriptText);
}

function buildCanonicalRuntimeResponseForTurn(
  channelId: string,
  turnId: string,
  core: CatsCoreState,
): {
  message: ChatMessage;
  response: RoomAssistantTurnDelivery;
} | null {
  const conversationId = buildChatConversationId(channelId);
  const relevantLanes = core.lanes.filter((lane) =>
    lane.conversationId === conversationId && lane.turnId === turnId);
  if (relevantLanes.length === 0) {
    return null;
  }

  const lanesById = new Map<string, LaneRecord>(
    relevantLanes.map((lane) => [lane.id, lane]),
  );
  const relevantSegments = core.segments.filter((segment) =>
    segment.conversationId === conversationId
    && segment.turnId === turnId
    && segment.kind === 'text'
    && segment.status === 'complete'
    && lanesById.has(segment.laneId),
  );
  if (relevantSegments.length === 0) {
    return null;
  }

  const terminalSegments = relevantSegments.filter((segment) =>
    segment.metadata?.terminal === true);
  const anchorSegment = (terminalSegments.length > 0 ? terminalSegments : relevantSegments)
    .sort(compareChatCoreSegmentsDescending)[0];
  if (!anchorSegment) {
    return null;
  }

  const lane = lanesById.get(anchorSegment.laneId);
  if (!lane) {
    return null;
  }

  const laneSegments = relevantSegments
    .filter((segment) => segment.laneId === lane.id)
    .sort(compareChatCoreSegmentsAscending);
  if (laneSegments.length === 0) {
    return null;
  }

  const anchorMetadata = anchorSegment.metadata as Record<string, unknown> | undefined;
  const laneMetadata = lane.metadata as Record<string, unknown> | undefined;
  const assistantTurnId = readChatCoreMetadataString(anchorMetadata, 'assistantTurnId')
    ?? readChatCoreMetadataString(laneMetadata, 'responseAssistantTurnId')
    ?? `assistant-turn-${turnId}`;
  const participantKind = readChatCoreMetadataString(laneMetadata, 'participantKind') === 'orchestrator'
    ? 'orchestrator'
    : 'cat';
  const targetId = participantKind === 'orchestrator'
    ? 'orchestrator'
    : resolveRawChatParticipantId(lane.participantId, conversationId);
  const anchorMessageId = readChatCoreMetadataString(anchorMetadata, 'chatMessageId');
  const canonicalMessage = anchorMessageId
    ? buildCanonicalChatMessage(core, channelId, anchorMessageId)
    : null;
  const fullText = laneSegments
    .map((segment) => segment.content ?? '')
    .join('');
  const senderName = readChatCoreMetadataString(laneMetadata, 'speakerLabel')
    ?? (participantKind === 'orchestrator' ? ORCHESTRATOR_NAME : 'Agent');

  return {
    message: canonicalMessage
      ? {
          ...canonicalMessage,
          metadata: {
            ...(canonicalMessage.metadata ?? {}),
            repairSource: 'canonical_segment_fallback',
          },
        }
      : {
          id: anchorMessageId
            ?? `canonical-segment-${assistantTurnId}-${anchorSegment.sequence}`,
          channelId,
          senderKind: participantKind === 'orchestrator' ? 'orchestrator' : 'agent',
          senderName,
          body: fullText,
          mentions: [],
          metadata: {
            event: 'assistant_turn_segment',
            assistantTurnId,
            targetStateId: readChatCoreMetadataString(anchorMetadata, 'targetStateId')
              ?? readChatCoreMetadataString(laneMetadata, 'targetStateId')
              ?? null,
            terminal: true,
            turnId,
            targetKind: participantKind,
            ...(targetId ? { targetId } : {}),
            ...(anchorSegment.sessionId ? { sessionId: anchorSegment.sessionId } : {}),
            ...(readChatCoreMetadataString(anchorMetadata, 'routingTrigger')
              ? { routingTrigger: readChatCoreMetadataString(anchorMetadata, 'routingTrigger') }
              : {}),
            ...(readChatCoreMetadataNumber(anchorMetadata, 'dispatchDepth') !== null
              ? { dispatchDepth: readChatCoreMetadataNumber(anchorMetadata, 'dispatchDepth') }
              : {}),
            repairSource: 'canonical_segment_fallback',
          },
          usage: null,
          executionProvider: readChatCoreMetadataString(anchorMetadata, 'executionProvider'),
          executionModel: readChatCoreMetadataString(anchorMetadata, 'executionModel'),
          executionInstance: readChatCoreMetadataString(anchorMetadata, 'executionInstance'),
          createdAt: anchorSegment.createdAt,
        },
    response: {
      assistantTurnId,
      messageIds: laneSegments.map((segment) =>
        readChatCoreMetadataString(
          segment.metadata as Record<string, unknown> | undefined,
          'chatMessageId',
        ) ?? segment.id),
      fullText,
      segmentCount: laneSegments.length,
    },
  };
}

function buildParticipantRefFromResponse(
  message: ChatMessage,
): RoomRoutingParticipantRef | null {
  const targetKind = message.metadata?.targetKind;
  const targetId = typeof message.metadata?.targetId === 'string'
    ? message.metadata.targetId.trim()
    : '';

  if (targetKind === 'orchestrator') {
    return {
      participantKind: 'orchestrator',
      participantId: targetId || 'orchestrator',
      participantName: message.senderName,
    };
  }

  if (targetKind === 'cat' && targetId) {
    return {
      participantKind: 'cat',
      participantId: targetId,
      participantName: message.senderName,
    };
  }

  if (message.senderKind === 'orchestrator') {
    return {
      participantKind: 'orchestrator',
      participantId: 'orchestrator',
      participantName: message.senderName,
    };
  }

  return targetId
    ? {
        participantKind: 'cat',
        participantId: targetId,
        participantName: message.senderName,
      }
    : null;
}

function doesTargetStatusMatchRecoveredResponse(
  target: RoomWorkflowTargetState,
  assistantTurnId: string,
  targetStateId: string | null,
): boolean {
  if (target.response?.assistantTurnId === assistantTurnId) {
    return true;
  }

  return targetStateId !== null && target.id === targetStateId;
}

function hasOutstandingTargetsBeyondRecoveredResponse(
  turn: RoomWorkflowTurn,
  assistantTurnId: string,
  targetStateId: string | null,
): boolean {
  return turn.targetStatuses.some((target) => {
    if (
      target.status !== 'pending'
      && target.status !== 'running'
      && target.status !== 'waiting_for_converge'
    ) {
      return false;
    }

    return !doesTargetStatusMatchRecoveredResponse(target, assistantTurnId, targetStateId);
  });
}

function resolveExpectedTurnTargetCount(turn: RoomWorkflowTurn): number {
  const turnStartedEvent = turn.events.find((event) => event.kind === 'turn_started') ?? null;
  if (turnStartedEvent) {
    return turnStartedEvent.targets.length;
  }

  return turn.targetStatuses.length;
}

function hasUnmaterializedSequentialTargets(turn: RoomWorkflowTurn): boolean {
  if (turn.workflowShape !== 'sequential') {
    return false;
  }

  const expectedTargetCount = resolveExpectedTurnTargetCount(turn);
  if (expectedTargetCount <= 1) {
    return false;
  }

  return turn.targetStatuses.length < expectedTargetCount;
}

interface CanonicalRecoveredTargetMetadata {
  orderIndex: number | null;
  sourceMessageId: string | null;
  sourceParticipant: RoomRoutingParticipantRef | null;
  trigger: RoomRoutingTrigger | null;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  handoffReason: RoomWorkflowHandoffReason | null;
}

function resolveCanonicalRecoveredTargetMetadata(
  core: CatsCoreState | undefined,
  channelId: string,
  turnId: string,
  assistantTurnId: string,
  targetStateId: string | null,
): CanonicalRecoveredTargetMetadata | null {
  if (!core) {
    return null;
  }

  const conversationId = buildChatConversationId(channelId);
  const lane = core.lanes.find((candidate) =>
    candidate.conversationId === conversationId
    && candidate.turnId === turnId
    && (
      (targetStateId !== null
        && readChatCoreMetadataString(candidate.metadata, 'targetStateId') === targetStateId)
      || readChatCoreMetadataString(candidate.metadata, 'responseAssistantTurnId') === assistantTurnId
    )) ?? null;
  if (!lane) {
    return null;
  }

  const sourceMessageId = readChatCoreMetadataString(lane.metadata, 'sourceMessageId');
  return {
    orderIndex: lane.orderIndex,
    sourceMessageId,
    sourceParticipant: resolveCanonicalSourceParticipant(core, conversationId, turnId, sourceMessageId),
    trigger: normalizeCanonicalRoutingTrigger(readChatCoreMetadataString(lane.metadata, 'trigger')),
    branchStrategy: normalizeCanonicalBranchStrategy(
      readChatCoreMetadataString(lane.metadata, 'branchStrategy'),
    ),
    handoffReason: normalizeCanonicalHandoffReason(
      readChatCoreMetadataString(lane.metadata, 'handoffReason'),
    ),
  };
}

function resolveCanonicalSourceParticipant(
  core: CatsCoreState,
  conversationId: string,
  turnId: string,
  sourceMessageId: string | null,
): RoomRoutingParticipantRef | null {
  if (!sourceMessageId) {
    return null;
  }

  const turn = core.turns.find((candidate) =>
    candidate.conversationId === conversationId && candidate.id === turnId) ?? null;
  if (turn && readChatCoreMetadataString(turn.metadata, 'sourceMessageId') === sourceMessageId) {
    const sourceSenderKind = readChatCoreMetadataString(turn.metadata, 'sourceSenderKind');
    const sourceSenderName = readChatCoreMetadataString(turn.metadata, 'sourceSenderName') ?? '';
    if (sourceSenderKind === 'orchestrator') {
      return {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: sourceSenderName || ORCHESTRATOR_NAME,
      };
    }
  }

  const sourceSegment = core.segments
    .filter((candidate) =>
      candidate.conversationId === conversationId
      && readChatCoreMetadataString(candidate.metadata, 'chatMessageId') === sourceMessageId)
    .sort(compareChatCoreSegmentsDescending)[0] ?? null;
  if (!sourceSegment) {
    return null;
  }

  const sourceLane = core.lanes.find((candidate) =>
    candidate.conversationId === conversationId && candidate.id === sourceSegment.laneId) ?? null;
  if (!sourceLane) {
    return null;
  }

  const participantKind = readChatCoreMetadataString(sourceLane.metadata, 'participantKind');
  const speakerLabel = readChatCoreMetadataString(sourceLane.metadata, 'speakerLabel');
  if (participantKind === 'orchestrator') {
    return {
      participantKind: 'orchestrator',
      participantId: 'orchestrator',
      participantName: speakerLabel ?? ORCHESTRATOR_NAME,
    };
  }

  const participantId = resolveRawChatParticipantId(sourceLane.participantId, conversationId);
  if (!participantId) {
    return null;
  }

  return {
    participantKind: 'cat',
    participantId,
    participantName: speakerLabel ?? participantId,
  };
}

function normalizeCanonicalRoutingTrigger(
  value: string | null,
): RoomRoutingTrigger | null {
  switch (value) {
    case 'room_default':
    case 'explicit_mention':
    case 'continuation_mention':
      return value;
    default:
      return null;
  }
}

function normalizeCanonicalBranchStrategy(
  value: string | null,
): RoomWorkflowBranchStrategy | null {
  switch (value) {
    case 'fresh_no_parent':
    case 'transplant_context':
      return value;
    default:
      return null;
  }
}

function normalizeCanonicalHandoffReason(
  value: string | null,
): RoomWorkflowHandoffReason | null {
  switch (value) {
    case 'room_entry':
    case 'room_default':
      return value;
    case 'explicit_mention':
      return value;
    case 'workflow_continuation':
      return value;
    case 'choice_response':
      return 'workflow_continuation';
    case 'operator_reroute':
      return value;
    case 'runtime_retry':
      return value;
    default:
      return null;
  }
}

function hasOutstandingSequentialTargetsAfterRecoveredLane(
  turn: RoomWorkflowTurn,
  recoveredParticipant: RoomRoutingParticipantRef | null,
  recoveredTargetOrderIndex: number | null,
): boolean {
  if (turn.workflowShape !== 'sequential') {
    return false;
  }

  const continuationTargets = readLatestSequentialContinuationTargets(turn);
  if (continuationTargets.length > 0 && recoveredParticipant) {
    const recoveredContinuationIndex = continuationTargets.findIndex((target) =>
      sameParticipantRef(target, recoveredParticipant));
    if (
      recoveredContinuationIndex !== -1
      && recoveredContinuationIndex < continuationTargets.length - 1
    ) {
      return true;
    }
  }

  const expectedTargetCount = resolveExpectedTurnTargetCount(turn);
  if (expectedTargetCount <= 1) {
    return false;
  }
  if (recoveredTargetOrderIndex === null) {
    return turn.targetStatuses.length < expectedTargetCount;
  }

  return recoveredTargetOrderIndex < expectedTargetCount - 1;
}

function readLatestSequentialContinuationTargets(
  turn: RoomWorkflowTurn,
): RoomRoutingParticipantRef[] {
  return readLatestWorkflowContinuationContext(turn)?.targets ?? [];
}

const ACTIVE_CANONICAL_LANE_STATUSES = new Set([
  'pending',
  'waiting',
  'connecting',
  'running',
  'streaming',
]);

function doesCanonicalLaneMatchRecoveredResponse(
  lane: LaneRecord,
  assistantTurnId: string,
  targetStateId: string | null,
): boolean {
  return (targetStateId !== null
    && readChatCoreMetadataString(lane.metadata, 'targetStateId') === targetStateId)
    || readChatCoreMetadataString(lane.metadata, 'responseAssistantTurnId') === assistantTurnId;
}

function hasOutstandingCanonicalLanesBeyondRecoveredResponse(
  core: CatsCoreState | undefined,
  channelId: string,
  turnId: string,
  assistantTurnId: string,
  targetStateId: string | null,
): boolean {
  if (!core) {
    return false;
  }

  const conversationId = buildChatConversationId(channelId);
  const relevantLanes = core.lanes.filter((lane) =>
    lane.conversationId === conversationId && lane.turnId === turnId);

  return relevantLanes.some((lane) =>
    ACTIVE_CANONICAL_LANE_STATUSES.has(lane.status)
    && !doesCanonicalLaneMatchRecoveredResponse(lane, assistantTurnId, targetStateId));
}

function resolveDefaultTargetReason(
  channel: ChatChannelState,
  participant: RoomRoutingParticipantRef | null,
): RoomRouteDefaultTargetReason | null {
  if (!participant) {
    return null;
  }

  if (participant.participantKind === 'orchestrator') {
    return 'boss_chat_default';
  }

  return channel.roomRouting?.mode === 'direct_cat_chat'
    ? 'direct_chat_recipient'
    : 'boss_chat_default';
}

function createFallbackOutcome(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  participant: RoomRoutingParticipantRef | null,
): RoomRoutingOutcome {
  return {
    turnId: turn.id,
    mode: channel.roomRouting?.mode ?? 'boss_chat',
    sourceMessageId: turn.sourceMessageId,
    sourceSenderKind: turn.sourceSenderKind,
    sourceSenderName: turn.sourceSenderName,
    status: 'running',
    resolution: {
      routingMode: 'room_default',
      selectionKind: participant ? 'default_target' : 'blocked',
      defaultTarget: participant ? structuredClone(participant) : null,
      defaultTargetReason: resolveDefaultTargetReason(channel, participant),
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: participant ? [structuredClone(participant)] : [],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: turn.continuationCount,
    totalDispatchCount: turn.dispatchCount,
    guard: null,
    startedAt: turn.startedAt,
    completedAt: null,
  };
}

function ensureCompletedTargetStatus(
  turn: RoomWorkflowTurn,
  participant: RoomRoutingParticipantRef | null,
  responseMessage: ChatMessage,
  response: NonNullable<RoomWorkflowTargetState['response']>,
  targetStateId: string | null,
  recoveredMetadata?: CanonicalRecoveredTargetMetadata | null,
): RoomWorkflowTargetState | null {
  if (!participant) {
    return null;
  }

  const completedAt = responseMessage.createdAt;
  const existing = (targetStateId
    ? turn.targetStatuses.find((target) => target.id === targetStateId)
    : null)
    ?? turn.targetStatuses.find((target) =>
      target.response?.assistantTurnId === response.assistantTurnId)
    ?? turn.targetStatuses.find((target) =>
      target.status === 'running' || target.status === 'pending');

  if (existing) {
    existing.participant = structuredClone(participant);
    if (recoveredMetadata?.sourceParticipant) {
      existing.source = structuredClone(recoveredMetadata.sourceParticipant);
    }
    if (recoveredMetadata?.sourceMessageId) {
      existing.sourceMessageId = recoveredMetadata.sourceMessageId;
    }
    existing.status = 'completed';
    existing.completedAt = existing.completedAt ?? completedAt;
    existing.response = structuredClone(response);
    existing.error = null;
    existing.dispatchId = existing.dispatchId ?? randomUUID();
    existing.trigger = existing.trigger
      ?? recoveredMetadata?.trigger
      ?? 'room_default';
    existing.handoffReason = existing.handoffReason
      ?? recoveredMetadata?.handoffReason
      ?? 'room_default';
    existing.branchStrategy = existing.branchStrategy
      ?? recoveredMetadata?.branchStrategy
      ?? 'fresh_no_parent';
    existing.startedAt = existing.startedAt ?? existing.queuedAt;
    return existing;
  }

  const targetStatus: RoomWorkflowTargetState = {
    id: targetStateId ?? randomUUID(),
    dispatchId: randomUUID(),
    participant: structuredClone(participant),
    source: recoveredMetadata?.sourceParticipant
      ? structuredClone(recoveredMetadata.sourceParticipant)
      : null,
    sourceMessageId: recoveredMetadata?.sourceMessageId ?? turn.sourceMessageId,
    trigger: recoveredMetadata?.trigger ?? 'room_default',
    mentionNames: [],
    depth: 0,
    parentCheckpointId: turn.lastCheckpointId,
    branchStrategy: recoveredMetadata?.branchStrategy ?? 'fresh_no_parent',
    handoffReason: recoveredMetadata?.handoffReason ?? 'room_default',
    wakeRequestId: null,
    status: 'completed',
    queuedAt: turn.startedAt,
    startedAt: turn.startedAt,
    completedAt,
    response: structuredClone(response),
    error: null,
  };
  turn.targetStatuses.push(targetStatus);
  return targetStatus;
}

function ensureCompletedDispatch(
  outcome: RoomRoutingOutcome,
  participant: RoomRoutingParticipantRef | null,
  responseMessage: ChatMessage,
  response: NonNullable<RoomRoutingDispatch['response']>,
  targetStatus: RoomWorkflowTargetState | null,
): RoomRoutingDispatch | null {
  if (!participant) {
    return null;
  }

  const completedAt = responseMessage.createdAt;
  const existing = (targetStatus
    ? outcome.dispatches.find((dispatch) => dispatch.id === targetStatus.dispatchId)
    : null)
    ?? outcome.dispatches.find((dispatch) =>
    dispatch.response?.assistantTurnId === response.assistantTurnId)
    ?? outcome.dispatches.find((dispatch) =>
      dispatch.target.participantKind === participant.participantKind
      && dispatch.target.participantId === participant.participantId)
    ?? outcome.dispatches.find((dispatch) =>
      dispatch.status === 'running' || dispatch.status === 'pending');

  if (existing) {
    if (targetStatus?.source) {
      existing.source = structuredClone(targetStatus.source);
    }
    if (targetStatus?.sourceMessageId) {
      existing.sourceMessageId = targetStatus.sourceMessageId;
    }
    if (targetStatus?.trigger) {
      existing.trigger = targetStatus.trigger;
    }
    existing.target = structuredClone(participant);
    existing.status = 'completed';
    existing.completedAt = existing.completedAt ?? completedAt;
    existing.response = structuredClone(response);
    existing.error = null;
    return existing;
  }

  const dispatch: RoomRoutingDispatch = {
    id: targetStatus?.dispatchId ?? randomUUID(),
    sourceMessageId: targetStatus?.sourceMessageId ?? outcome.sourceMessageId,
    source: targetStatus?.source ? structuredClone(targetStatus.source) : null,
    target: structuredClone(participant),
    trigger: targetStatus?.trigger ?? 'room_default',
    status: 'completed',
    mentionNames: [],
    response: structuredClone(response),
    startedAt: targetStatus?.startedAt ?? outcome.startedAt,
    completedAt,
    error: null,
  };
  outcome.dispatches.push(dispatch);
  return dispatch;
}

function ensureResolvedTarget(
  outcome: RoomRoutingOutcome,
  participant: RoomRoutingParticipantRef | null,
): void {
  if (!participant) {
    return;
  }

  if (!outcome.resolvedTargets.some((target) =>
    target.participantKind === participant.participantKind
    && target.participantId === participant.participantId)) {
    outcome.resolvedTargets.push(structuredClone(participant));
  }

  if (!outcome.resolution.defaultTarget) {
    outcome.resolution.defaultTarget = structuredClone(participant);
    outcome.resolution.defaultTargetReason = outcome.resolution.defaultTargetReason ?? 'boss_chat_default';
  }
  if (outcome.resolution.selectionKind === 'blocked') {
    outcome.resolution.selectionKind = 'default_target';
    outcome.resolution.blockedReason = null;
    outcome.resolution.note = null;
  }
}

function readEventResponseAssistantTurnId(event: RoomWorkflowTurn['events'][number]): string | null {
  const rawResponse = event.metadata?.response;
  if (!rawResponse || typeof rawResponse !== 'object' || Array.isArray(rawResponse)) {
    return null;
  }
  const response = rawResponse as Record<string, unknown>;

  return typeof response.assistantTurnId === 'string' && response.assistantTurnId.trim().length > 0
    ? response.assistantTurnId.trim()
    : null;
}

function appendRecoveredTargetCompletedEvent(
  turn: RoomWorkflowTurn,
  dispatch: RoomRoutingDispatch | null,
  participant: RoomRoutingParticipantRef | null,
  responseMessage: ChatMessage,
  response: NonNullable<RoomRoutingDispatch['response']>,
  workflow: ReturnType<typeof resolveRoomWorkflowState>,
): void {
  if (!dispatch || !participant) {
    return;
  }

  if (turn.events.some((event) =>
    event.kind === 'target_completed'
    && readEventResponseAssistantTurnId(event) === response.assistantTurnId)) {
    return;
  }

  appendWorkflowEvent(
    workflow,
    turn,
    createWorkflowEvent(
      turn.id,
      'target_completed',
      'completed',
      `${participant.participantName} completed this room dispatch.`,
      responseMessage.createdAt,
      null,
      turn.sourceMessageId,
      [structuredClone(participant)],
      {
        dispatchId: dispatch.id,
        metadata: {
          response,
          recoveryPhase: 'orphaned_completed_turn_repair',
        },
      },
    ),
  );
}

function hasRecoveredResponseMessage(
  channel: ChatChannelState,
  responseMessage: ChatMessage,
): boolean {
  const assistantTurnId = readAssistantTurnId(responseMessage);
  if (!assistantTurnId) {
    return channel.messages.some((message) => message.id === responseMessage.id);
  }

  const matchingMessages = channel.messages.filter((message) =>
    readAssistantTurnId(message) === assistantTurnId);
  if (matchingMessages.length === 0) {
    return false;
  }

  if (matchingMessages.length > 1) {
    return true;
  }

  return !canUpgradeRecoveredResponseMessage(matchingMessages[0] ?? null, responseMessage);
}

function canUpgradeRecoveredResponseMessage(
  existingMessage: ChatMessage | null,
  recoveredMessage: ChatMessage,
): boolean {
  if (!existingMessage || !isAssistantTurnSegmentMessage(existingMessage)) {
    return false;
  }

  const existingAssistantTurnId = readAssistantTurnId(existingMessage);
  const recoveredAssistantTurnId = readAssistantTurnId(recoveredMessage);
  if (!existingAssistantTurnId || existingAssistantTurnId !== recoveredAssistantTurnId) {
    return false;
  }

  const existingText = existingMessage.body.trim();
  const recoveredText = recoveredMessage.body.trim();
  return recoveredText.length > existingText.length && recoveredText.includes(existingText);
}

function insertRecoveredResponseMessage(
  channel: ChatChannelState,
  responseMessage: ChatMessage,
): boolean {
  const assistantTurnId = readAssistantTurnId(responseMessage);
  if (assistantTurnId) {
    const matchingIndices = channel.messages.flatMap((message, index) =>
      readAssistantTurnId(message) === assistantTurnId ? [index] : []);
    if (matchingIndices.length === 1) {
      const existingIndex = matchingIndices[0] ?? -1;
      const existingMessage = existingIndex >= 0
        ? channel.messages[existingIndex] ?? null
        : null;
      if (existingIndex >= 0 && canUpgradeRecoveredResponseMessage(existingMessage, responseMessage)) {
        channel.messages[existingIndex] = {
          ...structuredClone(responseMessage),
          id: existingMessage?.id ?? responseMessage.id,
          createdAt: existingMessage?.createdAt ?? responseMessage.createdAt,
        };
        channel.lastMessageAt = channel.messages[channel.messages.length - 1]?.createdAt ?? channel.lastMessageAt;
        return true;
      }
    }
  }

  if (hasRecoveredResponseMessage(channel, responseMessage)) {
    return false;
  }

  const insertIndex = channel.messages.findIndex((message) =>
    message.createdAt.localeCompare(responseMessage.createdAt) > 0);
  const nextIndex = insertIndex >= 0 ? insertIndex : channel.messages.length;
  channel.messages.splice(nextIndex, 0, structuredClone(responseMessage));
  channel.lastMessageAt = channel.messages[channel.messages.length - 1]?.createdAt ?? channel.lastMessageAt;
  return true;
}

function isStartupRecoveredBlockedTurn(turn: RoomWorkflowTurn): boolean {
  return turn.status === 'blocked'
    && turn.stageId === 'startup_recovery'
    && turn.events.some((event) => event.metadata?.recoverySource === 'server_restart');
}

function readStartupRecoveryInterruptMessage(turn: RoomWorkflowTurn): string {
  const targetError = turn.targetStatuses.find((target) =>
    typeof target.error === 'string' && target.error.trim().length > 0)?.error?.trim();
  if (targetError) {
    return `Previous room turn was interrupted because ${targetError.replace(/\.$/u, '')}.`;
  }

  const eventError = turn.events.find((event) =>
    typeof event.metadata?.interruptedError === 'string'
    && event.metadata.interruptedError.trim().length > 0)?.metadata?.interruptedError;
  if (typeof eventError === 'string' && eventError.trim().length > 0) {
    return `Previous room turn was interrupted because ${eventError.trim().replace(/\.$/u, '')}.`;
  }

  return 'Previous room turn was interrupted because Cats server restarted before room workflow cleanup completed.';
}

function resolveStartupRecoverySourceBoundaryCreatedAt(
  turn: RoomWorkflowTurn,
  options: {
    core?: CatsCoreState;
    channelId: string;
  },
): string {
  const canonicalSourceMessage = options.core
    ? buildCanonicalChatMessage(options.core, options.channelId, turn.sourceMessageId)
    : null;
  if (
    canonicalSourceMessage?.createdAt
    && (
      canonicalSourceMessage.senderKind === 'user'
      || canonicalSourceMessage.metadata?.event === 'assistant_turn_segment'
    )
  ) {
    return canonicalSourceMessage.createdAt;
  }

  const targetBoundary = turn.targetStatuses
    .filter((target) => target.sourceMessageId === turn.sourceMessageId)
    .flatMap((target) => [target.queuedAt, target.startedAt, target.completedAt ?? null])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
  if (targetBoundary) {
    return targetBoundary;
  }

  const eventBoundary = turn.events
    .filter((event) => event.sourceMessageId === turn.sourceMessageId)
    .map((event) => event.createdAt)
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
  if (eventBoundary) {
    return eventBoundary;
  }

  return options.core?.turns.find((candidate) =>
    candidate.id === turn.id
    && candidate.conversationId === buildChatConversationId(options.channelId))?.createdAt
    ?? turn.startedAt;
}

function readMessageSessionId(message: ChatMessage): string | null {
  return typeof message.metadata?.sessionId === 'string' && message.metadata.sessionId.trim().length > 0
    ? message.metadata.sessionId.trim()
    : null;
}

function resolveCanonicalSessionRecord(
  core: CatsCoreState | undefined,
  channelId: string,
  sessionId: string | null,
) {
  if (!core || !sessionId) {
    return null;
  }

  const conversationId = buildChatConversationId(channelId);
  return core.sessions.find((session) =>
    session.id === sessionId && session.conversationId === conversationId) ?? null;
}

function resolveMissingSessionParticipantName(
  channel: ChatChannelState,
  responseMessage: ChatMessage,
  core?: CatsCoreState,
): string {
  const targetKind = responseMessage.metadata?.targetKind;
  const targetId = typeof responseMessage.metadata?.targetId === 'string'
    ? responseMessage.metadata.targetId.trim()
    : '';
  const executionLabelSnapshot = typeof responseMessage.metadata?.executionLabelSnapshot === 'string'
    && responseMessage.metadata.executionLabelSnapshot.trim().length > 0
    ? responseMessage.metadata.executionLabelSnapshot.trim()
    : null;

  if (targetKind === 'orchestrator') {
    return resolveVisibleOrchestratorLabel({
      displayName: responseMessage.senderName,
      executionLabel: executionLabelSnapshot,
      provider: responseMessage.executionProvider,
      instance: responseMessage.executionInstance,
    }) ?? ORCHESTRATOR_NAME;
  }

  if (targetId) {
    const assignment = (channel.participantAssignments ?? []).find((candidate) =>
      candidate.participantId === targetId)
      ?? channel.catAssignments.find((candidate) =>
        candidate.participantId === targetId || candidate.catId === targetId);
    if (assignment?.name?.trim()) {
      return assignment.name;
    }
  }

  const canonicalSession = resolveCanonicalSessionRecord(core, channel.id, readMessageSessionId(responseMessage));
  if (canonicalSession?.laneId) {
    const canonicalLane = core?.lanes.find((lane) =>
      lane.id === canonicalSession.laneId && lane.conversationId === canonicalSession.conversationId) ?? null;
    const canonicalSpeakerLabel = readChatCoreMetadataString(canonicalLane?.metadata, 'speakerLabel');
    if (canonicalSpeakerLabel) {
      return canonicalSpeakerLabel;
    }
  }

  return responseMessage.senderName;
}

function resolveMissingSessionTargetId(
  responseMessage: ChatMessage,
  channelId: string,
  core?: CatsCoreState,
): string | null {
  const targetId = typeof responseMessage.metadata?.targetId === 'string'
    && responseMessage.metadata.targetId.trim().length > 0
    ? responseMessage.metadata.targetId.trim()
    : null;
  if (targetId) {
    return targetId;
  }
  if (responseMessage.metadata?.targetKind !== 'cat') {
    return targetId;
  }

  const canonicalSession = resolveCanonicalSessionRecord(
    core,
    channelId,
    readMessageSessionId(responseMessage),
  );
  return resolveRawChatParticipantId(
    canonicalSession?.participantId ?? null,
    buildChatConversationId(channelId),
  );
}

function resolveMissingSessionCwd(
  channel: ChatChannelState,
  responseMessage: ChatMessage,
  core?: CatsCoreState,
  runtimeDataDir?: string | null,
): string | null {
  const sessionId = readMessageSessionId(responseMessage);
  if (!sessionId) {
    return null;
  }

  const targetId = typeof responseMessage.metadata?.targetId === 'string'
    ? responseMessage.metadata.targetId.trim()
    : '';

  if (runtimeDataDir?.trim()) {
    const sessionPath = path.join(path.resolve(runtimeDataDir), 'sessions', sessionId);
    if (existsSync(sessionPath)) {
      return sessionPath;
    }
  }

  if (channel.orchestratorLease.sessionId === sessionId && channel.orchestratorLease.cwd) {
    return channel.orchestratorLease.cwd;
  }

  if (targetId) {
    const assignment = (channel.participantAssignments ?? []).find((candidate) =>
      candidate.participantId === targetId)
      ?? channel.catAssignments.find((candidate) =>
        candidate.participantId === targetId || candidate.catId === targetId);
    if (assignment?.execution.lease.sessionId === sessionId && assignment.execution.lease.cwd) {
      return assignment.execution.lease.cwd;
    }
  }

  const canonicalSession = resolveCanonicalSessionRecord(core, channel.id, sessionId);
  const canonicalCwd = readChatCoreMetadataString(canonicalSession?.metadata, 'leaseCwd');
  if (canonicalCwd) {
    return canonicalCwd;
  }

  return channel.chatCwd;
}

export function repairMissingSessionStartedMessages(
  state: ChatState,
  channelId: string,
  options: {
    core?: CatsCoreState;
    runtimeDataDir?: string | null;
    now?: Date;
  } = {},
): {
  repaired: boolean;
  state: ChatState;
} {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return { repaired: false, state };
  }

  const existingSessionStartedIds = new Set(
    channel.messages
      .filter((message) => message.metadata?.event === 'session_started')
      .map((message) => readMessageSessionId(message))
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );
  const missingResponses = channel.messages.filter((message) => {
    const sessionId = readMessageSessionId(message);
    return isAssistantTurnSegmentMessage(message)
      && Boolean(sessionId)
      && !existingSessionStartedIds.has(sessionId!);
  });

  if (missingResponses.length === 0) {
    return { repaired: false, state };
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nowIso = (options.now ?? new Date()).toISOString();
  let repaired = false;

  for (const responseMessage of missingResponses) {
    const sessionId = readMessageSessionId(responseMessage);
    if (!sessionId || existingSessionStartedIds.has(sessionId)) {
      continue;
    }

    const responseIndex = nextChannel.messages.findIndex((candidate) =>
      candidate.id === responseMessage.id);
    if (responseIndex < 0) {
      continue;
    }

    const cwd = resolveMissingSessionCwd(
      nextChannel,
      responseMessage,
      options.core,
      options.runtimeDataDir,
    );
    const participantName = resolveMissingSessionParticipantName(
      nextChannel,
      responseMessage,
      options.core,
    );
    const targetKind = responseMessage.metadata?.targetKind === 'cat' ? 'cat' : 'orchestrator';
    const targetId = resolveMissingSessionTargetId(
      responseMessage,
      channelId,
      options.core,
    ) ?? undefined;

    nextChannel.messages.splice(responseIndex, 0, {
      id: randomUUID(),
      channelId,
      senderKind: 'system',
      senderName: 'Runtime',
      body: formatSessionStartedMessage(participantName, { id: sessionId, cwd }),
      mentions: [],
      metadata: {
        event: 'session_started',
        targetKind,
        ...(targetId ? { targetId } : {}),
        sessionId,
        verbosity: 'verbose',
        repairSource: 'missing_session_started_message',
      },
      usage: null,
      executionProvider: null,
      executionModel: null,
      executionInstance: null,
      createdAt: responseMessage.createdAt,
    });
    existingSessionStartedIds.add(sessionId);
    if (!nextChannel.chatCwd && cwd) {
      nextChannel.chatCwd = cwd;
    }
    repaired = true;
  }

  if (repaired) {
    nextChannel.updatedAt = nowIso;
  }

  return repaired ? { repaired: true, state: nextState } : { repaired: false, state };
}

export function repairMissingStartupRecoveryNotice(
  state: ChatState,
  channelId: string,
  options: {
    now?: Date;
    core?: CatsCoreState;
  } = {},
): {
  repaired: boolean;
  state: ChatState;
} {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel?.roomRouting?.workflow?.turnHistory?.length) {
    return { repaired: false, state };
  }

  const blockedTurns = channel.roomRouting.workflow.turnHistory.filter(isStartupRecoveredBlockedTurn);
  if (blockedTurns.length === 0) {
    return { repaired: false, state };
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nowIso = (options.now ?? new Date()).toISOString();
  let repaired = false;

  for (const turn of nextChannel.roomRouting?.workflow?.turnHistory ?? []) {
    if (!isStartupRecoveredBlockedTurn(turn)) {
      continue;
    }

    const sourceMessageIndex = nextChannel.messages.findIndex((message) =>
      message.id === turn.sourceMessageId);
    const sourceBoundaryCreatedAt = sourceMessageIndex >= 0
      ? nextChannel.messages[sourceMessageIndex]!.createdAt
      : resolveStartupRecoverySourceBoundaryCreatedAt(turn, {
        core: options.core,
        channelId,
      });
    const isAfterSourceBoundary = (message: ChatMessage, index: number): boolean => (
      sourceMessageIndex >= 0
        ? index > sourceMessageIndex
        : message.createdAt.localeCompare(sourceBoundaryCreatedAt) > 0
    );

    const nextUserMessageIndex = nextChannel.messages.findIndex((message, index) =>
      isAfterSourceBoundary(message, index) && message.senderKind === 'user');
    const noticeAlreadyExists = nextChannel.messages.some((message, index) =>
      isAfterSourceBoundary(message, index)
      && (nextUserMessageIndex < 0 || index < nextUserMessageIndex)
      && message.metadata?.event === 'workflow_interrupted'
      && message.metadata?.turnId === turn.id);
    if (noticeAlreadyExists) {
      continue;
    }

    const createdAt = turn.completedAt ?? turn.updatedAt ?? turn.startedAt;
    const insertIndex = nextUserMessageIndex >= 0 ? nextUserMessageIndex : nextChannel.messages.length;
    nextChannel.messages.splice(insertIndex, 0, {
      id: randomUUID(),
      channelId,
      senderKind: 'system',
      senderName: 'Chat',
      body: readStartupRecoveryInterruptMessage(turn),
      mentions: [],
      metadata: {
        event: 'workflow_interrupted',
        blockedReason: 'startup_recovery',
        turnId: turn.id,
        repairSource: 'missing_startup_recovery_notice',
        recoverySource: 'server_restart',
      },
      usage: null,
      executionProvider: null,
      executionModel: null,
      executionInstance: null,
      createdAt,
    });
    repaired = true;
  }

  if (repaired) {
    nextChannel.updatedAt = nowIso;
  }

  return repaired ? { repaired: true, state: nextState } : { repaired: false, state };
}

export function repairOrphanedCompletedDispatchTurn(
  state: ChatState,
  channelId: string,
  now: Date = new Date(),
  core?: CatsCoreState,
): {
  repaired: boolean;
  state: ChatState;
} {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return { repaired: false, state };
  }

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = workflow.activeTurn?.status === 'running'
    ? workflow.activeTurn
    : null;
  const recoveredTurn = !activeTurn
    && roomRouting.lastOutcome?.status === 'blocked'
    ? workflow.turnHistory.find((candidate) =>
      candidate.id === roomRouting.lastOutcome?.turnId
      && isStartupRecoveredBlockedTurn(candidate))
    : null;
  const repairTurnId = activeTurn?.id ?? recoveredTurn?.id ?? null;
  if (!repairTurnId) {
    return { repaired: false, state };
  }

  const recoveredResponse = readRuntimeResponseForTurn(channel, channelId, repairTurnId, core);
  if (!recoveredResponse) {
    return { repaired: false, state };
  }
  const { message: responseMessage, response } = recoveredResponse;
  const assistantTurnId = readAssistantTurnId(responseMessage);
  if (!assistantTurnId) {
    return { repaired: false, state };
  }
  const targetStateId = readAssistantTurnTargetStateId(responseMessage);
  const participant = buildParticipantRefFromResponse(responseMessage);
  const canonicalRecoveredTarget = resolveCanonicalRecoveredTargetMetadata(
    core,
    channelId,
    repairTurnId,
    assistantTurnId,
    targetStateId,
  );
  const candidateTurn = activeTurn ?? recoveredTurn;
  if (
    candidateTurn
    && (
      hasOutstandingTargetsBeyondRecoveredResponse(candidateTurn, assistantTurnId, targetStateId)
      || hasOutstandingCanonicalLanesBeyondRecoveredResponse(
        core,
        channelId,
        repairTurnId,
        assistantTurnId,
        targetStateId,
      )
      || hasOutstandingSequentialTargetsAfterRecoveredLane(
        candidateTurn,
        participant,
        canonicalRecoveredTarget?.orderIndex ?? null,
      )
    )
  ) {
    return { repaired: false, state };
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nextRoomRouting = resolveRoomRoutingState(nextChannel.roomRouting);
  const nextWorkflow = resolveRoomWorkflowState(nextRoomRouting.workflow);
  let nextActiveTurn = nextWorkflow.activeTurn?.status === 'running'
    ? nextWorkflow.activeTurn
    : null;
  if (!nextActiveTurn) {
    const recoveredTurnIndex = nextWorkflow.turnHistory.findIndex((candidate) =>
      candidate.id === repairTurnId && isStartupRecoveredBlockedTurn(candidate));
    if (recoveredTurnIndex >= 0) {
      const [recoveredCandidate] = nextWorkflow.turnHistory.splice(recoveredTurnIndex, 1);
      nextWorkflow.activeTurn = recoveredCandidate ?? null;
      nextActiveTurn = recoveredCandidate ?? null;
    }
  }
  if (!nextActiveTurn) {
    return { repaired: false, state: nextState };
  }

  const targetStatus = ensureCompletedTargetStatus(
    nextActiveTurn,
    participant,
    responseMessage,
    response,
    targetStateId,
    canonicalRecoveredTarget,
  );
  const outcome = nextRoomRouting.lastOutcome?.turnId === nextActiveTurn.id
    ? structuredClone(nextRoomRouting.lastOutcome)
    : createFallbackOutcome(nextChannel, nextActiveTurn, participant);
  const dispatch = ensureCompletedDispatch(
    outcome,
    participant,
    responseMessage,
    response,
    targetStatus,
  );
  ensureResolvedTarget(outcome, participant);
  outcome.totalDispatchCount = Math.max(
    outcome.totalDispatchCount,
    outcome.dispatches.filter((candidate) => candidate.status === 'completed').length,
    dispatch ? 1 : 0,
  );
  outcome.completedAt = null;
  appendRecoveredTargetCompletedEvent(
    nextActiveTurn,
    dispatch,
    participant,
    responseMessage,
    response,
    nextWorkflow,
  );
  const insertedRecoveredResponse = insertRecoveredResponseMessage(nextChannel, responseMessage);
  if (insertedRecoveredResponse) {
    nextChannel.updatedAt = now.toISOString();
  }

  return {
    repaired: true,
    state: finalizeDispatchTurn(nextState, channelId, now, {
      nowIso: now.toISOString(),
      baseRoomRouting: nextRoomRouting,
      workflow: nextWorkflow,
      activeTurn: nextActiveTurn,
      outcome,
      latestCheckpoint: nextRoomRouting.lastCheckpoint,
      guardReason: null,
      userMessageId: nextActiveTurn.sourceMessageId,
      describeGuardReason,
    }),
  };
}
