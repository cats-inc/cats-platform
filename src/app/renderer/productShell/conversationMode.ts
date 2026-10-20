import type { RoomRoutingMode } from '../../../shared/roomRouting.js';
import type { ProductChannelKind } from './channelTopology.js';

/**
 * A conversation is a DM or a room of participants (SPEC-125 FR-24, FR-25).
 * Every room has at least one participant; how many there are, not whether
 * any is a cat, decides what the composer shows.
 */
export type ChatConversationMode =
  | 'direct_message'
  | 'participant_chat';

type ConversationModeCarrier = {
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

  return 'participant_chat';
}

export function isDirectConversationMode(
  conversationMode: ChatConversationMode | null | undefined,
): boolean {
  return conversationMode === 'direct_message';
}
