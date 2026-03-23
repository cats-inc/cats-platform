import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  CatsCoreState,
  CoreActivityKind,
  CoreActivityRecord,
  CoreActorRecord,
  CoreApprovalRecord,
  CoreBudgetAlertLevel,
  CoreBudgetAlertSource,
  CoreCheckpointRecord,
  CoreCheckpointStatus,
  CoreConversationRecord,
  CoreConversationStatus,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
  CoreOrchestrationOutcomeRecord,
  CoreRecordMetadata,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreTraceKind,
  CoreTraceRecord,
  CoreRunRecord,
  OwnerProfileRecord,
} from '../../../core/types.js';
import { CATS_CORE_STATE_VERSION } from '../../../core/types.js';
import {
  createDefaultCoreState,
  createDefaultOwnerProfile,
  createEmptyMemoryCheckpoint,
  createCatActorId,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
} from '../../../core/model.js';
import {
  buildCoreGovernanceSummary,
  buildCoreWorkflowSummary,
  buildRuntimeDeliveryManifestSummary,
} from '../../../core/governance.js';
import type {
  ChatChannelState,
  ChatCat,
  ChatState,
  RoomRoutingParticipantRef,
  RoomWorkflowEvent,
  RoomWorkflowTurn,
} from '../../../shared/app-shell.js';

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

function latestWorkflowTurn(channel: ChatChannelState): RoomWorkflowTurn | null {
  const workflow = channel.roomRouting?.workflow;
  return workflow?.activeTurn ?? workflow?.turnHistory[0] ?? null;
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

  return {
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
  };
}

function createOwnerActor(ownerProfile: OwnerProfileRecord): CoreActorRecord {
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

function createOrchestratorActor(chat: ChatState): CoreActorRecord {
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

function createCatActor(cat: ChatCat, bossCatId: string | null): CoreActorRecord {
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

function createConversationFromChannel(
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

function createTaskFromChannel(
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
  const status = derivedStatus === 'in_progress' || derivedStatus === 'archived'
    ? derivedStatus
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

function preserveCoreOwnedTasks(existingTasks: CoreTaskRecord[]): CoreTaskRecord[] {
  return existingTasks
    .filter((task) => !task.id.startsWith('task-channel-'))
    .map((task) => structuredClone(task));
}

function preserveCoreOwnedRuns(existingRuns: CoreRunRecord[]): CoreRunRecord[] {
  return existingRuns
    .filter((run) => !run.id.startsWith('run-room-routing-'))
    .map((run) => structuredClone(run));
}

function preserveCoreOwnedTraces(existingTraces: CoreTraceRecord[]): CoreTraceRecord[] {
  return existingTraces
    .filter((trace) => !trace.id.startsWith('trace-room-routing-'))
    .map((trace) => structuredClone(trace));
}

function preserveCoreOwnedCheckpoints(
  existingCheckpoints: CoreCheckpointRecord[],
): CoreCheckpointRecord[] {
  return existingCheckpoints
    .filter((checkpoint) => !checkpoint.id.startsWith('checkpoint-room-routing-'))
    .map((checkpoint) => structuredClone(checkpoint));
}

function preserveCoreOwnedOutcomes(
  existingOutcomes: CoreOrchestrationOutcomeRecord[],
): CoreOrchestrationOutcomeRecord[] {
  return existingOutcomes
    .filter((outcome) => !outcome.id.startsWith('outcome-room-routing-'))
    .map((outcome) => structuredClone(outcome));
}

function preserveCoreOwnedActivities(
  existingActivities: CoreActivityRecord[],
): CoreActivityRecord[] {
  return existingActivities
    .filter((activity) => !activity.id.startsWith('activity-room-routing-'))
    .map((activity) => structuredClone(activity));
}

function actorIdForParticipant(
  participant: RoomRoutingParticipantRef | null,
): string | null {
  if (!participant) {
    return null;
  }

  return participant.participantKind === 'orchestrator'
    ? GLOBAL_ORCHESTRATOR_ACTOR_ID
    : createCatActorId(participant.participantId);
}

function collectWorkflowTurns(channel: ChatChannelState): RoomWorkflowTurn[] {
  const workflow = channel.roomRouting?.workflow;
  if (!workflow) {
    return [];
  }

  return [
    ...(workflow.activeTurn ? [structuredClone(workflow.activeTurn)] : []),
    ...workflow.turnHistory.map((turn) => structuredClone(turn)),
  ];
}

function toCoreRunStatus(status: RoomWorkflowTurn['status']): CoreRunRecord['status'] {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'queued';
    case 'idle':
    default:
      return 'queued';
  }
}

function toCoreTraceKind(event: RoomWorkflowEvent): CoreTraceKind {
  if (event.kind === 'checkpoint') {
    return event.metadata.approvalRequired || event.metadata.approvalStatus
      ? 'approval'
      : 'checkpoint';
  }
  if (event.kind === 'outcome') {
    return 'outcome';
  }
  if (event.kind === 'target_failed' || event.kind === 'guard_blocked') {
    return 'error';
  }
  if (event.kind === 'turn_started' || event.kind === 'fan_out') {
    return 'status';
  }
  return 'dispatch';
}

function toCoreCheckpointStatus(event: RoomWorkflowEvent): CoreCheckpointStatus {
  const metadataStatus = event.metadata.checkpointStatus;
  if (
    metadataStatus === 'open'
    || metadataStatus === 'completed'
    || metadataStatus === 'cancelled'
  ) {
    return metadataStatus;
  }

  return event.status === 'completed' ? 'completed' : 'open';
}

function toCoreOutcomeStatus(
  status: RoomWorkflowTurn['status'],
): CoreOrchestrationOutcomeRecord['status'] {
  // Core projections follow the room-workflow vocabulary (`failed`) rather
  // than the legacy explicit-routing outcome vocabulary (`error`).
  switch (status) {
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    default:
      return 'blocked';
  }
}

function createWorkflowRun(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
): CoreRunRecord {
  const traceId = `trace-room-routing-${turn.id}`;
  const summary = turn.events[turn.events.length - 1]?.message
    ?? `${channel.title} room workflow turn`;

  return {
    id: `run-room-routing-${channel.id}-${turn.id}`,
    title: `${channel.title} room turn`,
    status: toCoreRunStatus(turn.status),
    conversationId: `conversation-channel-${channel.id}`,
    taskId: `task-channel-${channel.id}`,
    parentRunId: null,
    orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    traceId,
    summary,
    createdAt: turn.startedAt,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    updatedAt: turn.updatedAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      guard: turn.guard,
      workflowStageId: turn.stageId,
      workflowShape: turn.workflowShape,
      workflowLastCheckpointId: turn.lastCheckpointId,
      workflowReviewRequired: turn.reviewRequired,
      workflowConvergeTargetId: turn.convergeTargetId,
      branchStates: structuredClone(turn.targetStatuses),
      continuationCount: turn.continuationCount,
      dispatchCount: turn.dispatchCount,
      targetCount: turn.targetStatuses.length,
      workflowSummary: buildCoreWorkflowSummary({
        runStatus: toCoreRunStatus(turn.status),
        stageId: turn.stageId,
        shape: turn.workflowShape,
        reviewRequired: turn.reviewRequired,
        lastCheckpointId: turn.lastCheckpointId,
        convergeTargetId: turn.convergeTargetId,
        continuationCount: turn.continuationCount,
        dispatchCount: turn.dispatchCount,
        targetCount: turn.targetStatuses.length,
        branchStates: turn.targetStatuses,
      }),
    },
  };
}

function createWorkflowTrace(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreTraceRecord {
  const runId = `run-room-routing-${channel.id}-${turn.id}`;
  return {
    id: `trace-room-routing-${event.id}`,
    traceId: `trace-room-routing-${turn.id}`,
    kind: toCoreTraceKind(event),
    conversationId: `conversation-channel-${channel.id}`,
    runId,
    taskId: `task-channel-${channel.id}`,
    actorId: actorIdForParticipant(event.actor),
    message: event.message,
    createdAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventKind: event.kind,
      eventStatus: event.status,
      targets: event.targets.map((target) => actorIdForParticipant(target)).filter(Boolean),
      ...structuredClone(event.metadata),
    },
  };
}

function createWorkflowCheckpoint(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreCheckpointRecord {
  const workflowStageId = typeof event.metadata.workflowStageId === 'string'
    ? event.metadata.workflowStageId
    : turn.stageId;
  const workflowShape = typeof event.metadata.workflowShape === 'string'
    ? event.metadata.workflowShape
    : turn.workflowShape;
  return {
    id: `checkpoint-room-routing-${event.checkpointId ?? event.id}`,
    label: `${channel.title} workflow checkpoint`,
    status: toCoreCheckpointStatus(event),
    conversationId: `conversation-channel-${channel.id}`,
    runId: `run-room-routing-${channel.id}-${turn.id}`,
    taskId: `task-channel-${channel.id}`,
    sourceTraceId: `trace-room-routing-${event.id}`,
    summary: event.message,
    createdAt: event.createdAt,
    completedAt: toCoreCheckpointStatus(event) === 'completed' ? event.createdAt : null,
    updatedAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventKind: event.kind,
      checkpointKind: event.metadata.checkpointKind ?? null,
      workflowStageId,
      workflowShape,
      workflowSummary: buildCoreWorkflowSummary({
        runStatus: toCoreRunStatus(turn.status),
        stageId: workflowStageId,
        shape: workflowShape,
        reviewRequired: turn.reviewRequired,
        lastCheckpointId: turn.lastCheckpointId,
        convergeTargetId: turn.convergeTargetId,
        continuationCount: turn.continuationCount,
        dispatchCount: turn.dispatchCount,
        targetCount: turn.targetStatuses.length,
        branchStates: turn.targetStatuses,
      }),
      ...structuredClone(event.metadata),
    },
  };
}

function createWorkflowOutcome(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreOrchestrationOutcomeRecord {
  return {
    id: `outcome-room-routing-${event.outcomeId ?? event.id}`,
    title: `${channel.title} room workflow outcome`,
    status: toCoreOutcomeStatus(turn.status),
    conversationId: `conversation-channel-${channel.id}`,
    runId: `run-room-routing-${channel.id}-${turn.id}`,
    taskId: `task-channel-${channel.id}`,
    summary: event.message,
    recordedAt: event.createdAt,
    updatedAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventStatus: event.status,
      guard: turn.guard,
      workflowStageId: turn.stageId,
      workflowShape: turn.workflowShape,
      workflowLastCheckpointId: turn.lastCheckpointId,
      branchStates: structuredClone(turn.targetStatuses),
      continuationCount: turn.continuationCount,
      dispatchCount: turn.dispatchCount,
      workflowSummary: buildCoreWorkflowSummary({
        runStatus: toCoreRunStatus(turn.status),
        stageId: turn.stageId,
        shape: turn.workflowShape,
        reviewRequired: turn.reviewRequired,
        lastCheckpointId: turn.lastCheckpointId,
        convergeTargetId: turn.convergeTargetId,
        continuationCount: turn.continuationCount,
        dispatchCount: turn.dispatchCount,
        targetCount: turn.targetStatuses.length,
        branchStates: turn.targetStatuses,
      }),
      ...structuredClone(event.metadata),
    },
  };
}

function toCoreActivityKind(event: RoomWorkflowEvent): CoreActivityKind {
  if (event.metadata.approvalRequired === true || event.metadata.approvalStatus === 'pending') {
    return 'approval_requested';
  }

  if (event.metadata.approvalStatus === 'approved' || event.metadata.approvalStatus === 'rejected') {
    return 'approval_decided';
  }

  if (event.kind === 'checkpoint' || event.kind === 'guard_blocked') {
    return 'checkpoint_recorded';
  }

  if (event.kind === 'turn_started' || event.kind === 'fan_out' || event.kind === 'outcome') {
    return 'status_change';
  }

  return 'work_item_updated';
}

function createWorkflowActivity(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): CoreActivityRecord {
  return {
    id: `activity-room-routing-${event.id}`,
    kind: toCoreActivityKind(event),
    actorId: actorIdForParticipant(event.actor),
    projectId: null,
    workItemId: null,
    conversationId: `conversation-channel-${channel.id}`,
    taskId: `task-channel-${channel.id}`,
    runId: `run-room-routing-${channel.id}-${turn.id}`,
    artifactId: null,
    message: event.message,
    createdAt: event.createdAt,
    metadata: {
      source: 'chat-room-workflow',
      channelId: channel.id,
      turnId: turn.id,
      eventKind: event.kind,
      eventStatus: event.status,
      workflowStageId: turn.stageId,
      workflowShape: turn.workflowShape,
      ...structuredClone(event.metadata),
    },
  };
}

function preserveCoreOwnedActors(existingActors: CoreActorRecord[]): CoreActorRecord[] {
  return existingActors
    .filter((actor) => actor.source === 'core_record')
    .map((actor) => structuredClone(actor));
}

function preserveCoreOwnedConversations(
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

function preserveCoreOwnedArchives(
  existingArchives: ArchiveMetadataRecord[],
): ArchiveMetadataRecord[] {
  return existingArchives
    .filter(
      (archive) =>
        archive.sourceChannelId === null && !archive.id.startsWith('archive-channel-'),
    )
    .map((archive) => structuredClone(archive));
}

function createArchiveMetadata(
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

function syncBotBindings(
  chat: ChatState,
  existingBindings: BotBindingRecord[],
): BotBindingRecord[] {
  const preservedBindings = existingBindings.map((binding) => structuredClone(binding));
  const telegramBotName = chat.globalOrchestrator.telegramBotName?.trim();
  const bossCatActorId = chat.bossCatId
    ? createCatActorId(chat.bossCatId)
    : null;

  if (!telegramBotName || !bossCatActorId) {
    return preservedBindings;
  }

  const existingTelegram = preservedBindings.find((binding) =>
    binding.platform === 'telegram' && binding.botName === telegramBotName,
  );
  const updatedAt = chat.globalOrchestrator.updatedAt;

  if (existingTelegram) {
    return preservedBindings.map((binding) =>
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

export function syncCoreStateWithChatState(
  chat: ChatState,
  existingCore: Partial<CatsCoreState> = createDefaultCoreState(),
): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = existingCore.ownerProfile ?? createDefaultOwnerProfile(updatedAt);
  const ownerActor = createOwnerActor(ownerProfile);
  const orchestratorActor = createOrchestratorActor(chat);
  const catActors = chat.cats.map((cat) => createCatActor(cat, chat.bossCatId));
  const preservedActors = preserveCoreOwnedActors(existingCore.actors ?? []);
  const existingTasks = new Map((existingCore.tasks ?? []).map((task) => [task.id, task]));
  const existingArchives = new Map((existingCore.archives ?? []).map((archive) => [archive.id, archive]));
  const preservedConversations = preserveCoreOwnedConversations(
    existingCore.conversations ?? [],
  );
  const conversations = chat.channels.map((channel) =>
    createConversationFromChannel(
      channel,
      [
        ownerProfile.actorId,
        GLOBAL_ORCHESTRATOR_ACTOR_ID,
        ...channel.catAssignments.map((assignment) => `actor-cat-${assignment.catId}`),
      ],
    ),
  );
  const tasks = chat.channels.map((channel) =>
    createTaskFromChannel(
      channel,
      ownerProfile.actorId,
      `conversation-channel-${channel.id}`,
      existingTasks.get(`task-channel-${channel.id}`) ?? null,
    ),
  );
  const preservedTasks = preserveCoreOwnedTasks(existingCore.tasks ?? []);
  const preservedRuns = preserveCoreOwnedRuns(existingCore.runs ?? []);
  const preservedTraces = preserveCoreOwnedTraces(existingCore.traces ?? []);
  const preservedCheckpoints = preserveCoreOwnedCheckpoints(existingCore.checkpoints ?? []);
  const preservedOutcomes = preserveCoreOwnedOutcomes(existingCore.outcomes ?? []);
  const preservedActivities = preserveCoreOwnedActivities(existingCore.activities ?? []);
  const preservedArchives = preserveCoreOwnedArchives(existingCore.archives ?? []);
  const archives = chat.channels.map((channel) =>
    createArchiveMetadata(
      channel,
      `conversation-channel-${channel.id}`,
      existingArchives.get(`archive-channel-${channel.id}`) ?? null,
    ),
  );
  const workflowTurns = chat.channels.flatMap((channel) =>
    collectWorkflowTurns(channel).map((turn) => ({ channel, turn })),
  );
  const workflowRuns = workflowTurns.map(({ channel, turn }) =>
    createWorkflowRun(channel, turn),
  );
  const workflowTraces = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowTrace(channel, turn, event)),
  );
  const workflowCheckpoints = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'checkpoint')
      .map((event) => createWorkflowCheckpoint(channel, turn, event)),
  );
  const workflowOutcomes = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'outcome')
      .map((event) => createWorkflowOutcome(channel, turn, event)),
  );
  const workflowActivities = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowActivity(channel, turn, event)),
  );

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: existingCore.setupCompleteAt ?? null,
    ownerProfile: {
      ...ownerProfile,
      updatedAt: ownerProfile.updatedAt || updatedAt,
    },
    actors: [ownerActor, orchestratorActor, ...catActors, ...preservedActors],
    conversations: [...conversations, ...preservedConversations],
    projects: structuredClone(existingCore.projects ?? []),
    workItems: structuredClone(existingCore.workItems ?? []),
    tasks: [...tasks, ...preservedTasks],
    runs: [...workflowRuns, ...preservedRuns],
    traces: [...workflowTraces, ...preservedTraces],
    checkpoints: [...workflowCheckpoints, ...preservedCheckpoints],
    outcomes: [...workflowOutcomes, ...preservedOutcomes],
    artifacts: structuredClone(existingCore.artifacts ?? []),
    activities: [...workflowActivities, ...preservedActivities],
    approvalBindings: structuredClone(existingCore.approvalBindings ?? []),
    botBindings: syncBotBindings(chat, existingCore.botBindings ?? []),
    archives: [...archives, ...preservedArchives],
    durableMemory: structuredClone(existingCore.durableMemory ?? []),
  };
}
