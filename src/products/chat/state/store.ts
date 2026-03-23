import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ChannelCatAssignment,
  ExecutionTargetSummary,
  GlobalOrchestratorSummary,
  MemoryCheckpointSummary,
  ParticipantExecutionLease,
  ParticipantExecutionState,
  RoomRouteResolution,
  RoomRoutingCheckpoint,
  RoomRoutingDispatch,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingState,
  RoomWorkflowEvent,
  RoomWorkflowState,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
  RoomWakeRequest,
  ChatCapabilities,
  ChatChannelState,
  ChatMessage,
  ChatCat,
  ChatState,
} from '../../../shared/app-shell.js';
import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  CatsCoreState,
  CoreActivityRecord,
  CoreActorRecord,
  CoreApprovalBindingRecord,
  CoreArtifactRecord,
  CoreCheckpointRecord,
  CoreConversationRecord,
  CoreOrchestrationOutcomeRecord,
  CoreProjectRecord,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkItemRecord,
  DurableMemoryRecord,
  OwnerProfileRecord,
} from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
import {
  createDefaultChatState,
  createEmptyExecutionLease,
  createEmptyMemoryCheckpoint,
} from './defaults.js';
import {
  createDefaultRoomRoutingState,
  createDefaultRoomWorkflowState,
  DEFAULT_WAKE_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT,
  normalizeRoomRouteBlockedReason,
  normalizeRoomRouteDefaultTargetReason,
  normalizeRoomRouteResolutionMode,
  normalizeRoomRouteSelectionKind,
  normalizeRoomRoutingCheckpointKind,
  normalizeRoomRoutingDispatchStatus,
  normalizeRoomRoutingGuardReason,
  normalizeRoomRoutingMode,
  normalizeRoomRoutingTrigger,
  normalizeRoomRoutingTurnStatus,
  normalizeRoomWakeReason,
  normalizeRoomWakeRequestStatus,
  normalizeRoomWakeTrigger,
  normalizeRoomWorkflowEventKind,
  normalizeRoomWorkflowStatus,
  normalizeRoomWorkflowTargetStatus,
} from './roomRouting.js';
import {
  createDefaultCoreState,
  createCatActorId,
} from '../../../core/model.js';
import { syncCoreStateWithChatState } from './coreProjection.js';

export interface ChatStore extends CoreStore {
  read(): Promise<ChatState>;
  write(state: ChatState): Promise<ChatState>;
}

interface PersistedChatSnapshot extends CatsCoreState {
  chat: ChatState;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeMetadata(value: unknown): CoreRecordMetadata {
  return asRecord(value) ?? {};
}

function normalizeExecutionTarget(
  rawTarget: unknown,
  fallbackTarget: ExecutionTargetSummary,
): ExecutionTargetSummary {
  const targetRecord = asRecord(rawTarget);
  const provider =
    readString(targetRecord?.provider, fallbackTarget.provider).trim()
    || fallbackTarget.provider;

  return {
    provider,
    instance: readNullableString(targetRecord?.instance) ?? fallbackTarget.instance,
    model: readNullableString(targetRecord?.model) ?? fallbackTarget.model,
  };
}

function normalizeExecutionLease(
  rawLease: unknown,
  fallbackTarget: ExecutionTargetSummary,
): ParticipantExecutionLease {
  const defaultLease = createEmptyExecutionLease();
  const leaseRecord = asRecord(rawLease);
  const rawStatus = readString(leaseRecord?.status, defaultLease.status);
  const status = (
    rawStatus === 'ready'
    || rawStatus === 'initializing'
    || rawStatus === 'error'
    || rawStatus === 'closed'
    || rawStatus === 'removed'
    || rawStatus === 'not_started'
  )
    ? rawStatus
    : defaultLease.status;

  return {
    sessionId: readNullableString(leaseRecord?.sessionId),
    status,
    cwd: readNullableString(leaseRecord?.cwd),
    lastError: readNullableString(leaseRecord?.lastError),
    provider: readNullableString(leaseRecord?.provider) ?? fallbackTarget.provider,
    model: readNullableString(leaseRecord?.model) ?? fallbackTarget.model,
    startedAt: readNullableString(leaseRecord?.startedAt),
    lastUsedAt: readNullableString(leaseRecord?.lastUsedAt),
  };
}

function normalizeMemoryCheckpoint(rawMemory: unknown): MemoryCheckpointSummary {
  const memoryRecord = asRecord(rawMemory);

  return {
    summary: readNullableString(memoryRecord?.summary),
    facts: readStringArray(memoryRecord?.facts),
    openLoops: readStringArray(memoryRecord?.openLoops),
    updatedAt: readNullableString(memoryRecord?.updatedAt),
  };
}

function normalizeExecutionState(
  rawExecution: unknown,
  fallbackTarget: ExecutionTargetSummary,
): ParticipantExecutionState {
  const executionRecord = asRecord(rawExecution);
  const target = normalizeExecutionTarget(
    executionRecord?.target ?? rawExecution,
    fallbackTarget,
  );

  return {
    target,
    lease: normalizeExecutionLease(
      executionRecord?.lease ?? rawExecution,
      target,
    ),
  };
}

function normalizeMessage(rawMessage: unknown, channelId: string): ChatMessage {
  const messageRecord = asRecord(rawMessage);
  const usageRecord = asRecord(messageRecord?.usage);
  const rawSenderKind = readString(messageRecord?.senderKind, 'system');
  const senderKind = (
    rawSenderKind === 'user'
    || rawSenderKind === 'agent'
    || rawSenderKind === 'system'
    || rawSenderKind === 'orchestrator'
  )
    ? rawSenderKind
    : 'system';

  return {
    id: readString(messageRecord?.id, randomUUID()),
    channelId: readString(messageRecord?.channelId, channelId),
    senderKind,
    senderName: readString(messageRecord?.senderName, 'Chat'),
    body: readString(messageRecord?.body),
    mentions: readStringArray(messageRecord?.mentions),
    metadata: asRecord(messageRecord?.metadata) ?? {},
    usage: usageRecord
      ? {
          inputTokens: readNumber(usageRecord.inputTokens),
          outputTokens: readNumber(usageRecord.outputTokens),
          tokensUsed: readNumber(usageRecord.tokensUsed),
        }
      : null,
    createdAt: readString(messageRecord?.createdAt, new Date().toISOString()),
  };
}

function normalizeRoomRoutingParticipant(rawParticipant: unknown): RoomRoutingParticipantRef | null {
  const participantRecord = asRecord(rawParticipant);
  if (!participantRecord) {
    return null;
  }

  const rawKind = readString(participantRecord.participantKind);
  const participantKind = rawKind === 'cat' ? 'cat' : rawKind === 'orchestrator'
    ? 'orchestrator'
    : null;

  if (!participantKind) {
    return null;
  }

  const participantId = readString(participantRecord.participantId);
  const participantName = readString(participantRecord.participantName);
  if (!participantId || !participantName) {
    return null;
  }

  return {
    participantKind,
    participantId,
    participantName,
  };
}

function normalizeRoomRouteResolution(rawResolution: unknown): RoomRouteResolution {
  const resolutionRecord = asRecord(rawResolution);
  return {
    routingMode: normalizeRoomRouteResolutionMode(resolutionRecord?.routingMode, 'room_default'),
    selectionKind: normalizeRoomRouteSelectionKind(
      resolutionRecord?.selectionKind,
      'blocked',
    ),
    defaultTarget: resolutionRecord?.defaultTarget
      ? normalizeRoomRoutingParticipant(resolutionRecord.defaultTarget)
      : null,
    defaultTargetReason: normalizeRoomRouteDefaultTargetReason(
      resolutionRecord?.defaultTargetReason,
    ),
    fallbackTarget: resolutionRecord?.fallbackTarget
      ? normalizeRoomRoutingParticipant(resolutionRecord.fallbackTarget)
      : null,
    blockedReason: normalizeRoomRouteBlockedReason(resolutionRecord?.blockedReason),
    note: readNullableString(resolutionRecord?.note),
  };
}

function normalizeRoomWakeRequest(rawWakeRequest: unknown): RoomWakeRequest | null {
  const wakeRequestRecord = asRecord(rawWakeRequest);
  if (!wakeRequestRecord) {
    return null;
  }

  const participant = normalizeRoomRoutingParticipant(wakeRequestRecord.participant);
  if (!participant) {
    return null;
  }

  return {
    id: readString(wakeRequestRecord.id, randomUUID()),
    participant,
    trigger: normalizeRoomWakeTrigger(wakeRequestRecord.trigger, 'route_target'),
    reason: normalizeRoomWakeReason(wakeRequestRecord.reason, 'room_default'),
    sourceMessageId: readNullableString(wakeRequestRecord.sourceMessageId),
    status: normalizeRoomWakeRequestStatus(wakeRequestRecord.status, 'completed'),
    createdAt: readString(wakeRequestRecord.createdAt, new Date().toISOString()),
    completedAt: readNullableString(wakeRequestRecord.completedAt),
    error: readNullableString(wakeRequestRecord.error),
  };
}

function normalizeRoomRoutingDispatch(rawDispatch: unknown): RoomRoutingDispatch | null {
  const dispatchRecord = asRecord(rawDispatch);
  if (!dispatchRecord) {
    return null;
  }

  const target = normalizeRoomRoutingParticipant(dispatchRecord.target);
  if (!target) {
    return null;
  }

  return {
    id: readString(dispatchRecord.id, randomUUID()),
    sourceMessageId: readString(dispatchRecord.sourceMessageId),
    source: normalizeRoomRoutingParticipant(dispatchRecord.source),
    target,
    trigger: normalizeRoomRoutingTrigger(dispatchRecord.trigger, 'continuation_mention'),
    status: normalizeRoomRoutingDispatchStatus(dispatchRecord.status, 'completed'),
    mentionNames: readStringArray(dispatchRecord.mentionNames),
    responseMessageId: readNullableString(dispatchRecord.responseMessageId),
    startedAt: readString(dispatchRecord.startedAt, new Date().toISOString()),
    completedAt: readNullableString(dispatchRecord.completedAt),
    error: readNullableString(dispatchRecord.error),
  };
}

function normalizeRoomRoutingCheckpoint(rawCheckpoint: unknown): RoomRoutingCheckpoint | null {
  const checkpointRecord = asRecord(rawCheckpoint);
  if (!checkpointRecord) {
    return null;
  }

  return {
    id: readString(checkpointRecord.id, randomUUID()),
    kind: normalizeRoomRoutingCheckpointKind(checkpointRecord.kind, 'turn_started'),
    message: readString(checkpointRecord.message),
    actor: normalizeRoomRoutingParticipant(checkpointRecord.actor),
    sourceMessageId: readNullableString(checkpointRecord.sourceMessageId),
    targets: Array.isArray(checkpointRecord.targets)
      ? checkpointRecord.targets
          .map((target) => normalizeRoomRoutingParticipant(target))
          .filter((target): target is RoomRoutingParticipantRef => target !== null)
      : [],
    createdAt: readString(checkpointRecord.createdAt, new Date().toISOString()),
  };
}

function normalizeRoomRoutingOutcome(rawOutcome: unknown): RoomRoutingOutcome | null {
  const outcomeRecord = asRecord(rawOutcome);
  if (!outcomeRecord) {
    return null;
  }
  const rawSourceSenderKind = readString(outcomeRecord.sourceSenderKind, 'system');
  const sourceSenderKind = (
    rawSourceSenderKind === 'user'
    || rawSourceSenderKind === 'agent'
    || rawSourceSenderKind === 'orchestrator'
    || rawSourceSenderKind === 'system'
  )
    ? rawSourceSenderKind
    : 'system';

  return {
    turnId: readString(outcomeRecord.turnId, randomUUID()),
    mode: normalizeRoomRoutingMode(outcomeRecord.mode, 'boss_chat'),
    sourceMessageId: readString(outcomeRecord.sourceMessageId),
    sourceSenderKind: sourceSenderKind as ChatMessage['senderKind'],
    sourceSenderName: readString(outcomeRecord.sourceSenderName, 'Chat'),
    status: normalizeRoomRoutingTurnStatus(outcomeRecord.status, 'idle'),
    resolution: normalizeRoomRouteResolution(outcomeRecord.resolution),
    resolvedTargets: Array.isArray(outcomeRecord.resolvedTargets)
      ? outcomeRecord.resolvedTargets
          .map((target) => normalizeRoomRoutingParticipant(target))
          .filter((target): target is RoomRoutingParticipantRef => target !== null)
      : [],
    unresolvedMentions: readStringArray(outcomeRecord.unresolvedMentions),
    dispatches: Array.isArray(outcomeRecord.dispatches)
      ? outcomeRecord.dispatches
          .map((dispatch) => normalizeRoomRoutingDispatch(dispatch))
          .filter((dispatch): dispatch is RoomRoutingDispatch => dispatch !== null)
      : [],
    checkpoints: Array.isArray(outcomeRecord.checkpoints)
      ? outcomeRecord.checkpoints
          .map((checkpoint) => normalizeRoomRoutingCheckpoint(checkpoint))
          .filter((checkpoint): checkpoint is RoomRoutingCheckpoint => checkpoint !== null)
      : [],
    continuationCount: readNumber(outcomeRecord.continuationCount),
    totalDispatchCount: readNumber(outcomeRecord.totalDispatchCount),
    guard: normalizeRoomRoutingGuardReason(outcomeRecord.guard),
    startedAt: readString(outcomeRecord.startedAt, new Date().toISOString()),
    completedAt: readNullableString(outcomeRecord.completedAt),
  };
}

function normalizeRoomWorkflowTarget(rawTarget: unknown): RoomWorkflowTargetState | null {
  const targetRecord = asRecord(rawTarget);
  if (!targetRecord) {
    return null;
  }

  const participant = normalizeRoomRoutingParticipant(targetRecord.participant);
  if (!participant) {
    return null;
  }

  return {
    id: readString(targetRecord.id, randomUUID()),
    dispatchId: readNullableString(targetRecord.dispatchId),
    participant,
    source: normalizeRoomRoutingParticipant(targetRecord.source),
    sourceMessageId: readString(targetRecord.sourceMessageId),
    trigger: normalizeRoomRoutingTrigger(targetRecord.trigger, 'continuation_mention'),
    mentionNames: readStringArray(targetRecord.mentionNames),
    depth: readNumber(targetRecord.depth),
    wakeRequestId: readNullableString(targetRecord.wakeRequestId),
    status: normalizeRoomWorkflowTargetStatus(targetRecord.status, 'pending'),
    queuedAt: readString(targetRecord.queuedAt, new Date().toISOString()),
    startedAt: readNullableString(targetRecord.startedAt),
    completedAt: readNullableString(targetRecord.completedAt),
    responseMessageId: readNullableString(targetRecord.responseMessageId),
    error: readNullableString(targetRecord.error),
  };
}

function normalizeRoomWorkflowEvent(rawEvent: unknown): RoomWorkflowEvent | null {
  const eventRecord = asRecord(rawEvent);
  if (!eventRecord) {
    return null;
  }

  return {
    id: readString(eventRecord.id, randomUUID()),
    turnId: readString(eventRecord.turnId),
    kind: normalizeRoomWorkflowEventKind(eventRecord.kind, 'turn_started'),
    status: normalizeRoomWorkflowStatus(eventRecord.status, 'running'),
    message: readString(eventRecord.message),
    actor: normalizeRoomRoutingParticipant(eventRecord.actor),
    sourceMessageId: readNullableString(eventRecord.sourceMessageId),
    targets: Array.isArray(eventRecord.targets)
      ? eventRecord.targets
          .map((target) => normalizeRoomRoutingParticipant(target))
          .filter((target): target is RoomRoutingParticipantRef => target !== null)
      : [],
    dispatchId: readNullableString(eventRecord.dispatchId),
    checkpointId: readNullableString(eventRecord.checkpointId),
    outcomeId: readNullableString(eventRecord.outcomeId),
    createdAt: readString(eventRecord.createdAt, new Date().toISOString()),
    metadata: asRecord(eventRecord.metadata) ?? {},
  };
}

function normalizeRoomWorkflowTurn(rawTurn: unknown): RoomWorkflowTurn | null {
  const turnRecord = asRecord(rawTurn);
  if (!turnRecord) {
    return null;
  }

  const rawSourceSenderKind = readString(turnRecord.sourceSenderKind, 'system');
  const sourceSenderKind = (
    rawSourceSenderKind === 'user'
    || rawSourceSenderKind === 'agent'
    || rawSourceSenderKind === 'orchestrator'
    || rawSourceSenderKind === 'system'
  )
    ? rawSourceSenderKind
    : 'system';

  return {
    id: readString(turnRecord.id, randomUUID()),
    status: normalizeRoomWorkflowStatus(turnRecord.status, 'idle'),
    sourceMessageId: readString(turnRecord.sourceMessageId),
    sourceSenderKind: sourceSenderKind as ChatMessage['senderKind'],
    sourceSenderName: readString(turnRecord.sourceSenderName, 'Chat'),
    guard: normalizeRoomRoutingGuardReason(turnRecord.guard),
    continuationCount: readNumber(turnRecord.continuationCount),
    dispatchCount: readNumber(turnRecord.dispatchCount),
    targetStatuses: Array.isArray(turnRecord.targetStatuses)
      ? turnRecord.targetStatuses
          .map((target) => normalizeRoomWorkflowTarget(target))
          .filter((target): target is RoomWorkflowTargetState => target !== null)
      : [],
    events: Array.isArray(turnRecord.events)
      ? turnRecord.events
          .map((event) => normalizeRoomWorkflowEvent(event))
          .filter((event): event is RoomWorkflowEvent => event !== null)
      : [],
    startedAt: readString(turnRecord.startedAt, new Date().toISOString()),
    updatedAt: readString(
      turnRecord.updatedAt,
      readString(turnRecord.startedAt, new Date().toISOString()),
    ),
    completedAt: readNullableString(turnRecord.completedAt),
  };
}

function normalizeRoomWorkflow(rawWorkflow: unknown): RoomWorkflowState {
  const workflowRecord = asRecord(rawWorkflow);
  const fallback = createDefaultRoomWorkflowState();

  return {
    activeTurn: normalizeRoomWorkflowTurn(workflowRecord?.activeTurn),
    turnHistory: Array.isArray(workflowRecord?.turnHistory)
      ? workflowRecord.turnHistory
          .map((turn) => normalizeRoomWorkflowTurn(turn))
          .filter((turn): turn is RoomWorkflowTurn => turn !== null)
          .slice(0, DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT)
      : fallback.turnHistory,
    eventHistory: Array.isArray(workflowRecord?.eventHistory)
      ? workflowRecord.eventHistory
          .map((event) => normalizeRoomWorkflowEvent(event))
          .filter((event): event is RoomWorkflowEvent => event !== null)
          .slice(0, DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT)
      : fallback.eventHistory,
    lastCheckpointEvent: normalizeRoomWorkflowEvent(workflowRecord?.lastCheckpointEvent),
    lastOutcomeEvent: normalizeRoomWorkflowEvent(workflowRecord?.lastOutcomeEvent),
  };
}

function normalizeRoomRouting(rawRoomRouting: unknown): RoomRoutingState {
  const roomRoutingRecord = asRecord(rawRoomRouting);
  const fallback = createDefaultRoomRoutingState();

  return {
    mode: normalizeRoomRoutingMode(roomRoutingRecord?.mode, fallback.mode),
    leadParticipantId: readNullableString(roomRoutingRecord?.leadParticipantId),
    maxContinuations: readNumber(
      roomRoutingRecord?.maxContinuations,
      fallback.maxContinuations,
    ),
    maxDispatchesPerTurn: readNumber(
      roomRoutingRecord?.maxDispatchesPerTurn,
      fallback.maxDispatchesPerTurn,
    ),
    maxTargetVisitsPerTurn: readNumber(
      roomRoutingRecord?.maxTargetVisitsPerTurn,
      fallback.maxTargetVisitsPerTurn,
    ),
    lastOutcome: normalizeRoomRoutingOutcome(roomRoutingRecord?.lastOutcome),
    lastCheckpoint: normalizeRoomRoutingCheckpoint(roomRoutingRecord?.lastCheckpoint),
    lastWakeRequest: normalizeRoomWakeRequest(roomRoutingRecord?.lastWakeRequest),
    wakeHistory: Array.isArray(roomRoutingRecord?.wakeHistory)
      ? roomRoutingRecord.wakeHistory
          .map((wakeRequest) => normalizeRoomWakeRequest(wakeRequest))
          .filter((wakeRequest): wakeRequest is RoomWakeRequest => wakeRequest !== null)
          .slice(0, DEFAULT_WAKE_HISTORY_LIMIT)
      : fallback.wakeHistory,
    workflow: normalizeRoomWorkflow(roomRoutingRecord?.workflow),
  };
}

function normalizeChatCat(rawCat: unknown): ChatCat | null {
  const catRecord = asRecord(rawCat);
  if (!catRecord) {
    return null;
  }

  const defaultExecutionTarget = normalizeExecutionTarget(
    catRecord.defaultExecutionTarget,
    { provider: 'claude', instance: null, model: null },
  );
  const rawStatus = readString(catRecord.status, 'active');

  return {
    id: readString(catRecord.id, randomUUID()),
    name: readString(catRecord.name, 'Cat'),
    roles: readStringArray(catRecord.roles),
    skillProfile: readNullableString(catRecord.skillProfile),
    mcpProfile: readNullableString(catRecord.mcpProfile),
    status: rawStatus === 'archived' ? 'archived' : 'active',
    createdAt: readString(catRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(catRecord.updatedAt, new Date().toISOString()),
    archivedAt: readNullableString(catRecord.archivedAt),
    avatarColor: readNullableString(catRecord.avatarColor),
    defaultExecutionTarget,
    memory: asRecord(catRecord.memory)
      ? normalizeMemoryCheckpoint(catRecord.memory)
      : createEmptyMemoryCheckpoint(),
  };
}

function normalizeChannelAssignment(
  rawAssignment: unknown,
  fallbackCat: ChatCat,
): ChannelCatAssignment | null {
  const assignmentRecord = asRecord(rawAssignment);
  if (!assignmentRecord) {
    return null;
  }

  const rawStatus = readString(assignmentRecord.status, 'active');
  const execution = normalizeExecutionState(
    assignmentRecord.execution,
    fallbackCat.defaultExecutionTarget,
  );

  return {
    catId: readString(assignmentRecord.catId, fallbackCat.id),
    status: rawStatus === 'removed' ? 'removed' : 'active',
    roles: readStringArray(assignmentRecord.roles),
    joinedAt: readString(assignmentRecord.joinedAt, new Date().toISOString()),
    leftAt: readNullableString(assignmentRecord.leftAt),
    execution,
  };
}

function normalizeChannel(
  rawChannel: unknown,
  catsById: Map<string, ChatCat>,
): ChatChannelState | null {
  const channelRecord = asRecord(rawChannel);
  if (!channelRecord) {
    return null;
  }

  const rawStatus = readString(channelRecord.status, 'planned');
  const status = (
    rawStatus === 'planned'
    || rawStatus === 'configured'
    || rawStatus === 'active'
    || rawStatus === 'watching'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'planned';
  const rawFormationMode = readString(channelRecord.formationMode, 'manual');
  const formationMode = rawFormationMode === 'orchestrator_suggested'
    ? 'orchestrator_suggested'
    : 'manual';
  const channelId = readString(channelRecord.id, randomUUID());

  const catAssignments = Array.isArray(channelRecord.catAssignments)
    ? channelRecord.catAssignments
        .map((assignment) => {
          const assignmentRecord = asRecord(assignment);
          const catId = readString(assignmentRecord?.catId, '');
          const fallbackCat = catId && catsById.has(catId)
            ? catsById.get(catId) ?? null
            : null;
          return fallbackCat ? normalizeChannelAssignment(assignmentRecord, fallbackCat) : null;
        })
        .filter((assignment): assignment is ChannelCatAssignment => assignment !== null)
      : [];
  const messages = Array.isArray(channelRecord.messages)
    ? channelRecord.messages.map((message) => normalizeMessage(message, channelId))
    : [];

  return {
    id: channelId,
    title: readString(channelRecord.title, 'Untitled chat'),
    topic: readString(channelRecord.topic, 'This chat is still taking shape.'),
    status,
    unreadCount: readNumber(channelRecord.unreadCount),
    repoPath: readNullableString(channelRecord.repoPath),
    chatCwd: readNullableString(channelRecord.chatCwd),
    language: readNullableString(channelRecord.language),
    responseLanguage: readString(channelRecord.responseLanguage, 'en'),
    formationMode,
    skillProfile: readNullableString(channelRecord.skillProfile) ?? 'chat-default',
    mcpProfile: readNullableString(channelRecord.mcpProfile) ?? 'chat-memory',
    orchestratorRoles: readStringArray(channelRecord.orchestratorRoles),
    createdAt: readString(channelRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(channelRecord.updatedAt, new Date().toISOString()),
    lastMessageAt: readNullableString(channelRecord.lastMessageAt),
    lastActivatedAt: readNullableString(channelRecord.lastActivatedAt),
    orchestratorLease: normalizeExecutionLease(
      channelRecord.orchestratorLease,
      { provider: 'claude', instance: null, model: null },
    ),
    catAssignments,
    messages,
    roomRouting: normalizeRoomRouting(channelRecord.roomRouting),
  };
}

function normalizeCapabilities(rawCapabilities: unknown): ChatCapabilities {
  const fallback = createDefaultChatState().capabilities;
  const capabilitiesRecord = asRecord(rawCapabilities);

  return {
    multiChannel: true,
    persistence:
      capabilitiesRecord?.persistence === 'file-backed' ? 'file-backed' : fallback.persistence,
    mentions: capabilitiesRecord?.mentions === 'basic' ? 'basic' : fallback.mentions,
    splitView:
      capabilitiesRecord?.splitView === 'planned' ? 'planned' : fallback.splitView,
    transcriptExport: true,
    participantManagement:
      capabilitiesRecord?.participantManagement === 'basic'
        ? 'basic'
        : fallback.participantManagement,
    runtimeSessions: true,
  };
}

function normalizeGlobalOrchestrator(rawOrchestrator: unknown): GlobalOrchestratorSummary {
  const fallback = createDefaultChatState().globalOrchestrator;
  const orchestratorRecord = asRecord(rawOrchestrator);
  const executionTarget = normalizeExecutionTarget(
    orchestratorRecord?.executionTarget,
    fallback.executionTarget,
  );

  return {
    mode: 'global',
    status: readString(orchestratorRecord?.status, fallback.status) === 'ready' ? 'ready' : 'warming',
    nextFocus: readString(orchestratorRecord?.nextFocus, fallback.nextFocus),
    entrypoints: readStringArray(orchestratorRecord?.entrypoints).length > 0
      ? readStringArray(orchestratorRecord?.entrypoints)
      : fallback.entrypoints,
    referenceProjects: readStringArray(orchestratorRecord?.referenceProjects).length > 0
      ? readStringArray(orchestratorRecord?.referenceProjects)
      : fallback.referenceProjects,
    notes: readStringArray(orchestratorRecord?.notes).length > 0
      ? readStringArray(orchestratorRecord?.notes)
      : fallback.notes,
    executionTarget,
    systemPrompt: readString(orchestratorRecord?.systemPrompt, fallback.systemPrompt),
    skillProfile: readNullableString(orchestratorRecord?.skillProfile) ?? fallback.skillProfile,
    mcpProfile: readNullableString(orchestratorRecord?.mcpProfile) ?? fallback.mcpProfile,
    memory: asRecord(orchestratorRecord?.memory)
      ? normalizeMemoryCheckpoint(orchestratorRecord?.memory)
      : fallback.memory,
    telegramBotName: readNullableString(orchestratorRecord?.telegramBotName),
    updatedAt: readString(orchestratorRecord?.updatedAt, new Date().toISOString()),
  };
}

function normalizeOwnerProfile(rawOwnerProfile: unknown): OwnerProfileRecord {
  const fallback = createDefaultCoreState().ownerProfile;
  const ownerProfileRecord = asRecord(rawOwnerProfile);

  return {
    actorId: readString(ownerProfileRecord?.actorId, fallback.actorId),
    displayName: readString(ownerProfileRecord?.displayName, fallback.displayName),
    avatarColor: readNullableString(ownerProfileRecord?.avatarColor),
    summary: readNullableString(ownerProfileRecord?.summary),
    communicationPreferences: readStringArray(ownerProfileRecord?.communicationPreferences),
    decisionPreferences: readStringArray(ownerProfileRecord?.decisionPreferences),
    escalationPreferences: readStringArray(ownerProfileRecord?.escalationPreferences),
    updatedAt: readString(ownerProfileRecord?.updatedAt, fallback.updatedAt),
  };
}

function normalizeCoreActor(rawActor: unknown): CoreActorRecord | null {
  const actorRecord = asRecord(rawActor);
  if (!actorRecord) {
    return null;
  }

  const rawKind = readString(actorRecord.kind, 'worker');
  const kind = (
    rawKind === 'owner'
    || rawKind === 'orchestrator'
    || rawKind === 'worker'
    || rawKind === 'stakeholder'
    || rawKind === 'bot'
    || rawKind === 'resource'
  )
    ? rawKind
    : 'worker';
  const rawStatus = readString(actorRecord.status, 'active');
  const status = rawStatus === 'archived' ? 'archived' : 'active';
  const rawSource = readString(actorRecord.source, 'core_record');
  const source = (
    rawSource === 'owner_profile'
    || rawSource === 'global_orchestrator'
    || rawSource === 'chat_cat'
    || rawSource === 'core_record'
  )
    ? rawSource
    : 'core_record';

  return {
    id: readString(actorRecord.id, randomUUID()),
    name: readString(actorRecord.name, 'Actor'),
    kind,
    status,
    roles: readStringArray(actorRecord.roles),
    skillProfile: readNullableString(actorRecord.skillProfile),
    mcpProfile: readNullableString(actorRecord.mcpProfile),
    defaultExecutionTarget: actorRecord.defaultExecutionTarget === null
      ? null
      : asRecord(actorRecord.defaultExecutionTarget)
        ? normalizeExecutionTarget(actorRecord.defaultExecutionTarget, {
            provider: 'claude',
            instance: null,
            model: null,
          })
        : null,
    memory: asRecord(actorRecord.memory)
      ? normalizeMemoryCheckpoint(actorRecord.memory)
      : createEmptyMemoryCheckpoint(),
    source,
    sourceId: readNullableString(actorRecord.sourceId),
    createdAt: readString(actorRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(actorRecord.updatedAt, new Date().toISOString()),
    archivedAt: readNullableString(actorRecord.archivedAt),
  };
}

function normalizeCoreConversation(rawConversation: unknown): CoreConversationRecord | null {
  const conversationRecord = asRecord(rawConversation);
  if (!conversationRecord) {
    return null;
  }

  const rawKind = readString(conversationRecord.kind, 'work_thread');
  const kind = (
    rawKind === 'chat_channel'
    || rawKind === 'direct_message'
    || rawKind === 'external_transport'
    || rawKind === 'private_escalation'
    || rawKind === 'work_thread'
    || rawKind === 'code_thread'
  )
    ? rawKind
    : 'work_thread';
  const rawStatus = readString(conversationRecord.status, 'planned');
  const status = (
    rawStatus === 'planned'
    || rawStatus === 'active'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'planned';

  return {
    id: readString(conversationRecord.id, randomUUID()),
    title: readString(conversationRecord.title, 'Untitled conversation'),
    kind,
    status,
    participantActorIds: readStringArray(conversationRecord.participantActorIds),
    sourceChannelId: readNullableString(conversationRecord.sourceChannelId),
    repoPath: readNullableString(conversationRecord.repoPath),
    responseLanguage: readString(conversationRecord.responseLanguage, 'en'),
    createdAt: readString(conversationRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(conversationRecord.updatedAt, new Date().toISOString()),
    lastMessageAt: readNullableString(conversationRecord.lastMessageAt),
  };
}

function normalizeCoreProject(rawProject: unknown): CoreProjectRecord | null {
  const projectRecord = asRecord(rawProject);
  if (!projectRecord) {
    return null;
  }

  const rawStatus = readString(projectRecord.status, 'planned');
  const status = (
    rawStatus === 'planned'
    || rawStatus === 'active'
    || rawStatus === 'paused'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'planned';

  return {
    id: readString(projectRecord.id, randomUUID()),
    title: readString(projectRecord.title, 'Untitled project'),
    status,
    ownerActorId: readString(projectRecord.ownerActorId),
    summary: readNullableString(projectRecord.summary),
    repoPath: readNullableString(projectRecord.repoPath),
    primaryConversationId: readNullableString(projectRecord.primaryConversationId),
    createdAt: readString(projectRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(projectRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(projectRecord.metadata),
  };
}

function normalizeCoreWorkItem(rawWorkItem: unknown): CoreWorkItemRecord | null {
  const workItemRecord = asRecord(rawWorkItem);
  if (!workItemRecord) {
    return null;
  }

  const rawStatus = readString(workItemRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'planned'
    || rawStatus === 'ready'
    || rawStatus === 'in_progress'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';

  return {
    id: readString(workItemRecord.id, randomUUID()),
    title: readString(workItemRecord.title, 'Untitled work item'),
    status,
    projectId: readNullableString(workItemRecord.projectId),
    conversationId: readNullableString(workItemRecord.conversationId),
    taskId: readNullableString(workItemRecord.taskId),
    parentWorkItemId: readNullableString(workItemRecord.parentWorkItemId),
    ownerActorId: readString(workItemRecord.ownerActorId),
    assignedActorIds: readStringArray(workItemRecord.assignedActorIds),
    summary: readNullableString(workItemRecord.summary),
    createdAt: readString(workItemRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(workItemRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(workItemRecord.metadata),
  };
}

function normalizeCoreTask(rawTask: unknown): CoreTaskRecord | null {
  const taskRecord = asRecord(rawTask);
  if (!taskRecord) {
    return null;
  }

  const approvalRecord = asRecord(taskRecord.approval);
  const rawStatus = readString(taskRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'pending_approval'
    || rawStatus === 'approved'
    || rawStatus === 'in_progress'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';
  const rawApprovalStatus = readString(approvalRecord?.status, 'not_requested');
  const approvalStatus = (
    rawApprovalStatus === 'not_requested'
    || rawApprovalStatus === 'pending'
    || rawApprovalStatus === 'approved'
    || rawApprovalStatus === 'rejected'
  )
    ? rawApprovalStatus
    : 'not_requested';

  return {
    id: readString(taskRecord.id, randomUUID()),
    title: readString(taskRecord.title, 'Untitled task'),
    status,
    conversationId: readNullableString(taskRecord.conversationId),
    ownerActorId: readString(taskRecord.ownerActorId),
    orchestratorActorId: readNullableString(taskRecord.orchestratorActorId),
    assignedActorIds: readStringArray(taskRecord.assignedActorIds),
    summary: readNullableString(taskRecord.summary),
    approval: {
      status: approvalStatus,
      requestedAt: readNullableString(approvalRecord?.requestedAt),
      decidedAt: readNullableString(approvalRecord?.decidedAt),
      decidedByActorId: readNullableString(approvalRecord?.decidedByActorId),
      notes: readNullableString(approvalRecord?.notes),
    },
    createdAt: readString(taskRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(taskRecord.updatedAt, new Date().toISOString()),
  };
}

function normalizeCoreRun(rawRun: unknown): CoreRunRecord | null {
  const runRecord = asRecord(rawRun);
  if (!runRecord) {
    return null;
  }

  const rawStatus = readString(runRecord.status, 'queued');
  const status = (
    rawStatus === 'queued'
    || rawStatus === 'running'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'queued';

  return {
    id: readString(runRecord.id, randomUUID()),
    title: readString(runRecord.title, 'Untitled run'),
    status,
    conversationId: readNullableString(runRecord.conversationId),
    taskId: readNullableString(runRecord.taskId),
    parentRunId: readNullableString(runRecord.parentRunId),
    orchestratorActorId: readNullableString(runRecord.orchestratorActorId),
    traceId: readNullableString(runRecord.traceId),
    summary: readNullableString(runRecord.summary),
    createdAt: readString(runRecord.createdAt, new Date().toISOString()),
    startedAt: readNullableString(runRecord.startedAt),
    completedAt: readNullableString(runRecord.completedAt),
    updatedAt: readString(runRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(runRecord.metadata),
  };
}

function normalizeCoreTrace(rawTrace: unknown): CoreTraceRecord | null {
  const traceRecord = asRecord(rawTrace);
  if (!traceRecord) {
    return null;
  }

  const rawKind = readString(traceRecord.kind, 'note');
  const kind = (
    rawKind === 'note'
    || rawKind === 'status'
    || rawKind === 'dispatch'
    || rawKind === 'approval'
    || rawKind === 'checkpoint'
    || rawKind === 'outcome'
    || rawKind === 'error'
  )
    ? rawKind
    : 'note';

  return {
    id: readString(traceRecord.id, randomUUID()),
    traceId: readString(traceRecord.traceId),
    kind,
    conversationId: readNullableString(traceRecord.conversationId),
    runId: readNullableString(traceRecord.runId),
    taskId: readNullableString(traceRecord.taskId),
    actorId: readNullableString(traceRecord.actorId),
    message: readString(traceRecord.message),
    createdAt: readString(traceRecord.createdAt, new Date().toISOString()),
    metadata: normalizeMetadata(traceRecord.metadata),
  };
}

function normalizeCoreCheckpoint(rawCheckpoint: unknown): CoreCheckpointRecord | null {
  const checkpointRecord = asRecord(rawCheckpoint);
  if (!checkpointRecord) {
    return null;
  }

  const rawStatus = readString(checkpointRecord.status, 'open');
  const status = (
    rawStatus === 'open'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'open';

  return {
    id: readString(checkpointRecord.id, randomUUID()),
    label: readString(checkpointRecord.label, 'Checkpoint'),
    status,
    conversationId: readNullableString(checkpointRecord.conversationId),
    runId: readNullableString(checkpointRecord.runId),
    taskId: readNullableString(checkpointRecord.taskId),
    sourceTraceId: readNullableString(checkpointRecord.sourceTraceId),
    summary: readNullableString(checkpointRecord.summary),
    createdAt: readString(checkpointRecord.createdAt, new Date().toISOString()),
    completedAt: readNullableString(checkpointRecord.completedAt),
    updatedAt: readString(checkpointRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(checkpointRecord.metadata),
  };
}

function normalizeCoreOutcome(rawOutcome: unknown): CoreOrchestrationOutcomeRecord | null {
  const outcomeRecord = asRecord(rawOutcome);
  if (!outcomeRecord) {
    return null;
  }

  const rawStatus = readString(outcomeRecord.status, 'succeeded');
  const status = (
    rawStatus === 'succeeded'
    || rawStatus === 'blocked'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'succeeded';

  return {
    id: readString(outcomeRecord.id, randomUUID()),
    title: readString(outcomeRecord.title, 'Outcome'),
    status,
    conversationId: readNullableString(outcomeRecord.conversationId),
    runId: readNullableString(outcomeRecord.runId),
    taskId: readNullableString(outcomeRecord.taskId),
    summary: readNullableString(outcomeRecord.summary),
    recordedAt: readString(outcomeRecord.recordedAt, new Date().toISOString()),
    updatedAt: readString(outcomeRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(outcomeRecord.metadata),
  };
}

function normalizeCoreArtifact(rawArtifact: unknown): CoreArtifactRecord | null {
  const artifactRecord = asRecord(rawArtifact);
  if (!artifactRecord) {
    return null;
  }

  const rawKind = readString(artifactRecord.kind, 'document');
  const kind = (
    rawKind === 'document'
    || rawKind === 'report'
    || rawKind === 'build'
    || rawKind === 'preview'
    || rawKind === 'attachment'
    || rawKind === 'transcript_export'
    || rawKind === 'dataset'
  )
    ? rawKind
    : 'document';
  const rawStatus = readString(artifactRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'ready'
    || rawStatus === 'published'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';

  return {
    id: readString(artifactRecord.id, randomUUID()),
    title: readString(artifactRecord.title, 'Untitled artifact'),
    kind,
    status,
    projectId: readNullableString(artifactRecord.projectId),
    workItemId: readNullableString(artifactRecord.workItemId),
    conversationId: readNullableString(artifactRecord.conversationId),
    taskId: readNullableString(artifactRecord.taskId),
    runId: readNullableString(artifactRecord.runId),
    path: readNullableString(artifactRecord.path),
    mimeType: readNullableString(artifactRecord.mimeType),
    sizeBytes: typeof artifactRecord.sizeBytes === 'number'
      && Number.isFinite(artifactRecord.sizeBytes)
      ? artifactRecord.sizeBytes
      : null,
    summary: readNullableString(artifactRecord.summary),
    createdAt: readString(artifactRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(artifactRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(artifactRecord.metadata),
  };
}

function normalizeCoreActivity(rawActivity: unknown): CoreActivityRecord | null {
  const activityRecord = asRecord(rawActivity);
  if (!activityRecord) {
    return null;
  }

  const rawKind = readString(activityRecord.kind, 'note');
  const kind = (
    rawKind === 'note'
    || rawKind === 'status_change'
    || rawKind === 'approval_requested'
    || rawKind === 'approval_decided'
    || rawKind === 'artifact_recorded'
    || rawKind === 'checkpoint_recorded'
    || rawKind === 'work_item_updated'
  )
    ? rawKind
    : 'note';

  return {
    id: readString(activityRecord.id, randomUUID()),
    kind,
    actorId: readNullableString(activityRecord.actorId),
    projectId: readNullableString(activityRecord.projectId),
    workItemId: readNullableString(activityRecord.workItemId),
    conversationId: readNullableString(activityRecord.conversationId),
    taskId: readNullableString(activityRecord.taskId),
    runId: readNullableString(activityRecord.runId),
    artifactId: readNullableString(activityRecord.artifactId),
    message: readString(activityRecord.message),
    createdAt: readString(activityRecord.createdAt, new Date().toISOString()),
    metadata: normalizeMetadata(activityRecord.metadata),
  };
}

function normalizeCoreApprovalBinding(
  rawApprovalBinding: unknown,
): CoreApprovalBindingRecord | null {
  const approvalBindingRecord = asRecord(rawApprovalBinding);
  if (!approvalBindingRecord) {
    return null;
  }

  const rawKind = readString(approvalBindingRecord.kind, 'owner_decision');
  const kind = (
    rawKind === 'owner_decision'
    || rawKind === 'review_gate'
    || rawKind === 'release_gate'
  )
    ? rawKind
    : 'owner_decision';
  const rawSubjectKind = readString(approvalBindingRecord.subjectKind, 'task');
  const subjectKind = (
    rawSubjectKind === 'project'
    || rawSubjectKind === 'work_item'
    || rawSubjectKind === 'task'
    || rawSubjectKind === 'run'
    || rawSubjectKind === 'artifact'
    || rawSubjectKind === 'conversation'
  )
    ? rawSubjectKind
    : 'task';

  return {
    id: readString(approvalBindingRecord.id, randomUUID()),
    kind,
    approvalTaskId: readString(approvalBindingRecord.approvalTaskId),
    subjectKind,
    subjectId: readString(approvalBindingRecord.subjectId),
    projectId: readNullableString(approvalBindingRecord.projectId),
    workItemId: readNullableString(approvalBindingRecord.workItemId),
    conversationId: readNullableString(approvalBindingRecord.conversationId),
    requestedByActorId: readNullableString(approvalBindingRecord.requestedByActorId),
    requestedForActorId: readString(approvalBindingRecord.requestedForActorId),
    createdAt: readString(approvalBindingRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(approvalBindingRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(approvalBindingRecord.metadata),
  };
}

function normalizeBotBinding(
  rawBinding: unknown,
  chat: ChatState,
): BotBindingRecord | null {
  const bindingRecord = asRecord(rawBinding);
  if (!bindingRecord) {
    return null;
  }

  const platform = readString(bindingRecord.platform);
  if (platform !== 'telegram' && platform !== 'line') {
    return null;
  }

  const rawStatus = readString(bindingRecord.status, 'active');

  const rawRoomMode = readString(bindingRecord.roomMode ?? bindingRecord.defaultRoomMode, 'boss_chat');
  const roomMode: BotBindingRecord['roomMode'] =
    rawRoomMode === 'direct_cat_chat' ? 'direct_cat_chat' : 'boss_chat';

  const rawInboundMode = readString(bindingRecord.inboundMode);
  const inboundMode: BotBindingRecord['inboundMode'] =
    rawInboundMode === 'polling' || rawInboundMode === 'webhook'
      ? rawInboundMode
      : readNullableString(bindingRecord.webhookSecret) ? 'webhook' : 'polling';

  return {
    id: readString(bindingRecord.id, randomUUID()),
    platform,
    botName: readString(bindingRecord.botName),
    orchestratorActorId: readString(bindingRecord.orchestratorActorId),
    catActorId:
      readNullableString(bindingRecord.catActorId)
      ?? readNullableString(bindingRecord.boundCatActorId)
      ?? (chat.bossCatId ? createCatActorId(chat.bossCatId) : null),
    bossCatActorId:
      readNullableString(bindingRecord.bossCatActorId)
      ?? (chat.bossCatId ? createCatActorId(chat.bossCatId) : null),
    botToken: readNullableString(bindingRecord.botToken),
    webhookSecret: readNullableString(bindingRecord.webhookSecret),
    inboundMode,
    roomMode,
    status: rawStatus === 'disabled' ? 'disabled' : 'active',
    createdAt: readString(bindingRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(bindingRecord.updatedAt, new Date().toISOString()),
  };
}

function normalizeArchiveMetadata(rawArchive: unknown): ArchiveMetadataRecord | null {
  const archiveRecord = asRecord(rawArchive);
  if (!archiveRecord) {
    return null;
  }

  const rawStatus = readString(archiveRecord.status, 'not_ready');
  const status = (
    rawStatus === 'not_ready'
    || rawStatus === 'ready_for_archive'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'not_ready';

  return {
    id: readString(archiveRecord.id, randomUUID()),
    sourceConversationId: readString(archiveRecord.sourceConversationId),
    sourceChannelId: readNullableString(archiveRecord.sourceChannelId),
    exportFormat: 'chat-channel-json',
    status,
    lastExportedAt: readNullableString(archiveRecord.lastExportedAt),
    updatedAt: readString(archiveRecord.updatedAt, new Date().toISOString()),
  };
}

function normalizeDurableMemoryRecord(rawRecord: unknown): DurableMemoryRecord | null {
  const record = asRecord(rawRecord);
  if (!record) {
    return null;
  }

  const rawSubjectType = readString(record.subjectType);
  if (
    rawSubjectType !== 'cat'
    && rawSubjectType !== 'owner'
    && rawSubjectType !== 'relationship'
    && rawSubjectType !== 'project'
  ) {
    return null;
  }

  const rawCategory = readString(record.category);
  if (
    rawCategory !== 'preference'
    && rawCategory !== 'fact'
    && rawCategory !== 'policy'
    && rawCategory !== 'style'
    && rawCategory !== 'relationship'
    && rawCategory !== 'lesson'
  ) {
    return null;
  }

  return {
    id: readString(record.id, randomUUID()),
    subjectType: rawSubjectType,
    subjectId: readString(record.subjectId),
    category: rawCategory,
    content: readString(record.content),
    confidence: typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? record.confidence
      : null,
    sourceRefs: readStringArray(record.sourceRefs),
    createdAt: readString(record.createdAt, new Date().toISOString()),
    updatedAt: readString(record.updatedAt, new Date().toISOString()),
  };
}

function looksLikeChatState(rawState: Record<string, unknown>): boolean {
  return Array.isArray(rawState.cats)
    && Array.isArray(rawState.channels)
    && typeof rawState.selectedChannelId === 'string';
}

function normalizeChatState(rawState: unknown): ChatState {
  const fallback = createDefaultChatState();
  const stateRecord = asRecord(rawState);
  if (!stateRecord) {
    return fallback;
  }

  const normalizedCats = Array.isArray(stateRecord.cats)
    ? stateRecord.cats
        .map((cat) => normalizeChatCat(cat))
        .filter((cat): cat is ChatCat => cat !== null)
    : [];
  const catsById = new Map(normalizedCats.map((cat) => [cat.id, cat]));
  const normalizedChannels = Array.isArray(stateRecord.channels)
    ? stateRecord.channels
        .map((channel) => normalizeChannel(channel, catsById))
        .filter((channel): channel is ChatChannelState => channel !== null)
    : fallback.channels;
  const rawSelectedChannelId = readString(
    stateRecord.selectedChannelId,
    normalizedChannels[0]?.id ?? fallback.selectedChannelId,
  );

  return {
    id: readString(stateRecord.id, fallback.id),
    name: readString(stateRecord.name, fallback.name),
    selectedChannelId: normalizedChannels.some((channel) => channel.id === rawSelectedChannelId)
      ? rawSelectedChannelId
      : normalizedChannels[0]?.id ?? fallback.selectedChannelId,
    bossCatId: readNullableString(stateRecord.bossCatId),
    cats: Array.from(catsById.values()),
    channels: normalizedChannels.length > 0 ? normalizedChannels : fallback.channels,
    globalOrchestrator: normalizeGlobalOrchestrator(stateRecord.globalOrchestrator),
    capabilities: normalizeCapabilities(stateRecord.capabilities),
    showVerboseMessages: readBoolean(stateRecord.showVerboseMessages, false),
  };
}

function extractCoreState(snapshot: PersistedChatSnapshot): CatsCoreState {
  const { chat: _chat, ...core } = snapshot;
  return core;
}

function buildPersistedChatSnapshot(
  chat: ChatState,
  core: CatsCoreState,
): PersistedChatSnapshot {
  return {
    ...structuredClone(core),
    chat: structuredClone(chat),
  };
}

async function writePersistedChatSnapshot(
  filePath: string,
  snapshot: PersistedChatSnapshot,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
}

function normalizePersistedChatSnapshot(rawState: unknown): PersistedChatSnapshot {
  const fallback = createDefaultCoreState();
  const stateRecord = asRecord(rawState);
  if (!stateRecord) {
    const chat = createDefaultChatState();
    return buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat, fallback));
  }

  const chatRecord = asRecord(stateRecord.chat);
  if (!chatRecord) {
    if (looksLikeChatState(stateRecord)) {
      const chat = normalizeChatState(stateRecord);
      return buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat, fallback));
    }

    const chat = createDefaultChatState();
    return buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat, fallback));
  }

  const chat = normalizeChatState(chatRecord);
  const actors = Array.isArray(stateRecord.actors)
    ? stateRecord.actors
        .map((actor) => normalizeCoreActor(actor))
        .filter((actor): actor is CoreActorRecord => actor !== null)
    : [];
  const conversations = Array.isArray(stateRecord.conversations)
    ? stateRecord.conversations
        .map((conversation) => normalizeCoreConversation(conversation))
        .filter((conversation): conversation is CoreConversationRecord => conversation !== null)
    : [];
  const projects = Array.isArray(stateRecord.projects)
    ? stateRecord.projects
        .map((project) => normalizeCoreProject(project))
        .filter((project): project is CoreProjectRecord => project !== null)
    : [];
  const workItems = Array.isArray(stateRecord.workItems)
    ? stateRecord.workItems
        .map((workItem) => normalizeCoreWorkItem(workItem))
        .filter((workItem): workItem is CoreWorkItemRecord => workItem !== null)
    : [];

  const tasks = Array.isArray(stateRecord.tasks)
    ? stateRecord.tasks
        .map((task) => normalizeCoreTask(task))
        .filter((task): task is CoreTaskRecord => task !== null)
    : [];
  const runs = Array.isArray(stateRecord.runs)
    ? stateRecord.runs
        .map((run) => normalizeCoreRun(run))
        .filter((run): run is CoreRunRecord => run !== null)
    : [];
  const traces = Array.isArray(stateRecord.traces)
    ? stateRecord.traces
        .map((trace) => normalizeCoreTrace(trace))
        .filter((trace): trace is CoreTraceRecord => trace !== null)
    : [];
  const checkpoints = Array.isArray(stateRecord.checkpoints)
    ? stateRecord.checkpoints
        .map((checkpoint) => normalizeCoreCheckpoint(checkpoint))
        .filter((checkpoint): checkpoint is CoreCheckpointRecord => checkpoint !== null)
    : [];
  const outcomes = Array.isArray(stateRecord.outcomes)
    ? stateRecord.outcomes
        .map((outcome) => normalizeCoreOutcome(outcome))
        .filter((outcome): outcome is CoreOrchestrationOutcomeRecord => outcome !== null)
    : [];
  const artifacts = Array.isArray(stateRecord.artifacts)
    ? stateRecord.artifacts
        .map((artifact) => normalizeCoreArtifact(artifact))
        .filter((artifact): artifact is CoreArtifactRecord => artifact !== null)
    : [];
  const activities = Array.isArray(stateRecord.activities)
    ? stateRecord.activities
        .map((activity) => normalizeCoreActivity(activity))
        .filter((activity): activity is CoreActivityRecord => activity !== null)
    : [];
  const approvalBindings = Array.isArray(stateRecord.approvalBindings)
    ? stateRecord.approvalBindings
        .map((approvalBinding) => normalizeCoreApprovalBinding(approvalBinding))
        .filter(
          (approvalBinding): approvalBinding is CoreApprovalBindingRecord =>
            approvalBinding !== null,
        )
    : [];
  const botBindings = Array.isArray(stateRecord.botBindings)
    ? stateRecord.botBindings
        .map((binding) => normalizeBotBinding(binding, chat))
        .filter((binding): binding is BotBindingRecord => binding !== null)
    : [];
  const archives = Array.isArray(stateRecord.archives)
    ? stateRecord.archives
        .map((archive) => normalizeArchiveMetadata(archive))
        .filter((archive): archive is ArchiveMetadataRecord => archive !== null)
    : [];
  const durableMemory = Array.isArray(stateRecord.durableMemory)
    ? stateRecord.durableMemory
        .map((record) => normalizeDurableMemoryRecord(record))
        .filter((record): record is DurableMemoryRecord => record !== null)
    : [];
  const normalized = syncCoreStateWithChatState(chat, {
    setupCompleteAt: readNullableString(stateRecord.setupCompleteAt),
    ownerProfile: normalizeOwnerProfile(stateRecord.ownerProfile),
    actors,
    conversations,
    projects,
    workItems,
    tasks,
    runs,
    traces,
    checkpoints,
    outcomes,
    artifacts,
    activities,
    approvalBindings,
    botBindings,
    archives,
    durableMemory,
  });

  return buildPersistedChatSnapshot(chat, {
    ...normalized,
    setupCompleteAt: readNullableString(stateRecord.setupCompleteAt),
    updatedAt: readString(stateRecord.updatedAt, normalized.updatedAt),
    ownerProfile: {
      ...normalized.ownerProfile,
      updatedAt: readString(
        asRecord(stateRecord.ownerProfile)?.updatedAt,
        normalized.ownerProfile.updatedAt,
      ),
    },
  });
}

export class FileChatStore implements ChatStore {
  constructor(private readonly filePath: string) {}

  private async readPersistedSnapshot(): Promise<PersistedChatSnapshot> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return normalizePersistedChatSnapshot(JSON.parse(raw) as unknown);
    } catch {
      const chat = createDefaultChatState();
      const core = syncCoreStateWithChatState(chat, createDefaultCoreState());
      const snapshot = buildPersistedChatSnapshot(chat, core);
      await writePersistedChatSnapshot(this.filePath, snapshot);
      return snapshot;
    }
  }

  async read(): Promise<ChatState> {
    return structuredClone((await this.readPersistedSnapshot()).chat);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(extractCoreState(await this.readPersistedSnapshot()));
  }

  async write(state: ChatState): Promise<ChatState> {
    const nextChatState = structuredClone(state);
    const nextCore = syncCoreStateWithChatState(nextChatState, await this.readCore());
    await writePersistedChatSnapshot(
      this.filePath,
      buildPersistedChatSnapshot(nextChatState, nextCore),
    );
    return structuredClone(nextChatState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    const snapshot = await this.readPersistedSnapshot();
    const nextChatState = structuredClone(snapshot.chat);
    const nextCore = syncCoreStateWithChatState(nextChatState, structuredClone(state));
    await writePersistedChatSnapshot(
      this.filePath,
      buildPersistedChatSnapshot(nextChatState, nextCore),
    );
    return structuredClone(nextCore);
  }
}

export class MemoryChatStore implements ChatStore {
  private chatState: ChatState;
  private coreState: CatsCoreState;

  constructor(
    initialState: ChatState | CatsCoreState | PersistedChatSnapshot = createDefaultChatState(),
  ) {
    const snapshot = normalizePersistedChatSnapshot(initialState);
    this.chatState = snapshot.chat;
    this.coreState = extractCoreState(snapshot);
  }

  async read(): Promise<ChatState> {
    return structuredClone(this.chatState);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(this.coreState);
  }

  async write(state: ChatState): Promise<ChatState> {
    this.chatState = structuredClone(state);
    this.coreState = syncCoreStateWithChatState(this.chatState, this.coreState);
    return structuredClone(this.chatState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    this.coreState = syncCoreStateWithChatState(this.chatState, structuredClone(state));
    return structuredClone(this.coreState);
  }
}
