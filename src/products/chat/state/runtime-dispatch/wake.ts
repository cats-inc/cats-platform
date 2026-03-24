import type {
  ChannelDispatchResult,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingOutcome,
  RoomRoutingState,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import type { CompanionBoxStore } from '../companionBoxStore.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import {
  type DispatchRequest,
} from '../room-routing/runtime.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  updateDispatch,
  updateWorkflowTarget,
} from '../room-routing/workflow.js';
import {
  resolveWakeReasonFromRoutingTrigger,
} from '../room-routing/wake.js';
import {
  ensureChannelMarkedActive,
  toParticipantRef,
} from '../runtime-session/state.js';
import {
  ensureTargetSession,
  maybeAutoCheckoutChannelTask,
} from '../runtimeSessionRouting.js';

export async function prepareReadyRequests(
  state: ChatState,
  channelId: string,
  requests: DispatchRequest[],
  runtimeClient: RuntimeClient,
  now: Date,
  options: {
    nowIso: string;
    baseRoomRouting: RoomRoutingState;
    workflow: RoomWorkflowState;
    activeTurn: RoomWorkflowTurn;
    outcome: RoomRoutingOutcome;
    latestCheckpoint: RoomRoutingCheckpoint | null;
    results: ChannelDispatchResult[];
    transport?: import('../runtimeTargeting.js').RuntimeTransportContext;
    companionStore?: CompanionBoxStore;
    memoryService?: CatsMemoryService;
    chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
  },
): Promise<{
  state: ChatState;
  latestCheckpoint: RoomRoutingCheckpoint | null;
  readyRequests: DispatchRequest[];
}> {
  const {
    activeTurn,
    baseRoomRouting,
    nowIso,
    outcome,
    results,
    workflow,
  } = options;
  let latestCheckpoint = options.latestCheckpoint;
  let nextState = state;
  const readyRequests: DispatchRequest[] = [];

  for (const request of requests) {
    const ensured = await ensureTargetSession(
      nextState,
      channelId,
      request.target,
      runtimeClient,
      now,
      {
        transport: options.transport,
        companionStore: options.companionStore,
        memoryService: options.memoryService,
        roomRouting: baseRoomRouting,
        wakeTrigger: 'route_target',
        wakeReason: request.trigger === 'continuation_mention'
          ? 'workflow_continuation'
          : resolveWakeReasonFromRoutingTrigger(request.trigger),
        sourceMessageId: request.sourceMessage.id,
      },
    );
    nextState = ensured.state;
    if (ensured.error) {
      updateDispatch(outcome, request.dispatchId, {
        status: 'error',
        completedAt: nowIso,
        error: ensured.error,
      });
      updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
        wakeRequestId: ensured.wakeRequest?.id ?? null,
        status: 'failed',
        completedAt: nowIso,
        error: ensured.error,
      });
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'target_failed',
          'failed',
          `Failed to wake ${request.target.participantName}: ${ensured.error}`,
          nowIso,
          request.sourceParticipant,
          request.sourceMessage.id,
          [toParticipantRef(request.target)],
          {
            dispatchId: request.dispatchId,
            metadata: {
              phase: 'wake',
              parentCheckpointId: request.parentCheckpointId,
              branchStrategy: request.branchStrategy,
              handoffReason: request.handoffReason,
            },
          },
        ),
      );
      latestCheckpoint = addWorkflowCheckpoint(
        outcome,
        workflow,
        activeTurn,
        'runtime_error',
        `Failed to wake ${request.target.participantName}: ${ensured.error}`,
        nowIso,
        request.sourceParticipant,
        [toParticipantRef(request.target)],
      );
      results.push({
        targetKind: request.target.participantKind,
        targetId: request.target.participantId,
        targetName: request.target.participantName,
        sessionId: null,
        status: 'error',
        dispatchId: request.dispatchId,
        turnId: activeTurn.id,
        targetStatus: 'failed',
        error: ensured.error,
        sourceMessageId: request.sourceMessage.id,
        trigger: request.trigger,
        dispatchDepth: request.depth,
      });
      continue;
    }

    nextState = ensureChannelMarkedActive(nextState, channelId, now);
    await maybeAutoCheckoutChannelTask(
      options.chatStore,
      runtimeClient,
      channelId,
      ensured.target,
      now,
    );
    readyRequests.push({
      ...request,
      target: ensured.target,
    });
    updateDispatch(outcome, request.dispatchId, {
      status: 'running',
      startedAt: nowIso,
    });
    updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
      wakeRequestId: ensured.wakeRequest?.id ?? null,
      status: 'running',
      startedAt: nowIso,
    });
    appendWorkflowEvent(
      workflow,
      activeTurn,
      createWorkflowEvent(
        activeTurn.id,
        'target_running',
        'running',
        `${ensured.target.participantName} is running this room dispatch.`,
        nowIso,
        request.sourceParticipant,
        request.sourceMessage.id,
        [toParticipantRef(ensured.target)],
        {
          dispatchId: request.dispatchId,
          metadata: {
            depth: request.depth,
            trigger: request.trigger,
            parentCheckpointId: request.parentCheckpointId,
            branchStrategy: request.branchStrategy,
            handoffReason: request.handoffReason,
          },
        },
      ),
    );
  }

  return {
    state: nextState,
    latestCheckpoint,
    readyRequests,
  };
}
