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

function isChatConversationId(conversationId: string | null | undefined): boolean {
  return typeof conversationId === 'string' && conversationId.startsWith('conversation-channel-');
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

function readMessageMetadataString(message: ChatMessage, key: string): string | null {
  const value = message.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readMessageMetadataNumber(message: ChatMessage, key: string): number | null {
  const value = message.metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
  if (participant.participantKind === 'orchestrator') {
    return channel.orchestratorLease;
  }

  const assignment = resolveChannelAssignments(channel).find(
    (candidate) => candidate.participantId === participant.participantId,
  );

  if (!assignment || typeof assignment !== 'object') {
    return null;
  }

  const execution = 'execution' in assignment ? assignment.execution : null;
  return execution?.lease ?? null;
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
  turnId: string,
  targetStateId: string,
): ChatMessage[] {
  return channel.messages
    .filter((message) => {
      if (readMessageMetadataString(message, 'event') !== ASSISTANT_TURN_SEGMENT_EVENT) {
        return false;
      }
      if (readMessageMetadataString(message, 'targetStateId') !== targetStateId) {
        return false;
      }
      const messageTurnId = readMessageMetadataString(message, 'turnId');
      return !messageTurnId || messageTurnId === turnId;
    })
    .sort((left, right) => {
      const leftIndex = readMessageMetadataNumber(left, 'segmentIndex') ?? 0;
      const rightIndex = readMessageMetadataNumber(right, 'segmentIndex') ?? 0;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });
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

function resolveTargetSessionId(
  channel: ChatChannelState,
  target: RoomWorkflowTargetState,
  responseMessages: ChatMessage[],
): string | null {
  for (let index = responseMessages.length - 1; index >= 0; index -= 1) {
    const sessionId = readMessageMetadataString(responseMessages[index]!, 'sessionId');
    if (sessionId) {
      return sessionId;
    }
  }

  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    if (!matchesSessionStartedParticipant(message, target.participant)) {
      continue;
    }
    const sessionId = readMessageMetadataString(message, 'sessionId');
    if (sessionId) {
      return sessionId;
    }
  }

  const lease = resolveTargetLease(channel, target.participant);
  if (
    lease?.sessionId
    && (target.status === 'pending' || target.status === 'running' || target.status === 'waiting_for_converge')
  ) {
    return lease.sessionId;
  }

  return null;
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
): SessionRecordStatus {
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
): string | null {
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
): CatsCoreState {
  const channel = requireChannel(state, channelId);
  const conversationId = buildChatConversationId(channelId);
  const turns = collectWorkflowTurns(channel);
  let nextCore = core;

  for (const turn of turns) {
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
      const responseMessages = resolveExecutionResponseMessages(channel, turn.id, target.id);
      const sessionId = resolveTargetSessionId(channel, target, responseMessages);
      const lease = resolveTargetLease(channel, target.participant);
      const laneId = buildChatLaneId(turn.id, target.id, target.participant.participantId);
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
            ),
            runtimeKey: target.participant.participantName,
            status: mapSessionStatus(target, lease),
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
  let nextCore: CatsCoreState = {
    ...core,
    turns: preserveCoreOwnedTurns(core.turns),
    lanes: preserveCoreOwnedLanes(core.lanes),
    segments: preserveCoreOwnedSegments(core.segments),
    sessions: preserveCoreOwnedSessions(core.sessions),
  };

  for (const channel of chat.channels) {
    nextCore = projectChatChannelInteractionToCore(nextCore, chat, channel.id, now);
  }

  return nextCore;
}
