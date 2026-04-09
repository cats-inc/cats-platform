import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import {
  ConversationSidebar,
  type ConversationSidebarAction,
  type ConversationSidebarRecentEntry,
} from '../../../../app/renderer/productShell/ConversationSidebar.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import type { AppShellPayload, ChatChannelSummary } from '../../api/contracts.js';
import {
  catInitials,
  isChatCat,
  presentChannelTitle,
  sortChatCatsForDisplay,
  type Surface,
} from '../chatUtils';
import {
  findDirectLaneForCat,
  resolveMyCatStatusDot,
  statusDotClassName,
  statusDotLabel,
} from '../myCatNavigation';
import { isDirectLaneSummary } from '../../shared/channelTopology.js';

export interface SidebarProps {
  payload: AppShellPayload;
  sidebarOpen: boolean;
  accountMenuOpen: boolean;
  overflowMenuOpenId: string | null;
  busy: string;
  surface: Surface;
  shellSurface?: PlatformSurfaceId;
  routeChannelId: string | null;
  accountMenuRef: RefObject<HTMLDivElement>;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenChatsOverview: () => void;
  onStartNewChat: () => void;
  onStartNewGroupChat: () => void;
  onStartNewParallelChat: () => void;
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onRenameChannel: (channelId: string, title: string) => void;
  onRenameParallelChatGroup: (groupId: string, title: string) => void;
  onUngroupParallelChatGroup: (groupId: string) => void;
  onDeleteParallelChatGroup: (groupId: string) => void;
  onArchiveCat: (catId: string) => void;
  onAccountMenuToggle: () => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onNavigateSettings: () => void;
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
}

function createPrimaryActions(props: SidebarProps): ConversationSidebarAction[] {
  return [
    {
      key: 'new-chat',
      label: 'New chat',
      onClick: props.onStartNewChat,
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3v10" />
          <path d="M3 8h10" />
        </svg>
      ),
    },
    {
      key: 'group-chat',
      label: 'Group chat',
      onClick: props.onStartNewGroupChat,
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="5" cy="6" r="2.25" />
          <circle cx="11" cy="6" r="2.25" />
          <path d="M2.75 12c.35-1.85 1.6-2.85 3.75-2.85S9.9 10.15 10.25 12" />
          <path d="M8.6 12c.28-1.48 1.26-2.28 2.9-2.28 1.56 0 2.46.7 2.75 2.28" />
        </svg>
      ),
    },
    {
      key: 'parallel-chat',
      label: 'Parallel chat',
      onClick: props.onStartNewParallelChat,
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 13V3h12v10H2z" />
          <path d="M7 3v10" />
          <path d="M11 3v10" />
        </svg>
      ),
    },
  ];
}

function buildRecentEntries(props: SidebarProps): ConversationSidebarRecentEntry<ChatChannelSummary>[] {
  const recentsChannels = props.payload.chat.channels.filter((channel) => !isDirectLaneSummary(channel));
  const activeParallelChatGroups = (props.payload.chat.parallelChatGroups ?? []).filter(
    (group) => group.status === 'active',
  );
  const parallelChatGroupByChannelId = new Map<string, typeof activeParallelChatGroups[number]>();

  for (const group of activeParallelChatGroups) {
    for (const channelId of group.memberChannelIds) {
      parallelChatGroupByChannelId.set(channelId, group);
    }
  }

  const channelById = new Map(recentsChannels.map((channel) => [channel.id, channel] as const));
  const recentEntries: ConversationSidebarRecentEntry<ChatChannelSummary>[] = [];
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
        .filter((member): member is ChatChannelSummary => member != null);

      if (groupChannels.length > 1) {
        seenGroupIds.add(compareGroup.id);
        groupChannels.forEach((member) => seenChannelIds.add(member.id));
        recentEntries.push({
          kind: 'group',
          key: compareGroup.id,
          title: compareGroup.title,
          overflowKey: `group:${compareGroup.id}`,
          isSelected: compareGroup.memberChannelIds.includes(props.routeChannelId ?? ''),
          onSelect: () => {
            const firstChannelId = compareGroup.memberChannelIds[0];
            if (firstChannelId) {
              props.onSelect(firstChannelId);
            }
          },
          onRename: (title) => {
            void props.onRenameParallelChatGroup(compareGroup.id, title);
          },
          onUngroup: () => {
            void props.onUngroupParallelChatGroup(compareGroup.id);
          },
          onDelete: () => {
            props.onOverflowMenuToggle(null);
            void props.onDeleteParallelChatGroup(compareGroup.id);
          },
          renameBusyKey: `concurrent-group:rename:${compareGroup.id}`,
          ungroupBusyKey: `concurrent-group:ungroup:${compareGroup.id}`,
          deleteBusyKey: `concurrent-group:delete:${compareGroup.id}`,
          channels: groupChannels.map((memberChannel) => ({
            channel: memberChannel,
            titleOverride: compareGroup.members.find(
              (member) => member.channelId === memberChannel.id,
            )?.title,
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

export function Sidebar(props: SidebarProps) {
  return ConversationSidebar({
    payload: props.payload,
    sidebarOpen: props.sidebarOpen,
    accountMenuOpen: props.accountMenuOpen,
    overflowMenuOpenId: props.overflowMenuOpenId,
    busy: props.busy,
    surface: props.surface,
    shellSurface: props.shellSurface,
    routeChannelId: props.routeChannelId,
    accountMenuRef: props.accountMenuRef,
    primaryActions: createPrimaryActions(props),
    recentEntries: buildRecentEntries(props),
    helpers: {
      catInitials,
      presentChannelTitle,
      isVisibleCat: isChatCat,
      sortCatsForDisplay: sortChatCatsForDisplay,
      isDirectLaneSummary,
      findDirectLaneForCat,
      resolveMyCatStatusDot,
      statusDotClassName,
      statusDotLabel,
    },
    onToggleSidebar: props.onToggleSidebar,
    onCollapsedSidebarClick: props.onCollapsedSidebarClick,
    onOpenChatsOverview: props.onOpenChatsOverview,
    onSelect: props.onSelect,
    onDeleteChannel: props.onDeleteChannel,
    onRenameChannel: props.onRenameChannel,
    onArchiveCat: props.onArchiveCat,
    onAccountMenuToggle: props.onAccountMenuToggle,
    onOverflowMenuToggle: props.onOverflowMenuToggle,
    onNavigateSettings: props.onNavigateSettings,
    onSwitchProduct: props.onSwitchProduct,
    activeMyCatId: props.activeMyCatId,
    onDirectChatCat: props.onDirectChatCat,
  });
}
