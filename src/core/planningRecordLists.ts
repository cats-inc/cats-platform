import type {
  CatsCoreState,
  CoreArtifactKind,
  CoreArtifactRecord,
  CoreArtifactStatus,
  CoreProjectRecord,
  CoreProjectStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
} from './types.js';

export interface CoreProjectListQuery {
  statuses?: CoreProjectStatus[];
  ownerActorIds?: string[];
  primaryConversationIds?: string[];
  repoPaths?: string[];
  limit?: number;
}

export interface CoreWorkItemListQuery {
  statuses?: CoreWorkItemStatus[];
  projectIds?: string[];
  conversationIds?: string[];
  taskIds?: string[];
  parentWorkItemIds?: string[];
  ownerActorIds?: string[];
  assignedActorIds?: string[];
  limit?: number;
}

export interface CoreArtifactListQuery {
  kinds?: CoreArtifactKind[];
  statuses?: CoreArtifactStatus[];
  projectIds?: string[];
  workItemIds?: string[];
  conversationIds?: string[];
  taskIds?: string[];
  runIds?: string[];
  mimeTypes?: string[];
  limit?: number;
}

function compareByUpdatedAt(
  left: { updatedAt: string; id: string },
  right: { updatedAt: string; id: string },
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return left.id.localeCompare(right.id);
}

function matchesProjectQuery(
  project: CoreProjectRecord,
  query: CoreProjectListQuery,
): boolean {
  if (
    query.statuses
    && !query.statuses.includes(project.status)
  ) {
    return false;
  }
  if (
    query.ownerActorIds
    && !query.ownerActorIds.includes(project.ownerActorId)
  ) {
    return false;
  }
  if (
    query.primaryConversationIds
    && !query.primaryConversationIds.includes(project.primaryConversationId ?? '')
  ) {
    return false;
  }
  if (
    query.repoPaths
    && !query.repoPaths.includes(project.repoPath ?? '')
  ) {
    return false;
  }
  return true;
}

function matchesWorkItemQuery(
  workItem: CoreWorkItemRecord,
  query: CoreWorkItemListQuery,
): boolean {
  if (
    query.statuses
    && !query.statuses.includes(workItem.status)
  ) {
    return false;
  }
  if (
    query.projectIds
    && !query.projectIds.includes(workItem.projectId ?? '')
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(workItem.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.taskIds
    && !query.taskIds.includes(workItem.taskId ?? '')
  ) {
    return false;
  }
  if (
    query.parentWorkItemIds
    && !query.parentWorkItemIds.includes(workItem.parentWorkItemId ?? '')
  ) {
    return false;
  }
  if (
    query.ownerActorIds
    && !query.ownerActorIds.includes(workItem.ownerActorId)
  ) {
    return false;
  }
  if (
    query.assignedActorIds
    && !workItem.assignedActorIds.some((actorId) => query.assignedActorIds?.includes(actorId))
  ) {
    return false;
  }
  return true;
}

function matchesArtifactQuery(
  artifact: CoreArtifactRecord,
  query: CoreArtifactListQuery,
): boolean {
  if (
    query.kinds
    && !query.kinds.includes(artifact.kind)
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(artifact.status)
  ) {
    return false;
  }
  if (
    query.projectIds
    && !query.projectIds.includes(artifact.projectId ?? '')
  ) {
    return false;
  }
  if (
    query.workItemIds
    && !query.workItemIds.includes(artifact.workItemId ?? '')
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(artifact.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.taskIds
    && !query.taskIds.includes(artifact.taskId ?? '')
  ) {
    return false;
  }
  if (
    query.runIds
    && !query.runIds.includes(artifact.runId ?? '')
  ) {
    return false;
  }
  if (
    query.mimeTypes
    && !query.mimeTypes.includes(artifact.mimeType ?? '')
  ) {
    return false;
  }
  return true;
}

export function listProjects(
  core: CatsCoreState,
  query: CoreProjectListQuery = {},
): CoreProjectRecord[] {
  return core.projects
    .filter((project) => matchesProjectQuery(project, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}

export function listWorkItems(
  core: CatsCoreState,
  query: CoreWorkItemListQuery = {},
): CoreWorkItemRecord[] {
  return core.workItems
    .filter((workItem) => matchesWorkItemQuery(workItem, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}

export function listArtifacts(
  core: CatsCoreState,
  query: CoreArtifactListQuery = {},
): CoreArtifactRecord[] {
  return core.artifacts
    .filter((artifact) => matchesArtifactQuery(artifact, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
