import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import {
  ConversationSidebar,
  type ConversationSidebarAction,
  type ConversationSidebarActionGroup,
  type ConversationSidebarProps,
  type ConversationSidebarRecentEntry,
} from '../../../../app/renderer/productShell/ConversationSidebar.js';
import type { ConversationSidebarPinnedItem } from '../../../../app/renderer/productShell/ConversationSidebarPinned.js';
import {
  createEmptyCodeWorkspacesSnapshot,
  useCodeWorkspaces,
  type CodeWorkspacesSnapshot,
} from '../state/codeWorkspacesStore.js';
import { buildConversationSidebarRecentEntries } from '../../../../app/renderer/productShell/conversationSidebarRecentEntries.js';
import type { AppShellPayload } from '../../api/contracts.js';
import type { ChatCat, ChatChannelSummary } from '../../../shared/api/workspaceContracts.js';
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
  type MyCatStatusDot,
} from '../myCatNavigation';
import { isDirectLaneSummary } from '../../shared/channelTopology.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import {
  CODE_ROUTE_PREFIX,
  buildCodeCodespacePath,
  isCodeArtifactsPath,
  isCodeBuildPath,
  isCodeCodespacesPath,
  isCodeRelayPath,
} from '../codePaths.js';

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
  onStartNewGroupChat?: () => void;
  onStartNewParallelChat?: () => void;
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onRenameChannel: (channelId: string, title: string) => void;
  onRenameParallelChatGroup?: (groupId: string, title: string) => void;
  onUngroupParallelChatGroup?: (groupId: string) => void;
  onDeleteParallelChatGroup?: (groupId: string) => void;
  onArchiveCat: (catId: string) => void;
  onAccountMenuToggle: () => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onNavigateSettings: () => void;
  onNavigateRuntime: () => void;
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
  onOpenBuild?: () => void;
  onOpenRelay?: () => void;
  onOpenWorkspaces?: () => void;
  onOpenWorkspace?: (workspaceId: string) => void;
  onOpenArtifacts?: () => void;
}

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

function createPrimaryActions(
  props: SidebarProps,
  t: Translate,
): ConversationSidebarAction[] {
  const actions: ConversationSidebarAction[] = [
    {
      key: 'new-chat',
      label: t(messageKeys.codeSidebarNewCodeLabel),
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
  ];

  if (props.onStartNewGroupChat) {
    actions.push({
      key: 'new-group-chat',
      label: t(messageKeys.codeSidebarTeamCodeLabel),
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
          <path d="M5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          <path d="M11 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          <path d="M2.5 12c.4-1.5 1.5-2.5 2.5-2.5s2.1 1 2.5 2.5" />
          <path d="M8.5 12c.4-1.5 1.5-2.5 2.5-2.5s2.1 1 2.5 2.5" />
        </svg>
      ),
    });
  }

  if (props.onStartNewParallelChat) {
    actions.push({
      key: 'new-parallel-chat',
      label: t(messageKeys.codeSidebarPeerCodeLabel),
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
          <path d="M4 13V6" />
          <path d="M1 9l3-3 3 3" />
          <path d="M12 13V6" />
          <path d="M9 9l3-3 3 3" />
        </svg>
      ),
    });
  }

  return actions;
}

function createExtraActionGroups(
  props: SidebarProps,
  workspacesSnapshot: CodeWorkspacesSnapshot,
  t: Translate,
): ConversationSidebarActionGroup[] {
  const currentPath = globalThis.location?.pathname ?? CODE_ROUTE_PREFIX;
  const groups: ConversationSidebarActionGroup[] = [];

  if (props.onOpenWorkspaces) {
    groups.push({
      key: 'workspaces',
      ariaLabel: t(messageKeys.codeSidebarCodespacesLabel),
      items: [
        {
          key: 'workspaces',
          label: t(messageKeys.codeSidebarCodespacesLabel),
          onClick: props.onOpenWorkspaces,
          active: isCodeCodespacesPath(currentPath),
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
              <path d="M2 5.5a1.5 1.5 0 0 1 1.5-1.5h2.25l1.25 1.5H12.5A1.5 1.5 0 0 1 14 7v4.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
              <path d="M2 7.75h12" />
            </svg>
          ),
        },
      ],
      pinnedItems: buildPinnedWorkspaceItems(props, currentPath, workspacesSnapshot),
    });
  }

  if (props.onOpenArtifacts) {
    groups.push({
      key: 'artifacts',
      ariaLabel: t(messageKeys.codeSidebarLabelArtifacts),
      items: [
        {
          key: 'artifacts',
          label: t(messageKeys.codeSidebarLabelArtifacts),
          onClick: props.onOpenArtifacts,
          active: isCodeArtifactsPath(currentPath),
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
              <path d="M3 4.5l5-2.5 5 2.5v6.5l-5 2.5-5-2.5z" />
              <path d="M3 4.5l5 2.5 5-2.5" />
              <path d="M8 7v6.5" />
            </svg>
          ),
        },
      ],
    });
  }

  if (props.onOpenRelay) {
    groups.push({
      key: 'relay',
      ariaLabel: t(messageKeys.codeSidebarLabelRelay),
      items: [
        {
          key: 'relay',
          label: t(messageKeys.codeSidebarLabelRelay),
          onClick: props.onOpenRelay,
          active: isCodeRelayPath(currentPath),
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
              <path d="M3 4h4" />
              <path d="M9 4h4" />
              <path d="M5 4v8" />
              <path d="M11 4v8" />
              <path d="M5 8h6" />
              <path d="M3 12h4" />
              <path d="M9 12h4" />
            </svg>
          ),
        },
      ],
    });
  }

  if (props.onOpenBuild) {
    groups.push({
      key: 'build',
      ariaLabel: t(messageKeys.codeSidebarLabelBuild),
      items: [
        {
          key: 'build',
          label: t(messageKeys.codeSidebarLabelBuild),
          onClick: props.onOpenBuild,
          active: isCodeBuildPath(currentPath),
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
              <path d="M2 4l6-2 6 2v6l-6 2-6-2z" />
              <path d="M2 4l6 2 6-2" />
              <path d="M8 6v8" />
            </svg>
          ),
        },
      ],
    });
  }

  return groups;
}

function buildPinnedWorkspaceItems(
  props: SidebarProps,
  currentPath: string,
  snapshot: CodeWorkspacesSnapshot,
): ConversationSidebarPinnedItem[] {
  if (!props.onOpenWorkspace) return [];
  return snapshot.workspaces
    .filter((ws) => snapshot.pinnedIds.has(ws.id))
    .map((ws) => ({
      id: ws.id,
      label: ws.title,
      isActive: currentPath === buildCodeCodespacePath(ws.id),
      onClick: () => props.onOpenWorkspace?.(ws.id),
      statusDot: {
        className: `codeWorkspacesList__dot codeWorkspacesList__dot--small codeWorkspacesList__dot--${ws.status}`,
        title: ws.status,
      },
    }));
}

function buildRecentEntries(props: SidebarProps): ConversationSidebarRecentEntry<ChatChannelSummary>[] {
  return buildConversationSidebarRecentEntries({
    channels: props.payload.chat.channels,
    parallelChatGroups: props.payload.chat.parallelChatGroups,
    activeSurface: props.shellSurface ?? 'code',
    routeChannelId: props.routeChannelId,
    isDirectLaneSummary,
    onSelect: props.onSelect,
    onRenameParallelGroup: props.onRenameParallelChatGroup,
    onUngroupParallelGroup: props.onUngroupParallelChatGroup,
    onDeleteParallelGroup: props.onDeleteParallelChatGroup,
    onCloseOverflowMenu: () => props.onOverflowMenuToggle(null),
  });
}

export interface CodeSidebarConversationPropsOptions {
  workspacesSnapshot?: CodeWorkspacesSnapshot;
  t?: Translate;
}

export type CodeSidebarConversationProps = ConversationSidebarProps<
  ChatCat,
  ChatChannelSummary,
  AppShellPayload,
  MyCatStatusDot
>;

export function createCodeSidebarConversationProps(
  props: SidebarProps,
  options: CodeSidebarConversationPropsOptions = {},
): CodeSidebarConversationProps {
  const workspacesSnapshot = options.workspacesSnapshot ?? createEmptyCodeWorkspacesSnapshot();
  const t = options.t ?? createTranslator('en');
  return {
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
    extraActionGroups: createExtraActionGroups(props, workspacesSnapshot, t),
    recentEntries: buildRecentEntries(props),
    recentEmptyStateLabel: t(messageKeys.codeSidebarNoCodesYetLabel),
    myCatsSectionLabel: t(messageKeys.codeSidebarMyClowdersLabel),
    myCatsSectionCats: [],
    forceShowMyCatsSection: true,
    myCatsEmptyStatePlaceholder: {
      label: t(messageKeys.codeSidebarNewClowderLabel),
      onClick: () => undefined,
    },
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
    onNavigateRuntime: props.onNavigateRuntime,
    onSwitchProduct: props.onSwitchProduct,
    activeMyCatId: props.activeMyCatId,
    onDirectChatCat: props.onDirectChatCat,
  };
}

export function Sidebar(props: SidebarProps) {
  const workspacesSnapshot = useCodeWorkspaces();
  const { t } = useI18n();
  return (
    <ConversationSidebar
      {...createCodeSidebarConversationProps(props, { workspacesSnapshot, t })}
    />
  );
}
