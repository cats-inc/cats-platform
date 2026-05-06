import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { filterChatChannelsForProductRecents } from '../../../products/shared/recentsFilter.js';
import {
  type ConversationSidebarChannel,
  type ConversationSidebarRecentEntry,
} from './ConversationSidebar.js';
import { resolveConversationSidebarChannelSurface } from './conversationSidebarViewModel.js';

interface ConversationSidebarParallelGroupMember {
  channelId: string;
  title?: string | null;
}

interface ConversationSidebarParallelGroup {
  id: string;
  title: string;
  originSurface?: PlatformSurfaceId | null;
  status?: string | null;
  memberChannelIds: readonly string[];
  members?: readonly ConversationSidebarParallelGroupMember[];
}

export interface BuildConversationSidebarRecentEntriesInput<
  TChannel extends ConversationSidebarChannel,
> {
  channels: readonly TChannel[];
  parallelChatGroups?: readonly ConversationSidebarParallelGroup[];
  activeSurface: PlatformSurfaceId;
  routeChannelId: string | null;
  isDirectLaneSummary: (channel: TChannel) => boolean;
  onSelect: (channelId: string) => void;
  onRenameParallelGroup?: (groupId: string, title: string) => void | Promise<void>;
  onUngroupParallelGroup?: (groupId: string) => void | Promise<void>;
  onDeleteParallelGroup?: (groupId: string) => void | Promise<void>;
  onCloseOverflowMenu?: () => void;
}

export function buildConversationSidebarRecentEntries<
  TChannel extends ConversationSidebarChannel,
>(
  input: BuildConversationSidebarRecentEntriesInput<TChannel>,
): ConversationSidebarRecentEntry<TChannel>[] {
  // Channel-level filter goes through the shared
  // `filterChatChannelsForProductRecents` so web + mobile share one
  // predicate. The `input.isDirectLaneSummary` callback is no
  // longer needed for this filter — the shared check uses the
  // resolved `channelKind` (web's `toChannelSummary` always sets
  // it; the helper also accepts `roomMode === 'direct_message'`
  // for any caller whose channel shape predates the resolution).
  const recentsChannels = filterChatChannelsForProductRecents(
    input.channels,
    input.activeSurface,
  );
  const activeParallelChatGroups = (input.parallelChatGroups ?? []).filter(
    (group) =>
      group.status === 'active'
      && resolveConversationSidebarChannelSurface(group.originSurface) === input.activeSurface,
  );
  const parallelChatGroupByChannelId = new Map<string, typeof activeParallelChatGroups[number]>();

  for (const group of activeParallelChatGroups) {
    for (const channelId of group.memberChannelIds) {
      parallelChatGroupByChannelId.set(channelId, group);
    }
  }

  const channelById = new Map(recentsChannels.map((channel) => [channel.id, channel] as const));
  const recentEntries: ConversationSidebarRecentEntry<TChannel>[] = [];
  const seenChannelIds = new Set<string>();
  const seenGroupIds = new Set<string>();

  for (const channel of recentsChannels) {
    if (seenChannelIds.has(channel.id)) {
      continue;
    }

    const compareGroup = parallelChatGroupByChannelId.get(channel.id);
    if (compareGroup && !seenGroupIds.has(compareGroup.id)) {
      const groupChannels = compareGroup.memberChannelIds
        .map((channelId) => channelById.get(channelId) ?? null)
        .filter((member): member is TChannel => member != null);

      if (groupChannels.length > 1) {
        seenGroupIds.add(compareGroup.id);
        groupChannels.forEach((member) => seenChannelIds.add(member.id));
        recentEntries.push({
          kind: 'group',
          key: compareGroup.id,
          title: compareGroup.title,
          originSurface: compareGroup.originSurface,
          overflowKey: `group:${compareGroup.id}`,
          isSelected: compareGroup.memberChannelIds.includes(input.routeChannelId ?? ''),
          onSelect: () => {
            const firstChannelId = compareGroup.memberChannelIds[0];
            if (firstChannelId) {
              input.onSelect(firstChannelId);
            }
          },
          onRename: input.onRenameParallelGroup
            ? (title) => {
                void input.onRenameParallelGroup?.(compareGroup.id, title);
              }
            : undefined,
          onUngroup: input.onUngroupParallelGroup
            ? () => {
                void input.onUngroupParallelGroup?.(compareGroup.id);
              }
            : undefined,
          onDelete: input.onDeleteParallelGroup
            ? () => {
                input.onCloseOverflowMenu?.();
                void input.onDeleteParallelGroup?.(compareGroup.id);
              }
            : undefined,
          renameBusyKey: `concurrent-group:rename:${compareGroup.id}`,
          ungroupBusyKey: `concurrent-group:ungroup:${compareGroup.id}`,
          deleteBusyKey: `concurrent-group:delete:${compareGroup.id}`,
          channels: groupChannels.map((memberChannel) => ({
            channel: memberChannel,
            titleOverride: compareGroup.members?.find(
              (member) => member.channelId === memberChannel.id,
            )?.title ?? undefined,
            disableRename: true,
          })),
        });
        continue;
      }
    }

    seenChannelIds.add(channel.id);
    recentEntries.push({
      kind: 'channel',
      channel,
    });
  }

  return recentEntries;
}
