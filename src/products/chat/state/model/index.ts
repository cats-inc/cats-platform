import type {
  AssignChannelCatInput,
  CreateChatChannelInput,
  MessageUsageSummary,
  NewChatDefaults,
  ParticipantExecutionLease,
  SendChannelMessageInput,
  ChatChannelState,
  ChatChannelStatus,
  ChatMessage,
  ChatState,
  UpdateGlobalOrchestratorInput,
} from '../../api/contracts.js';
import type {
  ChatMessageSenderKind,
  ParticipantSessionStatus,
} from '../../../../shared/roomRouting.js';
import { cloneProviderModelSelection } from '../../../../shared/providerSelection.js';
import { defaultCatProducts, hasSuiteSurface } from '../../../../shared/suiteSurfaces.js';
import {
  inferChannelKind,
  normalizeChannelAssignmentsForRoomMode,
  resolveChannelKind,
  resolveDirectLaneLeadParticipantId,
} from '../../shared/channelTopology.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from '../defaults.js';
import {
  applyMessageToChannel,
  createAssignmentRecord,
  createCatRecord,
  createMessageRecord,
} from './recordBuilders.js';
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
} from './shared.js';
import {
  createDefaultRoomRoutingState,
  resolveRoomRoutingState,
} from '../room-routing/index.js';

export type { ChatLifecycleState } from '../../shared/lifecycle.js';
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
} from './readModels.js';
export { requireCat, requireChannel } from './shared.js';
export {
  archiveCat,
  createCat,
  deleteCat,
  isDefaultCatName,
  pickAvatarColor,
  renameCat,
  setBossCat,
  unarchiveCat,
  updateCatExecutionTarget,
  updateCatProducts,
  updateCatSkillProfile,
} from './cats.js';

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

export function renameChannel(
  state: ChatState,
  channelId: string,
  title: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.title = title.trim() || channel.title;
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
        modelSelection: catDrafts[index]?.modelSelection,
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

  const normalizedCatAssignments = normalizeChannelAssignmentsForRoomMode(
    catAssignments,
    input.roomMode ?? 'boss_chat',
    defaultLeadParticipantId,
  );

  const channel: ChatChannelState = {
    id: channelId,
    title,
    topic,
    channelKind: inferChannelKind({
      roomMode: input.roomMode ?? 'boss_chat',
      participants: normalizedCatAssignments,
    }),
    recoverableDirectLaneCatId: null,
    status: normalizedCatAssignments.length > 0 ? 'configured' : 'planned',
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
        activeCatIds: normalizedCatAssignments
          .filter((assignment) => assignment.status === 'active')
          .map((assignment) => assignment.catId),
      }),
    pendingProvider: normalizeOptionalText(input.pendingProvider),
    pendingModel: normalizeOptionalText(input.pendingModel),
    pendingInstance: normalizeOptionalText(input.pendingInstance),
    pendingModelSelection: cloneProviderModelSelection(input.pendingModelSelection),
    createdAt: nowIso,
    updatedAt: nowIso,
    lastMessageAt: nowIso,
    lastActivatedAt: null,
    orchestratorLease: createEmptyExecutionLease(),
    catAssignments: normalizedCatAssignments,
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
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  channel.catAssignments = normalizeChannelAssignmentsForRoomMode(
    channel.catAssignments,
    roomRouting.mode,
    roomRouting.leadParticipantId,
  );
  channel.channelKind = resolveChannelKind({
    channelKind: channel.channelKind,
    roomMode: roomRouting.mode,
    participants: channel.catAssignments,
  });
  if (channel.channelKind === 'direct_lane') {
    const directLeadCatId = resolveDirectLaneLeadParticipantId(
      channel.catAssignments,
      roomRouting.leadParticipantId,
    );
    if (directLeadCatId && directLeadCatId !== input.catId) {
      throw new Error('Direct lanes can only contain their lead cat');
    }
  }
  const cat = requireCat(nextState, input.catId);
  if (cat.status !== 'active') {
    throw new Error(`Cat is not active: ${input.catId}`);
  }
  if (!hasSuiteSurface(cat.products, 'chat', { fallback: defaultCatProducts() })) {
    throw new Error(`Cat is not available in Cats Chat: ${input.catId}`);
  }
  const existing = channel.catAssignments.find((candidate) => candidate.catId === input.catId);

  if (!existing) {
    channel.catAssignments.push(
      createAssignmentRecord(
        cat,
        {
          provider: input.provider,
          instance: input.instance,
          model: input.model,
          modelSelection: input.modelSelection,
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
  const nextModelSelection = input.modelSelection === undefined
    ? cloneProviderModelSelection(existing.execution.modelSelection)
    : cloneProviderModelSelection(input.modelSelection);
  const targetChanged =
    existing.execution.target.provider !== nextProvider
    || existing.execution.target.instance !== nextInstance
    || existing.execution.target.model !== nextModel
    || JSON.stringify(existing.execution.modelSelection ?? null) !== JSON.stringify(nextModelSelection);

  existing.status = 'active';
  existing.leftAt = null;
  existing.roles = nextRoles.length > 0 ? nextRoles : (existing.roles.length > 0 ? existing.roles : cat.roles);
  existing.execution.target = {
    provider: nextProvider,
    instance: nextInstance,
    model: nextModel,
  };
  existing.execution.modelSelection = nextModelSelection;

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
    executionModelSelection: input.modelSelection === undefined
      ? cloneProviderModelSelection(nextState.globalOrchestrator.executionModelSelection)
      : cloneProviderModelSelection(input.modelSelection),
    systemPrompt:
      input.systemPrompt?.trim() || nextState.globalOrchestrator.systemPrompt,
    skillProfile: normalizeOptionalText(input.skillProfile),
    mcpProfile: normalizeOptionalText(input.mcpProfile),
    telegramBotName: normalizeOptionalText(input.telegramBotName),
    updatedAt: isoAt(now),
  };
  return nextState;
}

export function updateNewChatDefaults(
  state: ChatState,
  input: Partial<NewChatDefaults>,
): ChatState {
  const nextState = cloneState(state);
  nextState.newChatDefaults = {
    provider: input.provider?.trim() || nextState.newChatDefaults.provider,
    instance:
      input.instance === undefined
        ? nextState.newChatDefaults.instance
        : normalizeOptionalText(input.instance),
    model:
      input.model === undefined
        ? nextState.newChatDefaults.model
        : normalizeOptionalText(input.model),
    modelSelection: input.modelSelection === undefined
      ? cloneProviderModelSelection(nextState.newChatDefaults.modelSelection)
      : cloneProviderModelSelection(input.modelSelection),
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
    modelSelection?: AssignChannelCatInput['modelSelection'];
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
  if (input.modelSelection !== undefined) {
    channel.pendingModelSelection = cloneProviderModelSelection(input.modelSelection);
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
