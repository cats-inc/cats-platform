export const AVATAR_PALETTE = [
  '#7986CB', '#4DB6AC', '#FFB74D', '#BA68C8',
  '#64B5F6', '#81C784', '#FF8A65', '#9575CD',
  '#4FC3F7', '#A1887F', '#F06292', '#E57373',
] as const;

export function pickAvatarColor(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

import type {
  AssignChannelCatInput,
  CreateCatInput,
  CreateChatChannelInput,
  MessageUsageSummary,
  ParticipantExecutionLease,
  SendChannelMessageInput,
  ChatChannelState,
  ChatChannelStatus,
  ChatMessage,
  ChatState,
  UpdateGlobalOrchestratorInput,
} from '../api/contracts.js';
import type {
  ChatMessageSenderKind,
  ParticipantSessionStatus,
} from '../../../shared/roomRouting.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from './defaults.js';
import {
  applyMessageToChannel,
  createAssignmentRecord,
  createCatRecord,
  createMessageRecord,
} from './modelRecordBuilders.js';
import {
  cloneState,
  createChannelId,
  findChannelIndex,
  inferChannelComposerMode,
  isoAt,
  normalizeLeadParticipantId,
  normalizeList,
  normalizeOptionalText,
  requireCat,
  requireChannel,
  syncChannelLeadAndComposerMode,
  updateExecutionLease,
} from './modelShared.js';
import {
  createDefaultRoomRoutingState,
} from './roomRouting.js';

export type { ChatLifecycleState } from '../shared/lifecycle.js';
export {
  ORCHESTRATOR_NAME,
  buildChannelExportFilename,
  buildChannelView,
  exportChannel,
  resolveChannelEntryParticipant,
  resolveOrchestratorDisplayName,
  resolveParticipantLifecycleState,
  summarizeState,
  toChannelSummary,
} from './modelReadModels.js';
export { requireCat, requireChannel } from './modelShared.js';

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

const DEFAULT_CAT_NAME = 'Boss Cat';
const DEFAULT_AVATAR_COLOR = '#90A4AE';

export function isDefaultCatName(name: string): boolean {
  return name.trim() === DEFAULT_CAT_NAME;
}

export function createCat(
  state: ChatState,
  input: CreateCatInput,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const cat = createCatRecord(input, isoAt(now));
  if (!cat.avatarColor) {
    cat.avatarColor = isDefaultCatName(cat.name)
      ? DEFAULT_AVATAR_COLOR
      : pickAvatarColor(nextState.cats.length);
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

export function updateCatSkillProfile(
  state: ChatState,
  catId: string,
  skillProfile: string | null,
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  cat.skillProfile = skillProfile;
  cat.updatedAt = new Date().toISOString();
  return nextState;
}

export function setBossCat(
  state: ChatState,
  catId: string,
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  if (cat.status !== 'active') {
    throw new Error(`Cat is not active: ${catId}`);
  }
  nextState.bossCatId = catId;
  return nextState;
}

export function renameCat(
  state: ChatState,
  catId: string,
  name: string,
): ChatState {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Cat name cannot be empty');
  }
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  const wasDefault = isDefaultCatName(cat.name);
  cat.name = trimmed;
  if (isDefaultCatName(trimmed)) {
    cat.avatarColor = DEFAULT_AVATAR_COLOR;
  } else if (wasDefault && cat.avatarColor === DEFAULT_AVATAR_COLOR) {
    cat.avatarColor = pickAvatarColor(state.cats.indexOf(state.cats.find((c) => c.id === catId)!) );
  }
  cat.updatedAt = new Date().toISOString();
  return nextState;
}

export function createChannel(
  state: ChatState,
  input: CreateChatChannelInput,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const nowIso = isoAt(now);
  const topic = input.topic.trim();
  const channelId = createChannelId();
  const catDrafts = input.cats ?? [];
  const createdCats = catDrafts.map((palInput) => createCatRecord(palInput, nowIso));
  const participantCatIds = input.participantCatIds ?? [];

  // Auto-generate title for direct cat chats when title is empty
  let title = input.title.trim();
  if (!title && input.roomMode === 'direct_cat_chat') {
    const singleCatName = createdCats.length === 1
      ? createdCats[0]?.name
      : participantCatIds.length === 1
        ? nextState.cats.find((cat) => cat.id === participantCatIds[0])?.name
        : null;
    title = singleCatName ? `${singleCatName} Direct Chat` : 'New chat';
  }
  title = title || 'New chat';
  const requestedLeadParticipantId = normalizeLeadParticipantId(input.leadParticipantId);
  const defaultLeadParticipantId = requestedLeadParticipantId
    ?? (
      input.roomMode === 'direct_cat_chat' && createdCats.length === 1
        ? createdCats[0]?.id ?? null
        : input.roomMode === 'direct_cat_chat' && createdCats.length === 0 && participantCatIds.length === 1
          ? participantCatIds[0] ?? null
          : participantCatIds.length > 0
            ? participantCatIds[0] ?? null
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

  for (const catId of participantCatIds) {
    const existingCat = requireCat(nextState, catId);
    catAssignments.push(
      createAssignmentRecord(existingCat, {}, nowIso),
    );
  }

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
    composerMode: input.composerMode
      ?? inferChannelComposerMode({
        roomMode: input.roomMode,
        activeCatIds: catAssignments
          .filter((assignment) => assignment.status === 'active')
          .map((assignment) => assignment.catId),
      }),
    pendingProvider: normalizeOptionalText(input.pendingProvider),
    pendingModel: normalizeOptionalText(input.pendingModel),
    pendingInstance: normalizeOptionalText(input.pendingInstance),
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
    workingMemory: createEmptyMemoryCheckpoint(),
  };

  syncChannelLeadAndComposerMode(channel);
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

    syncChannelLeadAndComposerMode(channel);

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

  syncChannelLeadAndComposerMode(channel);

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
  assignment.execution.lease = {
    ...assignment.execution.lease,
    sessionId: null,
    status: 'removed',
    cwd: null,
    lastError: null,
    provider: null,
    model: null,
    startedAt: null,
    lastUsedAt: null,
  };

  syncChannelLeadAndComposerMode(channel);

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
    choices?: ChatMessage['choices'];
    choiceResponse?: ChatMessage['choiceResponse'];
    execution?: {
      provider?: string | null;
      model?: string | null;
      instance?: string | null;
    };
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
    options.execution ?? {},
    {
      choices: options.choices,
      choiceResponse: options.choiceResponse,
    },
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

export function setChannelPendingExecutionTarget(
  state: ChatState,
  channelId: string,
  input: {
    provider?: string | null;
    model?: string | null;
    instance?: string | null;
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);

  if (input.provider !== undefined) {
    channel.pendingProvider = normalizeOptionalText(input.provider);
  }
  if (input.model !== undefined) {
    channel.pendingModel = normalizeOptionalText(input.model);
  }
  if (input.instance !== undefined) {
    channel.pendingInstance = normalizeOptionalText(input.instance);
  }

  channel.updatedAt = isoAt(now);
  return nextState;
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

export function replaceState(state: ChatState, channel: ChatChannelState): ChatState {
  const nextState = cloneState(state);
  const index = findChannelIndex(nextState, channel.id);
  if (index === -1) {
    throw new Error(`Channel not found: ${channel.id}`);
  }
  nextState.channels[index] = structuredClone(channel);
  return nextState;
}
