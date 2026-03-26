import type { ChannelDispatchResult, ChatState } from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  RoomWorkflowShape,
} from '../../../../shared/roomRouting.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import type {
  WorkflowContinuationReplayResult,
  WorkflowContinuationReplaySnapshot,
} from '../../../../platform/orchestration/workflowContinuationReplay.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import { buildChannelView, requireChannel } from '../model/index.js';
import {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../room-routing/index.js';
import {
  type TargetResolution,
  workflowShapeForTargets,
} from '../room-routing/runtime.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createRoutingOutcome,
  createWorkflowEvent,
  createWorkflowTurn,
} from '../room-routing/workflow.js';
import type { RuntimeTransportContext } from '../runtimeTargeting.js';
import {
  buildCatTarget,
  buildOrchestratorTarget,
} from '../runtimeTargeting.js';
import { applyRoomRoutingSnapshot } from '../runtime-session/state.js';
import { finalizeDispatchTurn } from './finalize.js';
import { processDispatchQueue } from './loop.js';
import {
  materializeInFlightDispatchState,
  persistInFlightDispatchState,
} from './persistence.js';

function describeGuardReason(reason: string): string {
  switch (reason) {
    case 'max_continuations':
      return 'the continuation depth limit';
    case 'max_dispatches':
      return 'the per-turn dispatch limit';
    case 'max_target_visits':
      return 'the per-target revisit limit';
    case 'anti_ping_pong':
      return 'anti-ping-pong protection';
    default:
      return 'a routing guard';
  }
}

function toResolutionMode(targetCount: number): 'explicit_single' | 'explicit_multi' {
  return targetCount > 1 ? 'explicit_multi' : 'explicit_single';
}

function resolveReplayTarget(
  state: ChatState,
  channelId: string,
  participant: RoomRoutingParticipantRef,
) {
  const channel = buildChannelView(state, channelId);
  if (participant.participantKind === 'orchestrator') {
    return buildOrchestratorTarget(state, channel);
  }

  const cat = channel.assignedCats.find((candidate) =>
    candidate.status === 'active' && candidate.catId === participant.participantId,
  );
  return cat ? buildCatTarget(cat) : null;
}

function resolveReplayTargets(
  state: ChatState,
  request: WorkflowContinuationReplaySnapshot,
) {
  return request.targets
    .map((target) => resolveReplayTarget(state, request.channelId, target))
    .filter((target): target is NonNullable<ReturnType<typeof resolveReplayTarget>> => target !== null);
}

function buildReplayResolution(
  request: WorkflowContinuationReplaySnapshot,
  state: ChatState,
): TargetResolution {
  const targets = resolveReplayTargets(state, request);
  if (targets.length === 0) {
    throw new Error('Stored workflow continuation replay no longer has any active targets.');
  }

  return {
    targets,
    unresolved: [...request.unresolvedTargets],
    mentionNames: [...request.mentionNames],
    trigger: request.trigger,
    resolution: {
      routingMode: toResolutionMode(targets.length),
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Stored workflow continuation replay resumed the next room stage.',
    },
  };
}

function mapTurnStatusToExecutionState(
  status: string | null | undefined,
): WorkflowContinuationReplayResult['executionState'] {
  switch (status) {
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'completed';
    default:
      return 'running';
  }
}

export async function resumeWorkflowContinuationReplay(input: {
  request: WorkflowContinuationReplaySnapshot;
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore' | 'writeCore'>;
  runtimeClient: RuntimeClient;
  now: Date;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  transport?: RuntimeTransportContext;
}): Promise<WorkflowContinuationReplayResult & { results: ChannelDispatchResult[] }> {
  const state = await input.chatStore.read();
  const channel = buildChannelView(state, input.request.channelId);
  const sourceMessage = channel.messages.find((message) => message.id === input.request.sourceMessageId);
  if (!sourceMessage) {
    throw new Error(`Stored workflow continuation source message not found: ${input.request.sourceMessageId}`);
  }

  const initialResolution = buildReplayResolution(input.request, state);
  const nowIso = input.now.toISOString();
  const baseRoomRouting = resolveRoomRoutingState(requireChannel(state, input.request.channelId).roomRouting);
  const workflow = resolveRoomWorkflowState(baseRoomRouting.workflow);
  const maxContinuations = baseRoomRouting.maxContinuations ?? DEFAULT_MAX_ROUTING_CONTINUATIONS;
  const maxDispatches = baseRoomRouting.maxDispatchesPerTurn ?? DEFAULT_MAX_ROUTING_DISPATCHES;
  const maxTargetVisits = baseRoomRouting.maxTargetVisitsPerTurn ?? DEFAULT_MAX_ROUTING_TARGET_VISITS;
  const outcome = createRoutingOutcome(channel, sourceMessage, initialResolution, nowIso);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    nowIso,
    input.request.workflowStageId ?? 'continuation_handoff',
    input.request.workflowShape ?? workflowShapeForTargets(initialResolution.targets.length),
  );
  activeTurn.id = outcome.turnId;
  activeTurn.reviewRequired = input.request.reviewRequired;
  workflow.activeTurn = activeTurn;
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System resumed a stored workflow continuation.',
      nowIso,
      input.request.sourceParticipant,
      sourceMessage.id,
      initialResolution.targets.map((target) => ({
        participantKind: target.participantKind,
        participantId: target.participantId,
        participantName: target.participantName,
      })),
      {
        metadata: {
          trigger: initialResolution.trigger,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          selectionKind: initialResolution.resolution.selectionKind,
          replaySource: 'workflow_continuation',
          replayCheckpointId: input.request.checkpointId,
          continuationSource: input.request.continuationSource,
          workflowRecommendation: input.request.workflowRecommendation
            ? structuredClone(input.request.workflowRecommendation)
            : null,
        },
      },
    ),
  );
  let latestCheckpoint: RoomRoutingCheckpoint | null = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'turn_started',
    'System resumed a stored workflow continuation.',
    nowIso,
    input.request.sourceParticipant,
    initialResolution.targets.map((target) => ({
      participantKind: target.participantKind,
      participantId: target.participantId,
      participantName: target.participantName,
    })),
    {
      trigger: initialResolution.trigger,
      workflowStageId: activeTurn.stageId,
      workflowShape: activeTurn.workflowShape,
      replaySource: 'workflow_continuation',
      replayCheckpointId: input.request.checkpointId,
      continuationSource: input.request.continuationSource,
      workflowRecommendation: input.request.workflowRecommendation
        ? structuredClone(input.request.workflowRecommendation)
        : null,
    },
  );

  let nextState = materializeInFlightDispatchState(
    state,
    input.request.channelId,
    baseRoomRouting,
    workflow,
    outcome,
    latestCheckpoint,
    input.now,
  );
  nextState = await persistInFlightDispatchState(input.chatStore, nextState);

  const results: ChannelDispatchResult[] = [];
  const loopResult = await processDispatchQueue({
    state: nextState,
    channelId: input.request.channelId,
    runtimeClient: input.runtimeClient,
    now: input.now,
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    initialResolution,
    userMessage: sourceMessage,
    results,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    describeGuardReason,
    transport: input.transport,
    companionStore: input.companionStore,
    memoryService: input.memoryService,
    chatStore: input.chatStore,
  });
  nextState = loopResult.state;
  latestCheckpoint = loopResult.latestCheckpoint;
  const guardReason = loopResult.guardReason;

  nextState = finalizeDispatchTurn(nextState, input.request.channelId, input.now, {
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    guardReason,
    userMessageId: sourceMessage.id,
    describeGuardReason,
  });
  nextState = await persistInFlightDispatchState(input.chatStore, nextState);

  const persistedChannel = buildChannelView(nextState, input.request.channelId);
  const latestTurn = persistedChannel.roomRouting?.workflow.turnHistory[0]
    ?? persistedChannel.roomRouting?.workflow.activeTurn
    ?? null;

  return {
    channelId: input.request.channelId,
    sourceMessageId: sourceMessage.id,
    status: 'dispatched',
    blockedReason: null,
    results,
    executionState: mapTurnStatusToExecutionState(latestTurn?.status),
  };
}
