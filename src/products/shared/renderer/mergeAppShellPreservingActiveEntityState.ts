import type {
  ChatChannelSummary,
  ChatChannelView,
  ParallelChatGroupSummary,
} from '../api/workspaceContracts.js';
import {
  mergeChannelSummariesPreservingSubscribedView,
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
      channels: mergeChannelSummariesPreservingSubscribedView({
        currentChannels: current.chat.channels,
        nextChannels: next.chat.channels,
        currentSelectedChannel: current.chat.selectedChannel,
        activeSubscribedIds: activeIds,
      }),
      parallelChatGroups: mergeParallelChatGroupsPreservingSubscribedMembership(
        current.chat.parallelChatGroups,
        next.chat.parallelChatGroups,
        activeIds,
      ),
    },
  };
}
