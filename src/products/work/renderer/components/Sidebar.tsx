import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import {
  ConversationSidebar,
  type ConversationSidebarAction,
  type ConversationSidebarActionGroup,
} from '../../../../app/renderer/productShell/ConversationSidebar.js';
import type { AppShellPayload } from '../../api/contracts.js';
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
  onStartWorkIntake?: () => void;
  onOpenWarRoom?: () => void;
  onOpenProjects?: () => void;
  onOpenTasks?: () => void;
  onOpenWorkItems?: () => void;
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onRenameChannel: (channelId: string, title: string) => void;
  onArchiveCat: (catId: string) => void;
  onAccountMenuToggle: () => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onNavigateSettings: () => void;
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
}

function createPrimaryActions(props: SidebarProps): ConversationSidebarAction[] {
  const actions: ConversationSidebarAction[] = [
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
  ];

  if (props.onStartWorkIntake) {
    actions.push({
      key: 'start-work',
      label: 'Start work',
      onClick: props.onStartWorkIntake,
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
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
          <path d="M6 7h4" />
          <path d="M6 9.5h2.5" />
        </svg>
      ),
    });
  }

  return actions;
}

function createExtraActionGroups(props: SidebarProps): ConversationSidebarActionGroup[] {
  const currentPath = globalThis.location?.pathname ?? '/work';
  const groups: ConversationSidebarActionGroup[] = [];

  if (props.onOpenWarRoom) {
    groups.push({
      key: 'war-room',
      ariaLabel: 'Operations',
      items: [
        {
          key: 'war-room',
          label: 'War Room',
          onClick: props.onOpenWarRoom,
          active: currentPath.startsWith('/work/war-room'),
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
        },
      ],
    });
  }

  if (props.onOpenTasks) {
    groups.push({
      key: 'tasks',
      ariaLabel: 'Execution',
      items: [
        {
          key: 'tasks',
          label: 'Tasks',
          onClick: props.onOpenTasks,
          active: currentPath === '/work/tasks' || currentPath.startsWith('/work/tasks/'),
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
        },
      ],
    });
  }

  if (props.onOpenProjects) {
    groups.push({
      key: 'projects',
      ariaLabel: 'Portfolio',
      items: [
        {
          key: 'projects',
          label: 'Projects',
          onClick: props.onOpenProjects,
          active: currentPath.startsWith('/work/projects'),
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
          active: currentPath.startsWith('/work/work-items'),
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

  return groups;
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
    extraActionGroups: createExtraActionGroups(props),
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
