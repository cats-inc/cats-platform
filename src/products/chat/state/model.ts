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
  AssignChannelCatInput,
  ChannelExportPayload,
  ChannelCatAssignment,
  CreateCatInput,
  CreateChatChannelInput,
  GlobalOrchestratorSummary,
  MessageUsageSummary,
  ParticipantExecutionLease,
  ParticipantSessionStatus,
  SendChannelMessageInput,
  ChatChannelCat,
  ChatChannelState,
  ChatChannelStatus,
  ChatChannelSummary,
  ChatChannelView,
  ChatMessage,
  ChatMessageSenderKind,
  ChatCat,
  ChatState,
  UpdateGlobalOrchestratorInput,
} from '../../../shared/app-shell.js';
import { createChannelExportFilename } from '../../../shared/channelPaths.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from './defaults.js';
import {
  createDefaultRoomRoutingState,
  resolveRoomRoutingState,
} from './roomRouting.js';

export const ORCHESTRATOR_NAME = 'Orchestrator';

export function resolveOrchestratorDisplayName(state: ChatState): string {
  if (state.bossCatId) {
    const cat = state.cats.find((candidate) => candidate.id === state.bossCatId);
    if (cat) return cat.name;
  }
  return ORCHESTRATOR_NAME;
}

function cloneState(state: ChatState): ChatState {
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

function normalizeLeadParticipantId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function findChannelIndex(state: ChatState, channelId: string): number {
  return state.channels.findIndex((channel) => channel.id === channelId);
}

export function requireChannel(state: ChatState, channelId: string): ChatChannelState {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  return channel;
}

export function requireCat(state: ChatState, catId: string): ChatCat {
  const cat = state.cats.find((candidate) => candidate.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }

  return cat;
}

function activeCatCount(channel: ChatChannelState): number {
  return channel.catAssignments.filter((assignment) => assignment.status === 'active').length;
}

function createMessageRecord(
  channelId: string,
  senderKind: ChatMessageSenderKind,
  senderName: string,
  body: string,
  createdAt: string,
  metadata: Record<string, unknown>,
  usage: MessageUsageSummary | null,
): ChatMessage {
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
  channel: ChatChannelState,
  message: ChatMessage,
  nowIso: string,
): void {
  channel.messages.push(message);
  channel.updatedAt = nowIso;
  channel.lastMessageAt = nowIso;
}

function createCatRecord(input: CreateCatInput, nowIso: string): ChatCat {
  const name = input.name.trim();
  const provider = input.provider.trim();

  if (!name) {
    throw new Error('Cat name is required');
  }
  if (!provider) {
    throw new Error('Cat provider is required');
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
  cat: ChatCat,
  input: {
    provider?: string;
    instance?: string | null;
    model?: string | null;
    roles?: string[];
  },
  nowIso: string,
): ChannelCatAssignment {
  const roles = normalizeList(input.roles);

  return {
    catId: cat.id,
    status: 'active',
    roles: roles.length > 0 ? roles : cat.roles,
    joinedAt: nowIso,
    leftAt: null,
    execution: {
      target: {
        provider: input.provider?.trim() || cat.defaultExecutionTarget.provider,
        instance:
          input.instance === undefined
            ? cat.defaultExecutionTarget.instance
            : normalizeOptionalText(input.instance),
        model:
          input.model === undefined
            ? cat.defaultExecutionTarget.model
            : normalizeOptionalText(input.model),
      },
      lease: createEmptyExecutionLease(),
    },
  };
}

function hydrateChannelCat(
  cat: ChatCat,
  assignment: ChannelCatAssignment,
): ChatChannelCat {
  return {
    catId: cat.id,
    name: cat.name,
    roles: assignment.roles.length > 0 ? structuredClone(assignment.roles) : structuredClone(cat.roles),
    skillProfile: cat.skillProfile,
    mcpProfile: cat.mcpProfile,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: cat.avatarColor,
    execution: structuredClone(assignment.execution),
    memory: structuredClone(cat.memory),
  };
}

export function buildChannelView(
  state: ChatState,
  channelOrId: ChatChannelState | string,
): ChatChannelView {
  const channel =
    typeof channelOrId === 'string' ? requireChannel(state, channelOrId) : channelOrId;
  const clonedChannel = structuredClone(channel);

  return {
    ...clonedChannel,
    roomRouting: clonedChannel.roomRouting ?? createDefaultRoomRoutingState(),
    assignedCats: channel.catAssignments
      .filter((assignment) => state.cats.some((p) => p.id === assignment.catId))
      .map((assignment) =>
        hydrateChannelCat(requireCat(state, assignment.catId), assignment),
      ),
  };
}

export function toChannelSummary(channel: ChatChannelState): ChatChannelSummary {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflowStatus = roomRouting.workflow.activeTurn?.status
    ?? roomRouting.workflow.lastOutcomeEvent?.status
    ?? null;
  const lastWorkflowAt = roomRouting.workflow.activeTurn?.updatedAt
    ?? roomRouting.workflow.lastOutcomeEvent?.createdAt
    ?? null;
  const routingStatus = workflowStatus === 'pending'
    ? 'running'
    : workflowStatus === 'failed'
      ? 'error'
      : workflowStatus;
  return {
    id: channel.id,
    title: channel.title,
    topic: channel.topic,
    status: channel.status,
    unreadCount: channel.unreadCount,
    catCount: channel.catAssignments.length,
    activeCatCount: activeCatCount(channel),
    repoPath: channel.repoPath,
    chatCwd: channel.chatCwd,
    lastMessageAt: channel.lastMessageAt,
    lastActivatedAt: channel.lastActivatedAt,
    roomMode: roomRouting.mode,
    routingStatus: routingStatus ?? roomRouting.lastOutcome?.status ?? 'idle',
    lastRoutingAt:
      lastWorkflowAt
      ?? roomRouting.lastOutcome?.completedAt
      ?? roomRouting.lastCheckpoint?.createdAt
      ?? null,
  };
}

export function selectChannel(
  state: ChatState,
  selectedChannelId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, selectedChannelId);
  nextState.selectedChannelId = selectedChannelId;
  channel.unreadCount = 0;
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function deleteChannel(
  state: ChatState,
  channelId: string,
): ChatState {
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

export function createCat(
  state: ChatState,
  input: CreateCatInput,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const cat = createCatRecord(input, isoAt(now));
  if (!cat.avatarColor) {
    cat.avatarColor = pickAvatarColor(nextState.cats.length);
  }
  nextState.cats.unshift(cat);
  return nextState;
}

export function deleteCat(
  state: ChatState,
  catId: string,
): ChatState {
  const nextState = cloneState(state);
  const catIndex = nextState.cats.findIndex((p) => p.id === catId);
  if (catIndex === -1) {
    throw new Error(`Cat not found: ${catId}`);
  }
  if (nextState.bossCatId === catId) {
    throw new Error('Cannot delete Boss Cat');
  }
  nextState.cats.splice(catIndex, 1);
  for (const channel of nextState.channels) {
    channel.catAssignments = channel.catAssignments.filter((a) => a.catId !== catId);
  }
  return nextState;
}

export function createChannel(
  state: ChatState,
  input: CreateChatChannelInput,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const title = input.title.trim() || 'New chat';
  const topic = input.topic.trim();
  const channelId = createChannelId();
  const catDrafts = input.cats ?? input.cats ?? [];
  const createdCats = catDrafts.map((palInput) => createCatRecord(palInput, nowIso));
  const requestedLeadParticipantId = normalizeLeadParticipantId(input.leadParticipantId);
  const defaultLeadParticipantId = requestedLeadParticipantId
    ?? (
      input.roomMode === 'direct_cat_chat' && createdCats.length === 1
        ? createdCats[0]?.id ?? null
        : null
    );

  nextState.cats.unshift(...createdCats);

  const catAssignments = createdCats.map((cat, index) =>
    createAssignmentRecord(
      cat,
      {
        provider: catDrafts[index]?.provider,
        model: catDrafts[index]?.model,
        roles: catDrafts[index]?.roles,
      },
      nowIso,
    ),
  );

  const channel: ChatChannelState = {
    id: channelId,
    title,
    topic,
    status: catAssignments.length > 0 ? 'configured' : 'planned',
    unreadCount: 0,
    repoPath: normalizeOptionalText(input.repoPath),
    chatCwd: null,
    language: normalizeOptionalText(input.language),
    responseLanguage: normalizeOptionalText(input.responseLanguage) ?? 'en',
    formationMode: input.formationMode ?? 'manual',
    skillProfile: normalizeOptionalText(input.skillProfile) ?? 'chat-default',
    mcpProfile: normalizeOptionalText(input.mcpProfile) ?? 'chat-memory',
    orchestratorRoles: normalizeList(input.orchestratorRoles),
    createdAt: nowIso,
    updatedAt: nowIso,
    lastMessageAt: nowIso,
    lastActivatedAt: null,
    orchestratorLease: createEmptyExecutionLease(),
    catAssignments,
    messages: [],
    roomRouting: createDefaultRoomRoutingState({
      mode: input.roomMode,
      leadParticipantId: defaultLeadParticipantId,
    }),
  };

  nextState.channels.unshift(channel);
  nextState.selectedChannelId = channelId;
  return nextState;
}

export function assignCatToChannel(
  state: ChatState,
  channelId: string,
  input: AssignChannelCatInput,
  now: Date = new Date(),
): ChatState {
  if (state.bossCatId && input.catId === state.bossCatId) {
    throw new Error('Boss Cat is already the default chat entrypoint');
  }

  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const channel = requireChannel(nextState, channelId);
  const cat = requireCat(nextState, input.catId);
  const existing = channel.catAssignments.find((candidate) => candidate.catId === input.catId);

  if (!existing) {
    channel.catAssignments.push(
      createAssignmentRecord(
        cat,
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
        `${cat.name} joined the chat.`,
        nowIso,
        { event: 'cat_assigned', catId: cat.id },
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
  existing.roles = nextRoles.length > 0 ? nextRoles : (existing.roles.length > 0 ? existing.roles : cat.roles);
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
        ? `${cat.name}'s chat assignment was updated. Reactivate the chat to use the new provider target.`
        : `${cat.name}'s chat assignment is ready.`,
      nowIso,
      {
        event: targetChanged ? 'cat_assignment_updated' : 'cat_assignment_reused',
        catId: cat.id,
      },
      null,
    ),
    nowIso,
  );

  return nextState;
}

export function removeCatFromChannel(
  state: ChatState,
  channelId: string,
  catId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const channel = requireChannel(nextState, channelId);
  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);

  if (!assignment) {
    throw new Error(`Channel cat assignment not found: ${catId}`);
  }

  assignment.status = 'removed';
  assignment.leftAt = nowIso;
  assignment.execution.lease.status = 'removed';

  const cat = requireCat(nextState, catId);
  applyMessageToChannel(
    channel,
    createMessageRecord(
      channelId,
      'system',
      'Chat',
      `${cat.name} left the chat.`,
      nowIso,
      { event: 'pal_removed', catId },
      null,
    ),
    nowIso,
  );

  return nextState;
}

export function updateGlobalOrchestrator(
  state: ChatState,
  input: UpdateGlobalOrchestratorInput,
  now: Date = new Date(),
): ChatState {
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
  state: ChatState,
  channelId: string,
  input: SendChannelMessageInput & {
    senderKind: ChatMessageSenderKind;
    senderName: string;
  },
  now: Date = new Date(),
  options: {
    metadata?: Record<string, unknown>;
    usage?: MessageUsageSummary | null;
    incrementUnread?: boolean;
  } = {},
): { state: ChatState; message: ChatMessage } {
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
  state: ChatState,
  channelId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.orchestratorLease = updateExecutionLease(channel.orchestratorLease, leaseUpdate);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelCatLease(
  state: ChatState,
  channelId: string,
  catId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);

  if (!assignment) {
    throw new Error(`Channel cat assignment not found: ${catId}`);
  }

  assignment.execution.lease = updateExecutionLease(assignment.execution.lease, leaseUpdate);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelStatus(
  state: ChatState,
  channelId: string,
  status: ChatChannelStatus,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.status = status;
  channel.updatedAt = isoAt(now);
  if (status === 'active') {
    channel.lastActivatedAt = channel.updatedAt;
  }
  return nextState;
}

export function setChannelChatCwd(
  state: ChatState,
  channelId: string,
  chatCwd: string | null,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.chatCwd = normalizeOptionalText(chatCwd);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelRoomRouting(
  state: ChatState,
  channelId: string,
  roomRouting: NonNullable<ChatChannelState['roomRouting']>,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.roomRouting = structuredClone(roomRouting);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function parseMentions(text: string): string[] {
  return Array.from(new Set(text.match(/(?<!\w)@([A-Za-z0-9._-]+)/gu)?.map((value) => value.slice(1)) ?? []));
}

export function exportChannel(state: ChatState, channelId: string): ChannelExportPayload {
  const channel = requireChannel(state, channelId);

  return {
    exportedAt: new Date().toISOString(),
    orchestrator: structuredClone(state.globalOrchestrator),
    channel: structuredClone(channel),
    assignedCats: buildChannelView(state, channel).assignedCats,
  };
}

export function buildChannelExportFilename(state: ChatState, channelId: string): string {
  const channel = requireChannel(state, channelId);
  return createChannelExportFilename(channel.title, channel.id);
}

export function summarizeState(state: ChatState): {
  cats: ChatCat[];
  channels: ChatChannelSummary[];
  selectedChannel: ChatChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
} {
  const selectedChannelState =
    state.channels.find((channel) => channel.id === state.selectedChannelId) ?? null;

  return {
    cats: structuredClone(state.cats),
    channels: state.channels.map((channel) => toChannelSummary(channel)),
    selectedChannel: selectedChannelState ? buildChannelView(state, selectedChannelState) : null,
    globalOrchestrator: structuredClone(state.globalOrchestrator),
  };
}

export function replaceState(state: ChatState, channel: ChatChannelState): ChatState {
  const nextState = cloneState(state);
  const index = findChannelIndex(nextState, channel.id);
  if (index === -1) {
    throw new Error(`Channel not found: ${channel.id}`);
  }
  nextState.channels[index] = structuredClone(channel);
  return nextState;
}
