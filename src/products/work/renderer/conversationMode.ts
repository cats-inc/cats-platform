import type { ChatChannelView } from '../api/contracts';
import { isDirectLaneChannel } from '../shared/channelTopology';

export type ChatConversationMode =
  | 'direct_lane'
  | 'solo_thread'
  | 'cat_led_thread'
  | 'multi_cat_room';

export function resolveConversationMode(
  channel: Pick<ChatChannelView, 'assignedCats' | 'channelKind' | 'composerMode' | 'roomRouting'>,
): ChatConversationMode {
  if (isDirectLaneChannel(channel)) {
    return 'direct_lane';
  }

  if (channel.composerMode === 'solo') {
    return 'solo_thread';
  }

  const activeCatCount = channel.assignedCats.filter((cat) => cat.status === 'active').length;
  if (channel.channelKind === 'multi_cat_room' || activeCatCount > 1) {
    return 'multi_cat_room';
  }

  return 'cat_led_thread';
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
