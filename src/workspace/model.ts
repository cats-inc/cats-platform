import { randomUUID } from 'node:crypto';

import type {
  AddChannelMemberInput,
  ChannelExportPayload,
  CreateWorkspaceChannelInput,
  GlobalOrchestratorSummary,
  MessageUsageSummary,
  ParticipantExecutionLease,
  ParticipantSessionStatus,
  SendChannelMessageInput,
  WorkspaceChannelState,
  WorkspaceChannelStatus,
  WorkspaceChannelSummary,
  WorkspaceMember,
  WorkspaceMessage,
  WorkspaceMessageSenderKind,
  WorkspaceState,
  UpdateGlobalOrchestratorInput,
} from '../shared/app-shell.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from './defaults.js';

export const ORCHESTRATOR_NAME = 'Orchestrator';

function cloneState(state: WorkspaceState): WorkspaceState {
  return structuredClone(state);
}

function isoAt(now: Date): string {
  return now.toISOString();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'channel'
  );
}

function createUniqueChannelId(state: WorkspaceState, title: string): string {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;

  while (state.channels.some((channel) => channel.id === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function findChannelIndex(state: WorkspaceState, channelId: string): number {
  return state.channels.findIndex((channel) => channel.id === channelId);
}

export function requireChannel(state: WorkspaceState, channelId: string): WorkspaceChannelState {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  return channel;
}

function activeMemberCount(channel: WorkspaceChannelState): number {
  return channel.members.filter((member) => member.status === 'active').length;
}

function createMessageRecord(
  channelId: string,
  senderKind: WorkspaceMessageSenderKind,
  senderName: string,
  body: string,
  createdAt: string,
  metadata: Record<string, unknown>,
  usage: MessageUsageSummary | null,
): WorkspaceMessage {
  return {
    id: randomUUID(),
    channelId,
    senderKind,
    senderName,
    body: body.trim(),
    mentions: parseMentions(body),
    metadata,
    usage,
    createdAt,
  };
}

function applyMessageToChannel(
  channel: WorkspaceChannelState,
  message: WorkspaceMessage,
  nowIso: string,
): void {
  channel.messages.push(message);
  channel.updatedAt = nowIso;
  channel.lastMessageAt = nowIso;
}

function createMemberRecord(input: AddChannelMemberInput, nowIso: string): WorkspaceMember {
  const name = input.name.trim();
  const provider = input.provider.trim();
  if (!name) {
    throw new Error('Member name is required');
  }
  if (!provider) {
    throw new Error('Member provider is required');
  }

  return {
    id: randomUUID(),
    name,
    roles: normalizeList(input.roles),
    skillProfile: normalizeOptionalText(input.skillProfile),
    mcpProfile: normalizeOptionalText(input.mcpProfile),
    status: 'active',
    joinedAt: nowIso,
    leftAt: null,
    execution: {
      target: {
        provider,
        model: normalizeOptionalText(input.model),
      },
      lease: createEmptyExecutionLease(),
    },
    memory: createEmptyMemoryCheckpoint(),
  };
}

export function toChannelSummary(channel: WorkspaceChannelState): WorkspaceChannelSummary {
  return {
    id: channel.id,
    title: channel.title,
    topic: channel.topic,
    status: channel.status,
    unreadCount: channel.unreadCount,
    memberCount: channel.members.length,
    activeMemberCount: activeMemberCount(channel),
    repoPath: channel.repoPath,
    workspaceCwd: channel.workspaceCwd,
    lastMessageAt: channel.lastMessageAt,
    lastActivatedAt: channel.lastActivatedAt,
  };
}

export function selectChannel(
  state: WorkspaceState,
  selectedChannelId: string,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, selectedChannelId);
  nextState.selectedChannelId = selectedChannelId;
  channel.unreadCount = 0;
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function createChannel(
  state: WorkspaceState,
  input: CreateWorkspaceChannelInput,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const title = input.title.trim() || 'Untitled chat';
  const topic = input.topic.trim() || 'This chat is still taking shape.';
  const channelId = createUniqueChannelId(nextState, title);
  const members = (input.members ?? []).map((member) => createMemberRecord(member, nowIso));
  const channel: WorkspaceChannelState = {
    id: channelId,
    title,
    topic,
    status: members.length > 0 ? 'configured' : 'planned',
    unreadCount: 0,
    repoPath: normalizeOptionalText(input.repoPath),
    workspaceCwd: null,
    language: normalizeOptionalText(input.language),
    responseLanguage: normalizeOptionalText(input.responseLanguage) ?? 'en',
    formationMode: input.formationMode ?? 'manual',
    skillProfile: normalizeOptionalText(input.skillProfile) ?? 'workspace-default',
    mcpProfile: normalizeOptionalText(input.mcpProfile) ?? 'workspace-memory',
    orchestratorRoles: normalizeList(input.orchestratorRoles),
    createdAt: nowIso,
    updatedAt: nowIso,
    lastMessageAt: nowIso,
    lastActivatedAt: null,
    orchestratorLease: createEmptyExecutionLease(),
    members,
    messages: [
      createMessageRecord(
        channelId,
        'system',
        'Chat',
        `Chat created with ${members.length} pal${members.length === 1 ? '' : 's'}. Activate it to start runtime replies.`,
        nowIso,
        { event: 'channel_created' },
        null,
      ),
    ],
  };

  nextState.channels.unshift(channel);
  nextState.selectedChannelId = channelId;
  return nextState;
}

export function addMemberToChannel(
  state: WorkspaceState,
  channelId: string,
  input: AddChannelMemberInput,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const channel = requireChannel(nextState, channelId);
  const member = createMemberRecord(input, nowIso);

  channel.members.push(member);
  if (channel.status === 'planned') {
    channel.status = 'configured';
  }

  applyMessageToChannel(
    channel,
    createMessageRecord(
      channelId,
      'system',
      'Chat',
      `${member.name} joined the chat.`,
      nowIso,
      { event: 'member_joined', memberId: member.id },
      null,
    ),
    nowIso,
  );

  return nextState;
}

export function removeMemberFromChannel(
  state: WorkspaceState,
  channelId: string,
  memberId: string,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const channel = requireChannel(nextState, channelId);
  const member = channel.members.find((candidate) => candidate.id === memberId);

  if (!member) {
    throw new Error(`Member not found: ${memberId}`);
  }

  member.status = 'removed';
  member.leftAt = nowIso;
  member.execution.lease.status = 'removed';

  applyMessageToChannel(
    channel,
    createMessageRecord(
      channelId,
      'system',
      'Chat',
      `${member.name} left the chat.`,
      nowIso,
      { event: 'member_removed', memberId },
      null,
    ),
    nowIso,
  );

  return nextState;
}

export function updateGlobalOrchestrator(
  state: WorkspaceState,
  input: UpdateGlobalOrchestratorInput,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  nextState.globalOrchestrator = {
    ...nextState.globalOrchestrator,
    executionTarget: {
      provider: input.provider.trim() || nextState.globalOrchestrator.executionTarget.provider,
      model: normalizeOptionalText(input.model),
    },
    systemPrompt:
      input.systemPrompt?.trim() || nextState.globalOrchestrator.systemPrompt,
    skillProfile: normalizeOptionalText(input.skillProfile),
    mcpProfile: normalizeOptionalText(input.mcpProfile),
    telegramBotName: normalizeOptionalText(input.telegramBotName),
    updatedAt: isoAt(now),
  };
  return nextState;
}

export function appendMessage(
  state: WorkspaceState,
  channelId: string,
  input: SendChannelMessageInput & {
    senderKind: WorkspaceMessageSenderKind;
    senderName: string;
  },
  now: Date = new Date(),
  options: {
    metadata?: Record<string, unknown>;
    usage?: MessageUsageSummary | null;
    incrementUnread?: boolean;
  } = {},
): { state: WorkspaceState; message: WorkspaceMessage } {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const channel = requireChannel(nextState, channelId);
  const message = createMessageRecord(
    channelId,
    input.senderKind,
    input.senderName,
    input.body,
    nowIso,
    options.metadata ?? {},
    options.usage ?? null,
  );

  applyMessageToChannel(channel, message, nowIso);

  if (
    options.incrementUnread !== false
    && nextState.selectedChannelId !== channelId
    && input.senderKind !== 'user'
  ) {
    channel.unreadCount += 1;
  }

  return { state: nextState, message };
}

function updateExecutionLease(
  current: ParticipantExecutionLease,
  input: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
): ParticipantExecutionLease {
  return {
    sessionId:
      input.sessionId === undefined ? current.sessionId : input.sessionId,
    status: input.status ?? current.status,
    cwd: input.cwd === undefined ? current.cwd : input.cwd,
    lastError:
      input.lastError === undefined ? current.lastError : input.lastError,
    provider:
      input.provider === undefined ? current.provider : normalizeOptionalText(input.provider),
    model:
      input.model === undefined ? current.model : normalizeOptionalText(input.model),
    startedAt:
      input.startedAt === undefined ? current.startedAt : input.startedAt,
    lastUsedAt:
      input.lastUsedAt === undefined ? current.lastUsedAt : input.lastUsedAt,
  };
}

export function setChannelOrchestratorLease(
  state: WorkspaceState,
  channelId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.orchestratorLease = updateExecutionLease(channel.orchestratorLease, leaseUpdate);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelMemberLease(
  state: WorkspaceState,
  channelId: string,
  memberId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const member = channel.members.find((candidate) => candidate.id === memberId);

  if (!member) {
    throw new Error(`Member not found: ${memberId}`);
  }

  member.execution.lease = updateExecutionLease(member.execution.lease, leaseUpdate);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelStatus(
  state: WorkspaceState,
  channelId: string,
  status: WorkspaceChannelStatus,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.status = status;
  channel.updatedAt = isoAt(now);
  if (status === 'active') {
    channel.lastActivatedAt = channel.updatedAt;
  }
  return nextState;
}

export function setChannelWorkspaceCwd(
  state: WorkspaceState,
  channelId: string,
  workspaceCwd: string | null,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.workspaceCwd = normalizeOptionalText(workspaceCwd);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function parseMentions(text: string): string[] {
  return Array.from(new Set(text.match(/(?<!\w)@([A-Za-z0-9._-]+)/gu)?.map((value) => value.slice(1)) ?? []));
}

export function exportChannel(state: WorkspaceState, channelId: string): ChannelExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    orchestrator: structuredClone(state.globalOrchestrator),
    channel: structuredClone(requireChannel(state, channelId)),
  };
}

export function summarizeState(state: WorkspaceState): {
  channels: WorkspaceChannelSummary[];
  selectedChannel: WorkspaceChannelState | null;
  globalOrchestrator: GlobalOrchestratorSummary;
} {
  const selectedChannel =
    state.channels.find((channel) => channel.id === state.selectedChannelId) ?? null;

  return {
    channels: state.channels.map((channel) => toChannelSummary(channel)),
    selectedChannel: selectedChannel ? structuredClone(selectedChannel) : null,
    globalOrchestrator: structuredClone(state.globalOrchestrator),
  };
}

export function replaceState(state: WorkspaceState, channel: WorkspaceChannelState): WorkspaceState {
  const nextState = cloneState(state);
  const index = findChannelIndex(nextState, channel.id);
  if (index === -1) {
    throw new Error(`Channel not found: ${channel.id}`);
  }
  nextState.channels[index] = structuredClone(channel);
  return nextState;
}
