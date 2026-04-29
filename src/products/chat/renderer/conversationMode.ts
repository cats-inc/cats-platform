import type { ChatChannelView } from '../api/contracts';
import {
  countActiveChannelParticipants,
  isDirectLaneChannel,
  isSoloThreadChannel,
} from '../shared/channelTopology';

export type ChatConversationMode =
  | 'direct_lane'
  | 'solo_thread'
  | 'participant_thread'
  | 'multi_cat_room';

export function resolveConversationMode(
  channel: Pick<
    ChatChannelView,
    'assignedParticipants' | 'assignedCats' | 'channelKind' | 'composerMode' | 'roomRouting'
  >,
): ChatConversationMode {
  if (isDirectLaneChannel(channel)) {
    return 'direct_lane';
  }

  if (isSoloThreadChannel(channel)) {
    return 'solo_thread';
  }

  if (channel.channelKind === 'multi_cat_room' || countActiveChannelParticipants(channel) > 1) {
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
