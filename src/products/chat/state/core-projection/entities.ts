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
import {
  isReplayableContinuationGuardReason,
} from '../room-routing/continuationReplay.js';
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
  buildChatConversationId,
  buildChatOrchestratorParticipantId,
  buildChatOwnerParticipantId,
  buildChatParallelGroupContainerId,
  buildChatTaskId,
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

function latestWorkflowTurn(channel: ChatChannelState): RoomWorkflowTurn | null {
  const workflow = channel.roomRouting?.workflow;
  return workflow?.activeTurn ?? workflow?.turnHistory[0] ?? null;
}

function readLatestContinuationMetadata(
  turn: RoomWorkflowTurn | null,
  options: {
    excludeEventId?: string | null;
  } = {},
): CoreRecordMetadata | null {
  if (!turn) {
    return null;
  }

  for (const event of [...turn.events].reverse()) {
    if (options.excludeEventId && event.id === options.excludeEventId) {
      continue;
    }

    const metadata = readMetadataRecord(event.metadata);
    if (!metadata) {
      continue;
    }

    if (
      readMetadataString(metadata, 'continuationSource') !== null
      || readMetadataRecord(metadata.workflowRecommendation) !== null
      || readMetadataStringArray(metadata, 'unresolvedTargets').length > 0
      || readMetadataStringArray(metadata, 'mentionNames').length > 0
      || readMetadataString(metadata, 'branchStrategy') !== null
    ) {
      return metadata;
    }
  }

  return null;
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
  sourceParticipant: RoomRoutingParticipantRef;
  sourceMessageId: string;
  targets: RoomRoutingParticipantRef[];
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
  if (interruptedTargetStates.length === 0) {
    return null;
  }

  const sourceParticipant = interruptedTargetStates[0]?.source ?? null;
  const sourceMessageId = interruptedTargetStates[0]?.sourceMessageId?.trim() ?? '';
  if (!sourceParticipant || sourceMessageId.length === 0) {
    return null;
  }

  const trigger = interruptedTargetStates[0]?.trigger ?? 'continuation_mention';
  const branchStrategy = interruptedTargetStates[0]?.branchStrategy ?? null;
  for (const target of interruptedTargetStates) {
    if (
      !target.source
      || !sameParticipantRef(target.source, sourceParticipant)
      || target.sourceMessageId !== sourceMessageId
      || target.trigger !== trigger
      || target.branchStrategy !== branchStrategy
    ) {
      return null;
    }
  }

  const continuationMetadata = readLatestContinuationMetadata(turn, {
    excludeEventId: event.id,
  });
  const continuationSource = readMetadataString(continuationMetadata, 'continuationSource');

  return {
    sourceParticipant,
    sourceMessageId,
    targets: interruptedTargetStates.map((target) => structuredClone(target.participant)),
    mentionNames: uniqueStrings(
      interruptedTargetStates.flatMap((target) => [...target.mentionNames]),
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
  const sourceParticipant = startupRecoveryReplay?.sourceParticipant ?? event.actor;
  const targets = startupRecoveryReplay?.targets ?? readParticipantRefs(event.targets);
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
    || !sourceParticipant
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

function buildChannelTaskMetadata(
  channel: ChatChannelState,
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
    conversationId: buildChatConversationId(channel.id),
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
  const conversationId = buildChatConversationId(channel.id);
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
      conversationIds: chat.channels.map((channel) => buildChatConversationId(channel.id)),
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
        buildChatConversationId(channelId)),
      lastMessageAt: group.lastMessageAt,
    },
  };
}

export function createConversationFromChannel(
  channel: ChatChannelState,
  participantActorIds: string[],
): CoreConversationRecord {
  return {
    id: buildChatConversationId(channel.id),
    title: channel.title,
    kind: resolveChatConversationKind(channel.channelKind),
    status: mapChannelStatusToConversationStatus(channel),
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
    metadata: buildChannelTaskMetadata(channel, existingTask, approval),
  };
}

export function preserveCoreOwnedTasks(existingTasks: CoreTaskRecord[]): CoreTaskRecord[] {
  return existingTasks
    .filter((task) => !task.id.startsWith('task-channel-'))
    .map((task) => structuredClone(task));
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
        conversation.sourceChannelId === null
        && !conversation.id.startsWith('conversation-channel-'),
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

export function preserveCoreOwnedArchives(
  existingArchives: ArchiveMetadataRecord[],
): ArchiveMetadataRecord[] {
  return existingArchives
    .filter(
      (archive) =>
        archive.sourceChannelId === null && !archive.id.startsWith('archive-channel-'),
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
    ...preservedBindings,
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
