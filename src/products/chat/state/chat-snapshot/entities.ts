import { randomUUID } from 'node:crypto';

import type {
  ChannelParticipantAssignment,
  ChannelCatAssignment,
  ChatCapabilities,
  ChatCat,
  ChatChannelState,
  ChatMessage,
  ChatState,
  ParallelChatGroupState,
  GlobalOrchestratorSummary,
  NewChatDefaults,
} from '../../api/contracts.js';
import type {
  CoreRecordMetadata,
  ExecutionTargetSummary,
} from '../../../../core/types.js';
import { createDefaultChatState, createEmptyExecutionLease, createEmptyMemoryCheckpoint } from '../defaults.js';
import {
  resolveChannelKind,
  normalizeChannelAssignmentsForRoomMode,
  resolveDirectLaneRecipientId,
} from '../../shared/channelTopology.js';
import {
  extractChatMessageChoicesFromBody,
  normalizeChatMessageChoiceResponse,
} from '../../shared/messageChoices.js';
import {
  parseProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import {
  defaultCatProducts,
  listEnabledPlatformSurfaces,
  normalizePlatformSurfaceList,
} from '../../../../shared/platformSurfaces.js';
import { normalizeRoomRouting } from '../room-routing/snapshot.js';
import {
  asRecord,
  normalizeExecutionLease,
  normalizeExecutionState,
  normalizeExecutionTarget,
  normalizeMemoryCheckpoint,
  readBoolean,
  readNullableString,
  readNumber,
  readString,
  readStringArray,
} from './shared.js';

export function normalizeMessage(rawMessage: unknown, channelId: string): ChatMessage {
  const messageRecord = asRecord(rawMessage);
  const usageRecord = asRecord(messageRecord?.usage);
  const rawSenderKind = readString(messageRecord?.senderKind, 'system');
  const normalizedChoiceResponse = normalizeChatMessageChoiceResponse(messageRecord?.choiceResponse);
  const senderKind = (
    rawSenderKind === 'user'
    || rawSenderKind === 'agent'
    || rawSenderKind === 'system'
    || rawSenderKind === 'orchestrator'
  )
    ? rawSenderKind
    : 'system';
  const normalizedBody = readString(messageRecord?.body);
  const extractedChoices = extractChatMessageChoicesFromBody(
    normalizedBody,
    messageRecord?.choices,
  );

  return {
    id: readString(messageRecord?.id, randomUUID()),
    channelId: readString(messageRecord?.channelId, channelId),
    senderKind,
    senderName: readString(messageRecord?.senderName, 'Chat'),
    body: extractedChoices.body,
    ...(extractedChoices.choices ? { choices: extractedChoices.choices } : {}),
    ...(normalizedChoiceResponse ? { choiceResponse: normalizedChoiceResponse } : {}),
    mentions: readStringArray(messageRecord?.mentions),
    metadata: asRecord(messageRecord?.metadata) ?? {},
    usage: usageRecord
      ? {
          inputTokens: readNumber(usageRecord.inputTokens),
          outputTokens: readNumber(usageRecord.outputTokens),
          tokensUsed: readNumber(usageRecord.tokensUsed),
        }
      : null,
    executionProvider: readNullableString(messageRecord?.executionProvider),
    executionModel: readNullableString(messageRecord?.executionModel),
    executionInstance: readNullableString(messageRecord?.executionInstance),
    createdAt: readString(messageRecord?.createdAt, new Date().toISOString()),
  };
}

export function normalizeChatCat(rawCat: unknown): ChatCat | null {
  const catRecord = asRecord(rawCat);
  if (!catRecord) {
    return null;
  }

  const defaultExecutionTarget = normalizeExecutionTarget(
    catRecord.defaultExecutionTarget,
    { provider: 'claude', instance: null, model: null },
  );
  const rawStatus = readString(catRecord.status, 'active');

  return {
    id: readString(catRecord.id, randomUUID()),
    name: readString(catRecord.name, 'Cat'),
    roles: readStringArray(catRecord.roles),
    skillProfile: readNullableString(catRecord.skillProfile),
    mcpProfile: readNullableString(catRecord.mcpProfile),
    status: rawStatus === 'archived' ? 'archived' : 'active',
    createdAt: readString(catRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(catRecord.updatedAt, new Date().toISOString()),
    archivedAt: readNullableString(catRecord.archivedAt),
    avatarColor: readNullableString(catRecord.avatarColor),
    avatarUrl: readNullableString(catRecord.avatarUrl),
    defaultExecutionTarget,
    defaultModelSelection: parseProviderModelSelection(catRecord.defaultModelSelection),
    products: normalizePlatformSurfaceList(readStringArray(catRecord.products), {
      fallback: defaultCatProducts(),
    }),
    memory: asRecord(catRecord.memory)
      ? normalizeMemoryCheckpoint(catRecord.memory)
      : createEmptyMemoryCheckpoint(),
  };
}

export function normalizeChannelAssignment(
  rawAssignment: unknown,
  fallbackCat: ChatCat,
): ChannelCatAssignment | null {
  const assignmentRecord = asRecord(rawAssignment);
  if (!assignmentRecord) {
    return null;
  }

  const rawStatus = readString(assignmentRecord.status, 'active');
  const execution = normalizeExecutionState(
    assignmentRecord.execution,
    fallbackCat.defaultExecutionTarget,
  );

  return {
    participantId: readString(assignmentRecord.participantId, fallbackCat.id),
    sourceKind: 'cat',
    sourceRefId: readString(assignmentRecord.sourceRefId, fallbackCat.id),
    catId: readString(assignmentRecord.catId, fallbackCat.id),
    name: readString(assignmentRecord.name, fallbackCat.name),
    status: rawStatus === 'removed' ? 'removed' : 'active',
    roles: readStringArray(assignmentRecord.roles),
    roleHint: readNullableString(assignmentRecord.roleHint),
    joinedAt: readString(assignmentRecord.joinedAt, new Date().toISOString()),
    leftAt: readNullableString(assignmentRecord.leftAt),
    execution: {
      ...execution,
      modelSelection: parseProviderModelSelection(assignmentRecord.modelSelection)
        ?? parseProviderModelSelection(asRecord(assignmentRecord.execution)?.modelSelection),
    },
  };
}

function channelParticipantAssignmentFromCatAssignment(
  assignment: ChannelCatAssignment,
): ChannelParticipantAssignment {
  return {
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
  };
}

function normalizeParticipantAssignment(
  rawAssignment: unknown,
  catsById: Map<string, ChatCat>,
): ChannelParticipantAssignment | null {
  const assignmentRecord = asRecord(rawAssignment);
  if (!assignmentRecord) {
    return null;
  }

  const rawStatus = readString(assignmentRecord.status, 'active');
  const sourceKind = readString(assignmentRecord.sourceKind, 'adhoc') === 'cat'
    ? 'cat'
    : 'adhoc';
  const sourceRefId = readNullableString(assignmentRecord.sourceRefId);
  const fallbackCat = sourceKind === 'cat' && sourceRefId
    ? catsById.get(sourceRefId) ?? null
    : null;
  const fallbackTarget = fallbackCat?.defaultExecutionTarget ?? {
    provider: 'claude',
    instance: null,
    model: null,
  };
  const execution = normalizeExecutionState(
    assignmentRecord.execution,
    fallbackTarget,
  );

  return {
    participantId: readString(
      assignmentRecord.participantId,
      sourceKind === 'cat' && sourceRefId ? sourceRefId : randomUUID(),
    ),
    sourceKind,
    sourceRefId,
    name: readString(assignmentRecord.name, fallbackCat?.name ?? 'Participant'),
    status: rawStatus === 'removed' ? 'removed' : 'active',
    roles: readStringArray(assignmentRecord.roles),
    roleHint: readNullableString(assignmentRecord.roleHint),
    joinedAt: readString(assignmentRecord.joinedAt, new Date().toISOString()),
    leftAt: readNullableString(assignmentRecord.leftAt),
    execution: {
      ...execution,
      modelSelection: parseProviderModelSelection(assignmentRecord.modelSelection)
        ?? parseProviderModelSelection(asRecord(assignmentRecord.execution)?.modelSelection),
    },
  };
}

export function normalizeChannel(
  rawChannel: unknown,
  catsById: Map<string, ChatCat>,
): ChatChannelState | null {
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

  const catAssignments = Array.isArray(channelRecord.catAssignments)
    ? channelRecord.catAssignments
        .map((assignment) => {
          const assignmentRecord = asRecord(assignment);
          const catId = readString(assignmentRecord?.catId, '');
          const fallbackCat = catId && catsById.has(catId)
            ? catsById.get(catId) ?? null
            : null;
          return fallbackCat ? normalizeChannelAssignment(assignmentRecord, fallbackCat) : null;
        })
        .filter((assignment): assignment is ChannelCatAssignment => assignment !== null)
      : [];
  const messages = Array.isArray(channelRecord.messages)
    ? channelRecord.messages.map((message) => normalizeMessage(message, channelId))
    : [];
  const roomRouting = normalizeRoomRouting(channelRecord.roomRouting);
  const participantAssignments = Array.isArray(channelRecord.participantAssignments)
    ? channelRecord.participantAssignments
        .map((assignment) => normalizeParticipantAssignment(assignment, catsById))
        .filter(
          (assignment): assignment is ChannelParticipantAssignment =>
            assignment !== null,
        )
    : catAssignments.map((assignment) => channelParticipantAssignmentFromCatAssignment(assignment));
  const normalizedCatAssignments = normalizeChannelAssignmentsForRoomMode(
    catAssignments,
    roomRouting.mode,
    roomRouting.defaultRecipientId,
  );
  const normalizedParticipantAssignments = normalizeChannelAssignmentsForRoomMode(
    participantAssignments,
    roomRouting.mode,
    roomRouting.defaultRecipientId,
  );
  const channelKind = resolveChannelKind({
    channelKind:
      channelRecord.channelKind === 'boss_thread'
      || channelRecord.channelKind === 'direct_lane'
      || channelRecord.channelKind === 'multi_cat_room'
        ? channelRecord.channelKind
        : null,
    roomMode: roomRouting.mode,
    participants: normalizedParticipantAssignments,
  });
  if (channelKind === 'direct_lane') {
    roomRouting.defaultRecipientId = resolveDirectLaneRecipientId(
      normalizedParticipantAssignments,
      roomRouting.defaultRecipientId,
    );
  }
  const inferredComposerMode = channelRecord.composerMode === 'cat_led'
    ? 'cat_led'
    : channelRecord.composerMode === 'solo'
      ? 'solo'
      : channelKind === 'direct_lane'
          || normalizedParticipantAssignments.some((assignment) => assignment.status === 'active')
          || Boolean(roomRouting.defaultRecipientId)
        ? 'cat_led'
        : 'solo';

  return {
    id: channelId,
    title: readString(channelRecord.title, 'Untitled chat'),
    topic: readString(channelRecord.topic, 'This chat is still taking shape.'),
    channelKind,
    recoverableDirectLaneCatId: readNullableString(channelRecord.recoverableDirectLaneCatId),
    status,
    unreadCount: readNumber(channelRecord.unreadCount),
    repoPath: readNullableString(channelRecord.repoPath),
    chatCwd: readNullableString(channelRecord.chatCwd),
    language: readNullableString(channelRecord.language),
    responseLanguage: readString(channelRecord.responseLanguage, 'en'),
    formationMode,
    skillProfile: readNullableString(channelRecord.skillProfile) ?? 'chat-default',
    mcpProfile: readNullableString(channelRecord.mcpProfile) ?? 'chat-memory',
    orchestratorRoles: readStringArray(channelRecord.orchestratorRoles),
    composerMode: inferredComposerMode,
    pendingProvider: readNullableString(channelRecord.pendingProvider),
    pendingModel: readNullableString(channelRecord.pendingModel),
    pendingInstance: readNullableString(channelRecord.pendingInstance),
    pendingModelSelection: parseProviderModelSelection(channelRecord.pendingModelSelection),
    createdAt: readString(channelRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(channelRecord.updatedAt, new Date().toISOString()),
    lastMessageAt: readNullableString(channelRecord.lastMessageAt),
    lastActivatedAt: readNullableString(channelRecord.lastActivatedAt),
    orchestratorLease: channelKind === 'direct_lane'
      ? createEmptyExecutionLease()
      : normalizeExecutionLease(
        channelRecord.orchestratorLease,
        { provider: 'claude', instance: null, model: null },
      ),
    catAssignments: normalizedCatAssignments,
    participantAssignments: normalizedParticipantAssignments,
    messages,
    roomRouting,
  };
}

export function normalizeCapabilities(rawCapabilities: unknown): ChatCapabilities {
  const fallback = createDefaultChatState().capabilities;
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
    maxBossCats: typeof capabilitiesRecord?.maxBossCats === 'number' && capabilitiesRecord.maxBossCats > 0
      ? capabilitiesRecord.maxBossCats
      : fallback.maxBossCats,
    maxCats: typeof capabilitiesRecord?.maxCats === 'number' && capabilitiesRecord.maxCats > 0
      ? capabilitiesRecord.maxCats
      : fallback.maxCats,
    maxChatParticipants:
      typeof capabilitiesRecord?.maxChatParticipants === 'number'
      && capabilitiesRecord.maxChatParticipants > 0
        ? capabilitiesRecord.maxChatParticipants
        : fallback.maxChatParticipants,
    maxParallelChats: typeof capabilitiesRecord?.maxParallelChats === 'number' && capabilitiesRecord.maxParallelChats > 0
      ? capabilitiesRecord.maxParallelChats
      : fallback.maxParallelChats,
    availableSurfaces: normalizePlatformSurfaceList(
      Array.isArray(capabilitiesRecord?.availableSurfaces)
        ? (capabilitiesRecord.availableSurfaces as unknown[]).filter((v): v is string => typeof v === 'string')
        : null,
      {
        allowed: listEnabledPlatformSurfaces(),
        fallback: listEnabledPlatformSurfaces(),
      },
    ),
  };
}

export function normalizeGlobalOrchestrator(rawOrchestrator: unknown): GlobalOrchestratorSummary {
  const fallback = createDefaultChatState().globalOrchestrator;
  const orchestratorRecord = asRecord(rawOrchestrator);
  const executionTarget = normalizeExecutionTarget(
    orchestratorRecord?.executionTarget,
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
    executionModelSelection: parseProviderModelSelection(orchestratorRecord?.executionModelSelection),
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

export function normalizeNewChatDefaults(rawDefaults: unknown): NewChatDefaults {
  const fallback = createDefaultChatState().newChatDefaults;
  const defaultsRecord = asRecord(rawDefaults);
  const executionTarget = normalizeExecutionTarget(defaultsRecord, fallback);

  return {
    provider: executionTarget.provider,
    instance: executionTarget.instance,
    model: executionTarget.model,
    modelSelection: parseProviderModelSelection(defaultsRecord?.modelSelection),
  };
}

export function normalizeParallelChatGroup(rawGroup: unknown): ParallelChatGroupState | null {
  const groupRecord = asRecord(rawGroup);
  if (!groupRecord) {
    return null;
  }

  const rawStatus = readString(groupRecord.status, 'active');

  return {
    id: readString(groupRecord.id, randomUUID()),
    title: readString(groupRecord.title, 'Parallel chat'),
    mode: 'parallel',
    status: rawStatus === 'archived' ? 'archived' : 'active',
    memberChannelIds: readStringArray(groupRecord.memberChannelIds),
    createdAt: readString(groupRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(groupRecord.updatedAt, new Date().toISOString()),
    lastMessageAt: readNullableString(groupRecord.lastMessageAt),
  };
}

export function looksLikeChatState(rawState: Record<string, unknown>): boolean {
  return Array.isArray(rawState.cats)
    && Array.isArray(rawState.channels)
    && typeof rawState.selectedChannelId === 'string';
}
