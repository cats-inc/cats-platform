import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import {
  ConversationSidebar,
  type ConversationSidebarAction,
  type ConversationSidebarRecentEntry,
} from '../../../../app/renderer/productShell/ConversationSidebar.js';
import type { WorkspaceProductConfirmDialog } from '../../../shared/renderer/WorkspaceProductApp.js';
import { buildConversationSidebarRecentEntries } from '../../../../app/renderer/productShell/conversationSidebarRecentEntries.js';
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
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import { messageKeys, type MessageKey } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export interface SidebarProps {
  payload: AppShellPayload;
  sidebarOpen: boolean;
  accountMenuOpen: boolean;
  overflowMenuOpenId: string | null;
  busy: WorkspaceBusyState;
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
  onNavigateRuntime: () => void;
  onCreateNewCat: () => void;
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
  onClearDirectLane: (catId: string, channelId: string) => void;
  confirmDialog: WorkspaceProductConfirmDialog;
}

function createPrimaryActions(
  props: SidebarProps,
  t: (key: MessageKey) => string,
): ConversationSidebarAction[] {
  return [
    {
      key: 'new-chat',
      label: t(messageKeys.chatSidebarPrimaryActionNewChat),
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
      label: t(messageKeys.chatSidebarPrimaryActionGroupChat),
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
      label: t(messageKeys.chatSidebarPrimaryActionParallelChat),
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
  return buildConversationSidebarRecentEntries({
    channels: props.payload.chat.channels,
    parallelChatGroups: props.payload.chat.parallelChatGroups,
    activeSurface: props.shellSurface ?? 'chat',
    routeChannelId: props.routeChannelId,
    isDirectLaneSummary,
    onSelect: props.onSelect,
    onRenameParallelGroup: props.onRenameParallelChatGroup,
    onUngroupParallelGroup: props.onUngroupParallelChatGroup,
    onDeleteParallelGroup: props.onDeleteParallelChatGroup,
    onCloseOverflowMenu: () => props.onOverflowMenuToggle(null),
  });
}

export function Sidebar(props: SidebarProps) {
  const { t } = useI18n();

  /* Chat reframes the row's terminal popover action as "Clear" —
   * wipes the cat's direct-lane channel so the next visit starts a
   * fresh NewChatDraft. The cat itself is NOT archived (the canonical
   * archive flow lives in /settings/cats, where it belongs at the
   * platform level). Implementation: locate the existing direct-lane
   * channel for the cat and call the channel-delete handler the
   * sidebar already has wired in. Uses the app-level
   * `<ConfirmDialog>` (passed in via `props.confirmDialog`) for the
   * destructive-action gate so the modal matches the rest of chat's
   * confirms. */
  const onClearDirectLane = async (catId: string): Promise<void> => {
    const channel = findDirectLaneForCat(props.payload.chat.channels, catId);
    if (!channel) return;
    const cat = props.payload.chat.cats.find((entry) => entry.id === catId);
    const catName = cat?.name ?? '';
    const confirmed = await props.confirmDialog({
      title: t(messageKeys.conversationSidebarClearButton),
      message: t(messageKeys.conversationSidebarClearConfirmMessage, {
        catName,
      }),
      confirmLabel: t(messageKeys.conversationSidebarClearButton),
    });
    if (!confirmed) return;
    props.onClearDirectLane(catId, channel.id);
  };

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
    primaryActions: createPrimaryActions(props, t),
    recentEntries: buildRecentEntries(props),
    forceShowMyCatsSection: true,
    myCatsEmptyStatePlaceholder: {
      label: t(messageKeys.chatSidebarMyCatsEmptyStateLabel),
      onClick: props.onCreateNewCat,
    },
    myCatsTerminalActionLabelKey: messageKeys.conversationSidebarClearButton,
    helpers: {
      catInitials,
      presentChannelTitle: (title) => presentChannelTitle(title, t),
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
    onArchiveCat: (catId) => {
      void onClearDirectLane(catId);
    },
    onAccountMenuToggle: props.onAccountMenuToggle,
    onOverflowMenuToggle: props.onOverflowMenuToggle,
    onNavigateSettings: props.onNavigateSettings,
    onNavigateRuntime: props.onNavigateRuntime,
    onSwitchProduct: props.onSwitchProduct,
    activeMyCatId: props.activeMyCatId,
    onDirectChatCat: props.onDirectChatCat,
  });
}
