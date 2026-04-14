import type {
  CatsCoreState,
  ContainerRecordKind,
  ContainerRecordStatus,
  ContainerRecord,
  CoreConversationKind,
  CoreConversationRecord,
  CoreConversationStatus,
  ParticipantRecord,
  ParticipantRecordStatus,
} from './types.js';

export interface CoreContainerListQuery {
  kinds?: ContainerRecordKind[];
  statuses?: ContainerRecordStatus[];
  parentContainerIds?: string[];
  limit?: number;
}

export interface CoreConversationListQuery {
  kinds?: CoreConversationKind[];
  statuses?: CoreConversationStatus[];
  containerIds?: string[];
  participantActorIds?: string[];
  sourceChannelIds?: string[];
  repoPaths?: string[];
  responseLanguages?: string[];
  limit?: number;
}

export interface CoreParticipantListQuery {
  conversationIds?: string[];
  agentIds?: string[];
  roles?: string[];
  statuses?: ParticipantRecordStatus[];
  limit?: number;
}

function compareByUpdatedAt(
  left: { updatedAt: string; id: string },
  right: { updatedAt: string; id: string },
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return left.id.localeCompare(right.id);
}

function matchesContainerQuery(
  container: ContainerRecord,
  query: CoreContainerListQuery,
): boolean {
  if (query.kinds && !query.kinds.includes(container.kind)) {
    return false;
  }
  if (query.statuses && !query.statuses.includes(container.status)) {
    return false;
  }
  if (
    query.parentContainerIds
    && !query.parentContainerIds.includes(container.parentContainerId ?? '')
  ) {
    return false;
  }
  return true;
}

function matchesConversationQuery(
  conversation: CoreConversationRecord,
  query: CoreConversationListQuery,
): boolean {
  if (query.kinds && !query.kinds.includes(conversation.kind)) {
    return false;
  }
  if (query.statuses && !query.statuses.includes(conversation.status)) {
    return false;
  }
  if (
    query.containerIds
    && !query.containerIds.includes(conversation.containerId ?? '')
  ) {
    return false;
  }
  if (
    query.participantActorIds
    && !conversation.participantActorIds.some((actorId) => query.participantActorIds?.includes(actorId))
  ) {
    return false;
  }
  if (
    query.sourceChannelIds
    && !query.sourceChannelIds.includes(conversation.sourceChannelId ?? '')
  ) {
    return false;
  }
  if (
    query.repoPaths
    && !query.repoPaths.includes(conversation.repoPath ?? '')
  ) {
    return false;
  }
  if (
    query.responseLanguages
    && !query.responseLanguages.includes(conversation.responseLanguage)
  ) {
    return false;
  }
  return true;
}

function matchesParticipantQuery(
  participant: ParticipantRecord,
  query: CoreParticipantListQuery,
): boolean {
  if (
    query.conversationIds
    && !query.conversationIds.includes(participant.conversationId)
  ) {
    return false;
  }
  if (query.agentIds && !query.agentIds.includes(participant.agentId)) {
    return false;
  }
  if (query.roles && !query.roles.includes(participant.role ?? '')) {
    return false;
  }
  if (query.statuses && !query.statuses.includes(participant.status)) {
    return false;
  }
  return true;
}

export function listContainers(
  core: CatsCoreState,
  query: CoreContainerListQuery = {},
): ContainerRecord[] {
  return core.containers
    .filter((container) => matchesContainerQuery(container, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}

export function listConversations(
  core: CatsCoreState,
  query: CoreConversationListQuery = {},
): CoreConversationRecord[] {
  return core.conversations
    .filter((conversation) => matchesConversationQuery(conversation, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}

export function listParticipants(
  core: CatsCoreState,
  query: CoreParticipantListQuery = {},
): ParticipantRecord[] {
  return core.participants
    .filter((participant) => matchesParticipantQuery(participant, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
