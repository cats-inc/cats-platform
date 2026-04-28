import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import {
  ConversationSidebar,
  type ConversationSidebarAction,
  type ConversationSidebarActionGroup,
  type ConversationSidebarRecentEntry,
} from '../../../../app/renderer/productShell/ConversationSidebar.js';
import type { ConversationSidebarPinnedItem } from '../../../../app/renderer/productShell/ConversationSidebarPinned.js';
import {
  pinnedProjectsStore,
  usePinnedProjects,
  type PinnedProjectsSnapshot,
} from '../state/pinnedProjectsStore';
import './projects/projects.css';
import { buildConversationSidebarRecentEntries } from '../../../../app/renderer/productShell/conversationSidebarRecentEntries.js';
import type { AppShellPayload } from '../../api/contracts.js';
import type { ChatChannelSummary } from '../../../shared/api/workspaceContracts.js';
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
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import {
  WORK_ROUTE_PREFIX,
  isWorkBrokenLinksPath,
  isWorkCockpitPath,
  isWorkMissionsPath,
  isWorkProjectsPath,
  isWorkRunsPath,
  isWorkSystemMapPath,
  isWorkTasksPath,
  isWorkWarRoomPath,
  isWorkWorkItemsPath,
} from '../workPaths.js';

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
  onOpenWarRoom?: () => void;
  onOpenProjects?: () => void;
  onOpenProject?: (projectId: string) => void;
  onOpenTasks?: () => void;
  onOpenRuns?: () => void;
  onOpenMissions?: () => void;
  onOpenWorkItems?: () => void;
  onOpenSystemMap?: () => void;
  onOpenCockpit?: () => void;
  onOpenBrokenLinks?: () => void;
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
}

function createPrimaryActions(props: SidebarProps): ConversationSidebarAction[] {
  const actions: ConversationSidebarAction[] = [
    {
      key: 'new-work',
      label: 'New work',
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

  return actions;
}

function createExtraActionGroups(
  props: SidebarProps,
  pinnedSnapshot: PinnedProjectsSnapshot,
): ConversationSidebarActionGroup[] {
  const currentPath = globalThis.location?.pathname ?? WORK_ROUTE_PREFIX;
  const groups: ConversationSidebarActionGroup[] = [];

  if (props.onOpenProjects) {
    groups.push({
      key: 'projects',
      ariaLabel: 'Portfolio',
      items: [
        {
          key: 'projects',
          label: 'Projects',
          onClick: props.onOpenProjects,
          active: isWorkProjectsPath(currentPath),
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
              <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
              <path d="M5 3v-1" />
              <path d="M11 3v-1" />
              <path d="M4.5 7h7" />
            </svg>
          ),
        },
      ],
      pinnedItems: buildPinnedProjectItems(props, currentPath, pinnedSnapshot),
    });
  }

  if (props.onOpenWorkItems) {
    groups.push({
      key: 'work-items',
      ariaLabel: 'Managed Work',
      items: [
        {
          key: 'work-items',
          label: 'Work Items',
          onClick: props.onOpenWorkItems,
          active: isWorkWorkItemsPath(currentPath),
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
              <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
              <path d="M5 6h6" />
              <path d="M5 8.5h6" />
              <path d="M5 11h3.5" />
            </svg>
          ),
        },
      ],
    });
  }

  if (props.onOpenTasks || props.onOpenRuns || props.onOpenMissions) {
    const executionItems: ConversationSidebarAction[] = [];
    if (props.onOpenTasks) {
      executionItems.push({
        key: 'tasks',
        label: 'Tasks',
        onClick: props.onOpenTasks,
        active: isWorkTasksPath(currentPath) && !isWorkRunsPath(currentPath),
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
            <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
            <path d="M5 5.5h6" />
            <path d="M5 8h6" />
            <path d="M5 10.5h4" />
          </svg>
        ),
      });
    }
    if (props.onOpenRuns) {
      executionItems.push({
        key: 'runs',
        label: 'Runs',
        onClick: props.onOpenRuns,
        active: isWorkRunsPath(currentPath),
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
            <polygon points="5,3 12.5,8 5,13" />
          </svg>
        ),
      });
    }
    if (props.onOpenMissions) {
      executionItems.push({
        key: 'missions',
        label: 'Missions',
        onClick: props.onOpenMissions,
        active: isWorkMissionsPath(currentPath),
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
            <circle cx="8" cy="8" r="5" />
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1.5v2" />
            <path d="M8 12.5v2" />
            <path d="M1.5 8h2" />
            <path d="M12.5 8h2" />
          </svg>
        ),
      });
    }
    groups.push({
      key: 'execution',
      ariaLabel: 'Execution',
      items: executionItems,
    });
  }

  // Top-down Work surfaces (ADR-083 / SPEC-083): structural inspection,
  // operational triage, and conformance. Each entry navigates to a
  // dedicated full-canvas page.
  const topDownItems: ConversationSidebarAction[] = [];
  if (props.onOpenSystemMap) {
    topDownItems.push({
      key: 'system-map',
      label: 'System Map',
      onClick: props.onOpenSystemMap,
      active: isWorkSystemMapPath(currentPath),
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
          <rect x="2" y="2" width="4" height="4" rx="1" />
          <rect x="6.5" y="6.5" width="4" height="4" rx="1" />
          <rect x="11" y="11" width="3" height="3" rx="0.75" />
          <path d="M6 4h2" />
          <path d="M9 8h1.5" />
        </svg>
      ),
    });
  }
  if (props.onOpenCockpit) {
    topDownItems.push({
      key: 'cockpit',
      label: 'Cockpit',
      onClick: props.onOpenCockpit,
      active: isWorkCockpitPath(currentPath),
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
          <path d="M2 12.5a6 6 0 0 1 12 0" />
          <path d="M8 12.5V8" />
          <path d="M8 8l3-2.5" />
          <circle cx="8" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      ),
    });
  }
  if (props.onOpenBrokenLinks) {
    topDownItems.push({
      key: 'broken-links',
      label: 'Broken Links',
      onClick: props.onOpenBrokenLinks,
      active: isWorkBrokenLinksPath(currentPath),
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
          <path d="M6 6.5L4 8.5a2.12 2.12 0 0 0 3 3l1-1" />
          <path d="M10 9.5l2-2a2.12 2.12 0 0 0-3-3l-1 1" />
          <path d="M5.5 10.5l5-5" strokeDasharray="1.5 1.5" />
        </svg>
      ),
    });
  }
  if (props.onOpenWarRoom) {
    topDownItems.push({
      key: 'war-room',
      label: 'War Room',
      onClick: props.onOpenWarRoom,
      active: isWorkWarRoomPath(currentPath),
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
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
          <path d="M4 5h8" />
          <path d="M4 8h8" />
          <path d="M6 11h4" />
        </svg>
      ),
    });
  }
  if (topDownItems.length > 0) {
    groups.push({
      key: 'top-down',
      ariaLabel: 'Work top-down surfaces',
      items: topDownItems,
    });
  }

  return groups;
}

function buildPinnedProjectItems(
  props: SidebarProps,
  currentPath: string,
  snapshot: PinnedProjectsSnapshot,
): ConversationSidebarPinnedItem[] {
  if (!props.onOpenProject) return [];
  return snapshot.allProjects
    .filter((project) => snapshot.pinnedIds.has(project.id) && !snapshot.deletedIds.has(project.id))
    .map((project) => ({
      id: project.id,
      label: project.title,
      isActive: currentPath === `${WORK_ROUTE_PREFIX}/projects/${project.id}`,
      onClick: () => props.onOpenProject?.(project.id),
      statusDot: {
        className: `projectsList__dot projectsList__dot--small projectsList__dot--${project.status}`,
        title: project.status.replace(/_/g, ' '),
      },
      overflowActions: [
        {
          key: 'unpin',
          label: 'Unpin',
          onClick: () => {
            props.onOverflowMenuToggle(null);
            pinnedProjectsStore.unpin(project.id);
          },
        },
        {
          key: 'delete',
          label: 'Delete',
          destructive: true,
          onClick: () => {
            props.onOverflowMenuToggle(null);
            void pinnedProjectsStore.remove(project.id);
          },
        },
      ],
    }));
}

function buildRecentEntries(props: SidebarProps): ConversationSidebarRecentEntry<ChatChannelSummary>[] {
  return buildConversationSidebarRecentEntries({
    channels: props.payload.chat.channels,
    parallelChatGroups: props.payload.chat.parallelChatGroups,
    activeSurface: props.shellSurface ?? 'work',
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
  const pinnedSnapshot = usePinnedProjects();
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
    extraActionGroups: createExtraActionGroups(props, pinnedSnapshot),
    recentEntries: buildRecentEntries(props),
    recentEmptyStateLabel: 'No work yet',
    myCatsSectionLabel: 'My Catteries',
    myCatsSectionCats: [],
    forceShowMyCatsSection: true,
    myCatsEmptyStatePlaceholder: {
      label: 'New cattery',
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
  });
}
