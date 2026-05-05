import type { RoomRoutingMode } from '../../../shared/roomRouting.js';
import type { ProductChannelKind } from './channelTopology.js';

export type ChatConversationMode =
  | 'direct_message'
  | 'default_chat'
  | 'participant_chat';

type ConversationModeCarrier = {
  assignedCats: Array<{ status: string }>;
  channelKind?: ProductChannelKind | null;
  roomRouting?: { mode?: RoomRoutingMode | null } | null;
};

export function resolveConversationMode(
  channel: ConversationModeCarrier,
): ChatConversationMode {
  if (
    channel.channelKind === 'direct_message'
    || channel.roomRouting?.mode === 'direct_message'
  ) {
    return 'direct_message';
  }

  const activeCatCount = channel.assignedCats.filter((cat) => cat.status === 'active').length;
  if (activeCatCount === 0) {
    return 'default_chat';
  }

  if (activeCatCount > 0) {
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
