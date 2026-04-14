import { randomUUID } from 'node:crypto';

import { CoreValidationError } from '../errors.js';
import type {
  CoreContainerWriteInput,
  CoreConversationWriteInput,
  CoreParticipantWriteInput,
} from './inputs.js';
import {
  normalizeMetadata,
  normalizeNullableString,
  normalizeStringArray,
  replaceById,
  touchCoreState,
} from './shared.js';
import type {
  CatsCoreState,
  ContainerRecord,
  CoreConversationRecord,
  ParticipantRecord,
} from '../types.js';

export function upsertCoreContainer(
  core: CatsCoreState,
  input: CoreContainerWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; container: ContainerRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Container title is required', 'container_title_required');
  }

  const containerId = normalizeNullableString(input.id) ?? `container-${randomUUID()}`;
  const existing = core.containers.find((container) => container.id === containerId);
  const container: ContainerRecord = {
    id: containerId,
    kind: input.kind ?? existing?.kind ?? 'chat_root',
    title,
    status: input.status ?? existing?.status ?? 'active',
    parentContainerId:
      input.parentContainerId === undefined
        ? existing?.parentContainerId ?? null
        : normalizeNullableString(input.parentContainerId),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.containers, container);

  return {
    core: touchCoreState(
      {
        ...core,
        containers: records,
      },
      nowIso,
    ),
    container,
    created,
  };
}

export function upsertCoreConversation(
  core: CatsCoreState,
  input: CoreConversationWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; conversation: CoreConversationRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError(
      'Conversation title is required',
      'conversation_title_required',
    );
  }

  const conversationId = normalizeNullableString(input.id) ?? `conversation-${randomUUID()}`;
  const existing = core.conversations.find((conversation) => conversation.id === conversationId);
  const conversation: CoreConversationRecord = {
    id: conversationId,
    title,
    kind: input.kind ?? existing?.kind ?? 'chat_channel',
    status: input.status ?? existing?.status ?? 'planned',
    containerId:
      input.containerId === undefined
        ? existing?.containerId ?? null
        : normalizeNullableString(input.containerId),
    participantActorIds:
      input.participantActorIds === undefined
        ? normalizeStringArray(existing?.participantActorIds)
        : normalizeStringArray(input.participantActorIds),
    sourceChannelId:
      input.sourceChannelId === undefined
        ? existing?.sourceChannelId ?? null
        : normalizeNullableString(input.sourceChannelId),
    repoPath:
      input.repoPath === undefined
        ? existing?.repoPath ?? null
        : normalizeNullableString(input.repoPath),
    responseLanguage:
      normalizeNullableString(input.responseLanguage)
      ?? existing?.responseLanguage
      ?? 'en',
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    lastMessageAt:
      input.lastMessageAt === undefined
        ? existing?.lastMessageAt ?? null
        : normalizeNullableString(input.lastMessageAt),
  };

  const { records, created } = replaceById(core.conversations, conversation);

  return {
    core: touchCoreState(
      {
        ...core,
        conversations: records,
      },
      nowIso,
    ),
    conversation,
    created,
  };
}

export function upsertCoreParticipant(
  core: CatsCoreState,
  input: CoreParticipantWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; participant: ParticipantRecord; created: boolean } {
  const nowIso = now.toISOString();
  const conversationId = normalizeNullableString(input.conversationId);
  const agentId = normalizeNullableString(input.agentId);

  if (!conversationId) {
    throw new CoreValidationError(
      'Participant conversationId is required',
      'participant_conversation_id_required',
    );
  }
  if (!agentId) {
    throw new CoreValidationError(
      'Participant agentId is required',
      'participant_agent_id_required',
    );
  }

  const participantId = normalizeNullableString(input.id) ?? `participant-${randomUUID()}`;
  const existing = core.participants.find((participant) => participant.id === participantId);
  const participant: ParticipantRecord = {
    id: participantId,
    conversationId,
    agentId,
    joinedAt: existing?.joinedAt ?? input.joinedAt ?? nowIso,
    updatedAt: nowIso,
    role:
      input.role === undefined
        ? existing?.role ?? null
        : normalizeNullableString(input.role),
    status: input.status ?? existing?.status ?? 'active',
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.participants, participant);

  return {
    core: touchCoreState(
      {
        ...core,
        participants: records,
      },
      nowIso,
    ),
    participant,
    created,
  };
}
