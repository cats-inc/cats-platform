import type {
  AssignChannelCatInput,
  ChannelCatAssignment,
  ChannelParticipantAssignment,
  CreateParallelChatGroupInput,
  CreateChatChannelInput,
  MessageUsageSummary,
  NewChatDefaults,
  SendChannelMessageInput,
  ChatChannelState,
  ChatMessage,
  ChatState,
  UpdateGlobalOrchestratorInput,
} from '../../api/contracts.js';
import type {
  ChatMessageSenderKind,
} from '../../../../shared/roomRouting.js';
import {
  cloneProviderModelSelection,
  type ProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../../shared/platformSurfaces.js';
import {
  inferChannelKind,
  normalizeChannelAssignmentsForRoomMode,
  resolveChannelKind,
  resolveDirectLaneRecipientId,
} from '../../shared/channelTopology.js';
import {
  resolveChannelParticipantAssignments,
  resolveParticipantExecutionAssignments,
} from '../../shared/channelParticipants.js';
import { resolveTemporaryParticipantName } from '../../shared/participantNaming.js';
import { buildParallelChatMemberLabel } from '../../shared/parallelChats.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from '../defaults.js';
import {
  applyMessageToChannel,
  createAssignmentRecord,
  createCatRecord,
  createMessageRecord,
  createTemporaryParticipantAssignment,
} from './recordBuilders.js';
import {
  cloneState,
  createChannelId,
  findChannelIndex,
  inferChannelComposerMode,
  isoAt,
  normalizeDefaultRecipientId,
  normalizeList,
  normalizeOptionalText,
  requireCat,
  requireChannel,
  syncChannelDefaultRecipientAndComposerMode,
} from './shared.js';
export {
  deleteChannel,
  deleteParallelChatGroup,
  findParallelChatGroupByChannelId,
  renameChannel,
  renameParallelChatGroup,
  selectChannel,
  touchParallelChatGroup,
  ungroupParallelChatGroup,
} from './channelGroups.js';
export {
  replaceState,
  setChannelChatCwd,
  setChannelRoomRouting,
  setChannelStatus,
} from './channelState.js';
export {
  setChannelCatLease,
  setChannelOrchestratorLease,
  setChannelParticipantLease,
} from './channelLeases.js';
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

export function createParallelChatGroup(
  state: ChatState,
  input: CreateParallelChatGroupInput,
  now: Date = new Date(),
): ChatState {
  if (input.targets.length < 2) {
    throw new Error('Parallel chats require at least two model targets.');
  }

  let nextState = cloneState(state);
  const nowIso = isoAt(now);
  const memberChannelIds: string[] = [];

  for (const target of [...input.targets].reverse()) {
    nextState = createChannel(
      nextState,
      {
        title: input.title,
        topic: input.title,
        repoPath: input.repoPath,
        responseLanguage: input.responseLanguage,
        composerMode: 'solo',
        pendingProvider: target.provider,
        pendingModel: target.model ?? undefined,
        pendingInstance: target.instance ?? undefined,
        pendingModelSelection: target.modelSelection ?? undefined,
        skipBossCatGreeting: true,
      },
      now,
    );
    memberChannelIds.unshift(nextState.selectedChannelId);
  }

  nextState.parallelChatGroups.unshift({
    id: createChannelId(),
    title: input.title.trim() || 'Parallel chat',
    mode: 'parallel',
    status: 'active',
    memberChannelIds,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastMessageAt: null,
  });

  return nextState;
}

function describeCreatedRoom(
  state: ChatState,
  channelId: string,
): string {
  const channel = requireChannel(state, channelId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const activeParticipantNames = resolveChannelParticipantAssignments(channel)
    .filter((assignment) => assignment.status === 'active')
    .map((assignment) => assignment.name.trim())
    .filter((name): name is string => Boolean(name));

  if (roomRouting.mode === 'direct_cat_chat') {
    return `direct chat with ${activeParticipantNames[0] ?? 'the selected participant'}`;
  }

  if (channel.composerMode === 'solo' && channel.pendingProvider) {
    return `solo chat with ${buildParallelChatMemberLabel({
      provider: channel.pendingProvider,
      instance: channel.pendingInstance,
      model: channel.pendingModel,
      modelSelection: channel.pendingModelSelection ?? null,
    })}`;
  }

  if (activeParticipantNames.length === 1) {
    return `participant-led chat with ${activeParticipantNames[0]}`;
  }

  if (activeParticipantNames.length > 1) {
    return `shared room with ${activeParticipantNames.join(', ')}`;
  }

  return 'Boss Chat';
}

function resolveRequestedRoomMode(
  input: CreateChatChannelInput,
): NonNullable<CreateChatChannelInput['roomMode']> {
  if (input.roomMode) {
    return input.roomMode;
  }
  return input.entryKind === 'direct' ? 'direct_cat_chat' : 'boss_chat';
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
  const temporaryParticipants = input.temporaryParticipants ?? [];
  const takenParticipantNames = [
    ...createdCats.map((cat) => cat.name),
    ...participantCatIds.map((catId) => {
      const existingCat = state.cats.find((cat) => cat.id === catId);
      return existingCat?.name ?? '';
    }).filter((name) => name.length > 0),
  ];
  const resolvedTemporaryParticipants = temporaryParticipants.map((participant) => {
    const name = resolveTemporaryParticipantName(participant, takenParticipantNames);
    takenParticipantNames.push(name);
    return {
      ...participant,
      name,
    };
  });
  const createdTemporaryParticipants = resolvedTemporaryParticipants.map((participant) =>
    createTemporaryParticipantAssignment(participant, nowIso));
  const requestedRoomMode = resolveRequestedRoomMode(input);

  // Auto-generate title for direct cat chats when title is empty
  let title = input.title.trim();
  if (!title && requestedRoomMode === 'direct_cat_chat') {
    const singleCatName = createdCats.length === 1
      ? createdCats[0]?.name
      : participantCatIds.length === 1
        ? nextState.cats.find((cat) => cat.id === participantCatIds[0])?.name
        : createdTemporaryParticipants.length === 1
          ? createdTemporaryParticipants[0]?.name ?? null
        : null;
    title = singleCatName ? `${singleCatName} Direct Chat` : 'New chat';
  }
  title = title || 'New chat';
  const requestedLeadParticipantId = normalizeDefaultRecipientId(input.defaultRecipientId);
  const defaultLeadParticipantId = requestedLeadParticipantId
    ?? (
      requestedRoomMode === 'direct_cat_chat' && createdCats.length === 1
        ? createdCats[0]?.id ?? null
      : requestedRoomMode === 'direct_cat_chat' && createdCats.length === 0 && participantCatIds.length === 1
          ? participantCatIds[0] ?? null
          : participantCatIds.length > 0
          ? participantCatIds[0] ?? null
          : createdTemporaryParticipants.length > 0
            ? createdTemporaryParticipants[0]?.participantId ?? null
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

  const participantAssignments = [
    ...catAssignments.map((assignment) => ({
      participantId: assignment.participantId,
      sourceKind: assignment.sourceKind,
      sourceRefId: assignment.sourceRefId,
      name: assignment.name,
      status: assignment.status,
      roles: structuredClone(assignment.roles),
      roleHint: assignment.roleHint,
      joinedAt: assignment.joinedAt,
      leftAt: assignment.leftAt,
      execution: structuredClone(assignment.execution),
    })),
    ...createdTemporaryParticipants.map((participant) => structuredClone(participant)),
  ];

  const normalizedCatAssignments = normalizeChannelAssignmentsForRoomMode(
    catAssignments,
    requestedRoomMode,
    defaultLeadParticipantId,
  );
  const normalizedParticipantAssignments = normalizeChannelAssignmentsForRoomMode(
    participantAssignments,
    requestedRoomMode,
    defaultLeadParticipantId,
  );

  const channel: ChatChannelState = {
    id: channelId,
    title,
    topic,
    channelKind: inferChannelKind({
      roomMode: requestedRoomMode,
      participants: normalizedParticipantAssignments,
    }),
    recoverableDirectLaneCatId: null,
    status: normalizedParticipantAssignments.length > 0 ? 'configured' : 'planned',
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
      ?? (input.entryKind === 'solo' ? 'solo' : undefined)
      ?? inferChannelComposerMode({
        roomMode: requestedRoomMode,
        activeParticipantIds: normalizedParticipantAssignments
          .filter((assignment) => assignment.status === 'active')
          .map((assignment) => assignment.participantId),
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
    participantAssignments: normalizedParticipantAssignments,
    messages: [],
    roomRouting: createDefaultRoomRoutingState({
      mode: requestedRoomMode,
      defaultRecipientId: defaultLeadParticipantId,
    }),
    workingMemory: createEmptyMemoryCheckpoint(),
  };

  syncChannelDefaultRecipientAndComposerMode(channel);
  nextState.channels.unshift(channel);
  nextState.selectedChannelId = channelId;

  return appendMessage(
    nextState,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Chat',
      body: `Room created: ${describeCreatedRoom(nextState, channelId)}.`,
    },
    now,
    {
      metadata: {
        event: 'room_created',
        verbosity: 'verbose',
        roomMode: resolveRoomRoutingState(channel.roomRouting).mode,
        composerMode: channel.composerMode,
      },
      incrementUnread: false,
    },
  ).state;
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
    roomRouting.defaultRecipientId,
  );
  channel.channelKind = resolveChannelKind({
    channelKind: channel.channelKind,
    roomMode: roomRouting.mode,
    participants: channel.catAssignments,
  });
  if (channel.channelKind === 'direct_lane') {
    const directLeadCatId = resolveDirectLaneRecipientId(
      channel.catAssignments,
      roomRouting.defaultRecipientId,
    );
    if (directLeadCatId && directLeadCatId !== input.catId) {
      throw new Error('Direct lanes can only contain their lead cat');
    }
  }
  const cat = requireCat(nextState, input.catId);
  if (cat.status !== 'active') {
    throw new Error(`Cat is not active: ${input.catId}`);
  }
  if (!hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() })) {
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

    syncChannelDefaultRecipientAndComposerMode(channel);

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

  syncChannelDefaultRecipientAndComposerMode(channel);

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

  syncChannelDefaultRecipientAndComposerMode(channel);

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

export function setGlobalOrchestratorExecutionTarget(
  state: ChatState,
  input: {
    provider?: string | null;
    instance?: string | null;
    model?: string | null;
    modelSelection?: ProviderModelSelection | null;
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  nextState.globalOrchestrator = {
    ...nextState.globalOrchestrator,
    executionTarget: {
      provider: input.provider?.trim() || nextState.globalOrchestrator.executionTarget.provider,
      instance:
        input.instance === undefined
          ? nextState.globalOrchestrator.executionTarget.instance
          : normalizeOptionalText(input.instance),
      model:
        input.model === undefined
          ? nextState.globalOrchestrator.executionTarget.model
          : normalizeOptionalText(input.model),
    },
    executionModelSelection: input.modelSelection === undefined
      ? cloneProviderModelSelection(nextState.globalOrchestrator.executionModelSelection)
      : cloneProviderModelSelection(input.modelSelection),
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

export function setChannelCatExecutionTarget(
  state: ChatState,
  channelId: string,
  catId: string,
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
  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);

  if (!assignment) {
    throw new Error(`Channel cat assignment not found: ${catId}`);
  }

  if (input.provider !== undefined) {
    assignment.execution.target.provider =
      input.provider?.trim() || assignment.execution.target.provider;
  }
  if (input.model !== undefined) {
    assignment.execution.target.model = normalizeOptionalText(input.model);
  }
  if (input.instance !== undefined) {
    assignment.execution.target.instance = normalizeOptionalText(input.instance);
  }
  if (input.modelSelection !== undefined) {
    assignment.execution.modelSelection = cloneProviderModelSelection(input.modelSelection);
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelParticipantExecutionTarget(
  state: ChatState,
  channelId: string,
  participantId: string,
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
  const { participantAssignment, catAssignment } = resolveParticipantExecutionAssignments(
    channel,
    participantId,
  );

  if (!participantAssignment && !catAssignment) {
    throw new Error(`Channel participant assignment not found: ${participantId}`);
  }

  const assignments = [
    participantAssignment,
    catAssignment,
  ].filter((assignment): assignment is ChannelParticipantAssignment | ChannelCatAssignment => assignment != null);

  for (const assignment of assignments) {
    if (input.provider !== undefined) {
      assignment.execution.target.provider =
        input.provider?.trim() || assignment.execution.target.provider;
    }
    if (input.model !== undefined) {
      assignment.execution.target.model = normalizeOptionalText(input.model);
    }
    if (input.instance !== undefined) {
      assignment.execution.target.instance = normalizeOptionalText(input.instance);
    }
    if (input.modelSelection !== undefined) {
      assignment.execution.modelSelection = cloneProviderModelSelection(input.modelSelection);
    }
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}

export function updateChannelParticipantProfile(
  state: ChatState,
  channelId: string,
  participantId: string,
  input: {
    name?: string | null;
    roleHint?: string | null;
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const participantAssignment = resolveChannelParticipantAssignments(channel).find(
    (candidate) => candidate.participantId === participantId,
  ) ?? null;

  if (!participantAssignment) {
    throw new Error(`Channel participant assignment not found: ${participantId}`);
  }
  if (participantAssignment.sourceKind === 'cat') {
    throw new Error('Only temporary participants can be renamed here.');
  }

  const adhocAssignment = channel.participantAssignments?.find(
    (candidate) => candidate.participantId === participantId,
  ) ?? null;
  if (!adhocAssignment) {
    throw new Error(`Temporary participant assignment not found: ${participantId}`);
  }

  if (input.name !== undefined) {
    const nextName = input.name?.trim() || '';
    if (!nextName) {
      throw new Error('Temporary participant name is required');
    }
    adhocAssignment.name = nextName;
  }

  if (input.roleHint !== undefined) {
    adhocAssignment.roleHint = normalizeOptionalText(input.roleHint);
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}
