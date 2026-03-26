import type {
  CatsCoreState,
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreTaskStatus,
} from '../../../core/types.js';
import { resolveTaskExecutionProduct } from '../../../shared/taskExecutionBridge.js';
import {
  readTaskPlanningMetadataFromTask,
  resolveEffectiveTaskStrategy,
} from '../../../shared/taskPlanning.js';

const CODE_DASHBOARD_TASK_LIMIT = 16;
const CODE_DASHBOARD_ARTIFACT_LIMIT = 18;

export interface CodeDashboardSummary {
  ownerActorId: string;
  actorCount: number;
  conversationCount: number;
  taskCount: number;
  artifactCount: number;
  buildCount: number;
  previewCount: number;
  inProgressTaskCount: number;
  readyArtifactCount: number;
}

export interface CodeDashboardSection<TItem, TSummary> {
  title: string;
  emptyState: string;
  items: TItem[];
  summary: TSummary;
}

export interface CodeTaskListItem {
  id: string;
  title: string;
  status: CoreTaskStatus;
  summary: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  effectiveStrategy: string | null;
  updatedAt: string;
}

export interface CodeTaskListSummary {
  totalAvailable: number;
  returned: number;
  draftCount: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
}

export interface CodeArtifactListItem {
  id: string;
  title: string;
  kind: CoreArtifactKind;
  status: CoreArtifactStatus;
  summary: string | null;
  path: string | null;
  taskId: string | null;
  taskTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  updatedAt: string;
}

export interface CodeArtifactListSummary {
  totalAvailable: number;
  returned: number;
  buildCount: number;
  previewCount: number;
  readyCount: number;
  publishedCount: number;
}

export interface CodeDashboardProjection {
  product: {
    id: 'code';
    name: 'Cats Code';
    status: 'active';
    routeBase: '/code';
    apiBase: '/api/code';
  };
  summary: CodeDashboardSummary;
  sections: {
    tasks: CodeDashboardSection<CodeTaskListItem, CodeTaskListSummary>;
    artifacts: CodeDashboardSection<CodeArtifactListItem, CodeArtifactListSummary>;
  };
  selection: {
    defaultTaskId: string | null;
    defaultArtifactId: string | null;
  };
  extensionPoints: {
    projectionSource: 'cats-core';
    futureRoutes: string[];
  };
}

function formatTaskStatusCounts(tasks: CodeTaskListItem[]): CodeTaskListSummary {
  return tasks.reduce<CodeTaskListSummary>((summary, task) => {
    if (task.status === 'draft') {
      summary.draftCount += 1;
    }
    if (task.status === 'in_progress') {
      summary.inProgressCount += 1;
    }
    if (task.status === 'blocked') {
      summary.blockedCount += 1;
    }
    if (task.status === 'completed') {
      summary.completedCount += 1;
    }
    return summary;
  }, {
    totalAvailable: tasks.length,
    returned: tasks.length,
    draftCount: 0,
    inProgressCount: 0,
    blockedCount: 0,
    completedCount: 0,
  });
}

function formatArtifactStatusCounts(artifacts: CodeArtifactListItem[]): CodeArtifactListSummary {
  return artifacts.reduce<CodeArtifactListSummary>((summary, artifact) => {
    if (artifact.kind === 'build') {
      summary.buildCount += 1;
    }
    if (artifact.kind === 'preview') {
      summary.previewCount += 1;
    }
    if (artifact.status === 'ready') {
      summary.readyCount += 1;
    }
    if (artifact.status === 'published') {
      summary.publishedCount += 1;
    }
    return summary;
  }, {
    totalAvailable: artifacts.length,
    returned: artifacts.length,
    buildCount: 0,
    previewCount: 0,
    readyCount: 0,
    publishedCount: 0,
  });
}

function resolveConversationTitle(core: CatsCoreState, conversationId: string | null): string | null {
  if (!conversationId) {
    return null;
  }

  return core.conversations.find((conversation) => conversation.id === conversationId)?.title ?? null;
}

function resolveTaskWorkItem(
  core: CatsCoreState,
  taskId: string,
): { id: string; title: string } | null {
  const workItem = [...core.workItems]
    .filter((candidate) => candidate.taskId === taskId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  return workItem
    ? { id: workItem.id, title: workItem.title }
    : null;
}

function buildCodeTaskListItems(core: CatsCoreState): CodeTaskListItem[] {
  return [...core.tasks]
    .filter((task) => resolveTaskExecutionProduct({ core, task }) === 'code')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, CODE_DASHBOARD_TASK_LIMIT)
    .map((task) => {
      const planning = readTaskPlanningMetadataFromTask(task);
      const workItem = resolveTaskWorkItem(core, task.id);

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        summary: task.summary,
        conversationId: task.conversationId,
        conversationTitle: resolveConversationTitle(core, task.conversationId),
        workItemId: workItem?.id ?? null,
        workItemTitle: workItem?.title ?? null,
        effectiveStrategy: resolveEffectiveTaskStrategy('code', planning),
        updatedAt: task.updatedAt,
      };
    });
}

function buildCodeArtifactListItems(
  core: CatsCoreState,
  codeTaskItems: CodeTaskListItem[],
): CodeArtifactListItem[] {
  const allCodeTaskIds = new Set(
    core.tasks
      .filter((task) => resolveTaskExecutionProduct({ core, task }) === 'code')
      .map((task) => task.id),
  );
  const allCodeWorkItemIds = new Set(
    core.workItems
      .filter((workItem) => workItem.taskId && allCodeTaskIds.has(workItem.taskId))
      .map((workItem) => workItem.id),
  );

  return [...core.artifacts]
    .filter((artifact) =>
      (artifact.taskId ? allCodeTaskIds.has(artifact.taskId) : false)
      || (artifact.workItemId ? allCodeWorkItemIds.has(artifact.workItemId) : false))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, CODE_DASHBOARD_ARTIFACT_LIMIT)
    .map((artifact) => {
      const linkedTask = artifact.taskId
        ? codeTaskItems.find((task) => task.id === artifact.taskId) ?? null
        : null;
      const linkedWorkItem = artifact.workItemId
        ? core.workItems.find((workItem) => workItem.id === artifact.workItemId) ?? null
        : null;

      return {
        id: artifact.id,
        title: artifact.title,
        kind: artifact.kind,
        status: artifact.status,
        summary: artifact.summary,
        path: artifact.path,
        taskId: artifact.taskId,
        taskTitle: linkedTask?.title ?? null,
        workItemId: artifact.workItemId,
        workItemTitle: linkedWorkItem?.title ?? null,
        updatedAt: artifact.updatedAt,
      };
    });
}

export function buildCodeDashboardProjection(core: CatsCoreState): CodeDashboardProjection {
  const tasks = buildCodeTaskListItems(core);
  const artifacts = buildCodeArtifactListItems(core, tasks);
  const taskSummary = formatTaskStatusCounts(tasks);
  const artifactSummary = formatArtifactStatusCounts(artifacts);

  return {
    product: {
      id: 'code',
      name: 'Cats Code',
      status: 'active',
      routeBase: '/code',
      apiBase: '/api/code',
    },
    summary: {
      ownerActorId: core.ownerProfile.actorId,
      actorCount: core.actors.length,
      conversationCount: core.conversations.length,
      taskCount: taskSummary.totalAvailable,
      artifactCount: artifactSummary.totalAvailable,
      buildCount: artifactSummary.buildCount,
      previewCount: artifactSummary.previewCount,
      inProgressTaskCount: taskSummary.inProgressCount,
      readyArtifactCount: artifactSummary.readyCount,
    },
    sections: {
      tasks: {
        title: 'Code Tasks',
        emptyState: 'No code-oriented tasks have been routed into Cats Core yet.',
        items: tasks,
        summary: taskSummary,
      },
      artifacts: {
        title: 'Builds and Previews',
        emptyState: 'No build, preview, or code-linked artifacts have been recorded yet.',
        items: artifacts,
        summary: artifactSummary,
      },
    },
    selection: {
      defaultTaskId: tasks[0]?.id ?? null,
      defaultArtifactId: artifacts[0]?.id ?? null,
    },
    extensionPoints: {
      projectionSource: 'cats-core',
      futureRoutes: [
        '/api/code/projects',
        '/api/code/previews',
        '/api/code/builds',
      ],
    },
  };
}
