import type {
  ChatChannelState,
  ChatChannelStatus,
  ChatState,
} from '../../api/contracts.js';

import {
  cloneState,
  findChannelIndex,
  isoAt,
  normalizeOptionalText,
  requireChannel,
} from './shared.js';

export function setChannelStatus(
  state: ChatState,
  channelId: string,
  status: ChatChannelStatus,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.status = status;
  channel.updatedAt = isoAt(now);
  if (status === 'active') {
    channel.lastActivatedAt = channel.updatedAt;
  }
  return nextState;
}

export function setChannelChatCwd(
  state: ChatState,
  channelId: string,
  chatCwd: string | null,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.chatCwd = normalizeOptionalText(chatCwd);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelRoomRouting(
  state: ChatState,
  channelId: string,
  roomRouting: NonNullable<ChatChannelState['roomRouting']>,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.roomRouting = structuredClone(roomRouting);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function replaceState(state: ChatState, channel: ChatChannelState): ChatState {
  const nextState = cloneState(state);
  const index = findChannelIndex(nextState, channel.id);
  if (index === -1) {
    throw new Error(`Channel not found: ${channel.id}`);
  }
  nextState.channels[index] = structuredClone(channel);
  return nextState;
}
