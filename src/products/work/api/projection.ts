import {
  queryCoreOperatorInboxItems,
  type CoreOperatorInboxItem,
  type CoreOperatorInboxSummary,
} from '../../../core/operatorInbox.js';
import {
  buildCoreTaskInspectionView,
  type CoreTaskInspectionView,
} from '../../../core/taskInspection.js';
import {
  queryCoreTaskRecoveryViews,
  buildCoreTaskRecoveryView,
  type CoreTaskRecoveryListSummary,
  type CoreTaskRecoveryView,
} from '../../../core/recovery.js';
import {
  buildCoreTaskControlPlaneView,
  queryCoreTaskControlPlaneViews,
  type CoreTaskControlPlaneListSummary,
  type CoreTaskControlPlaneView,
} from '../../../core/taskControlPlane.js';
import {
  queryCoreTaskTimelineView,
  type CoreTaskTimelineQuerySummary,
  type CoreTaskTimelineView,
} from '../../../core/taskTimeline.js';
import type {
  CatsCoreState,
  CoreConversationRecord,
  CoreProjectRecord,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
} from '../../../core/types.js';

const WORK_DASHBOARD_INBOX_LIMIT = 10;
const WORK_DASHBOARD_CONTROL_PLANE_LIMIT = 12;
const WORK_DASHBOARD_RECOVERY_LIMIT = 10;
const WORK_TIMELINE_PREVIEW_LIMIT = 12;
const WORK_PROJECT_LIST_LIMIT = 12;
const WORK_WORK_ITEM_LIST_LIMIT = 16;
const WORK_DETAIL_LIST_LIMIT = 12;

export interface WorkDashboardSummary {
  ownerActorId: string;
  actorCount: number;
  conversationCount: number;
  projectCount: number;
  workItemCount: number;
  taskCount: number;
  pendingApprovalCount: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
  operatorAttentionCount: number;
  recoveryCount: number;
}

export interface WorkDashboardSection<TItem, TSummary> {
  title: string;
  emptyState: string;
  items: TItem[];
  summary: TSummary;
}

export interface WorkProjectListItem {
  id: string;
  title: string;
  status: CoreProjectStatus;
  summary: string | null;
  repoPath: string | null;
  primaryConversationId: string | null;
  primaryConversationTitle: string | null;
  ownerActorId: string;
  ownerName: string;
  linkedWorkItemCount: number;
  activeWorkItemCount: number;
  linkedTaskCount: number;
  updatedAt: string;
}

export interface WorkProjectListSummary {
  totalAvailable: number;
  returned: number;
  activeCount: number;
  pausedCount: number;
  archivedCount: number;
  linkedWorkItemCount: number;
}

export interface WorkProjectDetailProjection {
  product: {
    id: 'work';
    name: 'Cats Work';
  };
  project: CoreProjectRecord;
  ownerName: string;
  primaryConversation: CoreConversationRecord | null;
  workItems: WorkWorkItemListItem[];
  linkedTasks: Array<{
    id: string;
    title: string;
    status: CoreTaskStatus;
    summary: string | null;
    updatedAt: string;
  }>;
  artifacts: {
    totalCount: number;
    readyCount: number;
  };
  activity: {
    totalCount: number;
    latestMessages: string[];
  };
}

export interface WorkWorkItemListItem {
  id: string;
  title: string;
  status: CoreWorkItemStatus;
  summary: string | null;
  projectId: string | null;
  projectTitle: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  taskId: string | null;
  taskTitle: string | null;
  ownerActorId: string;
  ownerName: string;
  assignedActorNames: string[];
  updatedAt: string;
}

export interface WorkWorkItemListSummary {
  totalAvailable: number;
  returned: number;
  readyCount: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
  linkedTaskCount: number;
}

export interface WorkWorkItemDetailProjection {
  product: {
    id: 'work';
    name: 'Cats Work';
  };
  workItem: CoreWorkItemRecord;
  ownerName: string;
  project: WorkProjectListItem | null;
  conversation: CoreConversationRecord | null;
  assignedActors: Array<{
    actorId: string;
    displayName: string;
  }>;
  linkedTask: WorkTaskDetailProjection | null;
  artifacts: {
    totalCount: number;
    readyCount: number;
  };
  activity: {
    totalCount: number;
    latestMessages: string[];
  };
}

export interface WorkDashboardProjection {
  product: {
    id: 'work';
    name: 'Cats Work';
    status: 'active';
    routeBase: '/work';
    apiBase: '/api/work';
  };
  summary: WorkDashboardSummary;
  sections: {
    projects: WorkDashboardSection<WorkProjectListItem, WorkProjectListSummary>;
    workItems: WorkDashboardSection<WorkWorkItemListItem, WorkWorkItemListSummary>;
    operatorInbox: WorkDashboardSection<CoreOperatorInboxItem, CoreOperatorInboxSummary>;
    controlPlane: WorkDashboardSection<CoreTaskControlPlaneView, CoreTaskControlPlaneListSummary>;
    recovery: WorkDashboardSection<CoreTaskRecoveryView, CoreTaskRecoveryListSummary>;
  };
  selection: {
    defaultProjectId: string | null;
    defaultWorkItemId: string | null;
    defaultTaskId: string | null;
  };
  extensionPoints: {
    projectionSource: 'cats-core';
    futureRoutes: string[];
  };
}

export interface WorkTaskDetailProjection {
  product: {
    id: 'work';
    name: 'Cats Work';
  };
  task: CoreTaskRecord;
  inspection: CoreTaskInspectionView;
  controlPlane: CoreTaskControlPlaneView;
  recovery: CoreTaskRecoveryView;
  timeline: {
    summary: CoreTaskTimelineQuerySummary;
    view: CoreTaskTimelineView;
  };
}

function buildTaskStatusCounts(core: CatsCoreState): Record<CoreTaskRecord['status'], number> {
  return core.tasks.reduce<Record<CoreTaskRecord['status'], number>>((counts, task) => {
    counts[task.status] += 1;
    return counts;
  }, {
    draft: 0,
    pending_approval: 0,
    approved: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    archived: 0,
  });
}

function buildProjectStatusCounts(core: CatsCoreState): Record<CoreProjectStatus, number> {
  return core.projects.reduce<Record<CoreProjectStatus, number>>((counts, project) => {
    counts[project.status] += 1;
    return counts;
  }, {
    planned: 0,
    active: 0,
    paused: 0,
    archived: 0,
  });
}

function buildWorkItemStatusCounts(core: CatsCoreState): Record<CoreWorkItemStatus, number> {
  return core.workItems.reduce<Record<CoreWorkItemStatus, number>>((counts, workItem) => {
    counts[workItem.status] += 1;
    return counts;
  }, {
    draft: 0,
    planned: 0,
    ready: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    archived: 0,
  });
}

function resolveActorName(core: CatsCoreState, actorId: string | null | undefined): string {
  if (!actorId) {
    return 'Unknown owner';
  }

  if (actorId === core.ownerProfile.actorId) {
    return core.ownerProfile.displayName;
  }

  return core.actors.find((actor) => actor.id === actorId)?.name ?? actorId;
}

function resolveConversationTitle(core: CatsCoreState, conversationId: string | null): string | null {
  if (!conversationId) {
    return null;
  }

  return core.conversations.find((conversation) => conversation.id === conversationId)?.title ?? null;
}

function buildProjectListItems(
  core: CatsCoreState,
  limit = WORK_PROJECT_LIST_LIMIT,
): WorkProjectListItem[] {
  return [...core.projects]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map((project) => {
      const linkedWorkItems = core.workItems.filter((workItem) => workItem.projectId === project.id);
      const activeWorkItems = linkedWorkItems.filter((workItem) =>
        workItem.status !== 'completed'
        && workItem.status !== 'cancelled'
        && workItem.status !== 'archived');
      const linkedTaskIds = new Set(
        linkedWorkItems
          .map((workItem) => workItem.taskId)
          .filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0),
      );

      return {
        id: project.id,
        title: project.title,
        status: project.status,
        summary: project.summary,
        repoPath: project.repoPath,
        primaryConversationId: project.primaryConversationId,
        primaryConversationTitle: resolveConversationTitle(core, project.primaryConversationId),
        ownerActorId: project.ownerActorId,
        ownerName: resolveActorName(core, project.ownerActorId),
        linkedWorkItemCount: linkedWorkItems.length,
        activeWorkItemCount: activeWorkItems.length,
        linkedTaskCount: linkedTaskIds.size,
        updatedAt: project.updatedAt,
      };
    });
}

function buildWorkItemListItems(
  core: CatsCoreState,
  limit = WORK_WORK_ITEM_LIST_LIMIT,
): WorkWorkItemListItem[] {
  return [...core.workItems]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map((workItem) => {
      const linkedTask = workItem.taskId
        ? core.tasks.find((task) => task.id === workItem.taskId) ?? null
        : null;
      const projectTitle = workItem.projectId
        ? core.projects.find((project) => project.id === workItem.projectId)?.title ?? null
        : null;

      return {
        id: workItem.id,
        title: workItem.title,
        status: workItem.status,
        summary: workItem.summary,
        projectId: workItem.projectId,
        projectTitle,
        conversationId: workItem.conversationId,
        conversationTitle: resolveConversationTitle(core, workItem.conversationId),
        taskId: workItem.taskId,
        taskTitle: linkedTask?.title ?? null,
        ownerActorId: workItem.ownerActorId,
        ownerName: resolveActorName(core, workItem.ownerActorId),
        assignedActorNames: workItem.assignedActorIds.map((actorId) => resolveActorName(core, actorId)),
        updatedAt: workItem.updatedAt,
      };
    });
}

function buildProjectListSummary(
  items: WorkProjectListItem[],
  core: CatsCoreState,
): WorkProjectListSummary {
  const projectStatusCounts = buildProjectStatusCounts(core);

  return {
    totalAvailable: core.projects.length,
    returned: items.length,
    activeCount: projectStatusCounts.active,
    pausedCount: projectStatusCounts.paused,
    archivedCount: projectStatusCounts.archived,
    linkedWorkItemCount: core.workItems.filter((workItem) => workItem.projectId !== null).length,
  };
}

function buildWorkItemListSummary(
  items: WorkWorkItemListItem[],
  core: CatsCoreState,
): WorkWorkItemListSummary {
  const workItemStatusCounts = buildWorkItemStatusCounts(core);

  return {
    totalAvailable: core.workItems.length,
    returned: items.length,
    readyCount: workItemStatusCounts.ready,
    inProgressCount: workItemStatusCounts.in_progress,
    blockedCount: workItemStatusCounts.blocked,
    completedCount: workItemStatusCounts.completed,
    linkedTaskCount: core.workItems.filter((workItem) => workItem.taskId !== null).length,
  };
}

function resolveDefaultTaskId(
  operatorInbox: CoreOperatorInboxItem[],
  controlPlane: CoreTaskControlPlaneView[],
  recoveries: CoreTaskRecoveryView[],
  core: CatsCoreState,
): string | null {
  return operatorInbox[0]?.taskId
    ?? controlPlane[0]?.taskId
    ?? recoveries[0]?.taskId
    ?? core.tasks[0]?.id
    ?? null;
}

export function buildWorkDashboardProjection(core: CatsCoreState): WorkDashboardProjection {
  const operatorInbox = queryCoreOperatorInboxItems(core, {
    limit: WORK_DASHBOARD_INBOX_LIMIT,
  });
  const controlPlane = queryCoreTaskControlPlaneViews(core, {
    limit: WORK_DASHBOARD_CONTROL_PLANE_LIMIT,
  });
  const recovery = queryCoreTaskRecoveryViews(core, {
    limit: WORK_DASHBOARD_RECOVERY_LIMIT,
  });
  const projectItems = buildProjectListItems(core);
  const workItemItems = buildWorkItemListItems(core);
  const taskStatusCounts = buildTaskStatusCounts(core);

  return {
    product: {
      id: 'work',
      name: 'Cats Work',
      status: 'active',
      routeBase: '/work',
      apiBase: '/api/work',
    },
    summary: {
      ownerActorId: core.ownerProfile.actorId,
      actorCount: core.actors.length,
      conversationCount: core.conversations.length,
      projectCount: core.projects.length,
      workItemCount: core.workItems.length,
      taskCount: core.tasks.length,
      pendingApprovalCount: taskStatusCounts.pending_approval,
      inProgressCount: taskStatusCounts.in_progress,
      blockedCount: taskStatusCounts.blocked,
      completedCount: taskStatusCounts.completed,
      operatorAttentionCount: controlPlane.summary.needsOperatorAttentionCount,
      recoveryCount: recovery.summary.matching,
    },
    sections: {
      projects: {
        title: 'Projects',
        emptyState: 'No projects have been recorded in Cats Core yet.',
        items: projectItems,
        summary: buildProjectListSummary(projectItems, core),
      },
      workItems: {
        title: 'Work Items',
        emptyState: 'No work items have been recorded in Cats Core yet.',
        items: workItemItems,
        summary: buildWorkItemListSummary(workItemItems, core),
      },
      operatorInbox: {
        title: 'Operator Inbox',
        emptyState: 'No tasks currently need operator attention.',
        items: operatorInbox.tasks,
        summary: operatorInbox.summary,
      },
      controlPlane: {
        title: 'Control Plane',
        emptyState: 'No tasks are currently surfacing governance or workflow signals.',
        items: controlPlane.tasks,
        summary: controlPlane.summary,
      },
      recovery: {
        title: 'Recovery',
        emptyState: 'No tasks currently require replay, retry, or approval-based recovery.',
        items: recovery.recoveries,
        summary: recovery.summary,
      },
    },
    selection: {
      defaultProjectId: projectItems[0]?.id ?? null,
      defaultWorkItemId: workItemItems[0]?.id ?? null,
      defaultTaskId: resolveDefaultTaskId(
        operatorInbox.tasks,
        controlPlane.tasks,
        recovery.recoveries,
        core,
      ),
    },
    extensionPoints: {
      projectionSource: 'cats-core',
      futureRoutes: [
        '/api/work/projects',
        '/api/work/work-items',
        '/api/work/war-room',
      ],
    },
  };
}

export function buildWorkProjectListProjection(core: CatsCoreState): {
  product: {
    id: 'work';
    name: 'Cats Work';
  };
  projects: WorkProjectListItem[];
  summary: WorkProjectListSummary;
} {
  const projects = buildProjectListItems(core, Number.POSITIVE_INFINITY);
  return {
    product: {
      id: 'work',
      name: 'Cats Work',
    },
    projects,
    summary: buildProjectListSummary(projects, core),
  };
}

export function buildWorkProjectDetailProjection(
  core: CatsCoreState,
  project: CoreProjectRecord,
): WorkProjectDetailProjection {
  const workItems = buildWorkItemListItems(core, Number.POSITIVE_INFINITY)
    .filter((item) => item.projectId === project.id)
    .slice(0, WORK_DETAIL_LIST_LIMIT);
  const linkedTaskIds = new Set(
    core.workItems
      .filter((workItem) => workItem.projectId === project.id && workItem.taskId)
      .map((workItem) => workItem.taskId as string),
  );
  const linkedTasks = core.tasks
    .filter((task) => linkedTaskIds.has(task.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, WORK_DETAIL_LIST_LIMIT)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      summary: task.summary,
      updatedAt: task.updatedAt,
    }));
  const projectArtifacts = core.artifacts.filter((artifact) => artifact.projectId === project.id);
  const projectActivity = core.activities
    .filter((activity) => activity.projectId === project.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    product: {
      id: 'work',
      name: 'Cats Work',
    },
    project,
    ownerName: resolveActorName(core, project.ownerActorId),
    primaryConversation: project.primaryConversationId
      ? core.conversations.find((conversation) => conversation.id === project.primaryConversationId) ?? null
      : null,
    workItems,
    linkedTasks,
    artifacts: {
      totalCount: projectArtifacts.length,
      readyCount: projectArtifacts.filter((artifact) => artifact.status === 'ready').length,
    },
    activity: {
      totalCount: projectActivity.length,
      latestMessages: projectActivity.slice(0, 4).map((activity) => activity.message),
    },
  };
}

export function buildWorkWorkItemListProjection(core: CatsCoreState): {
  product: {
    id: 'work';
    name: 'Cats Work';
  };
  workItems: WorkWorkItemListItem[];
  summary: WorkWorkItemListSummary;
} {
  const workItems = buildWorkItemListItems(core, Number.POSITIVE_INFINITY);
  return {
    product: {
      id: 'work',
      name: 'Cats Work',
    },
    workItems,
    summary: buildWorkItemListSummary(workItems, core),
  };
}

export function buildWorkWorkItemDetailProjection(
  core: CatsCoreState,
  workItem: CoreWorkItemRecord,
): WorkWorkItemDetailProjection {
  const project = workItem.projectId
    ? core.projects.find((candidate) => candidate.id === workItem.projectId) ?? null
    : null;
  const linkedTask = workItem.taskId
    ? core.tasks.find((task) => task.id === workItem.taskId) ?? null
    : null;
  const workItemArtifacts = core.artifacts.filter((artifact) => artifact.workItemId === workItem.id);
  const workItemActivity = core.activities
    .filter((activity) => activity.workItemId === workItem.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    product: {
      id: 'work',
      name: 'Cats Work',
    },
    workItem,
    ownerName: resolveActorName(core, workItem.ownerActorId),
    project: project
      ? buildProjectListItems(
        {
          ...core,
          projects: [project],
        },
        1,
      )[0] ?? null
      : null,
    conversation: workItem.conversationId
      ? core.conversations.find((conversation) => conversation.id === workItem.conversationId) ?? null
      : null,
    assignedActors: workItem.assignedActorIds.map((actorId) => ({
      actorId,
      displayName: resolveActorName(core, actorId),
    })),
    linkedTask: linkedTask ? buildWorkTaskDetailProjection(core, linkedTask) : null,
    artifacts: {
      totalCount: workItemArtifacts.length,
      readyCount: workItemArtifacts.filter((artifact) => artifact.status === 'ready').length,
    },
    activity: {
      totalCount: workItemActivity.length,
      latestMessages: workItemActivity.slice(0, 4).map((activity) => activity.message),
    },
  };
}

export function buildWorkTaskDetailProjection(
  core: CatsCoreState,
  task: CoreTaskRecord,
): WorkTaskDetailProjection {
  const timeline = queryCoreTaskTimelineView(core, task, {
    limit: WORK_TIMELINE_PREVIEW_LIMIT,
  });

  return {
    product: {
      id: 'work',
      name: 'Cats Work',
    },
    task,
    inspection: buildCoreTaskInspectionView(core, task),
    controlPlane: buildCoreTaskControlPlaneView(core, task),
    recovery: buildCoreTaskRecoveryView(core, task),
    timeline: {
      summary: timeline.summary,
      view: timeline.timeline,
    },
  };
}
