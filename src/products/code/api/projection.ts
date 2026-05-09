import { createHash } from 'node:crypto';

import {
  buildCoreTaskControlPlaneView,
  type CoreTaskControlPlaneView,
} from '../../../core/taskControlPlane.js';
import {
  buildCoreTaskInspectionView,
  type CoreTaskInspectionView,
} from '../../../core/taskInspection.js';
import {
  buildCoreTaskRecoveryView,
  type CoreTaskRecoveryView,
} from '../../../core/recovery.js';
import {
  queryCoreTaskTimelineView,
  type CoreTaskTimelineQuerySummary,
  type CoreTaskTimelineView,
} from '../../../core/taskTimeline.js';
import {
  buildSupervisedRunInspectionProjection,
  type SupervisedRunInspectionProjection,
} from '../../../platform/supervision/index.js';
import type {
  CatsCoreState,
  CoreArtifactKind,
  CoreArtifactRecord,
  CoreArtifactStatus,
  CoreConversationRecord,
  EvidenceEvent,
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
import {
  readCodePlanFromTask,
  type CodePlanState,
} from '../state/planSteps.js';
import {
  readCodeWorkspaceSummaryFromTask,
  type CodeWorkspaceSummary,
} from '../shared/workspaceSummary.js';
import {
  CODE_API_ARTIFACT_DETAIL_PATH_TEMPLATE,
  CODE_API_ARTIFACTS_PATH,
  CODE_API_BUILDS_PATH,
  CODE_API_CODESPACE_DETAIL_PATH_TEMPLATE,
  CODE_API_CODESPACES_PATH,
  CODE_API_PREFIX,
  CODE_API_PREVIEWS_PATH,
  CODE_API_TASK_DETAIL_PATH_TEMPLATE,
  CODE_API_TASKS_PATH,
} from '../shared/apiPaths.js';
import {
  CODE_PRODUCT_NAME,
  createActiveCodeProductRef,
  createCodeProductRef,
} from '../shared/productMetadata.js';

const CODE_DASHBOARD_TASK_LIMIT = 16;
const CODE_DASHBOARD_WORK_ITEM_LIMIT = 16;
const CODE_DASHBOARD_ARTIFACT_LIMIT = 18;
const CODE_TIMELINE_PREVIEW_LIMIT = 12;
const CODE_DETAIL_ARTIFACT_LIMIT = 12;
const CODE_WORKSPACE_LIST_LIMIT = 48;

export interface CodeDashboardSummary {
  ownerActorId: string;
  actorCount: number;
  conversationCount: number;
  workItemCount: number;
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

export interface CodeWorkItemListItem {
  id: string;
  title: string;
  status: CoreWorkItemStatus;
  summary: string | null;
  targetProduct: 'code';
  conversationId: string | null;
  conversationTitle: string | null;
  conversationSourceChannelId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  ownerActorId: string;
  ownerName: string;
  assignedActors: Array<{
    actorId: string;
    displayName: string;
  }>;
  updatedAt: string;
}

export interface CodeWorkItemListSummary {
  totalAvailable: number;
  returned: number;
  draftCount: number;
  readyCount: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
  linkedTaskCount: number;
}

export type CodeArtifactProjectionDisposition = 'candidate' | 'record';

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
  runId: string | null;
  conversationId: string | null;
  workspacePath: string | null;
  producerLabel: string | null;
  disposition: CodeArtifactProjectionDisposition | null;
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
    name: typeof CODE_PRODUCT_NAME;
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
  workspace: CodeWorkspaceSummary | null;
  inspection: CoreTaskInspectionView;
  supervision: SupervisedRunInspectionProjection | null;
  controlPlane: CoreTaskControlPlaneView;
  recovery: CoreTaskRecoveryView;
  timeline: {
    summary: CoreTaskTimelineQuerySummary;
    view: CoreTaskTimelineView;
  };
  plan: CodePlanState | null;
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
    name: typeof CODE_PRODUCT_NAME;
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

export interface CodeWorkItemListProjection {
  workItems: CodeWorkItemListItem[];
  summary: CodeWorkItemListSummary;
}

export interface CodeArtifactListProjection {
  filter: 'all' | 'build' | 'preview';
  artifacts: CodeArtifactListItem[];
  summary: CodeArtifactListSummary;
}

export type CodeWorkspaceListItemStatus = 'active' | 'ready' | 'draft' | 'archived';
export type CodeWorkspaceListItemSource =
  | 'task_workspace'
  | 'conversation_repo'
  | 'runtime_cwd'
  | 'artifact_anchor';

export interface CodeWorkspaceListItem {
  id: string;
  title: string;
  summary: string | null;
  path: string;
  status: CodeWorkspaceListItemStatus;
  source: CodeWorkspaceListItemSource;
  conversationCount: number;
  taskCount: number;
  artifactCount: number;
  lastActiveAt: string;
}

export interface CodeWorkspaceListSummary {
  totalAvailable: number;
  returned: number;
  activeCount: number;
  taskBackedCount: number;
  artifactBackedCount: number;
}

export interface CodeWorkspaceConversationItem {
  id: string;
  title: string;
  kind: CoreConversationRecord['kind'];
  status: CoreConversationRecord['status'];
  repoPath: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface CodeWorkspaceListProjection {
  workspaces: CodeWorkspaceListItem[];
  summary: CodeWorkspaceListSummary;
}

export interface CodeWorkspaceDetailProjection {
  workspace: CodeWorkspaceListItem;
  conversations: CodeWorkspaceConversationItem[];
  tasks: CodeTaskListItem[];
  artifacts: CodeArtifactListItem[];
}

export interface CodeDashboardProjection {
  product: {
    id: 'code';
    name: typeof CODE_PRODUCT_NAME;
    status: 'active';
    routeBase: '/code';
    apiBase: typeof CODE_API_PREFIX;
  };
  summary: CodeDashboardSummary;
  sections: {
    workItems: CodeDashboardSection<CodeWorkItemListItem, CodeWorkItemListSummary>;
    tasks: CodeDashboardSection<CodeTaskListItem, CodeTaskListSummary>;
    artifacts: CodeDashboardSection<CodeArtifactListItem, CodeArtifactListSummary>;
  };
  selection: {
    defaultWorkItemId: string | null;
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

function resolveCodeActorName(core: CatsCoreState, actorId: string | null | undefined): string {
  if (!actorId) {
    return 'Unknown owner';
  }

  if (actorId === core.ownerProfile.actorId) {
    return core.ownerProfile.displayName;
  }

  return core.actors.find((actor) => actor.id === actorId)?.name ?? actorId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeWorkspacePathForComparison(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function createCodeWorkspaceId(workspacePath: string): string {
  const digest = createHash('sha256')
    .update(normalizeWorkspacePathForComparison(workspacePath))
    .digest('hex')
    .slice(0, 16);
  return `codespace-${digest}`;
}

function workspacePathMatches(left: string, right: string): boolean {
  return normalizeWorkspacePathForComparison(left) === normalizeWorkspacePathForComparison(right);
}

function deriveWorkspaceTitle(workspacePath: string): string {
  const normalized = normalizeWorkspacePathForComparison(workspacePath);
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}

function readArtifactDeclarationWorkspacePath(artifact: CoreArtifactRecord): string | null {
  const declaration = asRecord(artifact.metadata.codeArtifactDeclaration);
  const anchors = asRecord(declaration?.anchors);
  return readNonEmptyString(anchors?.workspacePath);
}

function readArtifactDeclarationProducerLabel(artifact: CoreArtifactRecord): string | null {
  const declaration = asRecord(artifact.metadata.codeArtifactDeclaration);
  return readNonEmptyString(declaration?.producerLabel);
}

function readArtifactDeclarationDisposition(
  artifact: CoreArtifactRecord,
): CodeArtifactProjectionDisposition | null {
  const declaration = asRecord(artifact.metadata.codeArtifactDeclaration);
  const disposition = declaration?.disposition;
  return disposition === 'candidate' || disposition === 'record' ? disposition : null;
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

function readWorkItemProductIntentTargetProduct(
  workItem: CoreWorkItemRecord,
): 'work' | 'code' | null {
  const productIntentIntake = asRecord(workItem.metadata.productIntentIntake);
  if (
    productIntentIntake?.targetProduct === 'work'
    || productIntentIntake?.targetProduct === 'code'
  ) {
    return productIntentIntake.targetProduct;
  }

  const intake = asRecord(workItem.metadata.directSlashModeIntake);
  return intake?.targetProduct === 'work' || intake?.targetProduct === 'code'
    ? intake.targetProduct
    : null;
}

function readWorkItemPlanningProductHint(
  workItem: CoreWorkItemRecord,
): 'chat' | 'work' | 'code' | null {
  const planning = asRecord(workItem.metadata.planning);
  return planning?.productHint === 'chat'
    || planning?.productHint === 'work'
    || planning?.productHint === 'code'
    ? planning.productHint
    : null;
}

function isCodeWorkItem(core: CatsCoreState, workItem: CoreWorkItemRecord): boolean {
  if (readWorkItemProductIntentTargetProduct(workItem) === 'code') {
    return true;
  }

  if (readWorkItemPlanningProductHint(workItem) === 'code') {
    return true;
  }

  const linkedTask = workItem.taskId
    ? core.tasks.find((task) => task.id === workItem.taskId) ?? null
    : null;
  if (linkedTask && isCodeTask(core, linkedTask)) {
    return true;
  }

  return core.artifacts.some((artifact) =>
    artifact.workItemId === workItem.id
    && (artifact.kind === 'build' || artifact.kind === 'preview'));
}

function listCodeWorkItems(core: CatsCoreState): CoreWorkItemRecord[] {
  return [...core.workItems]
    .filter((workItem) => isCodeWorkItem(core, workItem))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function buildCodeWorkItemListItem(
  core: CatsCoreState,
  workItem: CoreWorkItemRecord,
): CodeWorkItemListItem {
  const conversation = resolveConversation(core, workItem.conversationId);
  const linkedTask = workItem.taskId
    ? core.tasks.find((task) => task.id === workItem.taskId) ?? null
    : null;

  return {
    id: workItem.id,
    title: workItem.title,
    status: workItem.status,
    summary: workItem.summary,
    targetProduct: 'code',
    conversationId: workItem.conversationId,
    conversationTitle: resolveConversationTitle(conversation),
    conversationSourceChannelId: conversation?.sourceChannelId ?? null,
    taskId: workItem.taskId,
    taskTitle: linkedTask?.title ?? null,
    ownerActorId: workItem.ownerActorId,
    ownerName: resolveCodeActorName(core, workItem.ownerActorId),
    assignedActors: workItem.assignedActorIds.map((actorId) => ({
      actorId,
      displayName: resolveCodeActorName(core, actorId),
    })),
    updatedAt: workItem.updatedAt,
  };
}

function buildCodeWorkItemListSummary(
  allWorkItems: CoreWorkItemRecord[],
  returnedWorkItems: CodeWorkItemListItem[],
): CodeWorkItemListSummary {
  return allWorkItems.reduce<CodeWorkItemListSummary>((summary, workItem) => {
    if (workItem.status === 'draft') {
      summary.draftCount += 1;
    }
    if (workItem.status === 'ready') {
      summary.readyCount += 1;
    }
    if (workItem.status === 'in_progress') {
      summary.inProgressCount += 1;
    }
    if (workItem.status === 'blocked') {
      summary.blockedCount += 1;
    }
    if (workItem.status === 'completed') {
      summary.completedCount += 1;
    }
    if (workItem.taskId) {
      summary.linkedTaskCount += 1;
    }
    return summary;
  }, {
    totalAvailable: allWorkItems.length,
    returned: returnedWorkItems.length,
    draftCount: 0,
    readyCount: 0,
    inProgressCount: 0,
    blockedCount: 0,
    completedCount: 0,
    linkedTaskCount: 0,
  });
}

function listCodeArtifacts(
  core: CatsCoreState,
  codeTasks: CoreTaskRecord[],
  filter: 'all' | 'build' | 'preview' = 'all',
  options: { includeWorkspaceAnchored?: boolean } = {},
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
      || (artifact.workItemId ? allCodeWorkItemIds.has(artifact.workItemId) : false)
      || (options.includeWorkspaceAnchored === true
        ? readArtifactDeclarationWorkspacePath(artifact) !== null
        : false))
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
    runId: artifact.runId,
    conversationId: artifact.conversationId,
    workspacePath: resolveArtifactWorkspacePath(core, artifact),
    producerLabel: readArtifactDeclarationProducerLabel(artifact),
    disposition: readArtifactDeclarationDisposition(artifact),
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

function selectDefaultCodeArtifactId(artifacts: readonly CodeArtifactListItem[]): string | null {
  const latestReadyArtifact = artifacts
    .filter((artifact) => artifact.status === 'ready')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;

  return latestReadyArtifact?.id ?? artifacts[0]?.id ?? null;
}

interface CodeWorkspaceAccumulator {
  path: string;
  source: CodeWorkspaceListItemSource;
  conversationIds: Set<string>;
  taskIds: Set<string>;
  artifactIds: Set<string>;
  taskStatuses: Set<CoreTaskStatus>;
  conversationStatuses: Set<CoreConversationRecord['status']>;
  lastActiveAt: string;
}

const WORKSPACE_SOURCE_PRIORITY: Record<CodeWorkspaceListItemSource, number> = {
  task_workspace: 40,
  conversation_repo: 30,
  runtime_cwd: 20,
  artifact_anchor: 10,
};

function upsertWorkspaceAccumulator(
  accumulators: Map<string, CodeWorkspaceAccumulator>,
  workspacePath: string,
  source: CodeWorkspaceListItemSource,
  updatedAt: string,
): CodeWorkspaceAccumulator {
  const normalizedPath = normalizeWorkspacePathForComparison(workspacePath);
  const existing = accumulators.get(normalizedPath);
  if (existing) {
    if (WORKSPACE_SOURCE_PRIORITY[source] > WORKSPACE_SOURCE_PRIORITY[existing.source]) {
      existing.source = source;
    }
    if (updatedAt.localeCompare(existing.lastActiveAt) > 0) {
      existing.lastActiveAt = updatedAt;
    }
    return existing;
  }

  const accumulator: CodeWorkspaceAccumulator = {
    path: workspacePath.trim(),
    source,
    conversationIds: new Set<string>(),
    taskIds: new Set<string>(),
    artifactIds: new Set<string>(),
    taskStatuses: new Set<CoreTaskStatus>(),
    conversationStatuses: new Set<CoreConversationRecord['status']>(),
    lastActiveAt: updatedAt,
  };
  accumulators.set(normalizedPath, accumulator);
  return accumulator;
}

function resolveArtifactWorkspacePath(
  core: CatsCoreState,
  artifact: CoreArtifactRecord,
): string | null {
  const declaredWorkspace = readArtifactDeclarationWorkspacePath(artifact);
  if (declaredWorkspace) {
    return declaredWorkspace;
  }

  const task = artifact.taskId
    ? core.tasks.find((candidate) => candidate.id === artifact.taskId) ?? null
    : null;
  const taskWorkspace = task ? readCodeWorkspaceSummaryFromTask(task)?.workspacePath ?? null : null;
  if (taskWorkspace) {
    return taskWorkspace;
  }

  const conversation = resolveConversation(core, artifact.conversationId);
  return conversation?.repoPath ?? null;
}

function resolveWorkspaceStatus(
  accumulator: CodeWorkspaceAccumulator,
): CodeWorkspaceListItemStatus {
  if ([...accumulator.taskStatuses].some((status) =>
    status === 'in_progress' || status === 'approved' || status === 'pending_approval')) {
    return 'active';
  }

  if (accumulator.taskStatuses.has('draft')) {
    return 'draft';
  }

  const hasTrackedRecords =
    accumulator.conversationIds.size > 0
    || accumulator.taskIds.size > 0
    || accumulator.artifactIds.size > 0;
  const allTasksTerminal =
    accumulator.taskStatuses.size === 0
    || [...accumulator.taskStatuses].every((status) =>
      status === 'completed' || status === 'cancelled' || status === 'archived');
  const allConversationsArchived =
    accumulator.conversationStatuses.size === 0
    || [...accumulator.conversationStatuses].every((status) => status === 'archived');

  return hasTrackedRecords && allTasksTerminal && allConversationsArchived
    ? 'archived'
    : 'ready';
}

function buildCodeWorkspaceListItem(
  accumulator: CodeWorkspaceAccumulator,
): CodeWorkspaceListItem {
  return {
    id: createCodeWorkspaceId(accumulator.path),
    title: deriveWorkspaceTitle(accumulator.path),
    summary: null,
    path: accumulator.path,
    status: resolveWorkspaceStatus(accumulator),
    source: accumulator.source,
    conversationCount: accumulator.conversationIds.size,
    taskCount: accumulator.taskIds.size,
    artifactCount: accumulator.artifactIds.size,
    lastActiveAt: accumulator.lastActiveAt,
  };
}

function buildCodeWorkspaceListSummary(
  allWorkspaces: readonly CodeWorkspaceListItem[],
  returnedWorkspaces: readonly CodeWorkspaceListItem[],
): CodeWorkspaceListSummary {
  return allWorkspaces.reduce<CodeWorkspaceListSummary>((summary, workspace) => {
    if (workspace.status === 'active') {
      summary.activeCount += 1;
    }
    if (workspace.taskCount > 0) {
      summary.taskBackedCount += 1;
    }
    if (workspace.artifactCount > 0) {
      summary.artifactBackedCount += 1;
    }
    return summary;
  }, {
    totalAvailable: allWorkspaces.length,
    returned: returnedWorkspaces.length,
    activeCount: 0,
    taskBackedCount: 0,
    artifactBackedCount: 0,
  });
}

function buildCodeWorkspaceConversationItem(
  conversation: CoreConversationRecord,
): CodeWorkspaceConversationItem {
  return {
    id: conversation.id,
    title: conversation.title,
    kind: conversation.kind,
    status: conversation.status,
    repoPath: conversation.repoPath,
    updatedAt: conversation.updatedAt,
    lastMessageAt: conversation.lastMessageAt,
  };
}

function buildCodeWorkspaceItems(core: CatsCoreState): CodeWorkspaceListItem[] {
  const codeTasks = listCodeTasks(core);
  const codeConversationIds = new Set(
    codeTasks.map((task) => task.conversationId).filter((id): id is string => !!id),
  );
  const accumulators = new Map<string, CodeWorkspaceAccumulator>();

  for (const task of codeTasks) {
    const workspace = readCodeWorkspaceSummaryFromTask(task);
    if (!workspace) {
      continue;
    }
    const accumulator = upsertWorkspaceAccumulator(
      accumulators,
      workspace.workspacePath,
      'task_workspace',
      task.updatedAt,
    );
    accumulator.taskIds.add(task.id);
    accumulator.taskStatuses.add(task.status);
    if (task.conversationId) {
      accumulator.conversationIds.add(task.conversationId);
    }
  }

  for (const conversation of core.conversations) {
    if (!conversation.repoPath) {
      continue;
    }
    if (conversation.kind !== 'code_thread' && !codeConversationIds.has(conversation.id)) {
      continue;
    }
    const accumulator = upsertWorkspaceAccumulator(
      accumulators,
      conversation.repoPath,
      'conversation_repo',
      conversation.lastMessageAt ?? conversation.updatedAt,
    );
    accumulator.conversationIds.add(conversation.id);
    accumulator.conversationStatuses.add(conversation.status);
  }

  for (const session of core.sessions) {
    const leaseCwd = readNonEmptyString(session.metadata.leaseCwd);
    if (!leaseCwd || !session.conversationId || !codeConversationIds.has(session.conversationId)) {
      continue;
    }
    const accumulator = upsertWorkspaceAccumulator(
      accumulators,
      leaseCwd,
      'runtime_cwd',
      session.updatedAt,
    );
    accumulator.conversationIds.add(session.conversationId);
  }

  for (const artifact of listCodeArtifacts(core, codeTasks, 'all', {
    includeWorkspaceAnchored: true,
  })) {
    const workspacePath = resolveArtifactWorkspacePath(core, artifact);
    if (!workspacePath) {
      continue;
    }
    const accumulator = upsertWorkspaceAccumulator(
      accumulators,
      workspacePath,
      'artifact_anchor',
      artifact.updatedAt,
    );
    accumulator.artifactIds.add(artifact.id);
  }

  return [...accumulators.values()]
    .map((accumulator) => buildCodeWorkspaceListItem(accumulator))
    .sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt));
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

export function buildCodeWorkItemListProjection(core: CatsCoreState): CodeWorkItemListProjection {
  const allWorkItems = listCodeWorkItems(core);
  const workItems = allWorkItems
    .slice(0, CODE_DASHBOARD_WORK_ITEM_LIMIT)
    .map((workItem) => buildCodeWorkItemListItem(core, workItem));

  return {
    workItems,
    summary: buildCodeWorkItemListSummary(allWorkItems, workItems),
  };
}

export function buildCodeWorkspaceListProjection(core: CatsCoreState): CodeWorkspaceListProjection {
  const allWorkspaces = buildCodeWorkspaceItems(core);
  const workspaces = allWorkspaces.slice(0, CODE_WORKSPACE_LIST_LIMIT);

  return {
    workspaces,
    summary: buildCodeWorkspaceListSummary(allWorkspaces, workspaces),
  };
}

export function buildCodeWorkspaceDetailProjection(
  core: CatsCoreState,
  workspaceId: string,
): CodeWorkspaceDetailProjection | null {
  const workspace = buildCodeWorkspaceItems(core)
    .find((candidate) => candidate.id === workspaceId) ?? null;
  if (!workspace) {
    return null;
  }

  const codeTasks = listCodeTasks(core);
  const codeConversationIds = new Set(
    codeTasks.map((task) => task.conversationId).filter((id): id is string => !!id),
  );
  const tasks = codeTasks
    .filter((task) => {
      const summary = readCodeWorkspaceSummaryFromTask(task);
      return summary ? workspacePathMatches(summary.workspacePath, workspace.path) : false;
    })
    .map((task) => buildCodeTaskListItem(core, task));
  const taskItemById = new Map(tasks.map((task) => [task.id, task]));

  const conversations = core.conversations
    .filter((conversation) =>
      conversation.repoPath
      && (conversation.kind === 'code_thread' || codeConversationIds.has(conversation.id))
        ? workspacePathMatches(conversation.repoPath, workspace.path)
        : false)
    .sort((left, right) =>
      (right.lastMessageAt ?? right.updatedAt).localeCompare(left.lastMessageAt ?? left.updatedAt))
    .map((conversation) => buildCodeWorkspaceConversationItem(conversation));

  const artifacts = listCodeArtifacts(core, codeTasks, 'all', {
    includeWorkspaceAnchored: true,
  })
    .filter((artifact) => {
      const workspacePath = resolveArtifactWorkspacePath(core, artifact);
      return workspacePath ? workspacePathMatches(workspacePath, workspace.path) : false;
    })
    .map((artifact) => buildCodeArtifactListItem(core, artifact, taskItemById));

  return {
    workspace,
    conversations,
    tasks,
    artifacts,
  };
}

export function buildCodeArtifactListProjection(
  core: CatsCoreState,
  filter: 'all' | 'build' | 'preview' = 'all',
): CodeArtifactListProjection {
  const allTasks = listCodeTasks(core);
  const taskItems = allTasks.map((task) => buildCodeTaskListItem(core, task));
  const taskItemById = new Map(taskItems.map((task) => [task.id, task]));
  const allArtifacts = listCodeArtifacts(core, allTasks, filter, {
    includeWorkspaceAnchored: true,
  });
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
  evidenceEvents: EvidenceEvent[] = [],
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
  const inspection = buildCoreTaskInspectionView(core, task);

  return {
    product: createCodeProductRef(),
    task,
    conversation,
    workItem: buildWorkItemReference(core, workItem),
    effectiveStrategy: resolveEffectiveTaskStrategy('code', readTaskPlanningMetadataFromTask(task)),
    workspace: readCodeWorkspaceSummaryFromTask(task),
    plan: readCodePlanFromTask(task),
    inspection,
    supervision: inspection.latestRun
      ? buildSupervisedRunInspectionProjection(core, inspection.latestRun.id, evidenceEvents)
      : null,
    controlPlane: buildCoreTaskControlPlaneView(core, task),
    recovery: buildCoreTaskRecoveryView(core, task),
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
  const relatedArtifacts = listCodeArtifacts(core, codeTasks, 'all', {
    includeWorkspaceAnchored: true,
  })
    .filter((candidate) =>
      candidate.id !== artifact.id
      && (
        (artifact.taskId && candidate.taskId === artifact.taskId)
        || (artifact.workItemId && candidate.workItemId === artifact.workItemId)
      ))
    .slice(0, CODE_DETAIL_ARTIFACT_LIMIT)
    .map((candidate) => buildCodeArtifactListItem(core, candidate, taskItemById));

  return {
    product: createCodeProductRef(),
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
  const workItemList = buildCodeWorkItemListProjection(core);
  const artifactList = buildCodeArtifactListProjection(core);

  return {
    product: createActiveCodeProductRef(),
    summary: {
      ownerActorId: core.ownerProfile.actorId,
      actorCount: core.actors.length,
      conversationCount: core.conversations.length,
      workItemCount: workItemList.summary.totalAvailable,
      taskCount: taskList.summary.totalAvailable,
      artifactCount: artifactList.summary.totalAvailable,
      buildCount: artifactList.summary.buildCount,
      previewCount: artifactList.summary.previewCount,
      inProgressTaskCount: taskList.summary.inProgressCount,
      readyArtifactCount: artifactList.summary.readyCount,
    },
    sections: {
      workItems: {
        title: 'Code Work Items',
        emptyState: 'No code-targeted Work Items have been created yet.',
        items: workItemList.workItems,
        summary: workItemList.summary,
      },
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
      defaultWorkItemId: workItemList.workItems[0]?.id ?? null,
      defaultTaskId: taskList.tasks[0]?.id ?? null,
      defaultArtifactId: selectDefaultCodeArtifactId(artifactList.artifacts),
    },
    extensionPoints: {
      projectionSource: 'cats-core',
      futureRoutes: [
        CODE_API_TASKS_PATH,
        CODE_API_TASK_DETAIL_PATH_TEMPLATE,
        CODE_API_CODESPACES_PATH,
        CODE_API_CODESPACE_DETAIL_PATH_TEMPLATE,
        CODE_API_ARTIFACTS_PATH,
        CODE_API_ARTIFACT_DETAIL_PATH_TEMPLATE,
        CODE_API_BUILDS_PATH,
        CODE_API_PREVIEWS_PATH,
      ],
    },
  };
}
