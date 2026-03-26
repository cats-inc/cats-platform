import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  CoreActorRecord,
  CoreApprovalRecord,
  CoreBudgetAlertLevel,
  CoreBudgetAlertSource,
  CoreConversationRecord,
  CoreConversationStatus,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
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
} from '../../../../core/actors.js';
import {
  buildWorkflowContinuationReplayRequest,
  readWorkflowContinuationReplay,
  writeWorkflowContinuationReplayMetadata,
} from '../../../../platform/orchestration/workflowContinuationReplay.js';
import type {
  ChatChannelState,
  ChatCat,
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
import { defaultCatProducts, hasSuiteSurface } from '../../../../shared/suiteSurfaces.js';

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

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

function readMetadataRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

function readMetadataString(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readMetadataBoolean(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): boolean {
  if (!metadata) {
    return false;
  }

  return metadata[key] === true;
}

function readMetadataStringArray(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): string[] {
  if (!metadata) {
    return [];
  }

  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readParticipantRef(value: unknown): RoomRoutingParticipantRef | null {
  const record = readMetadataRecord(value);
  if (!record) {
    return null;
  }

  const participantKind = record.participantKind === 'orchestrator' || record.participantKind === 'cat'
    ? record.participantKind
    : null;
  const participantId = readMetadataString(record, 'participantId');
  const participantName = readMetadataString(record, 'participantName');
  if (!participantKind || !participantId || !participantName) {
    return null;
  }

  return {
    participantKind,
    participantId,
    participantName,
  };
}

function readParticipantRefs(values: unknown[]): RoomRoutingParticipantRef[] {
  return values
    .map((value) => readParticipantRef(value))
    .filter((value): value is RoomRoutingParticipantRef => value !== null);
}

function findLatestContinuationReplayEvent(turn: RoomWorkflowTurn | null) {
  if (!turn || !isReplayableContinuationGuardReason(turn.guard)) {
    return null;
  }

  return [...turn.events].reverse().find((event) => {
    const metadata = readMetadataRecord(event.metadata);
    return (event.kind === 'checkpoint' || event.kind === 'guard_blocked')
      && (
        readMetadataString(metadata, 'checkpointKind') === 'loop_guard'
        || readMetadataString(metadata, 'checkpointKind') === 'anti_ping_pong'
      )
      && readMetadataString(metadata, 'reason') === turn.guard;
  }) ?? null;
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
  const checkpointId = event.checkpointId ?? null;
  const sourceMessageId = readMetadataString(metadata, 'continuationSourceMessageId')
    ?? event.sourceMessageId;
  const sourceParticipant = event.actor;
  const targets = readParticipantRefs(event.targets);
  const workflowShape = readMetadataString(metadata, 'workflowShape');
  if (
    !metadata
    || !checkpointId
    || !sourceMessageId
    || !sourceParticipant
    || targets.length === 0
    || (
      workflowShape !== 'sequential'
      && workflowShape !== 'parallel'
      && workflowShape !== 'converge'
    )
  ) {
    return null;
  }

  return buildWorkflowContinuationReplayRequest({
    channelId: channel.id,
    checkpointId,
    sourceMessageId,
    sourceParticipant,
    targets,
    mentionNames: readMetadataStringArray(metadata, 'mentionNames'),
    trigger: 'continuation_mention',
    branchStrategy: readMetadataString(metadata, 'branchStrategy') as
      | 'fork_if_possible'
      | 'transplant_context'
      | 'fresh_no_parent'
      | null,
    workflowStageId: readMetadataString(metadata, 'workflowStageId'),
    workflowShape: workflowShape as RoomWorkflowShape,
    reviewRequired: readMetadataBoolean(metadata, 'reviewRequired'),
    continuationSource: (() => {
      const source = readMetadataString(metadata, 'continuationSource');
      return source === 'explicit_mentions' || source === 'workflow_recommendation'
        ? source
        : null;
    })(),
    workflowRecommendation: readMetadataRecord(metadata.workflowRecommendation),
    unresolvedTargets: readMetadataStringArray(metadata, 'unresolvedTargets'),
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

  return writeWorkflowContinuationReplayMetadata(
    metadata,
    derivedReplay,
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
    conversationId: `conversation-channel-${channel.id}`,
    taskId: `task-channel-${channel.id}`,
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

export function createConversationFromChannel(
  channel: ChatChannelState,
  participantActorIds: string[],
): CoreConversationRecord {
  return {
    id: `conversation-channel-${channel.id}`,
    title: channel.title,
    kind: 'chat_channel',
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
    id: `task-channel-${channel.id}`,
    title: channel.title,
    status,
    conversationId,
    ownerActorId,
    orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    assignedActorIds: channel.catAssignments.map((assignment) => `actor-cat-${assignment.catId}`),
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
    id: `archive-channel-${channel.id}`,
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
        && hasSuiteSurface(cat.products, 'chat', { fallback: defaultCatProducts() }))
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
