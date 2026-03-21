import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ChannelPalAssignment,
  ExecutionTargetSummary,
  GlobalOrchestratorSummary,
  MemoryCheckpointSummary,
  ParticipantExecutionLease,
  ParticipantExecutionState,
  WorkspaceCapabilities,
  WorkspaceChannelState,
  WorkspaceMessage,
  WorkspacePal,
  WorkspaceState,
} from '../../../shared/app-shell.js';
import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  CatsCoreState,
  CoreTaskRecord,
  OwnerProfileRecord,
} from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
import { isOpaqueChannelId } from '../../../shared/channelPaths.js';
import {
  createDefaultWorkspaceState,
  createEmptyExecutionLease,
  createEmptyMemoryCheckpoint,
} from './defaults.js';
import {
  createDefaultCoreState,
  createPalActorId,
} from '../../../core/model.js';
import { syncCoreStateWithWorkspace } from './coreProjection.js';

export interface WorkspaceStore extends CoreStore {
  read(): Promise<WorkspaceState>;
  write(state: WorkspaceState): Promise<WorkspaceState>;
}

interface PersistedWorkspaceSnapshot extends CatsCoreState {
  workspace: WorkspaceState;
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

function normalizeExecutionTarget(
  rawTarget: unknown,
  legacyOwner: Record<string, unknown> | null,
  fallbackTarget: ExecutionTargetSummary,
): ExecutionTargetSummary {
  const targetRecord = asRecord(rawTarget);
  const provider =
    readString(targetRecord?.provider, readString(legacyOwner?.provider, fallbackTarget.provider)).trim()
    || fallbackTarget.provider;

  return {
    provider,
    instance:
      readNullableString(targetRecord?.instance)
      ?? readNullableString(legacyOwner?.instance)
      ?? fallbackTarget.instance,
    model:
      readNullableString(targetRecord?.model)
      ?? readNullableString(legacyOwner?.model)
      ?? fallbackTarget.model,
  };
}

function normalizeExecutionLease(
  rawLease: unknown,
  legacyOwner: Record<string, unknown> | null,
  fallbackTarget: ExecutionTargetSummary,
): ParticipantExecutionLease {
  const defaultLease = createEmptyExecutionLease();
  const leaseRecord = asRecord(rawLease);
  const legacySession = asRecord(legacyOwner?.session);
  const rawLeaseStatus = readString(leaseRecord?.status);
  const source = leaseRecord && (
    leaseRecord.sessionId !== undefined
    || leaseRecord.cwd !== undefined
    || leaseRecord.lastError !== undefined
    || rawLeaseStatus === 'not_started'
    || rawLeaseStatus === 'initializing'
    || rawLeaseStatus === 'ready'
    || rawLeaseStatus === 'error'
    || rawLeaseStatus === 'closed'
    || rawLeaseStatus === 'removed'
  )
    ? leaseRecord
    : (legacySession ?? leaseRecord);
  const rawStatus = readString(source?.status, defaultLease.status);
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
    sessionId: readNullableString(source?.sessionId),
    status,
    cwd: readNullableString(source?.cwd),
    lastError: readNullableString(source?.lastError),
    provider:
      readNullableString(source?.provider)
      ?? readNullableString(legacyOwner?.provider)
      ?? fallbackTarget.provider,
    model:
      readNullableString(source?.model)
      ?? readNullableString(legacyOwner?.model)
      ?? fallbackTarget.model,
    startedAt: readNullableString(source?.startedAt),
    lastUsedAt: readNullableString(source?.lastUsedAt),
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
  legacyOwner: Record<string, unknown> | null,
  fallbackTarget: ExecutionTargetSummary,
): ParticipantExecutionState {
  const executionRecord = asRecord(rawExecution);
  const target = normalizeExecutionTarget(
    executionRecord?.target ?? rawExecution,
    legacyOwner,
    fallbackTarget,
  );

  return {
    target,
    lease: normalizeExecutionLease(
      executionRecord?.lease ?? rawExecution,
      legacyOwner,
      target,
    ),
  };
}

function normalizeMessage(rawMessage: unknown, channelId: string): WorkspaceMessage {
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

function normalizeWorkspacePal(rawPal: unknown): WorkspacePal | null {
  const palRecord = asRecord(rawPal);
  if (!palRecord) {
    return null;
  }

  const defaultExecutionTarget = normalizeExecutionTarget(
    palRecord.defaultExecutionTarget,
    palRecord,
    { provider: 'claude', instance: null, model: null },
  );
  const rawStatus = readString(palRecord.status, 'active');

  return {
    id: readString(palRecord.id, randomUUID()),
    name: readString(palRecord.name, 'Pal'),
    roles: readStringArray(palRecord.roles),
    skillProfile: readNullableString(palRecord.skillProfile),
    mcpProfile: readNullableString(palRecord.mcpProfile),
    status: rawStatus === 'archived' ? 'archived' : 'active',
    createdAt: readString(palRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(palRecord.updatedAt, new Date().toISOString()),
    archivedAt: readNullableString(palRecord.archivedAt),
    avatarColor: readNullableString(palRecord.avatarColor),
    defaultExecutionTarget,
    memory: asRecord(palRecord.memory)
      ? normalizeMemoryCheckpoint(palRecord.memory)
      : createEmptyMemoryCheckpoint(),
  };
}

function normalizeChannelAssignment(
  rawAssignment: unknown,
  fallbackPal: WorkspacePal,
): ChannelPalAssignment | null {
  const assignmentRecord = asRecord(rawAssignment);
  if (!assignmentRecord) {
    return null;
  }

  const rawStatus = readString(assignmentRecord.status, 'active');
  const execution = normalizeExecutionState(
    assignmentRecord.execution,
    assignmentRecord,
    fallbackPal.defaultExecutionTarget,
  );

  return {
    palId: readString(assignmentRecord.palId, fallbackPal.id),
    status: rawStatus === 'removed' ? 'removed' : 'active',
    roles: readStringArray(assignmentRecord.roles),
    joinedAt: readString(assignmentRecord.joinedAt, new Date().toISOString()),
    leftAt: readNullableString(assignmentRecord.leftAt),
    execution,
  };
}

function ensureLegacyPalFromMember(
  rawMember: unknown,
  palsById: Map<string, WorkspacePal>,
): WorkspacePal | null {
  const memberRecord = asRecord(rawMember);
  if (!memberRecord) {
    return null;
  }

  const palId = readString(memberRecord.id, randomUUID());
  const existing = palsById.get(palId);
  if (existing) {
    return existing;
  }

  const execution = normalizeExecutionState(
    memberRecord.execution ?? memberRecord,
    memberRecord,
    { provider: 'claude', instance: null, model: null },
  );
  const rawStatus = readString(memberRecord.status, 'active');

  const pal: WorkspacePal = {
    id: palId,
    name: readString(memberRecord.name, 'Pal'),
    roles: readStringArray(memberRecord.roles),
    skillProfile: readNullableString(memberRecord.skillProfile),
    mcpProfile: readNullableString(memberRecord.mcpProfile),
    status: rawStatus === 'removed' ? 'archived' : 'active',
    createdAt: readString(memberRecord.joinedAt, new Date().toISOString()),
    updatedAt: readString(memberRecord.joinedAt, new Date().toISOString()),
    archivedAt: readNullableString(memberRecord.leftAt),
    avatarColor: readNullableString(memberRecord.avatarColor),
    defaultExecutionTarget: execution.target,
    memory: asRecord(memberRecord.memory)
      ? normalizeMemoryCheckpoint(memberRecord.memory)
      : createEmptyMemoryCheckpoint(),
  };

  palsById.set(pal.id, pal);
  return pal;
}

function normalizeChannel(
  rawChannel: unknown,
  palsById: Map<string, WorkspacePal>,
): WorkspaceChannelState | null {
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

  const palAssignments = Array.isArray(channelRecord.palAssignments)
    ? channelRecord.palAssignments
        .map((assignment) => {
          const assignmentRecord = asRecord(assignment);
          const palId = readString(assignmentRecord?.palId, '');
          const fallbackPal = palId && palsById.has(palId)
            ? palsById.get(palId) ?? null
            : null;
          return fallbackPal ? normalizeChannelAssignment(assignmentRecord, fallbackPal) : null;
        })
        .filter((assignment): assignment is ChannelPalAssignment => assignment !== null)
    : Array.isArray(channelRecord.members)
      ? channelRecord.members
          .map((member) => {
            const pal = ensureLegacyPalFromMember(member, palsById);
            if (!pal) {
              return null;
            }

            const memberRecord = asRecord(member);
            const execution = normalizeExecutionState(
              memberRecord?.execution ?? memberRecord,
              memberRecord,
              pal.defaultExecutionTarget,
            );
            const rawMemberStatus = readString(memberRecord?.status, 'active');

            return {
              palId: pal.id,
              status: rawMemberStatus === 'removed' ? 'removed' : 'active',
              roles: readStringArray(memberRecord?.roles),
              joinedAt: readString(memberRecord?.joinedAt, new Date().toISOString()),
              leftAt: readNullableString(memberRecord?.leftAt),
              execution,
            };
          })
          .filter((assignment): assignment is ChannelPalAssignment => assignment !== null)
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
    workspaceCwd: readNullableString(channelRecord.workspaceCwd),
    language: readNullableString(channelRecord.language),
    responseLanguage: readString(channelRecord.responseLanguage, 'en'),
    formationMode,
    skillProfile: readNullableString(channelRecord.skillProfile) ?? 'workspace-default',
    mcpProfile: readNullableString(channelRecord.mcpProfile) ?? 'workspace-memory',
    orchestratorRoles: readStringArray(channelRecord.orchestratorRoles),
    createdAt: readString(channelRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(channelRecord.updatedAt, new Date().toISOString()),
    lastMessageAt: readNullableString(channelRecord.lastMessageAt),
    lastActivatedAt: readNullableString(channelRecord.lastActivatedAt),
    orchestratorLease: normalizeExecutionLease(
      channelRecord.orchestratorLease ?? channelRecord.orchestratorSession,
      null,
      { provider: 'claude', instance: null, model: null },
    ),
    palAssignments,
    messages,
  };
}

function normalizeCapabilities(rawCapabilities: unknown): WorkspaceCapabilities {
  const fallback = createDefaultWorkspaceState().capabilities;
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
  const fallback = createDefaultWorkspaceState().globalOrchestrator;
  const orchestratorRecord = asRecord(rawOrchestrator);
  const executionTarget = normalizeExecutionTarget(
    orchestratorRecord?.executionTarget,
    orchestratorRecord,
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

function normalizeBotBinding(
  rawBinding: unknown,
  workspace: WorkspaceState,
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

  return {
    id: readString(bindingRecord.id, randomUUID()),
    platform,
    botName: readString(bindingRecord.botName),
    orchestratorActorId: readString(bindingRecord.orchestratorActorId),
    bossCatActorId:
      readNullableString(bindingRecord.bossCatActorId)
      ?? (workspace.bossCatId ? createPalActorId(workspace.bossCatId) : null),
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
    exportFormat: 'workspace-channel-json',
    status,
    lastExportedAt: readNullableString(archiveRecord.lastExportedAt),
    updatedAt: readString(archiveRecord.updatedAt, new Date().toISOString()),
  };
}

function normalizeWorkspaceState(rawState: unknown): WorkspaceState {
  const fallback = createDefaultWorkspaceState();
  const stateRecord = asRecord(rawState);
  if (!stateRecord) {
    return fallback;
  }
  const workspaceRecord = asRecord(stateRecord.workspace);
  const sourceRecord = workspaceRecord ?? stateRecord;

  const normalizedPals = Array.isArray(sourceRecord.pals)
    ? sourceRecord.pals
        .map((pal) => normalizeWorkspacePal(pal))
        .filter((pal): pal is WorkspacePal => pal !== null)
    : [];
  const palsById = new Map(normalizedPals.map((pal) => [pal.id, pal]));
  const normalizedChannels = Array.isArray(sourceRecord.channels)
    ? sourceRecord.channels
        .map((channel) => normalizeChannel(channel, palsById))
        .filter((channel): channel is WorkspaceChannelState => channel !== null)
    : fallback.channels;
  const { channels, migratedChannelIds } = migrateLegacyChannelIds(normalizedChannels);
  const rawSelectedChannelId = readString(
    sourceRecord.selectedChannelId,
    channels[0]?.id ?? fallback.selectedChannelId,
  );
  const selectedChannelId = migratedChannelIds.get(rawSelectedChannelId) ?? rawSelectedChannelId;

  return {
    id: readString(sourceRecord.id, fallback.id),
    name: readString(sourceRecord.name, fallback.name),
    selectedChannelId: channels.some((channel) => channel.id === selectedChannelId)
      ? selectedChannelId
      : channels[0]?.id ?? fallback.selectedChannelId,
    bossCatId: readNullableString(sourceRecord.bossCatId),
    pals: Array.from(palsById.values()),
    channels: channels.length > 0 ? channels : fallback.channels,
    globalOrchestrator: normalizeGlobalOrchestrator(sourceRecord.globalOrchestrator),
    capabilities: normalizeCapabilities(sourceRecord.capabilities),
    showVerboseMessages: readBoolean(sourceRecord.showVerboseMessages, false),
  };
}

function migrateLegacyChannelIds(
  channels: WorkspaceChannelState[],
): {
  channels: WorkspaceChannelState[];
  migratedChannelIds: Map<string, string>;
} {
  const migratedChannelIds = new Map<string, string>();
  const assignedChannelIds = new Set<string>();
  const nextChannels = channels.map((channel) => {
    const needsOpaqueId = !isOpaqueChannelId(channel.id) || assignedChannelIds.has(channel.id);
    const nextChannelId = needsOpaqueId ? randomUUID() : channel.id;
    assignedChannelIds.add(nextChannelId);

    if (nextChannelId === channel.id) {
      return channel;
    }

    migratedChannelIds.set(channel.id, nextChannelId);
    return {
      ...channel,
      id: nextChannelId,
      messages: channel.messages.map((message) => ({
        ...message,
        channelId: nextChannelId,
      })),
    };
  });

  return {
    channels: nextChannels,
    migratedChannelIds,
  };
}

function extractCoreState(snapshot: PersistedWorkspaceSnapshot): CatsCoreState {
  const { workspace: _workspace, ...core } = snapshot;
  return core;
}

function buildPersistedWorkspaceSnapshot(
  workspace: WorkspaceState,
  core: CatsCoreState,
): PersistedWorkspaceSnapshot {
  return {
    ...structuredClone(core),
    workspace: structuredClone(workspace),
  };
}

async function writePersistedWorkspaceSnapshot(
  filePath: string,
  snapshot: PersistedWorkspaceSnapshot,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
}

function normalizePersistedWorkspaceSnapshot(rawState: unknown): PersistedWorkspaceSnapshot {
  const fallback = createDefaultCoreState();
  const stateRecord = asRecord(rawState);
  const workspace = normalizeWorkspaceState(rawState);

  if (!stateRecord || !asRecord(stateRecord.workspace)) {
    return buildPersistedWorkspaceSnapshot(
      workspace,
      syncCoreStateWithWorkspace(workspace, fallback),
    );
  }

  const tasks = Array.isArray(stateRecord.tasks)
    ? stateRecord.tasks
        .map((task) => normalizeCoreTask(task))
        .filter((task): task is CoreTaskRecord => task !== null)
    : [];
  const botBindings = Array.isArray(stateRecord.botBindings)
    ? stateRecord.botBindings
        .map((binding) => normalizeBotBinding(binding, workspace))
        .filter((binding): binding is BotBindingRecord => binding !== null)
    : [];
  const archives = Array.isArray(stateRecord.archives)
    ? stateRecord.archives
        .map((archive) => normalizeArchiveMetadata(archive))
        .filter((archive): archive is ArchiveMetadataRecord => archive !== null)
    : [];
  const normalized = syncCoreStateWithWorkspace(workspace, {
    setupCompleteAt: readNullableString(stateRecord.setupCompleteAt),
    ownerProfile: normalizeOwnerProfile(stateRecord.ownerProfile),
    tasks,
    botBindings,
    archives,
  });

  return buildPersistedWorkspaceSnapshot(workspace, {
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

export class FileWorkspaceStore implements WorkspaceStore {
  constructor(private readonly filePath: string) {}

  private async readPersistedSnapshot(): Promise<PersistedWorkspaceSnapshot> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return normalizePersistedWorkspaceSnapshot(JSON.parse(raw) as unknown);
    } catch {
      const workspace = createDefaultWorkspaceState();
      const core = syncCoreStateWithWorkspace(workspace, createDefaultCoreState());
      const snapshot = buildPersistedWorkspaceSnapshot(workspace, core);
      await writePersistedWorkspaceSnapshot(this.filePath, snapshot);
      return snapshot;
    }
  }

  async read(): Promise<WorkspaceState> {
    return structuredClone((await this.readPersistedSnapshot()).workspace);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(extractCoreState(await this.readPersistedSnapshot()));
  }

  async write(state: WorkspaceState): Promise<WorkspaceState> {
    const nextWorkspace = structuredClone(state);
    const nextCore = syncCoreStateWithWorkspace(nextWorkspace, await this.readCore());
    await writePersistedWorkspaceSnapshot(
      this.filePath,
      buildPersistedWorkspaceSnapshot(nextWorkspace, nextCore),
    );
    return structuredClone(nextWorkspace);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    const snapshot = await this.readPersistedSnapshot();
    const nextWorkspace = structuredClone(snapshot.workspace);
    const nextCore = syncCoreStateWithWorkspace(nextWorkspace, structuredClone(state));
    await writePersistedWorkspaceSnapshot(
      this.filePath,
      buildPersistedWorkspaceSnapshot(nextWorkspace, nextCore),
    );
    return structuredClone(nextCore);
  }
}

export class MemoryWorkspaceStore implements WorkspaceStore {
  private workspaceState: WorkspaceState;
  private coreState: CatsCoreState;

  constructor(
    initialState: WorkspaceState | CatsCoreState | PersistedWorkspaceSnapshot = createDefaultWorkspaceState(),
  ) {
    const snapshot = normalizePersistedWorkspaceSnapshot(initialState);
    this.workspaceState = snapshot.workspace;
    this.coreState = extractCoreState(snapshot);
  }

  async read(): Promise<WorkspaceState> {
    return structuredClone(this.workspaceState);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(this.coreState);
  }

  async write(state: WorkspaceState): Promise<WorkspaceState> {
    this.workspaceState = structuredClone(state);
    this.coreState = syncCoreStateWithWorkspace(this.workspaceState, this.coreState);
    return structuredClone(this.workspaceState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    this.coreState = syncCoreStateWithWorkspace(this.workspaceState, structuredClone(state));
    return structuredClone(this.coreState);
  }
}
