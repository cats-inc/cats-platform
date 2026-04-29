import {
  listCoreOperatorInboxItems,
  summarizeCoreOperatorInboxItems,
  type CoreOperatorInboxItem,
  type CoreOperatorInboxSummary,
} from '../../../core/operatorInbox.js';
import {
  buildCoreTaskInspectionView,
  type CoreTaskInspectionView,
} from '../../../core/taskInspection.js';
import {
  buildCoreTaskRecoveryView,
  listCoreTaskRecoveryViews,
  summarizeCoreTaskRecoveryViews,
  type CoreTaskRecoveryListSummary,
  type CoreTaskRecoveryView,
} from '../../../core/recovery.js';
import {
  buildCoreTaskControlPlaneView,
  listCoreTaskControlPlaneViews,
  summarizeCoreTaskControlPlaneViews,
  type CoreTaskControlPlaneListSummary,
  type CoreTaskControlPlaneView,
} from '../../../core/taskControlPlane.js';
import {
  queryCoreTaskTimelineView,
  type CoreTaskTimelineQuerySummary,
  type CoreTaskTimelineItem,
  type CoreTaskTimelineView,
} from '../../../core/taskTimeline.js';
import {
  buildSupervisedRunInspectionProjection,
  type SupervisedRunInspectionProjection,
} from '../../../platform/supervision/index.js';
import type {
  CatsCoreState,
  CoreConversationRecord,
  EvidenceEvent,
  CoreProjectRecord,
  CoreProjectStatus,
  CoreRunRecord,
  CoreRunStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
  MissionRecordStatus,
} from '../../../core/types.js';
import {
  buildProjectStatusCounts,
  buildTaskStatusCounts,
  buildWorkItemStatusCounts,
  isWorkTask,
  resolveActorName,
  resolveTaskProductBinding,
} from './projectionSupport.js';
import type {
  TaskPriority,
  WorkAttentionState,
  WorkTaskProductBinding,
} from '../shared/workGraphTypes.js';
import {
  WORK_API_PREFIX,
  WORK_API_PROJECTS_PATH,
  WORK_API_TASKS_PATH,
  WORK_API_WAR_ROOM_PATH,
  WORK_API_WORK_ITEMS_PATH,
} from '../shared/apiPaths.js';
import {
  createActiveWorkProductRef,
  createWorkProductRef,
  WORK_PRODUCT_NAME,
} from '../shared/productMetadata.js';

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
  primaryConversationSourceChannelId: string | null;
  ownerActorId: string;
  ownerName: string;
  attention: WorkAttentionState;
  linkedWorkItemCount: number;
  activeWorkItemCount: number;
  linkedTaskCount: number;
  linkedActivityCount: number;
  attentionDecisionCount: number;
  attentionBlockedCount: number;
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

export interface WorkProjectListProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
  };
  projects: WorkProjectListItem[];
  summary: WorkProjectListSummary;
}

export interface WorkProjectDetailProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
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
    conversationTitle: string | null;
    conversationSourceChannelId: string | null;
    assignedActors: Array<{
      actorId: string;
      displayName: string;
    }>;
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
  conversationSourceChannelId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  parentWorkItemId: string | null;
  parentWorkItemTitle: string | null;
  ownerActorId: string;
  ownerName: string;
  assignedActors: Array<{
    actorId: string;
    displayName: string;
  }>;
  attention: WorkAttentionState;
  linkedTaskCount: number;
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

export interface WorkWorkItemListProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
  };
  workItems: WorkWorkItemListItem[];
  summary: WorkWorkItemListSummary;
}

export interface WorkWorkItemDetailProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
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

export interface WorkTaskListItem {
  id: string;
  title: string;
  status: CoreTaskStatus;
  summary: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  conversationSourceChannelId: string | null;
  ownerActorId: string;
  ownerName: string;
  ownerRole: string | null;
  assignedActors: Array<{
    actorId: string;
    displayName: string;
  }>;
  projectId: string | null;
  projectTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  parentTaskId: string | null;
  controlPlane: CoreTaskControlPlaneView;
  recovery: CoreTaskRecoveryView;
  attention: WorkAttentionState;
  productBinding: WorkTaskProductBinding;
  priority: TaskPriority | null;
  assigneeName: string | null;
  acceptanceCriteria: string | null;
  updatedAt: string;
}

export interface WorkTaskListSummary {
  totalAvailable: number;
  returned: number;
  pendingApprovalCount: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
  linkedWorkItemCount: number;
  needsOperatorAttentionCount: number;
  recoveryCount: number;
}

export interface WorkTaskListProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
  };
  tasks: WorkTaskListItem[];
  summary: WorkTaskListSummary;
}

export interface WorkRunListItem {
  id: string;
  title: string;
  status: CoreRunStatus;
  summary: string | null;
  taskId: string | null;
  taskTitle: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  parentRunId: string | null;
  parentRunTitle: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface WorkRunListSummary {
  totalAvailable: number;
  returned: number;
  queuedCount: number;
  runningCount: number;
  blockedCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
}

export interface WorkRunListProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
  };
  runs: WorkRunListItem[];
  summary: WorkRunListSummary;
}

export interface WorkMissionListItem {
  id: string;
  title: string;
  status: MissionRecordStatus;
  summary: string | null;
  managedWorkId: string | null;
  managedWorkTitle: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkMissionListSummary {
  totalAvailable: number;
  returned: number;
  draftCount: number;
  plannedCount: number;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
}

export interface WorkMissionListProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
  };
  missions: WorkMissionListItem[];
  summary: WorkMissionListSummary;
}

export interface WorkTaskActionContext {
  conversationTitle: string | null;
  conversationSourceChannelId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  assignedActors: Array<{
    actorId: string;
    displayName: string;
  }>;
}

export interface WorkOperatorInboxItem extends CoreOperatorInboxItem {
  taskContext: WorkTaskActionContext;
}

export interface WorkControlPlaneItem extends CoreTaskControlPlaneView {
  taskContext: WorkTaskActionContext;
}

export interface WorkRecoveryItem extends CoreTaskRecoveryView {
  taskContext: WorkTaskActionContext;
}

export interface WorkDashboardProjection {
  product: {
    id: 'work';
    name: typeof WORK_PRODUCT_NAME;
    status: 'active';
    routeBase: '/work';
    apiBase: typeof WORK_API_PREFIX;
  };
  summary: WorkDashboardSummary;
  sections: {
    projects: WorkDashboardSection<WorkProjectListItem, WorkProjectListSummary>;
    workItems: WorkDashboardSection<WorkWorkItemListItem, WorkWorkItemListSummary>;
    operatorInbox: WorkDashboardSection<WorkOperatorInboxItem, CoreOperatorInboxSummary>;
    controlPlane: WorkDashboardSection<WorkControlPlaneItem, CoreTaskControlPlaneListSummary>;
    recovery: WorkDashboardSection<WorkRecoveryItem, CoreTaskRecoveryListSummary>;
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
    name: typeof WORK_PRODUCT_NAME;
  };
  task: CoreTaskRecord;
  project: WorkProjectListItem | null;
  workItem: WorkWorkItemListItem | null;
  conversation: CoreConversationRecord | null;
  assignedActors: Array<{
    actorId: string;
    displayName: string;
  }>;
  inspection: CoreTaskInspectionView;
  supervision: SupervisedRunInspectionProjection | null;
  controlPlane: CoreTaskControlPlaneView;
  recovery: CoreTaskRecoveryView;
  timeline: {
    summary: CoreTaskTimelineQuerySummary;
    view: CoreTaskTimelineView;
  };
}

export interface WorkSupervisedRunLaunchProjection {
  task: CoreTaskRecord;
  run: CoreRunRecord;
  created: boolean;
  supervision: SupervisedRunInspectionProjection | null;
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
      const primaryConversation = project.primaryConversationId
        ? core.conversations.find((conversation) => conversation.id === project.primaryConversationId) ?? null
        : null;
      const linkedTaskIdSet = new Set(
        linkedWorkItems
          .map((workItem) => workItem.taskId)
          .filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0),
      );
      const linkedTasks = core.tasks.filter((task) => linkedTaskIdSet.has(task.id));
      const linkedActivities = core.activities.filter(
        (activity) => activity.projectId === project.id,
      );

      const decisionPool: WorkAttentionState[] = [
        ...linkedWorkItems.map((workItem) => deriveAttentionFromStatus(workItem.status)),
        ...linkedTasks.map((task) => deriveAttentionFromStatus(task.status)),
      ];
      const attentionDecisionCount = decisionPool.filter(
        (attention) => attention === 'decision_needed',
      ).length;
      const attentionBlockedCount = decisionPool.filter(
        (attention) => attention === 'blocked' || attention === 'failed',
      ).length;

      return {
        id: project.id,
        title: project.title,
        status: project.status,
        summary: project.summary,
        repoPath: project.repoPath,
        primaryConversationId: project.primaryConversationId,
        primaryConversationTitle: primaryConversation?.title ?? null,
        primaryConversationSourceChannelId: primaryConversation?.sourceChannelId ?? null,
        ownerActorId: project.ownerActorId,
        ownerName: resolveActorName(core, project.ownerActorId),
        attention: deriveAttentionFromStatus(project.status),
        linkedWorkItemCount: linkedWorkItems.length,
        activeWorkItemCount: activeWorkItems.length,
        linkedTaskCount: linkedTaskIdSet.size,
        linkedActivityCount: linkedActivities.length,
        attentionDecisionCount,
        attentionBlockedCount,
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
      const conversation = workItem.conversationId
        ? core.conversations.find((candidate) => candidate.id === workItem.conversationId) ?? null
        : null;
      const projectTitle = workItem.projectId
        ? core.projects.find((project) => project.id === workItem.projectId)?.title ?? null
        : null;
      const parentWorkItemTitle = workItem.parentWorkItemId
        ? core.workItems.find((candidate) => candidate.id === workItem.parentWorkItemId)?.title
          ?? null
        : null;

      return {
        id: workItem.id,
        title: workItem.title,
        status: workItem.status,
        summary: workItem.summary,
        projectId: workItem.projectId,
        projectTitle,
        conversationId: workItem.conversationId,
        conversationTitle: conversation?.title ?? null,
        conversationSourceChannelId: conversation?.sourceChannelId ?? null,
        taskId: workItem.taskId,
        taskTitle: linkedTask?.title ?? null,
        parentWorkItemId: workItem.parentWorkItemId ?? null,
        parentWorkItemTitle,
        ownerActorId: workItem.ownerActorId,
        ownerName: resolveActorName(core, workItem.ownerActorId),
        assignedActors: workItem.assignedActorIds.map((actorId) => ({
          actorId,
          displayName: resolveActorName(core, actorId),
        })),
        attention: deriveAttentionFromStatus(workItem.status),
        linkedTaskCount: workItem.taskId ? 1 : 0,
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

const ATTENTION_BY_RECORD_STATUS: Record<string, WorkAttentionState> = {
  pending_approval: 'decision_needed',
  blocked: 'blocked',
  failed: 'failed',
  cancelled: 'failed',
  completed: 'recently_shipped',
};

function deriveAttentionFromStatus(status: string): WorkAttentionState {
  return ATTENTION_BY_RECORD_STATUS[status] ?? 'none';
}

interface TaskRendererExtras {
  priority: TaskPriority | null;
  assigneeName: string | null;
  acceptanceCriteria: string | null;
}

function readTaskRendererExtras(
  metadata: Record<string, unknown> | null | undefined,
): TaskRendererExtras {
  const empty: TaskRendererExtras = {
    priority: null,
    assigneeName: null,
    acceptanceCriteria: null,
  };
  if (!metadata) {
    return empty;
  }
  const raw = metadata.workRenderer;
  if (!raw || typeof raw !== 'object') {
    return empty;
  }
  const record = raw as Record<string, unknown>;
  const priority = record.priority;
  const validPriority =
    priority === 'urgent'
    || priority === 'high'
    || priority === 'medium'
    || priority === 'low';
  return {
    priority: validPriority ? (priority as TaskPriority) : null,
    assigneeName:
      typeof record.assigneeName === 'string' && record.assigneeName.length > 0
        ? record.assigneeName
        : null,
    acceptanceCriteria:
      typeof record.acceptanceCriteria === 'string'
        && record.acceptanceCriteria.length > 0
        ? record.acceptanceCriteria
        : null,
  };
}

function buildTaskListItems(
  core: CatsCoreState,
  limit = Number.POSITIVE_INFINITY,
): WorkTaskListItem[] {
  return [...core.tasks]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map((task) => {
      const conversation = task.conversationId
        ? core.conversations.find((candidate) => candidate.id === task.conversationId) ?? null
        : null;
      const workItem = core.workItems.find((candidate) => candidate.taskId === task.id) ?? null;
      const project = workItem?.projectId
        ? core.projects.find((candidate) => candidate.id === workItem.projectId) ?? null
        : null;
      const extras = readTaskRendererExtras(task.metadata);

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        summary: task.summary,
        conversationId: task.conversationId,
        conversationTitle: conversation?.title ?? null,
        conversationSourceChannelId: conversation?.sourceChannelId ?? null,
        ownerActorId: task.ownerActorId,
        ownerName: resolveActorName(core, task.ownerActorId),
        ownerRole: null,
        assignedActors: task.assignedActorIds.map((actorId) => ({
          actorId,
          displayName: resolveActorName(core, actorId),
        })),
        projectId: project?.id ?? null,
        projectTitle: project?.title ?? null,
        workItemId: workItem?.id ?? null,
        workItemTitle: workItem?.title ?? null,
        parentTaskId: task.parentTaskId ?? null,
        controlPlane: buildCoreTaskControlPlaneView(core, task),
        recovery: buildCoreTaskRecoveryView(core, task),
        attention: deriveAttentionFromStatus(task.status),
        productBinding: resolveTaskProductBinding(core, task),
        priority: extras.priority,
        assigneeName: extras.assigneeName,
        acceptanceCriteria: extras.acceptanceCriteria,
        updatedAt: task.updatedAt,
      };
    });
}

function buildTaskListSummary(
  items: WorkTaskListItem[],
  core: CatsCoreState,
): WorkTaskListSummary {
  const taskStatusCounts = buildTaskStatusCounts(core.tasks);

  return {
    totalAvailable: core.tasks.length,
    returned: items.length,
    pendingApprovalCount: taskStatusCounts.pending_approval,
    inProgressCount: taskStatusCounts.in_progress,
    blockedCount: taskStatusCounts.blocked,
    completedCount: taskStatusCounts.completed,
    linkedWorkItemCount: items.filter((item) => item.workItemId !== null).length,
    needsOperatorAttentionCount: items.filter((item) =>
      item.controlPlane.attention.needsOperatorAttention).length,
    recoveryCount: items.filter((item) => item.recovery.recoveryRequired).length,
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

function buildWorkTaskActionContext(
  core: CatsCoreState,
  taskId: string,
): WorkTaskActionContext {
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const conversation = task?.conversationId
    ? core.conversations.find((candidate) => candidate.id === task.conversationId) ?? null
    : null;
  const workItem = task
    ? core.workItems.find((candidate) => candidate.taskId === task.id) ?? null
    : null;
  const project = workItem?.projectId
    ? core.projects.find((candidate) => candidate.id === workItem.projectId) ?? null
    : null;

  return {
    conversationTitle: conversation?.title ?? null,
    conversationSourceChannelId: conversation?.sourceChannelId ?? null,
    projectId: project?.id ?? null,
    projectTitle: project?.title ?? null,
    workItemId: workItem?.id ?? null,
    workItemTitle: workItem?.title ?? null,
    assignedActors: task?.assignedActorIds.map((actorId) => ({
      actorId,
      displayName: resolveActorName(core, actorId),
    })) ?? [],
  };
}

export function buildWorkDashboardProjection(core: CatsCoreState): WorkDashboardProjection {
  const workTasks = core.tasks.filter((task) => isWorkTask(core, task));
  const workTaskIds = new Set(workTasks.map((task) => task.id));
  const operatorInboxItems = listCoreOperatorInboxItems(core)
    .filter((item) => workTaskIds.has(item.taskId))
    .slice(0, WORK_DASHBOARD_INBOX_LIMIT);
  const operatorInboxTaskItems: WorkOperatorInboxItem[] = operatorInboxItems.map((item) => ({
    ...item,
    taskContext: buildWorkTaskActionContext(core, item.taskId),
  }));
  const operatorInbox = {
    tasks: operatorInboxTaskItems,
    summary: summarizeCoreOperatorInboxItems({
      totalAvailable: operatorInboxTaskItems.length,
      matching: operatorInboxTaskItems.length,
      items: operatorInboxTaskItems,
    }),
  };
  const controlPlaneItems = listCoreTaskControlPlaneViews(core)
    .filter((view) => workTaskIds.has(view.taskId))
    .slice(0, WORK_DASHBOARD_CONTROL_PLANE_LIMIT);
  const controlPlaneTaskItems: WorkControlPlaneItem[] = controlPlaneItems.map((item) => ({
    ...item,
    taskContext: buildWorkTaskActionContext(core, item.taskId),
  }));
  const controlPlane = {
    tasks: controlPlaneTaskItems,
    summary: summarizeCoreTaskControlPlaneViews({
      totalAvailable: controlPlaneTaskItems.length,
      matching: controlPlaneTaskItems.length,
      views: controlPlaneTaskItems,
    }),
  };
  const recoveryItems = listCoreTaskRecoveryViews(core)
    .filter((view) => workTaskIds.has(view.taskId))
    .slice(0, WORK_DASHBOARD_RECOVERY_LIMIT);
  const recoveryTaskItems: WorkRecoveryItem[] = recoveryItems.map((item) => ({
    ...item,
    taskContext: buildWorkTaskActionContext(core, item.taskId),
  }));
  const recovery = {
    recoveries: recoveryTaskItems,
    summary: summarizeCoreTaskRecoveryViews({
      totalAvailable: recoveryTaskItems.length,
      matching: recoveryTaskItems.length,
      recoveries: recoveryTaskItems,
    }),
  };
  const projectItems = buildProjectListItems(core);
  const workItemItems = buildWorkItemListItems(core);
  const taskStatusCounts = buildTaskStatusCounts(workTasks);

  return {
    product: createActiveWorkProductRef(),
    summary: {
      ownerActorId: core.ownerProfile.actorId,
      actorCount: core.actors.length,
      conversationCount: core.conversations.length,
      projectCount: core.projects.length,
      workItemCount: core.workItems.length,
      taskCount: workTasks.length,
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
        WORK_API_PROJECTS_PATH,
        WORK_API_TASKS_PATH,
        WORK_API_WORK_ITEMS_PATH,
        WORK_API_WAR_ROOM_PATH,
      ],
    },
  };
}

export function buildWorkProjectListProjection(
  core: CatsCoreState,
): WorkProjectListProjection {
  const projects = buildProjectListItems(core, Number.POSITIVE_INFINITY);
  return {
    product: createWorkProductRef(),
    projects,
    summary: buildProjectListSummary(projects, core),
  };
}

export function buildWorkTaskListProjection(
  core: CatsCoreState,
): WorkTaskListProjection {
  const tasks = buildTaskListItems(core, Number.POSITIVE_INFINITY);
  return {
    product: createWorkProductRef(),
    tasks,
    summary: buildTaskListSummary(tasks, core),
  };
}

function buildRunListSummary(runs: readonly WorkRunListItem[]): WorkRunListSummary {
  const summary: WorkRunListSummary = {
    totalAvailable: runs.length,
    returned: runs.length,
    queuedCount: 0,
    runningCount: 0,
    blockedCount: 0,
    completedCount: 0,
    failedCount: 0,
    cancelledCount: 0,
  };
  for (const run of runs) {
    switch (run.status) {
      case 'queued':
        summary.queuedCount += 1;
        break;
      case 'running':
        summary.runningCount += 1;
        break;
      case 'blocked':
        summary.blockedCount += 1;
        break;
      case 'completed':
        summary.completedCount += 1;
        break;
      case 'failed':
        summary.failedCount += 1;
        break;
      case 'cancelled':
        summary.cancelledCount += 1;
        break;
      default: {
        const exhaustive: never = run.status;
        void exhaustive;
      }
    }
  }
  return summary;
}

export function buildWorkRunListProjection(
  core: CatsCoreState,
): WorkRunListProjection {
  const taskTitleById = new Map<string, string>();
  for (const task of core.tasks) {
    taskTitleById.set(task.id, task.title);
  }
  const conversationTitleById = new Map<string, string>();
  for (const conversation of core.conversations) {
    conversationTitleById.set(conversation.id, conversation.title || conversation.id);
  }
  const runTitleById = new Map<string, string>();
  for (const run of core.runs) {
    runTitleById.set(run.id, run.title);
  }

  const runs: WorkRunListItem[] = [...core.runs]
    .sort((left, right) => {
      const leftKey = left.startedAt ?? left.updatedAt;
      const rightKey = right.startedAt ?? right.updatedAt;
      return rightKey.localeCompare(leftKey);
    })
    .map((run) => ({
      id: run.id,
      title: run.title,
      status: run.status,
      summary: run.summary,
      taskId: run.taskId,
      taskTitle: run.taskId ? taskTitleById.get(run.taskId) ?? null : null,
      conversationId: run.conversationId,
      conversationTitle: run.conversationId
        ? conversationTitleById.get(run.conversationId) ?? null
        : null,
      parentRunId: run.parentRunId,
      parentRunTitle: run.parentRunId
        ? runTitleById.get(run.parentRunId) ?? null
        : null,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      updatedAt: run.updatedAt,
    }));

  return {
    product: createWorkProductRef(),
    runs,
    summary: buildRunListSummary(runs),
  };
}

function buildMissionListSummary(
  missions: readonly WorkMissionListItem[],
): WorkMissionListSummary {
  const summary: WorkMissionListSummary = {
    totalAvailable: missions.length,
    returned: missions.length,
    draftCount: 0,
    plannedCount: 0,
    queuedCount: 0,
    runningCount: 0,
    completedCount: 0,
    failedCount: 0,
    cancelledCount: 0,
  };
  for (const mission of missions) {
    switch (mission.status) {
      case 'draft':
        summary.draftCount += 1;
        break;
      case 'planned':
        summary.plannedCount += 1;
        break;
      case 'queued':
        summary.queuedCount += 1;
        break;
      case 'running':
        summary.runningCount += 1;
        break;
      case 'completed':
        summary.completedCount += 1;
        break;
      case 'failed':
        summary.failedCount += 1;
        break;
      case 'cancelled':
        summary.cancelledCount += 1;
        break;
      default: {
        const exhaustive: never = mission.status;
        void exhaustive;
      }
    }
  }
  return summary;
}

export function buildWorkMissionListProjection(
  core: CatsCoreState,
): WorkMissionListProjection {
  const workItemTitleById = new Map<string, string>();
  for (const workItem of core.workItems) {
    workItemTitleById.set(workItem.id, workItem.title);
  }
  const conversationTitleById = new Map<string, string>();
  for (const conversation of core.conversations) {
    conversationTitleById.set(conversation.id, conversation.title || conversation.id);
  }

  const missions: WorkMissionListItem[] = [...core.missions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((mission) => ({
      id: mission.id,
      title: mission.title,
      status: mission.status,
      summary: mission.summary,
      managedWorkId: mission.managedWorkId,
      managedWorkTitle: mission.managedWorkId
        ? workItemTitleById.get(mission.managedWorkId) ?? null
        : null,
      conversationId: mission.conversationId,
      conversationTitle: mission.conversationId
        ? conversationTitleById.get(mission.conversationId) ?? null
        : null,
      assignedAgentId: mission.assignedAgentId,
      assignedAgentName: mission.assignedAgentId
        ? resolveActorName(core, mission.assignedAgentId)
        : null,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
    }));

  return {
    product: createWorkProductRef(),
    missions,
    summary: buildMissionListSummary(missions),
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
    .map((task) => {
      const conversation = task.conversationId
        ? core.conversations.find((candidate) => candidate.id === task.conversationId) ?? null
        : null;

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        summary: task.summary,
        conversationTitle: conversation?.title ?? null,
        conversationSourceChannelId: conversation?.sourceChannelId ?? null,
        assignedActors: task.assignedActorIds.map((actorId) => ({
          actorId,
          displayName: resolveActorName(core, actorId),
        })),
        updatedAt: task.updatedAt,
      };
    });
  const projectArtifacts = core.artifacts.filter((artifact) => artifact.projectId === project.id);
  const projectActivity = core.activities
    .filter((activity) => activity.projectId === project.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    product: createWorkProductRef(),
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

export function buildWorkWorkItemListProjection(
  core: CatsCoreState,
): WorkWorkItemListProjection {
  const workItems = buildWorkItemListItems(core, Number.POSITIVE_INFINITY);
  return {
    product: createWorkProductRef(),
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
    product: createWorkProductRef(),
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
  evidenceEvents: EvidenceEvent[] = [],
): WorkTaskDetailProjection {
  const timeline = buildWorkTaskTimelineProjection(core, task, evidenceEvents);
  const inspection = buildCoreTaskInspectionView(core, task);
  const linkedWorkItem = core.workItems.find((candidate) => candidate.taskId === task.id) ?? null;
  const project = linkedWorkItem?.projectId
    ? core.projects.find((candidate) => candidate.id === linkedWorkItem.projectId) ?? null
    : null;
  const conversation = task.conversationId
    ? core.conversations.find((candidate) => candidate.id === task.conversationId) ?? null
    : null;
  const assignedActors = task.assignedActorIds.map((actorId) => ({
    actorId,
    displayName: resolveActorName(core, actorId),
  }));

  return {
    product: {
      id: 'work',
      name: 'Cats Work',
    },
    task,
    project: project
      ? buildProjectListItems(
        {
          ...core,
          projects: [project],
        },
        1,
      )[0] ?? null
      : null,
    workItem: linkedWorkItem
      ? buildWorkItemListItems(
        {
          ...core,
          workItems: [linkedWorkItem],
        },
        1,
      )[0] ?? null
      : null,
    conversation,
    assignedActors,
    inspection,
    supervision: inspection.latestRun
      ? buildSupervisedRunInspectionProjection(core, inspection.latestRun.id, evidenceEvents)
      : null,
    controlPlane: buildCoreTaskControlPlaneView(core, task),
    recovery: buildCoreTaskRecoveryView(core, task),
    timeline: {
      summary: timeline.summary,
      view: timeline.view,
    },
  };
}

function buildWorkTaskTimelineProjection(
  core: CatsCoreState,
  task: CoreTaskRecord,
  evidenceEvents: EvidenceEvent[],
): {
  summary: CoreTaskTimelineQuerySummary;
  view: CoreTaskTimelineView;
} {
  const base = queryCoreTaskTimelineView(core, task, {
    limit: null,
  }).timeline;
  const planItems = buildProviderAgentPlanTimelineItems(core, task);
  const evidenceItems = buildSupervisionEvidenceTimelineItems(core, task, evidenceEvents);
  const matching = [
    ...base.items,
    ...planItems,
    ...evidenceItems,
  ].sort(compareWorkTimelineItems);
  const returned = matching.slice(0, WORK_TIMELINE_PREVIEW_LIMIT);

  return {
    summary: {
      totalAvailable: matching.length,
      matching: matching.length,
      returned: returned.length,
    },
    view: {
      taskId: task.id,
      conversationId: task.conversationId,
      latestTimestamp: returned[0]?.timestamp ?? null,
      counts: {
        total: returned.length,
        taskLifecycle: returned.filter((item) => item.category === 'task_lifecycle').length,
        governance: returned.filter((item) => item.category === 'governance').length,
        execution: returned.filter((item) => item.category === 'execution').length,
        workflow: returned.filter((item) => item.category === 'workflow').length,
        recovery: returned.filter((item) => item.category === 'recovery').length,
        operator: returned.filter((item) => item.category === 'operator').length,
      },
      items: returned,
    },
  };
}

function buildProviderAgentPlanTimelineItems(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskTimelineItem[] {
  const runs = core.runs.filter((run) => run.taskId === task.id);

  return runs.flatMap((run) => {
    const supervision = asRecord(run.metadata.supervision);
    const runLoop = asRecord(supervision?.providerAgentRunLoop);
    const plans = Array.isArray(runLoop?.plans) ? runLoop.plans : [];

    return plans.flatMap((item) => {
      const record = asRecord(item);
      const planId = readString(record?.planId);
      const decisionId = readString(record?.decisionId);
      const recordedAt = readString(record?.recordedAt);
      const confidence = readString(record?.confidence);
      const stepCount = readFiniteNumber(record?.stepCount);
      const executableStepCount = readFiniteNumber(record?.executableStepCount);
      const toolNames = readStringArray(record?.toolNames);

      return planId &&
        decisionId &&
        recordedAt &&
        confidence &&
        stepCount !== null &&
        executableStepCount !== null
        ? [{
            timelineId: `provider_agent_plan:${run.id}:${planId}`,
            kind: 'plan' as const,
            category: 'workflow' as const,
            recordId: planId,
            timestamp: recordedAt,
            status: confidence,
            title: `Provider-agent plan: ${planId}`,
            summary: buildProviderAgentPlanTimelineSummary({
              decisionId,
              stepCount,
              executableStepCount,
              toolNames,
            }),
            taskId: task.id,
            conversationId: run.conversationId ?? task.conversationId,
            runId: run.id,
            traceId: run.traceId,
            actorId: run.orchestratorActorId,
          }]
        : [];
    });
  });
}

function buildProviderAgentPlanTimelineSummary(input: {
  decisionId: string;
  stepCount: number;
  executableStepCount: number;
  toolNames: string[];
}): string {
  const tools = input.toolNames.length > 0 ? `; tools: ${input.toolNames.join(', ')}` : '';
  return `${input.decisionId}: ${input.stepCount} step(s), ` +
    `${input.executableStepCount} executable${tools}`;
}

function buildSupervisionEvidenceTimelineItems(
  core: CatsCoreState,
  task: CoreTaskRecord,
  evidenceEvents: EvidenceEvent[],
): CoreTaskTimelineItem[] {
  const taskRunIds = new Set(
    core.runs
      .filter((run) => run.taskId === task.id)
      .map((run) => run.id),
  );

  return evidenceEvents.flatMap((event) => {
    const payload = asRecord(event.payload);
    const runId = readString(payload?.runId);
    if (!runId || !taskRunIds.has(runId)) {
      return [];
    }

    return [{
      timelineId: `evidence:${event.id}`,
      kind: 'evidence' as const,
      category: readEvidenceTimelineCategory(payload),
      recordId: event.id,
      timestamp: event.timestamp,
      status: readString(payload?.status),
      title: buildEvidenceTimelineTitle(payload),
      summary: readString(payload?.summary) ?? readString(payload?.source),
      taskId: task.id,
      conversationId: event.conversationId ?? task.conversationId,
      runId,
      traceId: null,
      actorId: event.actorId,
    }];
  });
}

function readEvidenceTimelineCategory(
  payload: Record<string, unknown> | null,
): CoreTaskTimelineItem['category'] {
  const status = readString(payload?.status);
  if (status === 'pending_approval') {
    return 'governance';
  }
  if (status === 'rejected') {
    return 'recovery';
  }
  return 'execution';
}

function buildEvidenceTimelineTitle(payload: Record<string, unknown> | null): string {
  const source = readString(payload?.source) ?? 'supervision evidence';
  const toolName = readString(payload?.toolName);
  if (toolName) {
    return `Evidence: ${toolName}`;
  }
  if (source === 'provider_agent_run_loop') {
    return 'Evidence: provider-agent run loop';
  }
  return `Evidence: ${source}`;
}

function compareWorkTimelineItems(
  left: CoreTaskTimelineItem,
  right: CoreTaskTimelineItem,
): number {
  const timestampDiff = right.timestamp.localeCompare(left.timestamp);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  const kindRank = (value: CoreTaskTimelineItem['kind']): number => {
    switch (value) {
      case 'activity':
        return 8;
      case 'evidence':
        return 7;
      case 'outcome':
        return 6;
      case 'plan':
        return 5;
      case 'checkpoint':
        return 4;
      case 'trace':
        return 3;
      case 'run':
        return 2;
      case 'approval_binding':
        return 1;
      case 'task':
      default:
        return 0;
    }
  };

  const rankDiff = kindRank(right.kind) - kindRank(left.kind);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  return right.recordId.localeCompare(left.recordId);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string =>
    typeof item === 'string' && item.trim().length > 0);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
