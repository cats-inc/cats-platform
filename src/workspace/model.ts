import { randomUUID } from 'node:crypto';

export const AVATAR_PALETTE = [
  '#E57373', '#F06292', '#BA68C8', '#9575CD',
  '#7986CB', '#64B5F6', '#4FC3F7', '#4DB6AC',
  '#81C784', '#FFB74D', '#FF8A65', '#A1887F',
] as const;

export function pickAvatarColor(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

import type {
  AssignChannelPalInput,
  ChannelExportPayload,
  ChannelPalAssignment,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  GlobalOrchestratorSummary,
  MessageUsageSummary,
  ParticipantExecutionLease,
  ParticipantSessionStatus,
  SendChannelMessageInput,
  WorkspaceChannelPal,
  WorkspaceChannelState,
  WorkspaceChannelStatus,
  WorkspaceChannelSummary,
  WorkspaceChannelView,
  WorkspaceMessage,
  WorkspaceMessageSenderKind,
  WorkspacePal,
  WorkspaceState,
  UpdateGlobalOrchestratorInput,
} from '../shared/app-shell.js';
import { createChannelExportFilename } from '../shared/channelPaths.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from './defaults.js';

export const ORCHESTRATOR_NAME = 'Orchestrator';

export function resolveOrchestratorDisplayName(state: WorkspaceState): string {
  if (state.bossCatId) {
    const pal = state.pals.find((candidate) => candidate.id === state.bossCatId);
    if (pal) return pal.name;
  }
  return ORCHESTRATOR_NAME;
}

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

function createChannelId(): string {
  return randomUUID();
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

export function requirePal(state: WorkspaceState, palId: string): WorkspacePal {
  const pal = state.pals.find((candidate) => candidate.id === palId);
  if (!pal) {
    throw new Error(`Pal not found: ${palId}`);
  }

  return pal;
}

function activePalCount(channel: WorkspaceChannelState): number {
  return channel.palAssignments.filter((assignment) => assignment.status === 'active').length;
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

function createPalRecord(input: CreateWorkspacePalInput, nowIso: string): WorkspacePal {
  const name = input.name.trim();
  const provider = input.provider.trim();

  if (!name) {
    throw new Error('Pal name is required');
  }
  if (!provider) {
    throw new Error('Pal provider is required');
  }

  return {
    id: randomUUID(),
    name,
    roles: normalizeList(input.roles),
    skillProfile: normalizeOptionalText(input.skillProfile),
    mcpProfile: normalizeOptionalText(input.mcpProfile),
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
    archivedAt: null,
    avatarColor: null,
    defaultExecutionTarget: {
      provider,
      instance: normalizeOptionalText(input.instance),
      model: normalizeOptionalText(input.model),
    },
    memory: createEmptyMemoryCheckpoint(),
  };
}

function createAssignmentRecord(
  pal: WorkspacePal,
  input: {
    provider?: string;
    instance?: string | null;
    model?: string | null;
    roles?: string[];
  },
  nowIso: string,
): ChannelPalAssignment {
  const roles = normalizeList(input.roles);

  return {
    palId: pal.id,
    status: 'active',
    roles: roles.length > 0 ? roles : pal.roles,
    joinedAt: nowIso,
    leftAt: null,
    execution: {
      target: {
        provider: input.provider?.trim() || pal.defaultExecutionTarget.provider,
        instance:
          input.instance === undefined
            ? pal.defaultExecutionTarget.instance
            : normalizeOptionalText(input.instance),
        model:
          input.model === undefined
            ? pal.defaultExecutionTarget.model
            : normalizeOptionalText(input.model),
      },
      lease: createEmptyExecutionLease(),
    },
  };
}

function hydrateChannelPal(
  pal: WorkspacePal,
  assignment: ChannelPalAssignment,
): WorkspaceChannelPal {
  return {
    palId: pal.id,
    name: pal.name,
    roles: assignment.roles.length > 0 ? structuredClone(assignment.roles) : structuredClone(pal.roles),
    skillProfile: pal.skillProfile,
    mcpProfile: pal.mcpProfile,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: pal.avatarColor,
    execution: structuredClone(assignment.execution),
    memory: structuredClone(pal.memory),
  };
}

export function buildChannelView(
  state: WorkspaceState,
  channelOrId: WorkspaceChannelState | string,
): WorkspaceChannelView {
  const channel =
    typeof channelOrId === 'string' ? requireChannel(state, channelOrId) : channelOrId;

  return {
    ...structuredClone(channel),
    assignedPals: channel.palAssignments
      .filter((assignment) => state.pals.some((p) => p.id === assignment.palId))
      .map((assignment) =>
        hydrateChannelPal(requirePal(state, assignment.palId), assignment),
      ),
  };
}

export function toChannelSummary(channel: WorkspaceChannelState): WorkspaceChannelSummary {
  return {
    id: channel.id,
    title: channel.title,
    topic: channel.topic,
    status: channel.status,
    unreadCount: channel.unreadCount,
    palCount: channel.palAssignments.length,
    activePalCount: activePalCount(channel),
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

export function deleteChannel(
  state: WorkspaceState,
  channelId: string,
): WorkspaceState {
  const nextState = cloneState(state);
  const index = findChannelIndex(nextState, channelId);
  if (index === -1) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  nextState.channels.splice(index, 1);

  if (nextState.selectedChannelId === channelId) {
    nextState.selectedChannelId = nextState.channels[0]?.id ?? '';
  }

  return nextState;
}

export function createWorkspacePal(
  state: WorkspaceState,
  input: CreateWorkspacePalInput,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const pal = createPalRecord(input, isoAt(now));
  if (!pal.avatarColor) {
    pal.avatarColor = pickAvatarColor(nextState.pals.length);
  }
  nextState.pals.unshift(pal);
  return nextState;
}

export function deletePal(
  state: WorkspaceState,
  palId: string,
): WorkspaceState {
  const nextState = cloneState(state);
  const palIndex = nextState.pals.findIndex((p) => p.id === palId);
  if (palIndex === -1) {
    throw new Error(`Pal not found: ${palId}`);
  }
  if (nextState.bossCatId === palId) {
    throw new Error('Cannot delete Boss Cat');
  }
  nextState.pals.splice(palIndex, 1);
  for (const channel of nextState.channels) {
    channel.palAssignments = channel.palAssignments.filter((a) => a.palId !== palId);
  }
  return nextState;
}

export function createChannel(
  state: WorkspaceState,
  input: CreateWorkspaceChannelInput,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const title = input.title.trim() || 'New chat';
  const topic = input.topic.trim();
  const channelId = createChannelId();
  const catDrafts = input.cats ?? input.pals ?? [];
  const createdPals = catDrafts.map((palInput) => createPalRecord(palInput, nowIso));

  nextState.pals.unshift(...createdPals);

  const palAssignments = createdPals.map((pal, index) =>
    createAssignmentRecord(
      pal,
      {
        provider: catDrafts[index]?.provider,
        model: catDrafts[index]?.model,
        roles: catDrafts[index]?.roles,
      },
      nowIso,
    ),
  );

  const channel: WorkspaceChannelState = {
    id: channelId,
    title,
    topic,
    status: palAssignments.length > 0 ? 'configured' : 'planned',
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
    palAssignments,
    messages: [],
  };

  nextState.channels.unshift(channel);
  nextState.selectedChannelId = channelId;
  return nextState;
}

export function assignPalToChannel(
  state: WorkspaceState,
  channelId: string,
  input: AssignChannelPalInput,
  now: Date = new Date(),
): WorkspaceState {
  if (state.bossCatId && input.palId === state.bossCatId) {
    throw new Error('Boss Cat is already the default chat entrypoint');
  }

  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const channel = requireChannel(nextState, channelId);
  const pal = requirePal(nextState, input.palId);
  const existing = channel.palAssignments.find((candidate) => candidate.palId === input.palId);

  if (!existing) {
    channel.palAssignments.push(
      createAssignmentRecord(
        pal,
        {
          provider: input.provider,
          instance: input.instance,
          model: input.model,
          roles: input.roles,
        },
        nowIso,
      ),
    );

    if (channel.status === 'planned') {
      channel.status = 'configured';
    }

    applyMessageToChannel(
      channel,
      createMessageRecord(
        channelId,
        'system',
        'Chat',
        `${pal.name} joined the chat.`,
        nowIso,
        { event: 'pal_assigned', palId: pal.id },
        null,
      ),
      nowIso,
    );
    return nextState;
  }

  const nextRoles = normalizeList(input.roles);
  const nextProvider = input.provider?.trim() || existing.execution.target.provider;
  const nextInstance =
    input.instance === undefined
      ? existing.execution.target.instance
      : normalizeOptionalText(input.instance);
  const nextModel =
    input.model === undefined
      ? existing.execution.target.model
      : normalizeOptionalText(input.model);
  const targetChanged =
    existing.execution.target.provider !== nextProvider
    || existing.execution.target.instance !== nextInstance
    || existing.execution.target.model !== nextModel;

  existing.status = 'active';
  existing.leftAt = null;
  existing.roles = nextRoles.length > 0 ? nextRoles : (existing.roles.length > 0 ? existing.roles : pal.roles);
  existing.execution.target = {
    provider: nextProvider,
    instance: nextInstance,
    model: nextModel,
  };

  if (targetChanged) {
    existing.execution.lease = createEmptyExecutionLease();
  } else if (existing.execution.lease.status === 'removed') {
    existing.execution.lease.status = 'not_started';
  }

  applyMessageToChannel(
    channel,
    createMessageRecord(
      channelId,
      'system',
      'Chat',
      targetChanged
        ? `${pal.name}'s chat assignment was updated. Reactivate the chat to use the new provider target.`
        : `${pal.name}'s chat assignment is ready.`,
      nowIso,
      {
        event: targetChanged ? 'pal_assignment_updated' : 'pal_assignment_reused',
        palId: pal.id,
      },
      null,
    ),
    nowIso,
  );

  return nextState;
}

export function removePalFromChannel(
  state: WorkspaceState,
  channelId: string,
  palId: string,
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const channel = requireChannel(nextState, channelId);
  const assignment = channel.palAssignments.find((candidate) => candidate.palId === palId);

  if (!assignment) {
    throw new Error(`Channel pal assignment not found: ${palId}`);
  }

  assignment.status = 'removed';
  assignment.leftAt = nowIso;
  assignment.execution.lease.status = 'removed';

  const pal = requirePal(nextState, palId);
  applyMessageToChannel(
    channel,
    createMessageRecord(
      channelId,
      'system',
      'Chat',
      `${pal.name} left the chat.`,
      nowIso,
      { event: 'pal_removed', palId },
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
      instance:
        normalizeOptionalText(input.instance)
        ?? nextState.globalOrchestrator.executionTarget.instance,
      model:
        input.model === undefined
          ? nextState.globalOrchestrator.executionTarget.model
          : normalizeOptionalText(input.model),
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

export function setChannelPalLease(
  state: WorkspaceState,
  channelId: string,
  palId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): WorkspaceState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const assignment = channel.palAssignments.find((candidate) => candidate.palId === palId);

  if (!assignment) {
    throw new Error(`Channel pal assignment not found: ${palId}`);
  }

  assignment.execution.lease = updateExecutionLease(assignment.execution.lease, leaseUpdate);
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
  const channel = requireChannel(state, channelId);

  return {
    exportedAt: new Date().toISOString(),
    orchestrator: structuredClone(state.globalOrchestrator),
    channel: structuredClone(channel),
    assignedPals: buildChannelView(state, channel).assignedPals,
  };
}

export function buildChannelExportFilename(state: WorkspaceState, channelId: string): string {
  const channel = requireChannel(state, channelId);
  return createChannelExportFilename(channel.title, channel.id);
}

export function summarizeState(state: WorkspaceState): {
  pals: WorkspacePal[];
  channels: WorkspaceChannelSummary[];
  selectedChannel: WorkspaceChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
} {
  const selectedChannelState =
    state.channels.find((channel) => channel.id === state.selectedChannelId) ?? null;

  return {
    pals: structuredClone(state.pals),
    channels: state.channels.map((channel) => toChannelSummary(channel)),
    selectedChannel: selectedChannelState ? buildChannelView(state, selectedChannelState) : null,
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
