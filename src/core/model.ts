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
} from '../shared/core.js';
import { CATS_CORE_STATE_VERSION } from '../shared/core.js';
import type {
  WorkspaceChannelState,
  WorkspacePal,
  WorkspaceState,
} from '../shared/app-shell.js';
import { createDefaultWorkspaceState, createEmptyMemoryCheckpoint } from '../workspace/defaults.js';

export const OWNER_ACTOR_ID = 'actor-owner';
export const GLOBAL_ORCHESTRATOR_ACTOR_ID = 'actor-orchestrator-global';

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

export function createDefaultOwnerProfile(updatedAt: string): OwnerProfileRecord {
  return {
    actorId: OWNER_ACTOR_ID,
    displayName: 'Owner',
    summary: null,
    communicationPreferences: [],
    decisionPreferences: [],
    escalationPreferences: [],
    updatedAt,
  };
}

function mapChannelStatusToConversationStatus(channel: WorkspaceChannelState): CoreConversationStatus {
  if (channel.status === 'planned') {
    return 'planned';
  }
  if (channel.status === 'archived') {
    return 'archived';
  }
  return 'active';
}

function mapChannelStatusToTaskStatus(channel: WorkspaceChannelState): CoreTaskStatus {
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

function createOrchestratorActor(workspace: WorkspaceState): CoreActorRecord {
  return {
    id: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    name: 'Orchestrator',
    kind: 'orchestrator',
    status: 'active',
    roles: ['orchestrator', ...workspace.globalOrchestrator.notes.map(() => 'coordinator')].slice(0, 2),
    skillProfile: workspace.globalOrchestrator.skillProfile,
    mcpProfile: workspace.globalOrchestrator.mcpProfile,
    defaultExecutionTarget: structuredClone(workspace.globalOrchestrator.executionTarget),
    memory: structuredClone(workspace.globalOrchestrator.memory),
    source: 'global_orchestrator',
    sourceId: 'global',
    createdAt: workspace.globalOrchestrator.updatedAt,
    updatedAt: workspace.globalOrchestrator.updatedAt,
    archivedAt: null,
  };
}

function createPalActor(pal: WorkspacePal): CoreActorRecord {
  return {
    id: `actor-pal-${pal.id}`,
    name: pal.name,
    kind: 'worker',
    status: pal.status === 'archived' ? 'archived' : 'active',
    roles: structuredClone(pal.roles),
    skillProfile: pal.skillProfile,
    mcpProfile: pal.mcpProfile,
    defaultExecutionTarget: structuredClone(pal.defaultExecutionTarget),
    memory: structuredClone(pal.memory),
    source: 'workspace_pal',
    sourceId: pal.id,
    createdAt: pal.createdAt,
    updatedAt: pal.updatedAt,
    archivedAt: pal.archivedAt,
  };
}

function createConversationFromChannel(
  channel: WorkspaceChannelState,
  participantActorIds: string[],
): CoreConversationRecord {
  return {
    id: `conversation-channel-${channel.id}`,
    title: channel.title,
    kind: 'workspace_channel',
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
  channel: WorkspaceChannelState,
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
    assignedActorIds: channel.palAssignments.map((assignment) => `actor-pal-${assignment.palId}`),
    summary: channel.topic,
    approval,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}

function createArchiveMetadata(
  channel: WorkspaceChannelState,
  conversationId: string,
  existingArchive: ArchiveMetadataRecord | null,
): ArchiveMetadataRecord {
  return {
    id: `archive-channel-${channel.id}`,
    sourceConversationId: conversationId,
    sourceChannelId: channel.id,
    exportFormat: 'workspace-channel-json',
    status: existingArchive?.status
      ?? (channel.messages.length > 0 || channel.status === 'archived'
        ? 'ready_for_archive'
        : 'not_ready'),
    lastExportedAt: existingArchive?.lastExportedAt ?? null,
    updatedAt: channel.updatedAt,
  };
}

function syncBotBindings(
  workspace: WorkspaceState,
  existingBindings: BotBindingRecord[],
): BotBindingRecord[] {
  const preservedLineBindings = existingBindings.filter((binding) => binding.platform === 'line');
  const telegramBotName = workspace.globalOrchestrator.telegramBotName?.trim();

  if (!telegramBotName) {
    return preservedLineBindings;
  }

  const existingTelegram = existingBindings.find((binding) => binding.platform === 'telegram');
  const updatedAt = workspace.globalOrchestrator.updatedAt;

  return [
    ...preservedLineBindings,
    {
      id: existingTelegram?.id ?? 'bot-binding-telegram-global',
      platform: 'telegram',
      botName: telegramBotName,
      orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
      status: 'active',
      createdAt: existingTelegram?.createdAt ?? updatedAt,
      updatedAt,
    },
  ];
}

export function syncCoreStateWithWorkspace(
  workspace: WorkspaceState,
  existingCore?: Partial<CatsCoreState>,
): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = existingCore?.ownerProfile ?? createDefaultOwnerProfile(updatedAt);
  const ownerActor = createOwnerActor(ownerProfile);
  const orchestratorActor = createOrchestratorActor(workspace);
  const palActors = workspace.pals.map((pal) => createPalActor(pal));
  const existingTasks = new Map((existingCore?.tasks ?? []).map((task) => [task.id, task]));
  const existingArchives = new Map((existingCore?.archives ?? []).map((archive) => [archive.id, archive]));
  const conversations = workspace.channels.map((channel) =>
    createConversationFromChannel(
      channel,
      [
        ownerProfile.actorId,
        GLOBAL_ORCHESTRATOR_ACTOR_ID,
        ...channel.palAssignments.map((assignment) => `actor-pal-${assignment.palId}`),
      ],
    ),
  );
  const tasks = workspace.channels.map((channel) =>
    createTaskFromChannel(
      channel,
      ownerProfile.actorId,
      `conversation-channel-${channel.id}`,
      existingTasks.get(`task-channel-${channel.id}`) ?? null,
    ),
  );
  const archives = workspace.channels.map((channel) =>
    createArchiveMetadata(
      channel,
      `conversation-channel-${channel.id}`,
      existingArchives.get(`archive-channel-${channel.id}`) ?? null,
    ),
  );

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    ownerProfile: {
      ...ownerProfile,
      updatedAt: ownerProfile.updatedAt || updatedAt,
    },
    actors: [ownerActor, orchestratorActor, ...palActors],
    conversations,
    tasks,
    botBindings: syncBotBindings(workspace, existingCore?.botBindings ?? []),
    archives,
    workspace: structuredClone(workspace),
  };
}

export function createDefaultCoreState(): CatsCoreState {
  return syncCoreStateWithWorkspace(createDefaultWorkspaceState());
}
