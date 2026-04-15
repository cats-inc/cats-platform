import {
  createCatActorId,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
} from '../../../../core/actors.js';
import {
  upsertCoreLane,
  upsertCoreSegment,
  upsertCoreSession,
  upsertCoreTurn,
} from '../../../../core/model/index.js';
import type {
  CatsCoreState,
  LaneRecordStatus,
  SessionRecordStatus,
  TurnRecord,
  TurnRecordStatus,
} from '../../../../core/types.js';
import type {
  ChannelParticipantAssignment,
  ChatChannelState,
  ChatMessage,
  ChatState,
  ParticipantExecutionLease,
} from '../../api/contracts.js';
import type {
  RoomRoutingParticipantRef,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import {
  ASSISTANT_TURN_SEGMENT_EVENT,
  buildAssistantTurnSourceMessage,
} from '../assistantTurnSegments.js';
import { requireChannel } from '../model/index.js';
import {
  buildChatAssignedParticipantId,
  buildChatConversationId,
  buildChatLaneId,
  buildChatOwnerParticipantId,
  buildChatOrchestratorParticipantId,
  buildDirectLaneTransportBindingId,
} from '../../../../shared/chatCoreIds.js';
import {
  resolveExecutionLeaseSnapshot,
} from '../../shared/channelParticipants.js';

function isChatConversationId(conversationId: string | null | undefined): boolean {
  return typeof conversationId === 'string' && conversationId.startsWith('conversation-channel-');
}

function appendMissingById<T extends { id: string }>(
  existing: T[],
  additions: ReadonlyArray<T>,
): T[] {
  if (additions.length === 0) {
    return existing;
  }

  const seenIds = new Set(existing.map((record) => record.id));
  const next = [...existing];
  for (const addition of additions) {
    if (seenIds.has(addition.id)) {
      continue;
    }
    seenIds.add(addition.id);
    next.push(structuredClone(addition));
  }
  return next;
}

export function preserveCoreOwnedTurns(
  existingTurns: CatsCoreState['turns'],
): CatsCoreState['turns'] {
  return existingTurns
    .filter((turn) => !isChatConversationId(turn.conversationId))
    .map((turn) => structuredClone(turn));
}

export function preserveCoreOwnedLanes(
  existingLanes: CatsCoreState['lanes'],
): CatsCoreState['lanes'] {
  return existingLanes
    .filter((lane) => !isChatConversationId(lane.conversationId))
    .map((lane) => structuredClone(lane));
}

export function preserveCoreOwnedSegments(
  existingSegments: CatsCoreState['segments'],
): CatsCoreState['segments'] {
  return existingSegments
    .filter((segment) => !isChatConversationId(segment.conversationId))
    .map((segment) => structuredClone(segment));
}

export function preserveCoreOwnedSessions(
  existingSessions: CatsCoreState['sessions'],
): CatsCoreState['sessions'] {
  return existingSessions
    .filter((session) => !isChatConversationId(session.conversationId))
    .map((session) => structuredClone(session));
}

function collectDurableChatTurnIds(
  core: CatsCoreState,
): Set<string> {
  return new Set(
    core.turns
      .filter((turn) =>
        isChatConversationId(turn.conversationId)
        && (turn.status === 'completed' || turn.status === 'failed'))
      .map((turn) => turn.id),
  );
}

function preserveDurableChatTurns(
  existingTurns: CatsCoreState['turns'],
  durableTurnIds: ReadonlySet<string>,
): CatsCoreState['turns'] {
  return existingTurns
    .filter((turn) => durableTurnIds.has(turn.id))
    .map((turn) => structuredClone(turn));
}

function preserveDurableChatLanes(
  existingLanes: CatsCoreState['lanes'],
  durableTurnIds: ReadonlySet<string>,
): CatsCoreState['lanes'] {
  return existingLanes
    .filter((lane) => durableTurnIds.has(lane.turnId))
    .map((lane) => structuredClone(lane));
}

function preserveDurableChatSegments(
  existingSegments: CatsCoreState['segments'],
  durableTurnIds: ReadonlySet<string>,
): CatsCoreState['segments'] {
  return existingSegments
    .filter((segment) => durableTurnIds.has(segment.turnId))
    .map((segment) => structuredClone(segment));
}

function preserveDurableChatSessions(
  existingSessions: CatsCoreState['sessions'],
  durableTurnIds: ReadonlySet<string>,
): CatsCoreState['sessions'] {
  return existingSessions
    .filter((session) => session.turnId !== null && durableTurnIds.has(session.turnId))
    .map((session) => structuredClone(session));
}

function readMessageMetadataString(message: ChatMessage, key: string): string | null {
  const value = message.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readMessageMetadataNumber(message: ChatMessage, key: string): number | null {
  const value = message.metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readMessageMetadataRecord(
  message: ChatMessage,
  key: string,
): Record<string, unknown> | null {
  const value = message.metadata?.[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : null;
}

function readMessageToolMetadataArray(
  message: ChatMessage,
  key: string,
): Array<{ toolName: string | null; toolId: string | null }> {
  const value = message.metadata?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return [];
    }

    const toolName = typeof entry.toolName === 'string' ? entry.toolName : null;
    const toolId = typeof entry.toolId === 'string' ? entry.toolId : null;
    if (!toolName && !toolId) {
      return [];
    }

    return [{ toolName, toolId }];
  });
}

function readRecordMetadataString(
  record: Pick<TurnRecord, 'metadata'> | null | undefined,
  key: string,
): string | null {
  const value = record?.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveCanonicalParticipantId(
  channelId: string,
  participant: RoomRoutingParticipantRef | null | undefined,
): string | null {
  if (!participant?.participantId) {
    return null;
  }

  return participant.participantKind === 'orchestrator'
    ? buildChatOrchestratorParticipantId(channelId)
    : buildChatAssignedParticipantId(channelId, participant.participantId);
}

function resolveChannelAssignments(
  channel: ChatChannelState,
): ChannelParticipantAssignment[] {
  return channel.participantAssignments ?? channel.catAssignments;
}

function resolveTargetAgentId(
  channel: ChatChannelState,
  participant: RoomRoutingParticipantRef,
): string | null {
  if (participant.participantKind === 'orchestrator') {
    return GLOBAL_ORCHESTRATOR_ACTOR_ID;
  }

  const assignment = resolveChannelAssignments(channel).find(
    (candidate) => candidate.participantId === participant.participantId,
  );
  if (!assignment) {
    const catAssignment = channel.catAssignments.find(
      (candidate) => candidate.participantId === participant.participantId,
    );
    return catAssignment ? createCatActorId(catAssignment.catId) : null;
  }

  if ('catId' in assignment && typeof assignment.catId === 'string' && assignment.catId.length > 0) {
    return createCatActorId(assignment.catId);
  }

  return assignment.sourceKind === 'cat' && assignment.sourceRefId
    ? createCatActorId(assignment.sourceRefId)
    : null;
}

function resolveTargetLease(
  channel: ChatChannelState,
  participant: RoomRoutingParticipantRef,
): ParticipantExecutionLease | null {
  return resolveExecutionLeaseSnapshot(channel, participant);
}

function collectWorkflowTurns(channel: ChatChannelState): RoomWorkflowTurn[] {
  const workflow = channel.roomRouting?.workflow;
  if (!workflow) {
    return [];
  }

  const ordered = [
    ...workflow.turnHistory,
    ...(workflow.activeTurn ? [workflow.activeTurn] : []),
  ];
  const byId = new Map<string, RoomWorkflowTurn>();
  for (const turn of ordered) {
    byId.set(turn.id, turn);
  }

  return [...byId.values()].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt));
}

function resolveExecutionResponseMessages(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  target: RoomWorkflowTargetState,
): ChatMessage[] {
  const turnMessages = channel.messages
    .filter((message) => {
      if (readMessageMetadataString(message, 'event') !== ASSISTANT_TURN_SEGMENT_EVENT) {
        return false;
      }
      const messageTurnId = readMessageMetadataString(message, 'turnId');
      return !messageTurnId || messageTurnId === turn.id;
    });
  const sortResponses = (messages: ChatMessage[]) => messages
    .sort((left, right) => {
      const leftIndex = readMessageMetadataNumber(left, 'segmentIndex') ?? 0;
      const rightIndex = readMessageMetadataNumber(right, 'segmentIndex') ?? 0;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });

  const exactMatches = turnMessages.filter((message) =>
    readMessageMetadataString(message, 'targetStateId') === target.id);
  if (exactMatches.length > 0) {
    return sortResponses(exactMatches);
  }
  if (turn.targetStatuses.length !== 1) {
    return [];
  }

  const participantMatches = turnMessages.filter((message) => {
    const messageTargetKind = readMessageMetadataString(message, 'targetKind');
    const messageTargetId = readMessageMetadataString(message, 'targetId');
    if (target.participant.participantKind === 'orchestrator') {
      return messageTargetKind === 'orchestrator'
        || messageTargetId === 'orchestrator'
        || message.senderKind === 'orchestrator';
    }

    return messageTargetKind === 'cat'
      && messageTargetId === target.participant.participantId;
  });
  return sortResponses(participantMatches);
}

function resolveSourceMessageBody(
  channel: ChatChannelState,
  sourceMessageId: string,
): string | null {
  const sourceMessage = channel.messages.find((message) => message.id === sourceMessageId);
  if (!sourceMessage) {
    return null;
  }

  if (readMessageMetadataString(sourceMessage, 'event') !== ASSISTANT_TURN_SEGMENT_EVENT) {
    return sourceMessage.body;
  }

  const assistantTurnId = readMessageMetadataString(sourceMessage, 'assistantTurnId');
  if (!assistantTurnId) {
    return sourceMessage.body;
  }

  const assistantTurnMessages = channel.messages
    .filter((message) =>
      readMessageMetadataString(message, 'event') === ASSISTANT_TURN_SEGMENT_EVENT
      && readMessageMetadataString(message, 'assistantTurnId') === assistantTurnId)
    .sort((left, right) => {
      const leftIndex = readMessageMetadataNumber(left, 'segmentIndex') ?? 0;
      const rightIndex = readMessageMetadataNumber(right, 'segmentIndex') ?? 0;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });

  return buildAssistantTurnSourceMessage(assistantTurnMessages)?.body ?? sourceMessage.body;
}

function preserveExistingTurnProjection(
  nextCore: CatsCoreState,
  core: CatsCoreState,
  conversationId: string,
  turnId: string,
): CatsCoreState {
  const existingTurns = core.turns.filter((turn) =>
    turn.conversationId === conversationId
    && turn.id === turnId);
  const existingLanes = core.lanes.filter((lane) =>
    lane.conversationId === conversationId
    && lane.turnId === turnId);
  const existingSegments = core.segments.filter((segment) =>
    segment.conversationId === conversationId
    && segment.turnId === turnId);
  const existingSessions = core.sessions.filter((session) =>
    session.conversationId === conversationId
    && session.turnId === turnId);

  return {
    ...nextCore,
    turns: appendMissingById(nextCore.turns, existingTurns),
    lanes: appendMissingById(nextCore.lanes, existingLanes),
    segments: appendMissingById(nextCore.segments, existingSegments),
    sessions: appendMissingById(nextCore.sessions, existingSessions),
  };
}

function matchesSessionStartedParticipant(
  message: ChatMessage,
  participant: RoomRoutingParticipantRef,
): boolean {
  if (readMessageMetadataString(message, 'event') !== 'session_started') {
    return false;
  }
  const targetKind = readMessageMetadataString(message, 'targetKind');
  if (participant.participantKind === 'orchestrator') {
    return targetKind === 'orchestrator';
  }

  return targetKind === 'cat'
    && readMessageMetadataString(message, 'targetId') === participant.participantId;
}

function resolveLatestSessionStartedMessage(
  channel: ChatChannelState,
  participant: RoomRoutingParticipantRef,
  options: {
    targetStateId?: string | null;
    laneId?: string | null;
    sessionId?: string | null;
  } = {},
): ChatMessage | null {
  let participantMatch: ChatMessage | null = null;
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    if (readMessageMetadataString(message, 'event') !== 'session_started') {
      continue;
    }

    if (
      options.targetStateId
      && readMessageMetadataString(message, 'targetStateId') === options.targetStateId
    ) {
      return message;
    }
    if (options.laneId && readMessageMetadataString(message, 'laneId') === options.laneId) {
      return message;
    }
    if (options.sessionId && readMessageMetadataString(message, 'sessionId') === options.sessionId) {
      return message;
    }

    if (!matchesSessionStartedParticipant(message, participant)) {
      continue;
    }
    participantMatch ??= message;
  }

  return !options.targetStateId && !options.laneId && !options.sessionId
    ? participantMatch
    : null;
}

function resolveTargetSessionId(
  channel: ChatChannelState,
  target: RoomWorkflowTargetState,
  responseMessages: ChatMessage[],
  laneId: string,
): string | null {
  const targetSessionId = target.sessionId?.trim() || null;
  if (targetSessionId) {
    return targetSessionId;
  }

  for (let index = responseMessages.length - 1; index >= 0; index -= 1) {
    const sessionId = readMessageMetadataString(responseMessages[index]!, 'sessionId');
    if (sessionId) {
      return sessionId;
    }
  }

  const sessionStartedMessage = resolveLatestSessionStartedMessage(
    channel,
    target.participant,
    {
      targetStateId: target.id,
      laneId,
    },
  );
  if (sessionStartedMessage) {
    const sessionId = readMessageMetadataString(sessionStartedMessage, 'sessionId');
    if (sessionId) {
      return sessionId;
    }
  }

  const lease = resolveTargetLease(channel, target.participant);
  if (shouldProjectTargetLeaseSession(lease, target)) {
    return lease.sessionId;
  }

  return null;
}

function resolveResponseTransportBindingId(
  responseMessages: ReadonlyArray<ChatMessage>,
): string | null {
  for (let index = responseMessages.length - 1; index >= 0; index -= 1) {
    const transportBindingId = readMessageMetadataString(
      responseMessages[index]!,
      'transportBindingId',
    );
    if (transportBindingId) {
      return transportBindingId;
    }
  }
  return null;
}

function shouldProjectTargetLeaseSession(
  lease: ReturnType<typeof resolveTargetLease>,
  target: RoomWorkflowTargetState,
): lease is NonNullable<ReturnType<typeof resolveTargetLease>> {
  if (
    !lease?.sessionId
    || (lease.status !== 'ready' && lease.status !== 'initializing')
    || (
      target.status !== 'pending'
      && target.status !== 'running'
      && target.status !== 'waiting_for_converge'
    )
  ) {
    return false;
  }

  const targetFloorAt = target.startedAt ?? target.queuedAt ?? null;
  if (!targetFloorAt) {
    return true;
  }
  if (!lease.startedAt) {
    return false;
  }

  const leaseStartedAt = Date.parse(lease.startedAt);
  const targetFloorTimestamp = Date.parse(targetFloorAt);
  if (Number.isNaN(leaseStartedAt) || Number.isNaN(targetFloorTimestamp)) {
    return false;
  }

  return leaseStartedAt >= targetFloorTimestamp;
}

function mapTurnStatus(status: RoomWorkflowTurn['status']): TurnRecordStatus {
  switch (status) {
    case 'running':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'blocked':
      return 'failed';
    default:
      return 'planned';
  }
}

function resolveTurnSourceParticipantId(
  channelId: string,
  turn: RoomWorkflowTurn,
): string | null {
  if (turn.sourceSenderKind === 'user') {
    return buildChatOwnerParticipantId(channelId);
  }
  if (turn.sourceSenderKind === 'orchestrator') {
    return buildChatOrchestratorParticipantId(channelId);
  }

  const sourceParticipant = turn.targetStatuses.find((target) => target.source)?.source ?? null;
  return resolveCanonicalParticipantId(channelId, sourceParticipant);
}

function resolveTurnKind(
  turn: RoomWorkflowTurn,
): 'user' | 'agent' | 'system' {
  if (turn.sourceSenderKind === 'user') {
    return 'user';
  }
  if (turn.sourceSenderKind === 'system') {
    return 'system';
  }

  return 'agent';
}

function mapLaneStatus(
  target: RoomWorkflowTargetState,
  responseMessages: ChatMessage[],
  sessionId: string | null,
): LaneRecordStatus {
  const hasTerminalResponse = responseMessages.some((message) => message.metadata?.terminal === true);
  if (hasTerminalResponse) {
    return 'completed';
  }

  switch (target.status) {
    case 'completed':
      return 'completed';
    case 'failed':
    case 'blocked':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'waiting_for_converge':
      return 'waiting';
    case 'pending':
      return 'pending';
    case 'running':
      if (responseMessages.length > 0) {
        return 'streaming';
      }
      return sessionId ? 'running' : 'connecting';
    default:
      return 'pending';
  }
}

function mapSessionStatus(
  target: RoomWorkflowTargetState,
  lease: ParticipantExecutionLease | null,
  responseMessages: ChatMessage[],
): SessionRecordStatus {
  if (responseMessages.some((message) => message.metadata?.terminal === true)) {
    return 'completed';
  }
  if (target.status === 'failed' || target.status === 'blocked') {
    return 'failed';
  }
  if (target.status === 'cancelled') {
    return 'cancelled';
  }
  if (target.status === 'completed') {
    return 'completed';
  }

  switch (lease?.status) {
    case 'error':
      return 'failed';
    case 'closed':
    case 'removed':
      return 'cancelled';
    case 'initializing':
    case 'not_started':
      return 'connecting';
    default:
      return 'active';
  }
}

function resolveSessionTransportBindingId(
  channelId: string,
  channel: ChatChannelState,
  participant: RoomRoutingParticipantRef,
  sessionId: string | null,
  targetStateId: string,
  laneId: string,
  responseMessages: ReadonlyArray<ChatMessage>,
): string | null {
  const responseTransportBindingId = resolveResponseTransportBindingId(responseMessages);
  if (responseTransportBindingId) {
    return responseTransportBindingId;
  }
  const sessionStartedMessage = resolveLatestSessionStartedMessage(
    channel,
    participant,
    {
      targetStateId,
      laneId,
      sessionId,
    },
  );
  const explicitTransportBindingId = sessionStartedMessage
    ? readMessageMetadataString(sessionStartedMessage, 'transportBindingId')
    : null;
  if (explicitTransportBindingId) {
    return explicitTransportBindingId;
  }

  return channel.channelKind === 'direct_lane'
    && channel.roomRouting?.defaultRecipientId === participant.participantId
    ? buildDirectLaneTransportBindingId(channelId)
    : null;
}

export function projectChatChannelInteractionToCore(
  core: CatsCoreState,
  state: ChatState,
  channelId: string,
  now: Date = new Date(),
  existingCore: CatsCoreState = core,
): CatsCoreState {
  const channel = requireChannel(state, channelId);
  const conversationId = buildChatConversationId(channelId);
  const turns = collectWorkflowTurns(channel);
  let nextCore = core;

  for (const turn of turns) {
    nextCore = preserveExistingTurnProjection(nextCore, existingCore, conversationId, turn.id);
    const existingTurn = existingCore.turns.find((candidate) =>
      candidate.conversationId === conversationId
      && candidate.id === turn.id) ?? null;
    nextCore = upsertCoreTurn(
      nextCore,
        {
          id: turn.id,
          conversationId,
          kind: resolveTurnKind(turn),
          status: mapTurnStatus(turn.status),
        sourceParticipantId: resolveTurnSourceParticipantId(channelId, turn),
        createdAt: turn.startedAt,
        startedAt: turn.startedAt,
        completedAt: turn.completedAt,
        metadata: {
          channelId,
          sourceMessageId: turn.sourceMessageId,
          sourceSenderKind: turn.sourceSenderKind,
          sourceSenderName: turn.sourceSenderName,
          sourceMessageBody:
            resolveSourceMessageBody(channel, turn.sourceMessageId)
            ?? readRecordMetadataString(existingTurn, 'sourceMessageBody'),
          workflowShape: turn.workflowShape,
          workflowStageId: turn.stageId,
          reviewRequired: turn.reviewRequired,
          guard: turn.guard,
          lastCheckpointId: turn.lastCheckpointId,
          convergeTargetId: turn.convergeTargetId,
          continuationCount: turn.continuationCount,
          dispatchCount: turn.dispatchCount,
        },
      },
      now,
    ).core;

    for (let index = 0; index < turn.targetStatuses.length; index += 1) {
      const target = turn.targetStatuses[index]!;
      const responseMessages = resolveExecutionResponseMessages(channel, turn, target);
      const lease = resolveTargetLease(channel, target.participant);
      const laneId = target.laneId?.trim() || buildChatLaneId(
        turn.id,
        target.id,
        target.participant.participantId,
      );
      const sessionId = resolveTargetSessionId(channel, target, responseMessages, laneId);
      const canonicalParticipantId = resolveCanonicalParticipantId(channelId, target.participant);
      const agentId = resolveTargetAgentId(channel, target.participant);

      nextCore = upsertCoreLane(
        nextCore,
        {
          id: laneId,
          turnId: turn.id,
          conversationId,
          participantId: canonicalParticipantId,
          agentId,
          orderIndex: index,
          status: mapLaneStatus(target, responseMessages, sessionId),
          createdAt: target.queuedAt,
          startedAt: target.startedAt,
          completedAt: target.completedAt,
          metadata: {
            channelId,
            targetStateId: target.id,
            sourceMessageId: target.sourceMessageId,
            participantKind: target.participant.participantKind,
            speakerLabel: target.participant.participantName,
            trigger: target.trigger,
            mentionNames: structuredClone(target.mentionNames),
            depth: target.depth,
            parentCheckpointId: target.parentCheckpointId,
            branchStrategy: target.branchStrategy,
            handoffReason: target.handoffReason,
            wakeRequestId: target.wakeRequestId,
            responseAssistantTurnId: target.response?.assistantTurnId ?? null,
          },
        },
        now,
      ).core;

      if (sessionId) {
        nextCore = upsertCoreSession(
          nextCore,
          {
            id: sessionId,
            conversationId,
            turnId: turn.id,
            laneId,
            participantId: canonicalParticipantId,
            agentId,
            transportBindingId: resolveSessionTransportBindingId(
              channelId,
              channel,
              target.participant,
              sessionId,
              target.id,
              laneId,
              responseMessages,
            ),
            runtimeKey: target.participant.participantName,
            status: mapSessionStatus(target, lease, responseMessages),
            createdAt: lease?.startedAt ?? turn.startedAt,
            startedAt: target.startedAt ?? lease?.startedAt ?? turn.startedAt,
            completedAt: target.completedAt,
            metadata: {
              channelId,
              targetStateId: target.id,
              leaseStatus: lease?.status ?? null,
              leaseProvider: lease?.provider ?? null,
              leaseModel: lease?.model ?? null,
              leaseCwd: lease?.cwd ?? null,
              leaseLastError: lease?.lastError ?? null,
              leaseLastUsedAt: lease?.lastUsedAt ?? null,
            },
          },
          now,
        ).core;
      }

      for (let segmentIndex = 0; segmentIndex < responseMessages.length; segmentIndex += 1) {
        const message = responseMessages[segmentIndex]!;
        const sequence = readMessageMetadataNumber(message, 'segmentIndex') ?? segmentIndex;
        const assistantTurnId = readMessageMetadataString(message, 'assistantTurnId') ?? 'assistant-turn';
        nextCore = upsertCoreSegment(
          nextCore,
          {
            id: `segment-${assistantTurnId}-${sequence}`,
            laneId,
            turnId: turn.id,
            conversationId,
            sessionId,
            sequence,
            kind: 'text',
            status: 'complete',
            content: message.body,
            createdAt: message.createdAt,
            completedAt: message.createdAt,
            metadata: {
              channelId,
              chatMessageId: message.id,
              assistantTurnId,
              targetStateId: target.id,
              sourceMessageId: target.sourceMessageId,
              terminal: message.metadata?.terminal === true,
              executionProvider: message.executionProvider ?? null,
              executionModel: message.executionModel ?? null,
              executionInstance: message.executionInstance ?? null,
              routingTrigger: readMessageMetadataString(message, 'routingTrigger'),
              dispatchDepth: readMessageMetadataNumber(message, 'dispatchDepth'),
              ...(readMessageToolMetadataArray(message, 'precedingTools').length > 0
                ? { precedingTools: readMessageToolMetadataArray(message, 'precedingTools') }
                : {}),
              ...(readMessageMetadataRecord(message, 'workflowRecommendation')
                ? { workflowRecommendation: readMessageMetadataRecord(message, 'workflowRecommendation') }
                : {}),
            },
          },
          now,
        ).core;
      }
    }
  }

  return nextCore;
}

export function projectChatInteractionRecordsToCore(
  core: CatsCoreState,
  chat: ChatState,
  now: Date = new Date(),
): CatsCoreState {
  const durableTurnIds = collectDurableChatTurnIds(core);
  let nextCore: CatsCoreState = {
    ...core,
    turns: [
      ...preserveCoreOwnedTurns(core.turns),
      ...preserveDurableChatTurns(core.turns, durableTurnIds),
    ],
    lanes: [
      ...preserveCoreOwnedLanes(core.lanes),
      ...preserveDurableChatLanes(core.lanes, durableTurnIds),
    ],
    segments: [
      ...preserveCoreOwnedSegments(core.segments),
      ...preserveDurableChatSegments(core.segments, durableTurnIds),
    ],
    sessions: [
      ...preserveCoreOwnedSessions(core.sessions),
      ...preserveDurableChatSessions(core.sessions, durableTurnIds),
    ],
  };

  for (const channel of chat.channels) {
    nextCore = projectChatChannelInteractionToCore(nextCore, chat, channel.id, now, core);
  }

  return nextCore;
}
