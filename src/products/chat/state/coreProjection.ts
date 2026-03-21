import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  CatsCoreState,
  CoreActorRecord,
  CoreApprovalRecord,
  CoreConversationRecord,
  CoreConversationStatus,
  CoreTaskRecord,
  CoreTaskStatus,
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
import type {
  ChatChannelState,
  ChatCat,
  ChatState,
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
  };
}

function preserveCoreOwnedTasks(existingTasks: CoreTaskRecord[]): CoreTaskRecord[] {
  return existingTasks
    .filter((task) => !task.id.startsWith('task-channel-'))
    .map((task) => structuredClone(task));
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
  const preservedLineBindings = existingBindings.filter((binding) => binding.platform === 'line');
  const telegramBotName = chat.globalOrchestrator.telegramBotName?.trim();
  const bossCatActorId = chat.bossCatId
    ? createCatActorId(chat.bossCatId)
    : null;

  if (!telegramBotName || !bossCatActorId) {
    return preservedLineBindings;
  }

  const existingTelegram = existingBindings.find((binding) => binding.platform === 'telegram');
  const updatedAt = chat.globalOrchestrator.updatedAt;

  return [
    ...preservedLineBindings,
    {
      id: existingTelegram?.id ?? 'bot-binding-telegram-global',
      platform: 'telegram',
      botName: telegramBotName,
      orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
      bossCatActorId,
      status: 'active',
      createdAt: existingTelegram?.createdAt ?? updatedAt,
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
  const existingTasks = new Map((existingCore.tasks ?? []).map((task) => [task.id, task]));
  const existingArchives = new Map((existingCore.archives ?? []).map((archive) => [archive.id, archive]));
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
  const archives = chat.channels.map((channel) =>
    createArchiveMetadata(
      channel,
      `conversation-channel-${channel.id}`,
      existingArchives.get(`archive-channel-${channel.id}`) ?? null,
    ),
  );

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: existingCore.setupCompleteAt ?? null,
    ownerProfile: {
      ...ownerProfile,
      updatedAt: ownerProfile.updatedAt || updatedAt,
    },
    actors: [ownerActor, orchestratorActor, ...catActors],
    conversations,
    tasks: [...tasks, ...preservedTasks],
    runs: structuredClone(existingCore.runs ?? []),
    traces: structuredClone(existingCore.traces ?? []),
    checkpoints: structuredClone(existingCore.checkpoints ?? []),
    outcomes: structuredClone(existingCore.outcomes ?? []),
    botBindings: syncBotBindings(chat, existingCore.botBindings ?? []),
    archives,
  };
}
