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
import type { CatsCoreState, CoreTaskRecord } from '../../../core/types.js';

const WORK_DASHBOARD_INBOX_LIMIT = 10;
const WORK_DASHBOARD_CONTROL_PLANE_LIMIT = 12;
const WORK_DASHBOARD_RECOVERY_LIMIT = 10;
const WORK_TIMELINE_PREVIEW_LIMIT = 12;

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
    operatorInbox: WorkDashboardSection<CoreOperatorInboxItem, CoreOperatorInboxSummary>;
    controlPlane: WorkDashboardSection<CoreTaskControlPlaneView, CoreTaskControlPlaneListSummary>;
    recovery: WorkDashboardSection<CoreTaskRecoveryView, CoreTaskRecoveryListSummary>;
  };
  selection: {
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
