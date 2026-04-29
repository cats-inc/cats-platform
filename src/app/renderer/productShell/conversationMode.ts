import type { RoomRoutingMode } from '../../../shared/roomRouting.js';
import type { ProductChannelKind } from './channelTopology.js';

export type ChatConversationMode =
  | 'direct_lane'
  | 'solo_thread'
  | 'participant_thread'
  | 'multi_cat_room';

type ConversationModeCarrier = {
  assignedCats: Array<{ status: string }>;
  channelKind?: ProductChannelKind | null;
  roomRouting?: { mode?: RoomRoutingMode | null } | null;
};

export function resolveConversationMode(
  channel: ConversationModeCarrier,
): ChatConversationMode {
  if (
    channel.channelKind === 'direct_lane'
    || channel.roomRouting?.mode === 'direct_cat_chat'
  ) {
    return 'direct_lane';
  }

  const activeCatCount = channel.assignedCats.filter((cat) => cat.status === 'active').length;
  if (activeCatCount === 0) {
    return 'solo_thread';
  }

  if (channel.channelKind === 'multi_cat_room' || activeCatCount > 1) {
    return 'multi_cat_room';
  }

  return 'participant_thread';
}

export function isDirectConversationMode(
  conversationMode: ChatConversationMode | null | undefined,
): boolean {
  return conversationMode === 'direct_lane';
}

export function isSoloThreadConversationMode(
  conversationMode: ChatConversationMode | null | undefined,
): boolean {
  return conversationMode === 'solo_thread';
}
