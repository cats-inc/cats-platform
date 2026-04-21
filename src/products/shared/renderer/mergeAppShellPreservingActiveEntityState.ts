import type {
  ChatChannelSummary,
  ChatChannelView,
  ParallelChatGroupSummary,
} from '../api/workspaceContracts.js';
import {
  mergeChannelSummaryWithChannelView,
  mergeParallelChatGroupsPreservingSubscribedMembership,
} from './activeEntityMerge.js';

export interface MergeableAppShellPayload {
  chat: {
    selectedChannelId: string;
    selectedChannel: ChatChannelView | null;
    channels: ChatChannelSummary[];
    parallelChatGroups: ParallelChatGroupSummary[];
  };
}

function normalizeActiveIds(activeSubscribedIds: Iterable<string>): Set<string> {
  return new Set(
    [...activeSubscribedIds]
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

function mergeChannelSummaries(
  currentChannels: ChatChannelSummary[],
  nextChannels: ChatChannelSummary[],
  currentSelectedChannel: ChatChannelView | null,
  activeIds: Set<string>,
): ChatChannelSummary[] {
  const currentById = new Map(currentChannels.map((channel) => [channel.id, channel]));
  const nextIds = new Set(nextChannels.map((channel) => channel.id));
  const result = nextChannels.map((nextChannel) => {
    if (!activeIds.has(nextChannel.id)) {
      return nextChannel;
    }

    const currentChannel = currentById.get(nextChannel.id) ?? nextChannel;
    return currentSelectedChannel?.id === nextChannel.id
      ? mergeChannelSummaryWithChannelView(currentChannel, currentSelectedChannel)
      : currentChannel;
  });

  for (const activeId of activeIds) {
    if (nextIds.has(activeId)) {
      continue;
    }
    const currentChannel = currentById.get(activeId);
    if (currentChannel) {
      result.unshift(currentChannel);
    }
  }

  return result;
}

export function mergeAppShellPreservingActiveEntityState<
  TPayload extends MergeableAppShellPayload,
>(
  current: TPayload,
  next: TPayload,
  activeSubscribedIds: Iterable<string>,
): TPayload {
  const activeIds = normalizeActiveIds(activeSubscribedIds);
  if (activeIds.size === 0) {
    return next;
  }

  const preserveSelectedChannel =
    current.chat.selectedChannelId
    && activeIds.has(current.chat.selectedChannelId);

  return {
    ...next,
    chat: {
      ...next.chat,
      selectedChannelId: preserveSelectedChannel
        ? current.chat.selectedChannelId
        : next.chat.selectedChannelId,
      selectedChannel: preserveSelectedChannel
        ? current.chat.selectedChannel
        : next.chat.selectedChannel,
      channels: mergeChannelSummaries(
        current.chat.channels,
        next.chat.channels,
        current.chat.selectedChannel,
        activeIds,
      ),
      parallelChatGroups: mergeParallelChatGroupsPreservingSubscribedMembership(
        current.chat.parallelChatGroups,
        next.chat.parallelChatGroups,
        activeIds,
      ),
    },
  };
}
