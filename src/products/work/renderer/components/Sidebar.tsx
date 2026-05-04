import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import {
  ConversationSidebar,
  type ConversationSidebarAction,
  type ConversationSidebarActionGroup,
  type ConversationSidebarProps,
  type ConversationSidebarRecentEntry,
} from '../../../../app/renderer/productShell/ConversationSidebar.js';
import type { ConversationSidebarPinnedItem } from '../../../../app/renderer/productShell/ConversationSidebarPinned.js';
import { removeWorkProject } from '../api/workRecords.js';
import {
  unpinProject,
  useUnpinnedProjectIds,
} from '../state/pinnedProjectPreferences.js';
import {
  PROJECTS_QUERY_KEY,
  useProjectsQuery,
  type WorkProjectListItem,
} from '../state/queries/projectsQuery.js';
import { sharedQueryClient } from '../../../shared/renderer/queryClient.js';
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
  WORK_ROUTE_PREFIX,
  isWorkBrokenLinksPath,
  isWorkCockpitPath,
  isWorkMissionsPath,
  isWorkProjectsPath,
  isWorkRunsPath,
  isWorkSchedulesPath,
  isWorkSystemMapPath,
  isWorkTasksPath,
  isWorkWarRoomPath,
  isWorkWorkItemsPath,
} from '../workPaths.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { getWorkObjectStatusLabel } from './topdown/WorkObjectCard.js';

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
  onOpenWarRoom?: () => void;
  onOpenProjects?: () => void;
  onOpenProject?: (projectId: string) => void;
  onOpenTasks?: () => void;
  onOpenRuns?: () => void;
  onOpenMissions?: () => void;
  onOpenSchedules?: () => void;
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

function createPrimaryActions(
  props: SidebarProps,
  t: ReturnType<typeof useI18n>["t"],
): ConversationSidebarAction[] {
  const actions: ConversationSidebarAction[] = [
    {
      key: 'new-work',
      label: t('workSidebarNewWorkLabel'),
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
      key: 'new-team-work',
      label: t('workSidebarTeamWorkLabel'),
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
    });
  }

  if (props.onStartNewParallelChat) {
    actions.push({
      key: 'new-parallel-work',
      label: t('workSidebarParallelWorkLabel'),
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
    });
  }

  return actions;
}

function createExtraActionGroups(
  props: SidebarProps,
  pinnedProjects: readonly WorkProjectListItem[],
  t: ReturnType<typeof useI18n>["t"],
): ConversationSidebarActionGroup[] {
  const currentPath = globalThis.location?.pathname ?? WORK_ROUTE_PREFIX;
  const groups: ConversationSidebarActionGroup[] = [];

  if (props.onOpenProjects) {
    groups.push({
      key: 'projects',
      ariaLabel: t('workSidebarPortfolioLabel'),
      items: [
        {
          key: 'projects',
          label: t('workSidebarProjectsLabel'),
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
      pinnedItems: buildPinnedProjectItems(props, currentPath, pinnedProjects, t),
    });
  }

  if (props.onOpenWorkItems) {
    groups.push({
      key: 'work-items',
      ariaLabel: t('workSidebarManagedWorkLabel'),
      items: [
        {
          key: 'work-items',
          label: t('workSidebarWorkItemsLabel'),
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

  if (
    props.onOpenTasks ||
    props.onOpenRuns ||
    props.onOpenMissions ||
    props.onOpenSchedules
  ) {
    const executionItems: ConversationSidebarAction[] = [];
    if (props.onOpenTasks) {
      executionItems.push({
        key: 'tasks',
        label: t('workSidebarTasksLabel'),
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
        label: t('workSidebarRunsLabel'),
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
        label: t('workSidebarMissionsLabel'),
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
    if (props.onOpenSchedules) {
      executionItems.push({
        key: 'schedules',
        label: t('workSidebarSchedulesLabel'),
        onClick: props.onOpenSchedules,
        active: isWorkSchedulesPath(currentPath),
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
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 4.5V8l2.5 1.5" />
            <path d="M4 2.5l-1 1" />
            <path d="M12 2.5l1 1" />
          </svg>
        ),
      });
    }
    groups.push({
      key: 'execution',
      ariaLabel: t('workSidebarExecutionLabel'),
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
      label: t('workSidebarSystemMapLabel'),
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
      label: t('workSidebarCockpitLabel'),
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
      label: t('workSidebarBrokenLinksLabel'),
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
      label: t('workSidebarWarRoomLabel'),
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
      ariaLabel: t('workSidebarWorkTopDownSurfacesLabel'),
      items: topDownItems,
    });
  }

  return groups;
}

function buildPinnedProjectItems(
  props: SidebarProps,
  currentPath: string,
  projects: readonly WorkProjectListItem[],
  t: ReturnType<typeof useI18n>["t"],
): ConversationSidebarPinnedItem[] {
  if (!props.onOpenProject) return [];
  return projects
    .map((project) => ({
      id: project.id,
      label: project.title,
      isActive: currentPath === `${WORK_ROUTE_PREFIX}/projects/${project.id}`,
      onClick: () => props.onOpenProject?.(project.id),
      statusDot: {
        className: `projectsList__dot projectsList__dot--small projectsList__dot--${project.status}`,
        title: getWorkObjectStatusLabel(project.status, t),
      },
      overflowActions: [
        {
          key: 'unpin',
          label: t('workSidebarUnpinProjectLabel'),
          onClick: () => {
            props.onOverflowMenuToggle(null);
            unpinProject(project.id);
          },
        },
        {
          key: 'delete',
          label: t('workSidebarDeleteProjectLabel'),
          destructive: true,
          onClick: () => {
            props.onOverflowMenuToggle(null);
            void removeWorkProject(project.id, t('workProjectDeleteError')).then(() =>
              sharedQueryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
            );
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

export interface WorkSidebarConversationPropsOptions {
  pinnedProjects?: readonly WorkProjectListItem[];
}

export type WorkSidebarConversationProps = ConversationSidebarProps<
  ChatCat,
  ChatChannelSummary,
  AppShellPayload,
  MyCatStatusDot
>;

export function createWorkSidebarConversationProps(
  props: SidebarProps,
  options: WorkSidebarConversationPropsOptions = {},
  t: ReturnType<typeof useI18n>["t"],
): WorkSidebarConversationProps {
  const pinnedProjects = options.pinnedProjects ?? [];
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
    extraActionGroups: createExtraActionGroups(props, pinnedProjects, t),
    recentEntries: buildRecentEntries(props),
    recentEmptyStateLabel: t('workSidebarNoWorkYetLabel'),
    myCatsSectionLabel: t('workSidebarMyCatteriesLabel'),
    myCatsSectionCats: [],
    forceShowMyCatsSection: true,
    myCatsEmptyStatePlaceholder: {
      label: t('workSidebarNewCatteryLabel'),
      onClick: () => undefined,
    },
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
  const { t } = useI18n();
  const projectsQuery = useProjectsQuery();
  const unpinnedIds = useUnpinnedProjectIds();
  const pinnedProjects = (projectsQuery.data?.projects ?? []).filter(
    (project) => !unpinnedIds.has(project.id),
  );
  return (
    <ConversationSidebar
      {...createWorkSidebarConversationProps(props, { pinnedProjects }, t)}
    />
  );
}
