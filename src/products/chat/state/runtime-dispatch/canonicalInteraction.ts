import type { CatsCoreState } from '../../../../core/types.js';
import type { ChatState } from '../../api/contracts.js';
import type { RoomWorkflowTurn } from '../../../../shared/roomRouting.js';
import { buildChatLaneId } from '../../../../shared/chatCoreIds.js';
import {
  projectChatChannelInteractionToCore,
} from '../core-projection/interaction.js';
import { requireChannel } from '../model/index.js';
import type { DispatchExecution } from './execution.js';

export interface RecordDispatchExecutionInteractionInput {
  core: CatsCoreState;
  state: ChatState;
  channelId: string;
  workflowTurn: RoomWorkflowTurn;
  execution: DispatchExecution;
  now: Date;
}

function buildSyntheticSessionStartedMessageId(input: {
  workflowTurnId: string;
  targetStateId: string;
  participantId: string;
  laneId?: string | null;
}): string {
  const laneId = input.laneId?.trim() || buildChatLaneId(
    input.workflowTurnId,
    input.targetStateId,
    input.participantId,
  );
  return `session-started-${laneId}`;
}

export function recordDispatchExecutionInteraction(
  input: RecordDispatchExecutionInteractionInput,
): CatsCoreState {
  const channel = requireChannel(input.state, input.channelId);
  const existingTurnIds = new Set([
    ...(channel.roomRouting?.workflow?.turnHistory ?? []).map((turn) => turn.id),
    ...(channel.roomRouting?.workflow?.activeTurn ? [channel.roomRouting.workflow.activeTurn.id] : []),
  ]);
  if (!existingTurnIds.has(input.workflowTurn.id)) {
    const nowIso = input.now.toISOString();
    const nextState = structuredClone(input.state);
    const nextChannel = requireChannel(nextState, input.channelId);
    const defaultRecipientId = nextChannel.roomRouting?.defaultRecipientId ?? null;
    const laneId = input.execution.target.laneId?.trim() || buildChatLaneId(
      input.workflowTurn.id,
      input.execution.targetStateId,
      input.execution.target.participantId,
    );
    const syntheticSessionMessageId = input.execution.target.sessionId
      ? buildSyntheticSessionStartedMessageId({
        workflowTurnId: input.workflowTurn.id,
        targetStateId: input.execution.targetStateId,
        participantId: input.execution.target.participantId,
        laneId,
      })
      : null;
    nextChannel.roomRouting = {
      mode: nextChannel.channelKind === 'direct_lane' ? 'direct_cat_chat' : 'boss_chat',
      defaultRecipientId,
      maxContinuations: 8,
      maxDispatchesPerTurn: 8,
      maxTargetVisitsPerTurn: 3,
      lastOutcome: null,
      lastCheckpoint: null,
      lastWakeRequest: null,
      wakeHistory: [],
      ...nextChannel.roomRouting,
      workflow: {
        activeTurn: null,
        turnHistory: [],
        eventHistory: [],
        lastCheckpointEvent: null,
        lastOutcomeEvent: null,
        ...nextChannel.roomRouting?.workflow,
      },
    };
    nextChannel.roomRouting.workflow.activeTurn = {
      id: input.workflowTurn.id,
      status: input.workflowTurn.completedAt ? 'completed' : 'running',
      sourceMessageId: input.workflowTurn.sourceMessageId,
      sourceSenderKind: input.workflowTurn.sourceSenderKind,
      sourceSenderName:
        input.workflowTurn.sourceSenderKind === 'user'
          ? 'User'
          : input.execution.target.participantName,
      guard: null,
      stageId: 'dispatch',
      workflowShape: input.workflowTurn.workflowShape,
      reviewRequired: input.workflowTurn.reviewRequired,
      lastCheckpointId: null,
      convergeTargetId: null,
      continuationCount: 0,
      dispatchCount: 1,
      targetStatuses: [
        {
          id: input.execution.targetStateId,
          dispatchId: null,
          participant: {
            participantKind: input.execution.target.participantKind,
            participantId: input.execution.target.participantId,
            participantName: input.execution.target.participantName,
          },
          laneId,
          sessionId: input.execution.target.sessionId,
          source: input.execution.sourceParticipant ?? null,
          sourceMessageId: input.execution.sourceMessage.id,
          trigger: input.execution.trigger ?? 'room_default',
          mentionNames: [],
          depth: input.execution.depth ?? 0,
          parentCheckpointId: null,
          branchStrategy: input.execution.branchStrategy ?? null,
          handoffReason: input.execution.handoffReason ?? null,
          wakeRequestId: null,
          status: input.execution.error ? 'failed' : 'completed',
          queuedAt: input.workflowTurn.startedAt,
          startedAt: input.workflowTurn.startedAt,
          completedAt: input.workflowTurn.completedAt ?? nowIso,
          response: null,
          error: input.execution.error,
        },
      ],
      events: [],
      startedAt: input.workflowTurn.startedAt,
      updatedAt: nowIso,
      completedAt: input.workflowTurn.completedAt,
    };
    if (
      syntheticSessionMessageId
      && !nextChannel.messages.some((message) => message.id === syntheticSessionMessageId)
    ) {
      nextChannel.messages.push({
        id: syntheticSessionMessageId,
        channelId: input.channelId,
        senderKind: 'system',
        senderName: 'system',
        body: '',
        mentions: [],
        metadata: {
          event: 'session_started',
          sessionId: input.execution.target.sessionId,
          targetKind:
            input.execution.target.participantKind === 'orchestrator'
              ? 'orchestrator'
              : 'cat',
          targetId:
            input.execution.target.participantKind === 'orchestrator'
              ? null
              : input.execution.target.participantId,
          turnId: input.workflowTurn.id,
          targetStateId: input.execution.targetStateId,
          laneId,
        },
        usage: null,
        executionProvider: null,
        executionModel: null,
        executionInstance: null,
        createdAt: input.workflowTurn.startedAt,
      });
    }
    return projectChatChannelInteractionToCore(
      input.core,
      nextState,
      input.channelId,
      input.now,
    );
  }

  return projectChatChannelInteractionToCore(
    input.core,
    input.state,
    input.channelId,
    input.now,
  );
}
