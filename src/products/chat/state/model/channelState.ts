import type {
  ChatChannelState,
  ChatChannelStatus,
  ChatState,
  CreateChatChannelInput,
} from '../../api/contracts.js';

import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import {
  cloneState,
  findChannelIndex,
  isoAt,
  normalizeOptionalText,
  requireChannel,
} from './shared.js';

/**
 * A Cat's direct lane: the first non-archived `direct_message` channel whose
 * default recipient is the Cat. Chat keeps one direct lane per Cat.
 */
export function findDirectLaneChannelForCat(
  state: Pick<ChatState, 'channels'>,
  catId: string,
): ChatChannelState | null {
  return state.channels.find((channel) =>
    channel.status !== 'archived'
    && isDirectLaneChannel(channel)
    && resolveRoomRoutingState(channel.roomRouting).defaultRecipientId === catId,
  ) ?? null;
}

/**
 * The existing direct lane a create request should reuse instead of adding a
 * second lane for the same Cat. Only a plain one-to-one direct message
 * qualifies: a request that adds other Cats, inline Cats or temporary
 * participants creates its own room as before.
 */
export function findReusableDirectLaneForCreate(
  state: Pick<ChatState, 'channels'>,
  input: CreateChatChannelInput,
): ChatChannelState | null {
  const roomMode = input.roomMode ?? (input.entryKind === 'direct' ? 'direct_message' : 'chat_channel');
  if (roomMode !== 'direct_message') {
    return null;
  }
  if ((input.cats?.length ?? 0) > 0 || (input.temporaryParticipants?.length ?? 0) > 0) {
    return null;
  }

  const participantCatIds = new Set(
    (input.participantCatIds ?? []).map((catId) => catId.trim()).filter(Boolean),
  );
  const catId = input.defaultRecipientId?.trim()
    || (participantCatIds.size === 1 ? [...participantCatIds][0] : '');
  if (!catId) {
    return null;
  }
  participantCatIds.delete(catId);
  if (participantCatIds.size > 0) {
    return null;
  }

  return findDirectLaneChannelForCat(state, catId);
}

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
