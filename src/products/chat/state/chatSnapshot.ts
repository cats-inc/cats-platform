import { randomUUID } from 'node:crypto';

import type {
  ChannelCatAssignment,
  GlobalOrchestratorSummary,
  ParticipantExecutionLease,
  ParticipantExecutionState,
  ChatCapabilities,
  ChatChannelState,
  ChatMessage,
  ChatCat,
  ChatState,
} from '../api/contracts.js';
import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
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
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
} from '../../../core/types.js';
import {
  createDefaultChatState,
  createEmptyExecutionLease,
  createEmptyMemoryCheckpoint,
} from './defaults.js';
import {
  extractChatMessageChoicesFromBody,
  normalizeChatMessageChoiceResponse,
} from '../shared/messageChoices.js';
import type { PersistedChatSnapshot } from './coreSnapshot.js';
import {
  buildPersistedChatSnapshot,
  normalizeArchiveMetadata,
  normalizeBotBinding,
  normalizeCoreActivity,
  normalizeCoreActor,
  normalizeCoreApprovalBinding,
  normalizeCoreArtifact,
  normalizeCoreCheckpoint,
  normalizeCoreConversation,
  normalizeCoreOutcome,
  normalizeCoreProject,
  normalizeCoreRun,
  normalizeCoreTask,
  normalizeCoreTrace,
  normalizeCoreWorkItem,
  normalizeDurableMemoryRecord,
  normalizeOwnerProfile,
} from './coreSnapshot.js';
import { normalizeRoomRouting } from './roomRoutingSnapshot.js';
import { createDefaultCoreState } from '../../../core/model.js';
import { syncCoreStateWithChatState } from './coreProjection.js';

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
  const normalizedChoiceResponse = normalizeChatMessageChoiceResponse(messageRecord?.choiceResponse);
  const senderKind = (
    rawSenderKind === 'user'
    || rawSenderKind === 'agent'
    || rawSenderKind === 'system'
    || rawSenderKind === 'orchestrator'
  )
    ? rawSenderKind
    : 'system';
  const normalizedBody = readString(messageRecord?.body);
  const extractedChoices = extractChatMessageChoicesFromBody(
    normalizedBody,
    messageRecord?.choices,
  );

  return {
    id: readString(messageRecord?.id, randomUUID()),
    channelId: readString(messageRecord?.channelId, channelId),
    senderKind,
    senderName: readString(messageRecord?.senderName, 'Chat'),
    body: extractedChoices.body,
    ...(extractedChoices.choices ? { choices: extractedChoices.choices } : {}),
    ...(normalizedChoiceResponse ? { choiceResponse: normalizedChoiceResponse } : {}),
    mentions: readStringArray(messageRecord?.mentions),
    metadata: asRecord(messageRecord?.metadata) ?? {},
    usage: usageRecord
      ? {
          inputTokens: readNumber(usageRecord.inputTokens),
          outputTokens: readNumber(usageRecord.outputTokens),
          tokensUsed: readNumber(usageRecord.tokensUsed),
        }
      : null,
    executionProvider: readNullableString(messageRecord?.executionProvider),
    executionModel: readNullableString(messageRecord?.executionModel),
    executionInstance: readNullableString(messageRecord?.executionInstance),
    createdAt: readString(messageRecord?.createdAt, new Date().toISOString()),
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
  const roomRouting = normalizeRoomRouting(channelRecord.roomRouting);
  const inferredComposerMode = channelRecord.composerMode === 'cat_led'
    ? 'cat_led'
    : channelRecord.composerMode === 'solo'
      ? 'solo'
      : roomRouting.mode === 'direct_cat_chat'
          || catAssignments.some((assignment) => assignment.status === 'active')
          || Boolean(roomRouting.leadParticipantId)
        ? 'cat_led'
        : 'solo';

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
    composerMode: inferredComposerMode,
    pendingProvider: readNullableString(channelRecord.pendingProvider),
    pendingModel: readNullableString(channelRecord.pendingModel),
    pendingInstance: readNullableString(channelRecord.pendingInstance),
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
    roomRouting,
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

function looksLikeChatState(rawState: Record<string, unknown>): boolean {
  return Array.isArray(rawState.cats)
    && Array.isArray(rawState.channels)
    && typeof rawState.selectedChannelId === 'string';
}

export function normalizeChatState(rawState: unknown): ChatState {
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

export function normalizePersistedChatSnapshot(rawState: unknown): PersistedChatSnapshot {
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
