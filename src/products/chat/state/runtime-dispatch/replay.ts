import type { ChannelDispatchResult, ChatState } from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  RoomWorkflowShape,
} from '../../../../shared/roomRouting.js';
import { normalizeRuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import { upsertCoreTask } from '../../../../core/model/index.js';
import type {
  WorkflowContinuationReplayBlockedReason,
  WorkflowContinuationReplayResult,
  WorkflowContinuationReplaySnapshot,
} from '../../../../platform/orchestration/workflowContinuationReplay.js';
import {
  readWorkflowContinuationReplay,
  writeWorkflowContinuationReplayMetadata,
} from '../../../../platform/orchestration/workflowContinuationReplay.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import { buildChannelView, requireChannel } from '../model/index.js';
import {
  readWorkflowRecommendation,
  resolveWorkflowRecommendationTargets,
  type WorkflowRecommendation,
} from '../room-routing/recommendations.js';
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

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
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

  const cat = (
    channel.assignedParticipants?.find((candidate) =>
      candidate.status === 'active' && candidate.participantId === participant.participantId)
    ?? channel.assignedCats.find((candidate) =>
      candidate.status === 'active'
      && (candidate.participantId === participant.participantId || candidate.catId === participant.participantId))
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

function sameParticipantRef(
  left: RoomRoutingParticipantRef,
  right: RoomRoutingParticipantRef,
): boolean {
  return left.participantKind === right.participantKind
    && left.participantId === right.participantId
    && left.participantName === right.participantName;
}

function readMissingConcreteReplayTargets(
  request: WorkflowContinuationReplaySnapshot,
  replayTargets: ReturnType<typeof resolveReplayTargets>,
): string[] {
  const resolvedParticipants = replayTargets.map((target) => ({
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
  }));
  return uniqueStrings(
    request.targets
      .filter((target) =>
        !resolvedParticipants.some((resolved) => sameParticipantRef(resolved, target)))
      .map((target) => target.participantName),
  );
}

function buildRecommendationReplayResolution(
  state: ChatState,
  request: WorkflowContinuationReplaySnapshot,
): {
  resolution: TargetResolution | null;
  blockedReason: WorkflowContinuationReplayBlockedReason | null;
  note: string | null;
  unresolvedTargets: string[];
} {
  const recommendation = readWorkflowRecommendation(request.workflowRecommendation);
  if (!recommendation) {
    return {
      resolution: null,
      blockedReason: null,
      note: null,
      unresolvedTargets: [...request.unresolvedTargets],
    };
  }

  const resolved = resolveWorkflowRecommendationTargets(state, request.channelId, recommendation);
  const unresolvedTargets = uniqueStrings([
    ...request.unresolvedTargets,
    ...resolved.unresolved,
  ]);
  if (requiresCompleteRecommendationResolution(recommendation, resolved.unresolved)) {
    return {
      resolution: null,
      blockedReason: 'no_valid_targets',
      note: 'Stored workflow continuation replay is still waiting for all parallel targets from its workflow recommendation.',
      unresolvedTargets,
    };
  }

  if (resolved.targets.length === 0) {
    return {
      resolution: null,
      blockedReason: 'no_valid_targets',
      note: 'Stored workflow continuation replay still has no active targets for its workflow recommendation.',
      unresolvedTargets,
    };
  }

  return {
    resolution: {
      targets: resolved.targets,
      unresolved: unresolvedTargets,
      mentionNames: resolved.mentionNames.length > 0
        ? resolved.mentionNames
        : [...request.mentionNames],
      trigger: request.trigger,
      resolution: {
        routingMode: toResolutionMode(resolved.targets.length),
        selectionKind: 'explicit_mentions',
        defaultTarget: null,
        defaultTargetReason: null,
        fallbackTarget: null,
        blockedReason: null,
        note: 'Stored workflow continuation replay re-resolved targets from its workflow recommendation.',
      },
    },
    blockedReason: null,
    note: null,
    unresolvedTargets,
  };
}

function requiresCompleteRecommendationResolution(
  recommendation: WorkflowRecommendation,
  unresolvedTargets: string[],
): boolean {
  return recommendation.workflowShape === 'parallel'
    && recommendation.candidateTargets.length > 1
    && unresolvedTargets.length > 0;
}

function requiresCompleteConcreteReplayResolution(
  request: WorkflowContinuationReplaySnapshot,
  missingTargets: string[],
): boolean {
  return request.workflowShape === 'parallel'
    && request.targets.length > 1
    && missingTargets.length > 0;
}

function buildReplayResolution(
  request: WorkflowContinuationReplaySnapshot,
  state: ChatState,
): {
  resolution: TargetResolution | null;
  blockedReason: WorkflowContinuationReplayBlockedReason | null;
  note: string | null;
  unresolvedTargets: string[];
} {
  const replayTargets = resolveReplayTargets(state, request);
  const missingConcreteTargets = readMissingConcreteReplayTargets(request, replayTargets);
  if (requiresCompleteConcreteReplayResolution(request, missingConcreteTargets)) {
    return {
      resolution: null,
      blockedReason: 'no_valid_targets',
      note: 'Stored workflow continuation replay is still waiting for all preserved parallel targets to recover.',
      unresolvedTargets: uniqueStrings([
        ...request.unresolvedTargets,
        ...missingConcreteTargets,
      ]),
    };
  }

  const unresolvedTargets = uniqueStrings([
    ...request.unresolvedTargets,
    ...missingConcreteTargets,
  ]);
  if (replayTargets.length > 0) {
    return {
      resolution: {
        targets: replayTargets,
        unresolved: unresolvedTargets,
        mentionNames: [...request.mentionNames],
        trigger: request.trigger,
        resolution: {
          routingMode: toResolutionMode(replayTargets.length),
          selectionKind: 'explicit_mentions',
          defaultTarget: null,
          defaultTargetReason: null,
          fallbackTarget: null,
          blockedReason: null,
          note: 'Stored workflow continuation replay resumed the next room stage.',
        },
      },
      blockedReason: null,
      note: null,
      unresolvedTargets,
    };
  }

  const recommendationResolution = buildRecommendationReplayResolution(state, request);
  if (recommendationResolution.resolution) {
    return {
      resolution: recommendationResolution.resolution,
      blockedReason: recommendationResolution.blockedReason,
      note: recommendationResolution.note,
      unresolvedTargets: recommendationResolution.unresolvedTargets,
    };
  }

  if (request.workflowRecommendation) {
    return {
      resolution: null,
      blockedReason: recommendationResolution.blockedReason ?? 'no_valid_targets',
      note: recommendationResolution.note
        ?? 'Stored workflow continuation replay still has no active targets for its workflow recommendation.',
      unresolvedTargets: recommendationResolution.unresolvedTargets,
    };
  }

  throw new Error(
    'Stored workflow continuation replay no longer has any active targets or resolvable workflow recommendation.',
  );
}

function buildChannelTaskId(channelId: string): string {
  return `task-channel-${channelId}`;
}

async function persistBlockedReplayMetadata(
  chatStore: Pick<ChatStore, 'readCore' | 'writeCore'>,
  request: WorkflowContinuationReplaySnapshot,
  resolution: Pick<
    ReturnType<typeof buildReplayResolution>,
    'blockedReason' | 'unresolvedTargets'
  >,
  now: Date,
): Promise<void> {
  if (!resolution.blockedReason) {
    return;
  }

  const core = await chatStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === buildChannelTaskId(request.channelId));
  if (!task) {
    return;
  }

  const existingReplay = readWorkflowContinuationReplay(task.metadata, {
    includeInProgress: true,
  }) ?? request;
  const metadata = writeWorkflowContinuationReplayMetadata(
    task.metadata,
    {
      ...existingReplay,
      blockedReason: resolution.blockedReason,
      unresolvedTargets: resolution.unresolvedTargets,
    },
    {
      replayState: existingReplay.replayState,
      replayTrigger: existingReplay.replayTrigger,
      replayAttemptAt: existingReplay.replayAttemptAt,
      replayError: existingReplay.replayError,
    },
  );
  const write = upsertCoreTask(
    core,
    {
      id: task.id,
      title: task.title,
      status: task.status,
      conversationId: task.conversationId,
      parentTaskId: task.parentTaskId ?? null,
      ownerActorId: task.ownerActorId,
      orchestratorActorId: task.orchestratorActorId,
      assignedActorIds: task.assignedActorIds,
      summary: task.summary,
      approval: task.approval,
      createdAt: task.createdAt,
      metadata,
    },
    now,
  );
  await chatStore.writeCore(write.core);
}

export function canResumeWorkflowContinuationReplay(
  request: WorkflowContinuationReplaySnapshot,
  state: ChatState,
): boolean {
  try {
    const resolution = buildReplayResolution(request, state).resolution;
    return Boolean(
      resolution
      && resolution.targets.length > 0
      && resolution.targets.every((target) =>
        typeof target.sessionId === 'string' && target.sessionId.trim().length > 0),
    );
  } catch {
    return false;
  }
}

function buildReplayResolutionSourceTargets(
  resolution: TargetResolution,
): RoomRoutingParticipantRef[] {
  return resolution.targets.map((target) => ({
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
  }));
}

function cloneWorkflowRecommendation(
  request: WorkflowContinuationReplaySnapshot,
): Record<string, unknown> | null {
  return request.workflowRecommendation
    ? structuredClone(request.workflowRecommendation)
    : null;
}

function buildReplayEventMetadata(
  input: {
    request: WorkflowContinuationReplaySnapshot;
    resolution: TargetResolution;
    workflowShape: RoomWorkflowShape;
    workflowStageId: string;
  },
): Record<string, unknown> {
  return {
    trigger: input.resolution.trigger,
    workflowStageId: input.workflowStageId,
    workflowShape: input.workflowShape,
    selectionKind: input.resolution.resolution.selectionKind,
    replaySource: 'workflow_continuation',
    replayCheckpointId: input.request.checkpointId,
    continuationSource: input.request.continuationSource,
    workflowRecommendation: cloneWorkflowRecommendation(input.request),
  };
}

function buildReplayCheckpointMetadata(
  input: {
    request: WorkflowContinuationReplaySnapshot;
    resolution: TargetResolution;
    workflowShape: RoomWorkflowShape;
    workflowStageId: string;
  },
): Record<string, unknown> {
  return {
    trigger: input.resolution.trigger,
    workflowStageId: input.workflowStageId,
    workflowShape: input.workflowShape,
    replaySource: 'workflow_continuation',
    replayCheckpointId: input.request.checkpointId,
    continuationSource: input.request.continuationSource,
    workflowRecommendation: cloneWorkflowRecommendation(input.request),
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
  const runtimeRecovery = normalizeRuntimeDispatchRecoveryPolicy();
  const state = await input.chatStore.read();
  const channel = buildChannelView(state, input.request.channelId);
  const sourceMessage = channel.messages.find((message) => message.id === input.request.sourceMessageId);
  if (!sourceMessage) {
    throw new Error(`Stored workflow continuation source message not found: ${input.request.sourceMessageId}`);
  }

  const initialReplayResolution = buildReplayResolution(input.request, state);
  if (!initialReplayResolution.resolution) {
    try {
      await persistBlockedReplayMetadata(
        input.chatStore,
        input.request,
        initialReplayResolution,
        input.now,
      );
    } catch {
      // Keep the replay attempt best-effort; callers still receive the
      // blocked result even if the additive metadata refresh fails.
    }
    return {
      channelId: input.request.channelId,
      sourceMessageId: sourceMessage.id,
      status: 'blocked',
      blockedReason: initialReplayResolution.blockedReason,
      results: [],
      executionState: 'blocked',
    };
  }
  const initialResolution = initialReplayResolution.resolution;
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
  activeTurn.convergeTargetId = activeTurn.workflowShape === 'converge'
    && initialResolution.targets.length === 1
    ? initialResolution.targets[0]!.participantId
    : null;
  workflow.activeTurn = activeTurn;
  const replayTargets = buildReplayResolutionSourceTargets(initialResolution);
  const replayEventMetadata = buildReplayEventMetadata({
    request: input.request,
    resolution: initialResolution,
    workflowShape: activeTurn.workflowShape,
    workflowStageId: activeTurn.stageId,
  });
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
      replayTargets,
      {
        metadata: replayEventMetadata,
      },
    ),
  );
  const replayCheckpointMetadata = buildReplayCheckpointMetadata({
    request: input.request,
    resolution: initialResolution,
    workflowShape: activeTurn.workflowShape,
    workflowStageId: activeTurn.stageId,
  });
  let latestCheckpoint: RoomRoutingCheckpoint | null = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'turn_started',
    'System resumed a stored workflow continuation.',
    nowIso,
    input.request.sourceParticipant,
    replayTargets,
    replayCheckpointMetadata,
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
    runtimeRecovery,
  });
  nextState = loopResult.state;
  latestCheckpoint = loopResult.latestCheckpoint;
  const guardReason = loopResult.guardReason;
  const blockedResolution = loopResult.blockedResolution;

  nextState = finalizeDispatchTurn(nextState, input.request.channelId, input.now, {
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    guardReason,
    blockedResolution,
    userMessageId: sourceMessage.id,
    describeGuardReason,
  });
  nextState = await persistInFlightDispatchState(input.chatStore, nextState);

  const persistedChannel = buildChannelView(nextState, input.request.channelId);
  const latestTurn = persistedChannel.roomRouting?.workflow.turnHistory[0]
    ?? persistedChannel.roomRouting?.workflow.activeTurn
    ?? null;
  const executionState = mapTurnStatusToExecutionState(latestTurn?.status);
  const finalBlockedReason = blockedResolution?.blockedReason ?? guardReason;

  return {
    channelId: input.request.channelId,
    sourceMessageId: sourceMessage.id,
    status: executionState === 'blocked' ? 'blocked' : 'dispatched',
    blockedReason: finalBlockedReason,
    results,
    executionState,
  };
}
