import type { ChatChannelView } from '../api/contracts';
import {
  countActiveChannelParticipants,
  isDirectLaneChannel,
  isDefaultChatChannel,
} from '../shared/channelTopology';

export type ChatConversationMode =
  | 'direct_message'
  | 'default_chat'
  | 'participant_chat';

export function resolveConversationMode(
  channel: Pick<
    ChatChannelView,
    'assignedParticipants' | 'assignedCats' | 'channelKind' | 'pendingProvider' | 'roomRouting'
  >,
): ChatConversationMode {
  if (isDirectLaneChannel(channel)) {
    return 'direct_message';
  }

  if (isDefaultChatChannel(channel)) {
    return 'default_chat';
  }

  if (countActiveChannelParticipants(channel) > 0) {
    return 'participant_chat';
  }

  return 'default_chat';
}

export function isDirectConversationMode(
  conversationMode: ChatConversationMode | null | undefined,
): boolean {
  return conversationMode === 'direct_message';
}

export function isDefaultChatConversationMode(
  conversationMode: ChatConversationMode | null | undefined,
): boolean {
  return conversationMode === 'default_chat';
}
