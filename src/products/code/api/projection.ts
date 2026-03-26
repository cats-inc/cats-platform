import {
  buildCoreTaskInspectionView,
  type CoreTaskInspectionView,
} from '../../../core/taskInspection.js';
import {
  queryCoreTaskTimelineView,
  type CoreTaskTimelineQuerySummary,
  type CoreTaskTimelineView,
} from '../../../core/taskTimeline.js';
import type {
  CatsCoreState,
  CoreArtifactKind,
  CoreArtifactRecord,
  CoreArtifactStatus,
  CoreConversationRecord,
  CoreProjectRecord,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
} from '../../../core/types.js';
import { resolveTaskExecutionProduct } from '../../../shared/taskExecutionBridge.js';
import {
  readTaskPlanningMetadataFromTask,
  resolveEffectiveTaskStrategy,
} from '../../../shared/taskPlanning.js';

const CODE_DASHBOARD_TASK_LIMIT = 16;
const CODE_DASHBOARD_ARTIFACT_LIMIT = 18;
const CODE_TIMELINE_PREVIEW_LIMIT = 12;
const CODE_DETAIL_ARTIFACT_LIMIT = 12;

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

export interface CodeTaskDetailProjection {
  product: {
    id: 'code';
    name: 'Cats Code';
  };
  task: CoreTaskRecord;
  conversation: CoreConversationRecord | null;
  workItem: {
    id: string;
    title: string;
    status: CoreWorkItemStatus;
    projectId: string | null;
    projectTitle: string | null;
    updatedAt: string;
  } | null;
  effectiveStrategy: string | null;
  inspection: CoreTaskInspectionView;
  timeline: {
    summary: CoreTaskTimelineQuerySummary;
    view: CoreTaskTimelineView;
  };
  linkedArtifacts: CodeArtifactListItem[];
  artifactSummary: {
    totalCount: number;
    buildCount: number;
    previewCount: number;
    readyCount: number;
  };
}

export interface CodeArtifactDetailProjection {
  product: {
    id: 'code';
    name: 'Cats Code';
  };
  artifact: CoreArtifactRecord;
  task: CodeTaskListItem | null;
  workItem: {
    id: string;
    title: string;
    status: CoreWorkItemStatus;
    projectId: string | null;
    projectTitle: string | null;
    updatedAt: string;
  } | null;
  project: CoreProjectRecord | null;
  conversation: CoreConversationRecord | null;
  relatedArtifacts: CodeArtifactListItem[];
  focus: {
    kind: 'build' | 'preview' | 'artifact';
    isReady: boolean;
    isPublished: boolean;
  };
}

export interface CodeTaskListProjection {
  tasks: CodeTaskListItem[];
  summary: CodeTaskListSummary;
}

export interface CodeArtifactListProjection {
  filter: 'all' | 'build' | 'preview';
  artifacts: CodeArtifactListItem[];
  summary: CodeArtifactListSummary;
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

function resolveConversationTitle(value: CoreConversationRecord | null): string | null {
  return value?.title ?? null;
}

function resolveConversation(core: CatsCoreState, conversationId: string | null): CoreConversationRecord | null {
  if (!conversationId) {
    return null;
  }

  return core.conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

function resolveTaskWorkItemRecord(
  core: CatsCoreState,
  taskId: string,
): CoreWorkItemRecord | null {
  return [...core.workItems]
    .filter((candidate) => candidate.taskId === taskId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

function resolveProjectTitle(core: CatsCoreState, projectId: string | null): string | null {
  if (!projectId) {
    return null;
  }

  return core.projects.find((project) => project.id === projectId)?.title ?? null;
}

function buildWorkItemReference(
  core: CatsCoreState,
  workItem: CoreWorkItemRecord | null,
): CodeTaskDetailProjection['workItem'] {
  if (!workItem) {
    return null;
  }

  return {
    id: workItem.id,
    title: workItem.title,
    status: workItem.status,
    projectId: workItem.projectId,
    projectTitle: resolveProjectTitle(core, workItem.projectId),
    updatedAt: workItem.updatedAt,
  };
}

function isCodeTask(core: CatsCoreState, task: CoreTaskRecord): boolean {
  if (core.artifacts.some((artifact) => artifact.taskId === task.id && (
    artifact.kind === 'build' || artifact.kind === 'preview'))) {
    return true;
  }

  return resolveTaskExecutionProduct({ core, task }) === 'code';
}

function listCodeTasks(core: CatsCoreState): CoreTaskRecord[] {
  return [...core.tasks]
    .filter((task) => isCodeTask(core, task))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function buildCodeTaskListItem(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CodeTaskListItem {
  const planning = readTaskPlanningMetadataFromTask(task);
  const conversation = resolveConversation(core, task.conversationId);
  const workItem = resolveTaskWorkItemRecord(core, task.id);

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    summary: task.summary,
    conversationId: task.conversationId,
    conversationTitle: resolveConversationTitle(conversation),
    workItemId: workItem?.id ?? null,
    workItemTitle: workItem?.title ?? null,
    effectiveStrategy: resolveEffectiveTaskStrategy('code', planning),
    updatedAt: task.updatedAt,
  };
}

function buildCodeTaskListSummary(
  allTasks: CoreTaskRecord[],
  returnedTasks: CodeTaskListItem[],
): CodeTaskListSummary {
  return allTasks.reduce<CodeTaskListSummary>((summary, task) => {
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
    totalAvailable: allTasks.length,
    returned: returnedTasks.length,
    draftCount: 0,
    inProgressCount: 0,
    blockedCount: 0,
    completedCount: 0,
  });
}

function listCodeArtifacts(
  core: CatsCoreState,
  codeTasks: CoreTaskRecord[],
  filter: 'all' | 'build' | 'preview' = 'all',
): CoreArtifactRecord[] {
  const allCodeTaskIds = new Set(codeTasks.map((task) => task.id));
  const allCodeWorkItemIds = new Set(
    core.workItems
      .filter((workItem) => workItem.taskId && allCodeTaskIds.has(workItem.taskId))
      .map((workItem) => workItem.id),
  );

  return [...core.artifacts]
    .filter((artifact) =>
      ((artifact.taskId ? allCodeTaskIds.has(artifact.taskId) : false)
      || (artifact.workItemId ? allCodeWorkItemIds.has(artifact.workItemId) : false))
      && (filter === 'all' || artifact.kind === filter))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function buildCodeArtifactListItem(
  core: CatsCoreState,
  artifact: CoreArtifactRecord,
  taskItemById: Map<string, CodeTaskListItem>,
): CodeArtifactListItem {
  const linkedTask = artifact.taskId ? taskItemById.get(artifact.taskId) ?? null : null;
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
}

function buildCodeArtifactListSummary(
  allArtifacts: CoreArtifactRecord[],
  returnedArtifacts: CodeArtifactListItem[],
): CodeArtifactListSummary {
  return allArtifacts.reduce<CodeArtifactListSummary>((summary, artifact) => {
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
    totalAvailable: allArtifacts.length,
    returned: returnedArtifacts.length,
    buildCount: 0,
    previewCount: 0,
    readyCount: 0,
    publishedCount: 0,
  });
}

export function buildCodeTaskListProjection(core: CatsCoreState): CodeTaskListProjection {
  const allTasks = listCodeTasks(core);
  const tasks = allTasks
    .slice(0, CODE_DASHBOARD_TASK_LIMIT)
    .map((task) => buildCodeTaskListItem(core, task));

  return {
    tasks,
    summary: buildCodeTaskListSummary(allTasks, tasks),
  };
}

export function buildCodeArtifactListProjection(
  core: CatsCoreState,
  filter: 'all' | 'build' | 'preview' = 'all',
): CodeArtifactListProjection {
  const allTasks = listCodeTasks(core);
  const taskItems = allTasks.map((task) => buildCodeTaskListItem(core, task));
  const taskItemById = new Map(taskItems.map((task) => [task.id, task]));
  const allArtifacts = listCodeArtifacts(core, allTasks, filter);
  const artifacts = allArtifacts
    .slice(0, CODE_DASHBOARD_ARTIFACT_LIMIT)
    .map((artifact) => buildCodeArtifactListItem(core, artifact, taskItemById));

  return {
    filter,
    artifacts,
    summary: buildCodeArtifactListSummary(allArtifacts, artifacts),
  };
}

export function buildCodeTaskDetailProjection(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CodeTaskDetailProjection {
  const conversation = resolveConversation(core, task.conversationId);
  const workItem = resolveTaskWorkItemRecord(core, task.id);
  const codeArtifacts = listCodeArtifacts(core, [task])
    .slice(0, CODE_DETAIL_ARTIFACT_LIMIT);
  const taskListProjection = buildCodeTaskListProjection(core);
  const taskItemById = new Map(taskListProjection.tasks.map((item) => [item.id, item]));
  const linkedArtifacts = codeArtifacts.map((artifact) =>
    buildCodeArtifactListItem(core, artifact, taskItemById));
  const artifactSummary = buildCodeArtifactListSummary(
    listCodeArtifacts(core, [task]),
    linkedArtifacts,
  );
  const timeline = queryCoreTaskTimelineView(core, task, { limit: CODE_TIMELINE_PREVIEW_LIMIT });

  return {
    product: {
      id: 'code',
      name: 'Cats Code',
    },
    task,
    conversation,
    workItem: buildWorkItemReference(core, workItem),
    effectiveStrategy: resolveEffectiveTaskStrategy('code', readTaskPlanningMetadataFromTask(task)),
    inspection: buildCoreTaskInspectionView(core, task),
    timeline: {
      summary: timeline.summary,
      view: timeline.timeline,
    },
    linkedArtifacts,
    artifactSummary: {
      totalCount: artifactSummary.totalAvailable,
      buildCount: artifactSummary.buildCount,
      previewCount: artifactSummary.previewCount,
      readyCount: artifactSummary.readyCount,
    },
  };
}

export function buildCodeArtifactDetailProjection(
  core: CatsCoreState,
  artifact: CoreArtifactRecord,
): CodeArtifactDetailProjection {
  const task = artifact.taskId
    ? core.tasks.find((candidate) => candidate.id === artifact.taskId) ?? null
    : null;
  const workItem = artifact.workItemId
    ? core.workItems.find((candidate) => candidate.id === artifact.workItemId) ?? null
    : (task ? resolveTaskWorkItemRecord(core, task.id) : null);
  const project = artifact.projectId
    ? core.projects.find((candidate) => candidate.id === artifact.projectId) ?? null
    : (workItem?.projectId
      ? core.projects.find((candidate) => candidate.id === workItem.projectId) ?? null
      : null);
  const conversation = resolveConversation(
    core,
    artifact.conversationId ?? task?.conversationId ?? workItem?.conversationId ?? null,
  );
  const taskProjection = task ? buildCodeTaskListItem(core, task) : null;
  const codeTasks = listCodeTasks(core);
  const taskItems = codeTasks.map((candidate) => buildCodeTaskListItem(core, candidate));
  const taskItemById = new Map(taskItems.map((item) => [item.id, item]));
  const relatedArtifacts = listCodeArtifacts(core, codeTasks)
    .filter((candidate) =>
      candidate.id !== artifact.id
      && (
        (artifact.taskId && candidate.taskId === artifact.taskId)
        || (artifact.workItemId && candidate.workItemId === artifact.workItemId)
      ))
    .slice(0, CODE_DETAIL_ARTIFACT_LIMIT)
    .map((candidate) => buildCodeArtifactListItem(core, candidate, taskItemById));

  return {
    product: {
      id: 'code',
      name: 'Cats Code',
    },
    artifact,
    task: taskProjection,
    workItem: buildWorkItemReference(core, workItem),
    project,
    conversation,
    relatedArtifacts,
    focus: {
      kind: artifact.kind === 'build'
        ? 'build'
        : artifact.kind === 'preview'
          ? 'preview'
          : 'artifact',
      isReady: artifact.status === 'ready',
      isPublished: artifact.status === 'published',
    },
  };
}

export function buildCodeDashboardProjection(core: CatsCoreState): CodeDashboardProjection {
  const taskList = buildCodeTaskListProjection(core);
  const artifactList = buildCodeArtifactListProjection(core);

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
      taskCount: taskList.summary.totalAvailable,
      artifactCount: artifactList.summary.totalAvailable,
      buildCount: artifactList.summary.buildCount,
      previewCount: artifactList.summary.previewCount,
      inProgressTaskCount: taskList.summary.inProgressCount,
      readyArtifactCount: artifactList.summary.readyCount,
    },
    sections: {
      tasks: {
        title: 'Code Tasks',
        emptyState: 'No code-oriented tasks have been routed into Cats Core yet.',
        items: taskList.tasks,
        summary: taskList.summary,
      },
      artifacts: {
        title: 'Builds and Previews',
        emptyState: 'No build, preview, or code-linked artifacts have been recorded yet.',
        items: artifactList.artifacts,
        summary: artifactList.summary,
      },
    },
    selection: {
      defaultTaskId: taskList.tasks[0]?.id ?? null,
      defaultArtifactId: artifactList.artifacts[0]?.id ?? null,
    },
    extensionPoints: {
      projectionSource: 'cats-core',
      futureRoutes: [
        '/api/code/tasks',
        '/api/code/tasks/:taskId',
        '/api/code/artifacts',
        '/api/code/artifacts/:artifactId',
        '/api/code/builds',
        '/api/code/previews',
      ],
    },
  };
}
