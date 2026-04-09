import type { ChatState } from '../../api/contracts.js';

import {
  cloneState,
  findChannelIndex,
  isoAt,
  requireChannel,
} from './shared.js';

export function selectChannel(
  state: ChatState,
  selectedChannelId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, selectedChannelId);
  nextState.selectedChannelId = selectedChannelId;
  channel.unreadCount = 0;
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function renameChannel(
  state: ChatState,
  channelId: string,
  title: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const nextTitle = title.trim() || channel.title;
  channel.title = nextTitle;
  channel.updatedAt = isoAt(now);
  for (const group of nextState.parallelChatGroups) {
    if (group.memberChannelIds.includes(channelId)) {
      group.title = nextTitle;
      group.updatedAt = channel.updatedAt;
    }
  }
  return nextState;
}

export function renameParallelChatGroup(
  state: ChatState,
  groupId: string,
  title: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const group = nextState.parallelChatGroups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new Error(`Parallel chat group not found: ${groupId}`);
  }

  const nextTitle = title.trim() || group.title;
  const updatedAt = isoAt(now);
  group.title = nextTitle;
  group.updatedAt = updatedAt;
  for (const memberChannelId of group.memberChannelIds) {
    const channel = nextState.channels.find((candidate) => candidate.id === memberChannelId);
    if (!channel) {
      continue;
    }
    channel.title = nextTitle;
    channel.updatedAt = updatedAt;
  }
  return nextState;
}

export function ungroupParallelChatGroup(
  state: ChatState,
  groupId: string,
  _now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const groupIndex = nextState.parallelChatGroups.findIndex((group) => group.id === groupId);
  if (groupIndex === -1) {
    throw new Error(`Parallel chat group not found: ${groupId}`);
  }

  nextState.parallelChatGroups.splice(groupIndex, 1);
  return nextState;
}

export function deleteParallelChatGroup(
  state: ChatState,
  groupId: string,
): ChatState {
  const nextState = cloneState(state);
  const group = nextState.parallelChatGroups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new Error(`Parallel chat group not found: ${groupId}`);
  }

  const deletedChannelIds = new Set(group.memberChannelIds);
  nextState.channels = nextState.channels.filter((channel) => !deletedChannelIds.has(channel.id));
  nextState.parallelChatGroups = nextState.parallelChatGroups.filter(
    (candidate) => candidate.id !== groupId,
  );

  if (deletedChannelIds.has(nextState.selectedChannelId)) {
    nextState.selectedChannelId = nextState.channels[0]?.id ?? '';
  }

  return nextState;
}

export function deleteChannel(
  state: ChatState,
  channelId: string,
): ChatState {
  const nextState = cloneState(state);
  const groupSiblingChannelId = nextState.parallelChatGroups.find((group) =>
    group.memberChannelIds.includes(channelId),
  )?.memberChannelIds.find((memberChannelId) => memberChannelId !== channelId) ?? '';
  const index = findChannelIndex(nextState, channelId);
  if (index === -1) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  nextState.channels.splice(index, 1);
  nextState.parallelChatGroups = nextState.parallelChatGroups
    .map((group) => ({
      ...group,
      memberChannelIds: group.memberChannelIds.filter(
        (memberChannelId) => memberChannelId !== channelId,
      ),
    }))
    .filter((group) => group.memberChannelIds.length > 1);

  if (nextState.selectedChannelId === channelId) {
    nextState.selectedChannelId = groupSiblingChannelId || (nextState.channels[0]?.id ?? '');
  }

  return nextState;
}

export function touchParallelChatGroup(
  state: ChatState,
  groupId: string,
  nowIso: string,
  lastMessageAt: string | null,
): void {
  const group = state.parallelChatGroups.find((candidate) => candidate.id === groupId);
  if (!group) {
    return;
  }

  group.updatedAt = nowIso;
  group.lastMessageAt = lastMessageAt;
}

export function findParallelChatGroupByChannelId(
  state: ChatState,
  channelId: string,
): ChatState['parallelChatGroups'][number] | null {
  return (
    state.parallelChatGroups.find((group) => group.memberChannelIds.includes(channelId)) ?? null
  );
}
