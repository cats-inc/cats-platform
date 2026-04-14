import {
  createCatActorId,
  createTemporaryParticipantActorId,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  OWNER_ACTOR_ID,
} from '../core/actors.js';
import type {
  AgentId,
  ContainerId,
  ConversationId,
  LaneId,
  ParticipantId,
} from '../core/types.js';
import type {
  ChannelParticipantAssignment,
  ChatChannelKind,
} from '../products/chat/api/contracts.js';

export const CHAT_ROOT_CONTAINER_ID = 'container-chat-root';

export function buildChatConversationId(channelId: string): ConversationId {
  return `conversation-channel-${channelId}`;
}

export function buildChatTaskId(channelId: string): string {
  return `task-channel-${channelId}`;
}

export function buildChatArchiveId(channelId: string): string {
  return `archive-channel-${channelId}`;
}

export function buildChatParallelGroupContainerId(groupId: string): ContainerId {
  return `container-parallel-group-${groupId}`;
}

export function buildChatParticipantRecordId(
  conversationId: ConversationId,
  participantKey: string,
): ParticipantId {
  return `participant-${conversationId}-${participantKey}`;
}

export function buildChatOwnerParticipantId(channelId: string): ParticipantId {
  return buildChatParticipantRecordId(buildChatConversationId(channelId), 'owner');
}

export function buildChatOrchestratorParticipantId(channelId: string): ParticipantId {
  return buildChatParticipantRecordId(buildChatConversationId(channelId), 'orchestrator');
}

export function buildChatAssignedParticipantId(
  channelId: string,
  participantId: string,
): ParticipantId {
  return buildChatParticipantRecordId(
    buildChatConversationId(channelId),
    participantId,
  );
}

export function buildChatLaneId(
  turnId: string,
  targetStateId: string | null | undefined,
  participantId: string,
): LaneId {
  return `lane-${turnId}-${targetStateId || participantId}`;
}

export function resolveChatParticipantAgentId(
  assignment: ChannelParticipantAssignment,
): AgentId {
  if (assignment.sourceKind === 'cat' && assignment.sourceRefId) {
    return createCatActorId(assignment.sourceRefId);
  }

  return createTemporaryParticipantActorId(assignment.participantId);
}

export function resolveChatConversationKind(
  channelKind: ChatChannelKind | null | undefined,
): 'chat_channel' | 'direct_message' {
  return channelKind === 'direct_lane' ? 'direct_message' : 'chat_channel';
}

export function resolveChatConversationActorIds(input: {
  channelId: string;
  channelKind: ChatChannelKind | null | undefined;
  assignments: ChannelParticipantAssignment[];
}): AgentId[] {
  const participantActorIds = input.assignments.map((assignment) =>
    resolveChatParticipantAgentId(assignment));

  return input.channelKind === 'direct_lane'
    ? [OWNER_ACTOR_ID, ...participantActorIds]
    : [OWNER_ACTOR_ID, GLOBAL_ORCHESTRATOR_ACTOR_ID, ...participantActorIds];
}
