import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  ContainerRecord,
  CoreActorRecord,
  CoreApprovalRecord,
  CoreBudgetAlertLevel,
  CoreBudgetAlertSource,
  CoreConversationRecord,
  CoreConversationStatus,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
  ParticipantRecord,
  CoreRecordMetadata,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  TransportBindingRecord,
  OwnerProfileRecord,
} from '../../../../core/types.js';
import {
  buildCoreGovernanceSummary,
  buildCoreWorkflowSummary,
  buildRuntimeDeliveryManifestSummary,
} from '../../../../core/governance.js';
import {
  createCatActorId,
  createEmptyMemoryCheckpoint,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  OWNER_ACTOR_ID,
} from '../../../../core/actors.js';
import {
  buildWorkflowContinuationReplayRequest,
  readWorkflowContinuationReplay,
  type WorkflowContinuationReplayTarget,
  writeWorkflowContinuationReplayMetadata,
} from '../../../../platform/orchestration/workflowContinuationReplay.js';
import type {
  ChannelParticipantAssignment,
  ChatChannelState,
  ChatCat,
  ParallelChatGroupState,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingParticipantRef,
  RoomWorkflowShape,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import { resolveChannelCanonicalIdentity } from '../model/index.js';
import {
  isReplayableContinuationGuardReason,
} from '../room-routing/continuationReplay.js';
import {
  mergeWorkflowContinuationTargets,
  readLatestWorkflowContinuationContext,
} from '../room-routing/continuationContext.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../../shared/platformSurfaces.js';
import {
  readMetadataBoolean,
  readMetadataRecord,
  readMetadataString,
  readMetadataStringArray,
  readParticipantRef,
  readParticipantRefs,
  sameParticipantRef,
  uniqueStrings,
} from './entityMetadata.js';
import {
  buildChatArchiveId,
  buildChatAssignedParticipantId,
  buildChatLaneId,
  buildDirectLaneTransportBindingId,
  buildChatOrchestratorParticipantId,
  buildChatOwnerParticipantId,
  buildChatParallelGroupContainerId,
  buildChatTaskId,
  buildChatWorkItemId,
  buildTelegramBotTransportBindingId,
  CHAT_ROOT_CONTAINER_ID,
  resolveChatConversationKind,
  resolveChatParticipantAgentId,
} from '../../../../shared/chatCoreIds.js';

function mapChannelStatusToConversationStatus(channel: ChatChannelState): CoreConversationStatus {
  if (channel.status === 'planned') {
    return 'planned';
  }
  if (channel.status === 'archived') {
    return 'archived';
  }
  return 'active';
}

function mapChannelStatusToTaskStatus(channel: ChatChannelState): CoreTaskStatus {
  if (channel.status === 'active' || channel.status === 'watching') {
    return 'in_progress';
  }
  if (channel.status === 'archived') {
    return 'archived';
  }
  return 'draft';
}

function shouldPreserveActiveChannelTaskStatus(status: CoreTaskStatus | null | undefined): boolean {
  return status === 'blocked' || status === 'completed' || status === 'cancelled';
}

function mapChannelStatusToWorkItemStatus(
  channel: ChatChannelState,
): CoreWorkItemRecord['status'] {
  if (channel.status === 'active' || channel.status === 'watching') {
    return 'in_progress';
  }
  if (channel.status === 'archived') {
    return 'archived';
  }
  return 'draft';
}

function shouldPreserveActiveChannelWorkItemStatus(
  status: CoreWorkItemRecord['status'] | null | undefined,
): boolean {
  return status === 'blocked' || status === 'completed' || status === 'cancelled';
}

function latestWorkflowTurn(channel: ChatChannelState): RoomWorkflowTurn | null {
  const workflow = channel.roomRouting?.workflow;
  return workflow?.activeTurn ?? workflow?.turnHistory[0] ?? null;
}

function findLatestContinuationReplayEvent(turn: RoomWorkflowTurn | null) {
  if (!turn) {
    return null;
  }

  return [...turn.events].reverse().find((event) => {
    const metadata = readMetadataRecord(event.metadata);
    const checkpointKind = readMetadataString(metadata, 'checkpointKind');
    const reason = readMetadataString(metadata, 'reason');
    const blockedReason = readMetadataString(metadata, 'blockedReason');

    if (event.kind !== 'checkpoint' && event.kind !== 'guard_blocked') {
      return false;
    }

    if (
      (checkpointKind === 'loop_guard' || checkpointKind === 'anti_ping_pong')
      && isReplayableContinuationGuardReason(reason)
      && reason === turn.guard
    ) {
      return true;
    }

    if (
      checkpointKind === 'loop_guard'
      && reason === 'startup_restart'
      && readMetadataString(metadata, 'recoveryPhase') === 'startup_recovered'
    ) {
      return true;
    }

    return checkpointKind === 'no_targets'
      && blockedReason === 'no_valid_targets'
      && readMetadataString(metadata, 'continuationSourceMessageId') !== null
      && readMetadataRecord(metadata?.workflowRecommendation) !== null;
  }) ?? null;
}

function readRecoveredStartupContinuationReplayRequest(
  turn: RoomWorkflowTurn | null,
  event: NonNullable<ReturnType<typeof findLatestContinuationReplayEvent>>,
): {
  sourceParticipant: RoomRoutingParticipantRef | null;
  sourceMessageId: string;
  sourceTurnId: string | null;
  sourceLaneId: string | null;
  sourceAssistantTurnId: string | null;
  targets: WorkflowContinuationReplayTarget[];
  mentionNames: string[];
  branchStrategy: 'fork_if_possible' | 'transplant_context' | 'fresh_no_parent' | null;
  trigger: 'room_default' | 'explicit_mention' | 'continuation_mention';
  workflowStageId: string | null;
  reviewRequired: boolean;
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  workflowRecommendation: Record<string, unknown> | null;
  unresolvedTargets: string[];
} | null {
  if (!turn) {
    return null;
  }

  const metadata = readMetadataRecord(event.metadata);
  if (!metadata) {
    return null;
  }

  const interruptedTargets = event.targets;
  if (interruptedTargets.length === 0) {
    return null;
  }

  const interruptedTargetStates = turn.targetStatuses.filter((target) =>
    interruptedTargets.some((participant) => sameParticipantRef(participant, target.participant)));
  const startupRecoveredInitialSequential =
    turn.workflowShape === 'sequential'
    && turn.sourceSenderKind === 'user'
    && interruptedTargetStates.length === 0
    && interruptedTargets.length > 0
    && turn.targetStatuses.length > 0
    && turn.targetStatuses.every((target) => target.depth === 0 && target.source === null);
  if (!startupRecoveredInitialSequential && interruptedTargetStates.length === 0) {
    return null;
  }

  let sourceParticipant = interruptedTargetStates[0]?.source ?? null;
  let sourceMessageId = interruptedTargetStates[0]?.sourceMessageId?.trim() ?? '';
  let trigger = interruptedTargetStates[0]?.trigger ?? 'continuation_mention';
  let branchStrategy = interruptedTargetStates[0]?.branchStrategy ?? null;
  const latestCompletedTargetState = startupRecoveredInitialSequential
    ? [...turn.targetStatuses].reverse().find((target) =>
      target.response?.messageIds.length
      && target.depth === 0
      && target.source === null
      && target.status === 'completed') ?? null
    : null;
  if (startupRecoveredInitialSequential) {
    sourceParticipant = latestCompletedTargetState
      ? structuredClone(latestCompletedTargetState.participant)
      : null;
    sourceMessageId = latestCompletedTargetState?.response?.messageIds.at(-1)?.trim() ?? '';
    trigger = 'continuation_mention';
    branchStrategy = 'transplant_context';
  }
  if (sourceMessageId.length === 0) {
    return null;
  }

  if (!startupRecoveredInitialSequential) {
    for (const target of interruptedTargetStates) {
      if (
        (
          sourceParticipant
            ? !target.source || !sameParticipantRef(target.source, sourceParticipant)
            : target.source !== null
        )
        || target.sourceMessageId !== sourceMessageId
        || target.trigger !== trigger
        || target.branchStrategy !== branchStrategy
      ) {
        return null;
      }
    }
  }

  let replayTargets = startupRecoveredInitialSequential
    ? mergeWorkflowContinuationTargets(interruptedTargets, metadata)
    : interruptedTargetStates.map((target) => ({
      participantKind: target.participant.participantKind,
      participantId: target.participant.participantId,
      participantName: target.participant.participantName,
      laneId: target.laneId,
      sessionId: target.sessionId,
    }));
  const continuationContext = readLatestWorkflowContinuationContext(turn, {
    excludeEventId: event.id,
  });
  if (
    turn.workflowShape === 'sequential'
    && sourceParticipant === null
    && interruptedTargetStates.every((target) => target.depth === 0)
  ) {
    const turnStartedEvent = turn.events.find((candidate) => candidate.kind === 'turn_started') ?? null;
    if (turnStartedEvent?.targets.length) {
      replayTargets = mergeWorkflowContinuationTargets(
        readParticipantRefs(turnStartedEvent.targets),
        readMetadataRecord(turnStartedEvent.metadata),
      );
      branchStrategy = null;
    }
  } else if (
    turn.workflowShape === 'sequential'
    && continuationContext?.targets.length
    && interruptedTargetStates.every((target) =>
      continuationContext.targets.some((participant) => sameParticipantRef(participant, target.participant)))
  ) {
    replayTargets = continuationContext.targets.map((target) => {
      const targetState = interruptedTargetStates.find((candidate) =>
        sameParticipantRef(candidate.participant, target));
      return {
        participantKind: target.participantKind,
        participantId: target.participantId,
        participantName: target.participantName,
        laneId: targetState?.laneId ?? null,
        sessionId: targetState?.sessionId ?? null,
      };
    });
  }

  const continuationMetadata = continuationContext?.metadata ?? null;
  const continuationSource = readMetadataString(continuationMetadata, 'continuationSource');
  const sourceTurnId = readMetadataString(metadata, 'continuationSourceTurnId')
    ?? readMetadataString(continuationMetadata, 'continuationSourceTurnId')
    ?? (latestCompletedTargetState ? turn.id : null);
  const sourceLaneId = readMetadataString(metadata, 'continuationSourceLaneId')
    ?? readMetadataString(continuationMetadata, 'continuationSourceLaneId')
    ?? (
      latestCompletedTargetState
        ? latestCompletedTargetState.laneId?.trim() || buildChatLaneId(
          turn.id,
          latestCompletedTargetState.id,
          latestCompletedTargetState.participant.participantId,
        )
        : null
    );
  const sourceAssistantTurnId = readMetadataString(
    metadata,
    'continuationSourceAssistantTurnId',
  )
    ?? readMetadataString(continuationMetadata, 'continuationSourceAssistantTurnId')
    ?? latestCompletedTargetState?.response?.assistantTurnId
    ?? null;

  return {
    sourceParticipant,
    sourceMessageId,
    sourceTurnId,
    sourceLaneId,
    sourceAssistantTurnId,
    targets: replayTargets,
    mentionNames: uniqueStrings(
      [
        ...interruptedTargetStates.flatMap((target) => [...target.mentionNames]),
        ...readMetadataStringArray(continuationMetadata, 'mentionNames'),
      ],
    ),
    branchStrategy,
    trigger,
    workflowStageId:
      readMetadataString(metadata, 'workflowStageIdBeforeRecovery')
      ?? readMetadataString(metadata, 'workflowStageId'),
    reviewRequired: turn.reviewRequired,
    continuationSource:
      continuationSource === 'explicit_mentions' || continuationSource === 'workflow_recommendation'
        ? continuationSource
        : null,
    workflowRecommendation: readMetadataRecord(continuationMetadata?.workflowRecommendation),
    unresolvedTargets: readMetadataStringArray(continuationMetadata, 'unresolvedTargets'),
  };
}

function readWorkflowContinuationReplayRequest(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn | null,
) {
  const event = findLatestContinuationReplayEvent(turn);
  if (!event) {
    return null;
  }

  const metadata = readMetadataRecord(event.metadata);
  if (!metadata) {
    return null;
  }
  const checkpointId = event.checkpointId ?? null;
  const reason = readMetadataString(metadata, 'reason');
  const startupRecoveryReplay = reason === 'startup_restart'
    ? readRecoveredStartupContinuationReplayRequest(turn, event)
    : null;
  const sourceMessageId = startupRecoveryReplay?.sourceMessageId
    ?? readMetadataString(metadata, 'continuationSourceMessageId')
    ?? event.sourceMessageId;
  const sourceTurnId = startupRecoveryReplay?.sourceTurnId
    ?? readMetadataString(metadata, 'continuationSourceTurnId');
  const sourceLaneId = startupRecoveryReplay?.sourceLaneId
    ?? readMetadataString(metadata, 'continuationSourceLaneId');
  const sourceAssistantTurnId = startupRecoveryReplay?.sourceAssistantTurnId
    ?? readMetadataString(metadata, 'continuationSourceAssistantTurnId');
  const sourceParticipant = startupRecoveryReplay?.sourceParticipant ?? event.actor;
  const targets = startupRecoveryReplay?.targets
    ?? mergeWorkflowContinuationTargets(readParticipantRefs(event.targets), metadata);
  const workflowRecommendation = startupRecoveryReplay?.workflowRecommendation
    ?? readMetadataRecord(metadata.workflowRecommendation);
  const workflowShape = readMetadataString(metadata, 'workflowShape');
  const blockedReason = (() => {
    if (isReplayableContinuationGuardReason(reason)) {
      return reason;
    }
    return readMetadataString(metadata, 'blockedReason') === 'no_valid_targets'
      ? 'no_valid_targets'
      : null;
  })();
  if (
    !metadata
    || !checkpointId
    || !sourceMessageId
    || (!workflowRecommendation && targets.length === 0)
    || (
      workflowShape !== 'sequential'
      && workflowShape !== 'concurrent'
      && workflowShape !== 'parallel'
      && workflowShape !== 'converge'
    )
    || (!blockedReason && reason !== 'startup_restart')
  ) {
    return null;
  }

  return buildWorkflowContinuationReplayRequest({
    channelId: channel.id,
    checkpointId,
    sourceMessageId,
    sourceTurnId,
    sourceLaneId,
    sourceAssistantTurnId,
    sourceParticipant,
    targets,
    mentionNames: startupRecoveryReplay?.mentionNames ?? readMetadataStringArray(metadata, 'mentionNames'),
    trigger: startupRecoveryReplay?.trigger ?? 'continuation_mention',
    branchStrategy: startupRecoveryReplay?.branchStrategy ?? readMetadataString(metadata, 'branchStrategy') as
      | 'fork_if_possible'
      | 'transplant_context'
      | 'fresh_no_parent'
      | null,
    workflowStageId:
      startupRecoveryReplay?.workflowStageId
      ?? readMetadataString(metadata, 'workflowStageId'),
    workflowShape: workflowShape as RoomWorkflowShape,
    reviewRequired: startupRecoveryReplay?.reviewRequired
      ?? readMetadataBoolean(metadata, 'reviewRequired'),
    continuationSource: startupRecoveryReplay?.continuationSource ?? (() => {
      const source = readMetadataString(metadata, 'continuationSource');
      return source === 'explicit_mentions' || source === 'workflow_recommendation'
        ? source
        : null;
    })(),
    workflowRecommendation,
    unresolvedTargets:
      startupRecoveryReplay?.unresolvedTargets
      ?? readMetadataStringArray(metadata, 'unresolvedTargets'),
    blockedReason,
    recordedAt: event.createdAt,
  });
}

function mergeWorkflowContinuationReplayMetadata(
  metadata: CoreRecordMetadata,
  existingTask: CoreTaskRecord | null,
  channel: ChatChannelState,
  turn: RoomWorkflowTurn | null,
): CoreRecordMetadata {
  const derivedReplay = readWorkflowContinuationReplayRequest(channel, turn);
  const existingReplay = readWorkflowContinuationReplay(existingTask?.metadata, {
    includeInProgress: true,
  });
  if (!derivedReplay) {
    return writeWorkflowContinuationReplayMetadata(metadata, null);
  }

  const preserveExistingState = existingReplay?.checkpointId === derivedReplay.checkpointId
    && existingReplay.sourceMessageId === derivedReplay.sourceMessageId;
  const mergedReplay = preserveExistingState && existingReplay
    ? {
        ...derivedReplay,
        continuationSource: derivedReplay.continuationSource ?? existingReplay.continuationSource,
        workflowRecommendation: derivedReplay.workflowRecommendation ?? existingReplay.workflowRecommendation,
        unresolvedTargets: uniqueStrings([
          ...derivedReplay.unresolvedTargets,
          ...existingReplay.unresolvedTargets,
        ]),
        blockedReason: existingReplay.blockedReason ?? derivedReplay.blockedReason,
      }
    : derivedReplay;

  return writeWorkflowContinuationReplayMetadata(
    metadata,
    mergedReplay,
    preserveExistingState
      ? {
          replayState: existingReplay.replayState,
          replayTrigger: existingReplay.replayTrigger,
          replayAttemptAt: existingReplay.replayAttemptAt,
          replayError: existingReplay.replayError,
        }
      : undefined,
  );
}

function resolveCanonicalConversationId(channelId: string): string {
  return resolveChannelCanonicalIdentity(null, channelId).conversationId;
}

function buildChannelTaskMetadata(
  channel: ChatChannelState,
  containerId: string | null,
  parallelGroupId: string | null,
  existingTask: CoreTaskRecord | null,
  approval: CoreApprovalRecord,
): CoreRecordMetadata {
  const latestTurn = latestWorkflowTurn(channel);
  const roomRouting = channel.roomRouting;
  const pendingApproval = approval.status === 'pending';
  const effectiveDeliveryMode: CoreDeliveryMode = channel.repoPath ? 'commit_only' : 'artifact_only';
  const effectiveDeliverySource: CoreEffectivePolicySource = roomRouting?.mode === 'direct_cat_chat'
    ? 'room_tightening'
    : 'chat_default';
  const deliveryGates: CoreDeliveryGate[] = [
    ...(pendingApproval ? ['owner_approval_required' as const] : []),
    ...(latestTurn?.reviewRequired ? ['manual_review_required' as const] : []),
  ];
  const effectiveBudgetAlertLevel: CoreBudgetAlertLevel = roomRouting?.lastOutcome?.guard
    ? 'blocked'
    : roomRouting?.lastWakeRequest?.status === 'failed'
      ? 'warning'
      : 'normal';
  const effectiveBudgetAlertSource: CoreBudgetAlertSource | null = roomRouting?.lastOutcome?.guard
    ? 'guardrail_state'
    : roomRouting?.lastWakeRequest?.status === 'failed'
      ? 'rate_limit_incident'
      : null;
  const effectiveDeliveryPolicy = {
    mode: effectiveDeliveryMode,
    gates: deliveryGates,
    source: effectiveDeliverySource,
    rationale: channel.repoPath
      ? 'Repo-backed chats default to commit-only delivery.'
      : 'Chats without a repo default to artifact-only delivery.',
  };
  const effectiveBudgetPolicy = {
    alertLevel: effectiveBudgetAlertLevel,
    source: effectiveBudgetAlertSource,
    rationale: roomRouting?.lastOutcome?.guard
      ? `Blocked by ${roomRouting.lastOutcome.guard}.`
      : roomRouting?.lastWakeRequest?.status === 'failed'
        ? 'Recent wake failures may require operator review.'
        : 'No active budget or runtime guardrail alerts.',
  };
  const runtimeDeliveryManifest = buildRuntimeDeliveryManifestSummary({
    deliveryMode: effectiveDeliveryPolicy.mode,
    deliveryGates: effectiveDeliveryPolicy.gates,
    channelId: channel.id,
    containerId,
    conversationId: resolveCanonicalConversationId(channel.id),
    taskId: buildChatTaskId(channel.id),
    roomMode: roomRouting?.mode ?? 'boss_chat',
    transport: null,
    workflowStageId: latestTurn?.stageId ?? null,
    workflowShape: latestTurn?.workflowShape ?? null,
  });
  const workflowSummary = buildCoreWorkflowSummary({
    runStatus: null,
    stageId: latestTurn?.stageId ?? null,
    shape: latestTurn?.workflowShape ?? null,
    reviewRequired: latestTurn?.reviewRequired ?? false,
    lastCheckpointId:
      latestTurn?.lastCheckpointId
      ?? roomRouting?.lastCheckpoint?.id
      ?? null,
    convergeTargetId: latestTurn?.convergeTargetId ?? null,
    continuationCount: latestTurn?.continuationCount ?? null,
    dispatchCount: latestTurn?.dispatchCount ?? null,
    targetCount: latestTurn?.targetStatuses.length ?? null,
    branchStates: latestTurn?.targetStatuses,
  });

  const nextMetadata = mergeWorkflowContinuationReplayMetadata(
    {
    ...structuredClone(existingTask?.metadata ?? {}),
    source: 'chat-channel',
    channelId: channel.id,
    containerId,
    parallelGroupId,
    roomRoutingMode: roomRouting?.mode ?? 'boss_chat',
    workflowStageId: latestTurn?.stageId ?? null,
    workflowShape: latestTurn?.workflowShape ?? null,
    workflowLastCheckpointId:
      latestTurn?.lastCheckpointId
      ?? roomRouting?.lastCheckpoint?.id
      ?? null,
    workflowReviewRequired: latestTurn?.reviewRequired ?? false,
    workflowConvergeTargetId: latestTurn?.convergeTargetId ?? null,
    effectiveDeliveryMode,
    effectiveDeliveryGates: deliveryGates,
    effectiveDeliverySource,
    effectiveDeliveryRationale: effectiveDeliveryPolicy.rationale,
    effectiveBudgetAlertLevel,
    effectiveBudgetAlertSource,
    effectiveBudgetRationale: effectiveBudgetPolicy.rationale,
    effectiveDeliveryPolicy,
    effectiveBudgetPolicy,
    runtimeDeliveryManifest,
    workflowSummary,
    governanceSummary: buildCoreGovernanceSummary({
      approval,
      delivery: effectiveDeliveryPolicy,
      budget: effectiveBudgetPolicy,
      runtimeDeliveryManifest,
      operatorMetadata: existingTask?.metadata ?? {},
    }),
    },
    existingTask,
    channel,
    latestTurn,
  );

  return nextMetadata;
}

function buildChannelWorkItemMetadata(
  channel: ChatChannelState,
  containerId: string | null,
  parallelGroupId: string | null,
  existingWorkItem: CoreWorkItemRecord | null,
): CoreRecordMetadata {
  const latestTurn = latestWorkflowTurn(channel);
  const roomRouting = channel.roomRouting;

  return {
    ...structuredClone(existingWorkItem?.metadata ?? {}),
    source: 'chat-channel',
    channelId: channel.id,
    containerId,
    parallelGroupId,
    roomRoutingMode: roomRouting?.mode ?? 'boss_chat',
    workflowStageId: latestTurn?.stageId ?? null,
    workflowShape: latestTurn?.workflowShape ?? null,
    workflowLastCheckpointId:
      latestTurn?.lastCheckpointId
      ?? roomRouting?.lastCheckpoint?.id
      ?? null,
    workflowReviewRequired: latestTurn?.reviewRequired ?? false,
    workflowConvergeTargetId: latestTurn?.convergeTargetId ?? null,
    taskId: buildChatTaskId(channel.id),
    repoPath: channel.repoPath,
    responseLanguage: channel.responseLanguage,
    messageCount: channel.messages.length,
    lastMessageAt: channel.lastMessageAt,
    workflowSummary: buildCoreWorkflowSummary({
      runStatus: null,
      stageId: latestTurn?.stageId ?? null,
      shape: latestTurn?.workflowShape ?? null,
      reviewRequired: latestTurn?.reviewRequired ?? false,
      lastCheckpointId:
        latestTurn?.lastCheckpointId
        ?? roomRouting?.lastCheckpoint?.id
        ?? null,
      convergeTargetId: latestTurn?.convergeTargetId ?? null,
      continuationCount: latestTurn?.continuationCount ?? null,
      dispatchCount: latestTurn?.dispatchCount ?? null,
      targetCount: latestTurn?.targetStatuses.length ?? null,
      branchStates: latestTurn?.targetStatuses,
    }),
  };
}

export function createOwnerActor(ownerProfile: OwnerProfileRecord): CoreActorRecord {
  return {
    id: ownerProfile.actorId,
    name: ownerProfile.displayName,
    kind: 'owner',
    status: 'active',
    roles: ['owner'],
    skillProfile: null,
    mcpProfile: null,
    defaultExecutionTarget: null,
    memory: createEmptyMemoryCheckpoint(),
    source: 'owner_profile',
    sourceId: ownerProfile.actorId,
    createdAt: ownerProfile.updatedAt,
    updatedAt: ownerProfile.updatedAt,
    archivedAt: null,
  };
}

export function createOrchestratorActor(chat: ChatState): CoreActorRecord {
  const roles = chat.globalOrchestrator.notes.length > 0
    ? ['orchestrator', 'coordinator']
    : ['orchestrator'];

  return {
    id: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    name: 'Orchestrator',
    kind: 'orchestrator',
    status: 'active',
    roles,
    skillProfile: chat.globalOrchestrator.skillProfile,
    mcpProfile: chat.globalOrchestrator.mcpProfile,
    defaultExecutionTarget: structuredClone(chat.globalOrchestrator.executionTarget),
    memory: structuredClone(chat.globalOrchestrator.memory),
    source: 'global_orchestrator',
    sourceId: 'global',
    createdAt: chat.globalOrchestrator.updatedAt,
    updatedAt: chat.globalOrchestrator.updatedAt,
    archivedAt: null,
  };
}

export function createCatActor(cat: ChatCat, bossCatId: string | null): CoreActorRecord {
  const bossCatRoles = cat.id === bossCatId
    ? ['boss_cat', 'primary_orchestrator']
    : [];

  return {
    id: createCatActorId(cat.id),
    name: cat.name,
    kind: 'worker',
    status: cat.status === 'archived' ? 'archived' : 'active',
    roles: uniqueStrings([...bossCatRoles, ...structuredClone(cat.roles)]),
    skillProfile: cat.skillProfile,
    mcpProfile: cat.mcpProfile,
    defaultExecutionTarget: structuredClone(cat.defaultExecutionTarget),
    memory: structuredClone(cat.memory),
    source: 'chat_cat',
    sourceId: cat.id,
    createdAt: cat.createdAt,
    updatedAt: cat.updatedAt,
    archivedAt: cat.archivedAt,
  };
}

export function createTemporaryParticipantActor(
  assignment: ChannelParticipantAssignment,
): CoreActorRecord {
  return {
    id: resolveChatParticipantAgentId(assignment),
    name: assignment.name,
    kind: 'stakeholder',
    status: 'active',
    roles: uniqueStrings([
      ...structuredClone(assignment.roles),
      ...(assignment.roleHint ? [assignment.roleHint] : []),
    ]),
    skillProfile: null,
    mcpProfile: null,
    defaultExecutionTarget: structuredClone(assignment.execution.target),
    memory: createEmptyMemoryCheckpoint(),
    source: 'chat_participant',
    sourceId: assignment.participantId,
    createdAt: assignment.joinedAt,
    updatedAt: assignment.leftAt ?? assignment.joinedAt,
    archivedAt: null,
  };
}

export function createTemporaryParticipantActors(chat: ChatState): CoreActorRecord[] {
  const actorsById = new Map<string, CoreActorRecord>();

  for (const channel of chat.channels) {
    for (const assignment of channel.participantAssignments ?? []) {
      if (assignment.sourceKind === 'cat') {
        continue;
      }

      const actor = createTemporaryParticipantActor(assignment);
      actorsById.set(actor.id, actor);
    }
  }

  return [...actorsById.values()];
}

function mapAssignmentStatusToParticipantStatus(
  assignment: ChannelParticipantAssignment,
): ParticipantRecord['status'] {
  return assignment.status === 'removed' ? 'removed' : 'active';
}

function buildParticipantRole(assignment: ChannelParticipantAssignment): string | null {
  return assignment.roleHint ?? assignment.roles[0] ?? null;
}

export function createChatConversationParticipants(
  channel: ChatChannelState,
): ParticipantRecord[] {
  const conversationId = resolveCanonicalConversationId(channel.id);
  const assignments = channel.participantAssignments ?? [];
  const participants: ParticipantRecord[] = [
    {
      id: buildChatOwnerParticipantId(channel.id),
      conversationId,
      agentId: OWNER_ACTOR_ID,
      joinedAt: channel.createdAt,
      updatedAt: channel.updatedAt,
      role: 'owner',
      status: 'active',
      metadata: {
        channelId: channel.id,
        source: 'chat_owner',
      },
    },
  ];

  if (channel.channelKind !== 'direct_lane') {
    participants.push({
      id: buildChatOrchestratorParticipantId(channel.id),
      conversationId,
      agentId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
      joinedAt: channel.createdAt,
      updatedAt: channel.updatedAt,
      role: 'orchestrator',
      status: 'active',
      metadata: {
        channelId: channel.id,
        source: 'chat_orchestrator',
      },
    });
  }

  participants.push(
    ...assignments.map((assignment) => ({
      id: buildChatAssignedParticipantId(channel.id, assignment.participantId),
      conversationId,
      agentId: resolveChatParticipantAgentId(assignment),
      joinedAt: assignment.joinedAt,
      updatedAt: assignment.leftAt ?? channel.updatedAt,
      role: buildParticipantRole(assignment),
      status: mapAssignmentStatusToParticipantStatus(assignment),
      metadata: {
        channelId: channel.id,
        channelKind: channel.channelKind ?? null,
        sourceKind: assignment.sourceKind,
        sourceRefId: assignment.sourceRefId,
        roleHint: assignment.roleHint,
        roles: structuredClone(assignment.roles),
        executionTarget: structuredClone(assignment.execution.target),
      },
    })),
  );

  return participants;
}

export function createChatRootContainer(chat: ChatState): ContainerRecord {
  const earliestCreatedAt = [...chat.channels]
    .map((channel) => channel.createdAt)
    .sort((left, right) => left.localeCompare(right))[0]
    ?? chat.globalOrchestrator.updatedAt;
  const latestUpdatedAt = [...chat.channels]
    .map((channel) => channel.updatedAt)
    .sort((left, right) => right.localeCompare(left))[0]
    ?? chat.globalOrchestrator.updatedAt;

  return {
    id: CHAT_ROOT_CONTAINER_ID,
    kind: 'chat_root',
    title: 'Cats Chat',
    status: 'active',
    parentContainerId: null,
    createdAt: earliestCreatedAt,
    updatedAt: latestUpdatedAt,
    metadata: {
      channelIds: chat.channels.map((channel) => channel.id),
      conversationIds: chat.channels.map((channel) => resolveCanonicalConversationId(channel.id)),
      parallelGroupIds: chat.parallelChatGroups.map((group) => group.id),
    },
  };
}

export function createParallelGroupContainer(
  group: ParallelChatGroupState,
): ContainerRecord {
  return {
    id: buildChatParallelGroupContainerId(group.id),
    kind: 'parallel_group',
    title: group.title,
    status: group.status === 'archived' ? 'archived' : 'active',
    parentContainerId: CHAT_ROOT_CONTAINER_ID,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    metadata: {
      groupId: group.id,
      mode: group.mode,
      memberChannelIds: structuredClone(group.memberChannelIds),
      memberConversationIds: group.memberChannelIds.map((channelId) =>
        resolveCanonicalConversationId(channelId)),
      lastMessageAt: group.lastMessageAt,
    },
  };
}

export function createDirectLaneTransportBindings(
  chat: ChatState,
): TransportBindingRecord[] {
  return chat.channels
    .filter((channel) => channel.channelKind === 'direct_lane')
    .map((channel) => {
      const conversationId = resolveCanonicalConversationId(channel.id);
      const defaultRecipientId = channel.roomRouting?.defaultRecipientId ?? null;
      const recipientAssignment = (channel.participantAssignments ?? []).find((assignment) =>
        assignment.participantId === defaultRecipientId) ?? null;

      return {
        id: buildDirectLaneTransportBindingId(channel.id),
        platform: 'internal',
        direction: 'bidirectional',
        conversationId,
        participantId: defaultRecipientId
          ? buildChatAssignedParticipantId(channel.id, defaultRecipientId)
          : null,
        agentId: recipientAssignment ? resolveChatParticipantAgentId(recipientAssignment) : null,
        externalThreadKey: `channel:${channel.id}`,
        status: channel.status === 'archived' ? 'archived' : 'active',
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
        metadata: {
          channelId: channel.id,
          channelKind: channel.channelKind,
          roomMode: channel.roomRouting?.mode ?? null,
          defaultRecipientId,
          recoverableDirectLaneCatId: channel.recoverableDirectLaneCatId ?? null,
        },
      };
    });
}

export function createBotTransportBindings(
  botBindings: BotBindingRecord[],
): TransportBindingRecord[] {
  return botBindings.map((binding) => ({
    id: buildTelegramBotTransportBindingId(binding.id),
    platform: binding.platform === 'telegram' ? 'telegram' : 'web',
    direction: 'bidirectional',
    conversationId: null,
    participantId: null,
    agentId: binding.catActorId ?? binding.bossCatActorId ?? null,
    externalThreadKey: binding.botName ? `bot:${binding.botName}` : binding.id,
    status: binding.status === 'disabled' ? 'disabled' : 'active',
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
    metadata: {
      bindingId: binding.id,
      botName: binding.botName,
      inboundMode: binding.inboundMode,
      roomMode: binding.roomMode,
      orchestratorActorId: binding.orchestratorActorId,
    },
  }));
}

export function createConversationFromChannel(
  channel: ChatChannelState,
  containerId: string | null,
  participantActorIds: string[],
): CoreConversationRecord {
  return {
    id: resolveCanonicalConversationId(channel.id),
    title: channel.title,
    kind: resolveChatConversationKind(channel.channelKind),
    status: mapChannelStatusToConversationStatus(channel),
    containerId,
    participantActorIds: uniqueStrings(participantActorIds),
    sourceChannelId: channel.id,
    repoPath: channel.repoPath,
    responseLanguage: channel.responseLanguage,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    lastMessageAt: channel.lastMessageAt,
  };
}

export function createTaskFromChannel(
  channel: ChatChannelState,
  ownerActorId: string,
  conversationId: string,
  containerId: string | null,
  parallelGroupId: string | null,
  existingTask: CoreTaskRecord | null,
): CoreTaskRecord {
  const derivedStatus = mapChannelStatusToTaskStatus(channel);
  const approval: CoreApprovalRecord = existingTask?.approval ?? {
    status: 'not_requested',
    requestedAt: null,
    decidedAt: null,
    decidedByActorId: null,
    decisionAction: null,
    notes: null,
  };
  const status = derivedStatus === 'archived'
    ? derivedStatus
    : derivedStatus === 'in_progress'
      ? shouldPreserveActiveChannelTaskStatus(existingTask?.status)
        ? existingTask?.status ?? derivedStatus
        : derivedStatus
      : existingTask?.status ?? derivedStatus;

  return {
    id: buildChatTaskId(channel.id),
    title: channel.title,
    status,
    conversationId,
    ownerActorId,
    orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    assignedActorIds: (channel.participantAssignments ?? []).map((assignment) =>
      resolveChatParticipantAgentId(assignment)),
    summary: channel.topic,
    approval,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    metadata: buildChannelTaskMetadata(
      channel,
      containerId,
      parallelGroupId,
      existingTask,
      approval,
    ),
  };
}

export function createWorkItemFromChannel(
  channel: ChatChannelState,
  ownerActorId: string,
  conversationId: string,
  containerId: string | null,
  parallelGroupId: string | null,
  existingWorkItem: CoreWorkItemRecord | null,
): CoreWorkItemRecord {
  const derivedStatus = mapChannelStatusToWorkItemStatus(channel);
  const status = derivedStatus === 'archived'
    ? derivedStatus
    : derivedStatus === 'in_progress'
      ? shouldPreserveActiveChannelWorkItemStatus(existingWorkItem?.status)
        ? existingWorkItem?.status ?? derivedStatus
        : derivedStatus
      : existingWorkItem?.status ?? derivedStatus;

  return {
    id: buildChatWorkItemId(channel.id),
    title: channel.title,
    status,
    projectId: null,
    conversationId,
    taskId: buildChatTaskId(channel.id),
    parentWorkItemId: null,
    ownerActorId,
    assignedActorIds: (channel.participantAssignments ?? []).map((assignment) =>
      resolveChatParticipantAgentId(assignment)),
    summary: channel.topic,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    metadata: buildChannelWorkItemMetadata(
      channel,
      containerId,
      parallelGroupId,
      existingWorkItem,
    ),
  };
}

export function preserveCoreOwnedTasks(existingTasks: CoreTaskRecord[]): CoreTaskRecord[] {
  return existingTasks
    .filter((task) => !task.id.startsWith('task-channel-'))
    .map((task) => structuredClone(task));
}

export function preserveCoreOwnedWorkItems(
  existingWorkItems: CoreWorkItemRecord[],
): CoreWorkItemRecord[] {
  return existingWorkItems
    .filter((workItem) => !workItem.id.startsWith('work-item-chat-channel-'))
    .map((workItem) => structuredClone(workItem));
}

export function preserveCoreOwnedActors(existingActors: CoreActorRecord[]): CoreActorRecord[] {
  return existingActors
    .filter((actor) => actor.source === 'core_record')
    .map((actor) => structuredClone(actor));
}

export function preserveCoreOwnedConversations(
  existingConversations: CoreConversationRecord[],
): CoreConversationRecord[] {
  return existingConversations
    .filter(
      (conversation) =>
        !conversation.id.startsWith('conversation-channel-'),
    )
    .map((conversation) => structuredClone(conversation));
}

export function preserveCoreOwnedParticipants(
  existingParticipants: ParticipantRecord[],
): ParticipantRecord[] {
  return existingParticipants
    .filter((participant) => !participant.conversationId.startsWith('conversation-channel-'))
    .map((participant) => structuredClone(participant));
}

export function preserveCoreOwnedContainers(
  existingContainers: ContainerRecord[],
): ContainerRecord[] {
  return existingContainers
    .filter((container) =>
      container.id !== CHAT_ROOT_CONTAINER_ID
      && !container.id.startsWith('container-parallel-group-'))
    .map((container) => structuredClone(container));
}

export function preserveCoreOwnedTransportBindings(
  existingBindings: TransportBindingRecord[],
): TransportBindingRecord[] {
  return existingBindings
    .filter((binding) =>
      !binding.id.startsWith('transport-internal-direct-lane-')
      && !binding.id.startsWith('transport-telegram-bot-'))
    .map((binding) => structuredClone(binding));
}

export function preserveCoreOwnedArchives(
  existingArchives: ArchiveMetadataRecord[],
): ArchiveMetadataRecord[] {
  return existingArchives
    .filter(
      (archive) =>
        !archive.id.startsWith('archive-channel-'),
    )
    .map((archive) => structuredClone(archive));
}

export function createArchiveMetadata(
  channel: ChatChannelState,
  conversationId: string,
  existingArchive: ArchiveMetadataRecord | null,
): ArchiveMetadataRecord {
  return {
    id: buildChatArchiveId(channel.id),
    sourceConversationId: conversationId,
    sourceChannelId: channel.id,
    exportFormat: 'chat-channel-json',
    status: existingArchive?.status
      ?? (channel.messages.length > 0 || channel.status === 'archived'
        ? 'ready_for_archive'
        : 'not_ready'),
    lastExportedAt: existingArchive?.lastExportedAt ?? null,
    updatedAt: channel.updatedAt,
  };
}

export function syncBotBindings(
  chat: ChatState,
  existingBindings: BotBindingRecord[],
): BotBindingRecord[] {
  const preservedBindings = existingBindings.map((binding) => structuredClone(binding));
  const telegramBotName = chat.globalOrchestrator.telegramBotName?.trim();
  const bossCatActorId = chat.bossCatId
    ? createCatActorId(chat.bossCatId)
    : null;
  const chatCatsByActorId = new Map(
    chat.cats.map((cat) => [createCatActorId(cat.id), cat]),
  );
  const activeChatCatActorIds = new Set(
    chat.cats
      .filter((cat) =>
        cat.status === 'active'
        && hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() }))
      .map((cat) => createCatActorId(cat.id)),
  );
  const normalizedBindings = preservedBindings.map((binding) => {
    const linkedCatActorId = binding.catActorId ?? binding.bossCatActorId;
    if (!linkedCatActorId || activeChatCatActorIds.has(linkedCatActorId)) {
      return binding;
    }
    const linkedCat = chatCatsByActorId.get(linkedCatActorId) ?? null;
    return {
      ...binding,
      status: 'disabled' as const,
      updatedAt: linkedCat?.updatedAt ?? binding.updatedAt,
    };
  });

  if (!telegramBotName || !bossCatActorId) {
    return normalizedBindings;
  }

  const existingTelegram = normalizedBindings.find((binding) =>
    binding.platform === 'telegram' && binding.botName === telegramBotName,
  );
  const updatedAt = chat.globalOrchestrator.updatedAt;

  if (existingTelegram) {
    return normalizedBindings.map((binding) =>
      binding.id === existingTelegram.id
        ? {
            ...binding,
            catActorId: binding.catActorId ?? bossCatActorId,
            bossCatActorId,
            botToken: binding.botToken ?? null,
            webhookSecret: binding.webhookSecret ?? null,
            roomMode: binding.roomMode ?? 'boss_chat',
            updatedAt,
          }
        : binding,
    );
  }

  return [
    ...normalizedBindings,
    {
      id: 'bot-binding-telegram-global',
      platform: 'telegram',
      botName: telegramBotName,
      orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
      catActorId: bossCatActorId,
      bossCatActorId,
      botToken: null,
      webhookSecret: null,
      inboundMode: 'polling' as const,
      roomMode: 'boss_chat' as const,
      status: 'active' as const,
      createdAt: updatedAt,
      updatedAt,
    },
  ];
}
