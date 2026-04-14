import {
  upsertCoreContainer,
  upsertCoreConversation,
  upsertCoreParticipant,
} from '../model/index.js';
import {
  listContainers,
  listConversations,
  listParticipants,
} from '../structuralRecordLists.js';
import {
  CORE_CONTAINER_KINDS,
  CORE_CONTAINER_STATUSES,
  CORE_CONVERSATION_KINDS,
  CORE_CONVERSATION_STATUSES,
  CORE_PARTICIPANT_STATUSES,
} from './constants.js';
import {
  handleCoreError,
  readEnumValue,
  readMetadata,
  readNullableString,
  readOptionalString,
  readRequiredString,
  readStringArray,
  readWrappedBody,
} from './shared.js';
import {
  readContainerListQuery,
  readConversationListQuery,
  readParticipantListQuery,
} from './queryFilters.js';
import type { CoreApiRouteContext } from './types.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreContainers(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readContainerListQuery(context.url.searchParams);
  sendJson(context.response, 200, { containers: listContainers(core, query) });
}

async function handleCoreContainerWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const container = await readWrappedBody(context, 'container');
    const next = upsertCoreContainer(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(container.id, 'container.id'),
        kind: readEnumValue(container.kind, 'container.kind', CORE_CONTAINER_KINDS),
        title: readRequiredString(container.title, 'container.title'),
        status: readEnumValue(
          container.status,
          'container.status',
          CORE_CONTAINER_STATUSES,
        ),
        parentContainerId: readNullableString(
          container.parentContainerId,
          'container.parentContainerId',
        ),
        createdAt: readOptionalString(container.createdAt, 'container.createdAt'),
        metadata: readMetadata(container.metadata, 'container.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedContainer = persisted.containers.find(
      (candidate) => candidate.id === next.container.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      container: persistedContainer ?? next.container,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreConversations(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readConversationListQuery(context.url.searchParams);
  sendJson(context.response, 200, { conversations: listConversations(core, query) });
}

async function handleCoreConversationWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const conversation = await readWrappedBody(context, 'conversation');
    const next = upsertCoreConversation(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(conversation.id, 'conversation.id'),
        title: readRequiredString(conversation.title, 'conversation.title'),
        kind: readEnumValue(
          conversation.kind,
          'conversation.kind',
          CORE_CONVERSATION_KINDS,
        ),
        status: readEnumValue(
          conversation.status,
          'conversation.status',
          CORE_CONVERSATION_STATUSES,
        ),
        containerId: readNullableString(conversation.containerId, 'conversation.containerId'),
        participantActorIds: readStringArray(
          conversation.participantActorIds,
          'conversation.participantActorIds',
        ),
        sourceChannelId: readNullableString(
          conversation.sourceChannelId,
          'conversation.sourceChannelId',
        ),
        repoPath: readNullableString(conversation.repoPath, 'conversation.repoPath'),
        responseLanguage: readNullableString(
          conversation.responseLanguage,
          'conversation.responseLanguage',
        ),
        createdAt: readOptionalString(conversation.createdAt, 'conversation.createdAt'),
        lastMessageAt: readNullableString(
          conversation.lastMessageAt,
          'conversation.lastMessageAt',
        ),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedConversation = persisted.conversations.find(
      (candidate) => candidate.id === next.conversation.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      conversation: persistedConversation ?? next.conversation,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreParticipants(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readParticipantListQuery(context.url.searchParams);
  sendJson(context.response, 200, { participants: listParticipants(core, query) });
}

async function handleCoreParticipantWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const participant = await readWrappedBody(context, 'participant');
    const next = upsertCoreParticipant(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(participant.id, 'participant.id'),
        conversationId:
          readNullableString(participant.conversationId, 'participant.conversationId') ?? '',
        agentId: readNullableString(participant.agentId, 'participant.agentId') ?? '',
        role: readNullableString(participant.role, 'participant.role'),
        status: readEnumValue(
          participant.status,
          'participant.status',
          CORE_PARTICIPANT_STATUSES,
        ),
        joinedAt: readOptionalString(participant.joinedAt, 'participant.joinedAt'),
        metadata: readMetadata(participant.metadata, 'participant.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedParticipant = persisted.participants.find(
      (candidate) => candidate.id === next.participant.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      participant: persistedParticipant ?? next.participant,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreStructuralRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/containers') {
    if (context.method === 'GET') {
      try {
        await handleCoreContainers(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreContainerWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/conversations') {
    if (context.method === 'GET') {
      try {
        await handleCoreConversations(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreConversationWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/participants') {
    if (context.method === 'GET') {
      try {
        await handleCoreParticipants(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreParticipantWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}
