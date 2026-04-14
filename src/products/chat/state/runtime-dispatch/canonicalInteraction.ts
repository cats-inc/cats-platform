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
import type { CatsCoreState } from '../../../../core/types.js';
import type { ChatMessage, ChatState } from '../../api/contracts.js';
import type { RoomWorkflowTurn } from '../../../../shared/roomRouting.js';
import { ASSISTANT_TURN_SEGMENT_EVENT } from '../assistantTurnSegments.js';
import { requireChannel } from '../model/index.js';
import type { DispatchExecution } from './execution.js';

function readMessageMetadataString(message: ChatMessage, key: string): string | null {
  const value = message.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readMessageMetadataNumber(message: ChatMessage, key: string): number | null {
  const value = message.metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildCanonicalConversationId(channelId: string): string {
  return `conversation-channel-${channelId}`;
}

function buildCanonicalLaneId(turnId: string, targetStateId: string, participantId: string): string {
  return `lane-${turnId}-${targetStateId || participantId}`;
}

function resolveTargetAgentId(state: ChatState, channelId: string, execution: DispatchExecution): string | null {
  if (execution.target.participantKind === 'orchestrator') {
    return GLOBAL_ORCHESTRATOR_ACTOR_ID;
  }

  const channel = requireChannel(state, channelId);
  const assignment = channel.catAssignments.find(
    (candidate) => candidate.participantId === execution.target.participantId,
  );
  return assignment ? createCatActorId(assignment.catId) : null;
}

function resolveExecutionResponseMessages(
  state: ChatState,
  channelId: string,
  execution: DispatchExecution,
  workflowTurnId: string,
): ChatMessage[] {
  const channel = requireChannel(state, channelId);

  return channel.messages
    .filter((message) => {
      if (readMessageMetadataString(message, 'event') !== ASSISTANT_TURN_SEGMENT_EVENT) {
        return false;
      }
      if (readMessageMetadataString(message, 'targetStateId') !== execution.targetStateId) {
        return false;
      }
      if (readMessageMetadataString(message, 'sourceMessageId') !== execution.sourceMessage.id) {
        return false;
      }
      const turnId = readMessageMetadataString(message, 'turnId');
      return !turnId || turnId === workflowTurnId;
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

export interface RecordDispatchExecutionInteractionInput {
  core: CatsCoreState;
  state: ChatState;
  channelId: string;
  workflowTurn: RoomWorkflowTurn;
  execution: DispatchExecution;
  now: Date;
}

export function recordDispatchExecutionInteraction(
  input: RecordDispatchExecutionInteractionInput,
): CatsCoreState {
  const conversationId = buildCanonicalConversationId(input.channelId);
  const participantId = input.execution.target.participantId;
  const targetStateId = input.execution.targetStateId;
  if (!participantId || !targetStateId) {
    return input.core;
  }

  const laneId = buildCanonicalLaneId(input.workflowTurn.id, targetStateId, participantId);
  const agentId = resolveTargetAgentId(input.state, input.channelId, input.execution);
  const responseMessages = resolveExecutionResponseMessages(
    input.state,
    input.channelId,
    input.execution,
    input.workflowTurn.id,
  );
  const matchedLaneIndex = input.workflowTurn.targetStatuses.findIndex(
    (target) => target.id === targetStateId,
  );

  let core = upsertCoreTurn(
    input.core,
    {
      id: input.workflowTurn.id,
      conversationId,
      kind: input.workflowTurn.sourceSenderKind === 'user' ? 'user' : 'agent',
      status: input.workflowTurn.completedAt ? 'completed' : 'active',
      sourceParticipantId: input.execution.sourceParticipant?.participantId ?? null,
      createdAt: input.workflowTurn.startedAt,
      startedAt: input.workflowTurn.startedAt,
      completedAt: input.workflowTurn.completedAt,
      metadata: {
        channelId: input.channelId,
        sourceMessageId: input.workflowTurn.sourceMessageId,
        workflowShape: input.workflowTurn.workflowShape,
        reviewRequired: input.workflowTurn.reviewRequired,
      },
    },
    input.now,
  ).core;

  core = upsertCoreLane(
    core,
    {
      id: laneId,
      turnId: input.workflowTurn.id,
      conversationId,
      participantId,
      agentId,
      orderIndex: matchedLaneIndex >= 0 ? matchedLaneIndex : 0,
      status: input.execution.error ? 'failed' : 'completed',
      createdAt: input.workflowTurn.startedAt,
      completedAt: input.execution.error ? input.now.toISOString() : null,
      metadata: {
        channelId: input.channelId,
        targetStateId,
        sourceMessageId: input.execution.sourceMessage.id,
        participantKind: input.execution.target.participantKind,
        speakerLabel: input.execution.target.participantName,
      },
    },
    input.now,
  ).core;

  if (input.execution.target.sessionId) {
    core = upsertCoreSession(
      core,
      {
        id: input.execution.target.sessionId,
        conversationId,
        turnId: input.workflowTurn.id,
        laneId,
        participantId,
        agentId,
        runtimeKey: input.execution.target.participantName,
        status: input.execution.error ? 'failed' : 'active',
        createdAt: input.workflowTurn.startedAt,
        startedAt: input.workflowTurn.startedAt,
        metadata: {
          channelId: input.channelId,
          targetStateId,
        },
      },
      input.now,
    ).core;
  }

  for (let index = 0; index < responseMessages.length; index += 1) {
    const message = responseMessages[index]!;
    const segmentIndex = readMessageMetadataNumber(message, 'segmentIndex') ?? index;
    const assistantTurnId = readMessageMetadataString(message, 'assistantTurnId') ?? 'assistant-turn';
    core = upsertCoreSegment(
      core,
      {
        id: `segment-${assistantTurnId}-${segmentIndex}`,
        laneId,
        turnId: input.workflowTurn.id,
        conversationId,
        sessionId: input.execution.target.sessionId ?? null,
        sequence: segmentIndex,
        kind: 'text',
        status: 'complete',
        content: message.body,
        createdAt: message.createdAt,
        completedAt: message.createdAt,
        metadata: {
          chatMessageId: message.id,
          assistantTurnId,
          targetStateId,
          sourceMessageId: input.execution.sourceMessage.id,
          executionProvider: message.executionProvider ?? null,
          executionModel: message.executionModel ?? null,
          executionInstance: message.executionInstance ?? null,
        },
      },
      input.now,
    ).core;
  }

  return core;
}
