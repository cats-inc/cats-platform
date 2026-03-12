import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ExecutionTargetSummary,
  GlobalOrchestratorSummary,
  MemoryCheckpointSummary,
  ParticipantExecutionLease,
  WorkspaceCapabilities,
  WorkspaceChannelState,
  WorkspaceMember,
  WorkspaceMessage,
  WorkspaceState,
} from '../shared/app-shell.js';
import {
  createDefaultWorkspaceState,
  createEmptyExecutionLease,
  createEmptyMemoryCheckpoint,
} from './defaults.js';

export interface WorkspaceStore {
  read(): Promise<WorkspaceState>;
  write(state: WorkspaceState): Promise<WorkspaceState>;
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
  const source = leaseRecord ?? legacySession;
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

function normalizeMember(rawMember: unknown): WorkspaceMember | null {
  const memberRecord = asRecord(rawMember);
  if (!memberRecord) {
    return null;
  }

  const executionRecord = asRecord(memberRecord.execution);
  const executionTarget = normalizeExecutionTarget(
    executionRecord?.target ?? memberRecord.execution,
    memberRecord,
    {
      provider: 'claude',
      model: null,
    },
  );
  const rawStatus = readString(memberRecord.status, 'active');

  return {
    id: readString(memberRecord.id, randomUUID()),
    name: readString(memberRecord.name, 'Pal'),
    roles: readStringArray(memberRecord.roles),
    skillProfile: readNullableString(memberRecord.skillProfile),
    mcpProfile: readNullableString(memberRecord.mcpProfile),
    status: rawStatus === 'removed' ? 'removed' : 'active',
    joinedAt: readString(memberRecord.joinedAt, new Date().toISOString()),
    leftAt: readNullableString(memberRecord.leftAt),
    execution: {
      target: executionTarget,
      lease: normalizeExecutionLease(
        asRecord(memberRecord.execution)?.lease ?? memberRecord.execution,
        memberRecord,
        executionTarget,
      ),
    },
    memory: normalizeMemoryCheckpoint(memberRecord.memory),
  };
}

function normalizeChannel(rawChannel: unknown): WorkspaceChannelState | null {
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
  const defaultTarget: ExecutionTargetSummary = { provider: 'claude', model: null };
  const normalizedMembers = Array.isArray(channelRecord.members)
    ? channelRecord.members
        .map((member) => normalizeMember(member))
        .filter((member): member is WorkspaceMember => member !== null)
    : [];
  const channelId = readString(channelRecord.id, randomUUID());
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
      defaultTarget,
    ),
    members: normalizedMembers,
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

function normalizeWorkspaceState(rawState: unknown): WorkspaceState {
  const fallback = createDefaultWorkspaceState();
  const stateRecord = asRecord(rawState);
  if (!stateRecord) {
    return fallback;
  }

  const channels = Array.isArray(stateRecord.channels)
    ? stateRecord.channels
        .map((channel) => normalizeChannel(channel))
        .filter((channel): channel is WorkspaceChannelState => channel !== null)
    : fallback.channels;
  const selectedChannelId = readString(
    stateRecord.selectedChannelId,
    channels[0]?.id ?? fallback.selectedChannelId,
  );

  return {
    id: readString(stateRecord.id, fallback.id),
    name: readString(stateRecord.name, fallback.name),
    selectedChannelId: channels.some((channel) => channel.id === selectedChannelId)
      ? selectedChannelId
      : channels[0]?.id ?? fallback.selectedChannelId,
    channels: channels.length > 0 ? channels : fallback.channels,
    globalOrchestrator: normalizeGlobalOrchestrator(stateRecord.globalOrchestrator),
    capabilities: normalizeCapabilities(stateRecord.capabilities),
  };
}

export class FileWorkspaceStore implements WorkspaceStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<WorkspaceState> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return normalizeWorkspaceState(JSON.parse(raw) as unknown);
    } catch {
      const fallback = createDefaultWorkspaceState();
      await this.write(fallback);
      return fallback;
    }
  }

  async write(state: WorkspaceState): Promise<WorkspaceState> {
    const nextState = structuredClone(state);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf-8');
    return structuredClone(nextState);
  }
}

export class MemoryWorkspaceStore implements WorkspaceStore {
  private state: WorkspaceState;

  constructor(initialState: WorkspaceState = createDefaultWorkspaceState()) {
    this.state = structuredClone(initialState);
  }

  async read(): Promise<WorkspaceState> {
    return structuredClone(this.state);
  }

  async write(state: WorkspaceState): Promise<WorkspaceState> {
    this.state = structuredClone(state);
    return structuredClone(this.state);
  }
}
