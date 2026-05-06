import { randomUUID } from 'node:crypto';

import {
  CoreConflictError,
  CoreNotFoundError,
  CoreValidationError,
} from '../errors.js';
import type {
  CoreArtifactWriteInput,
  CoreProjectWriteInput,
  CoreWorkItemWriteInput,
} from './inputs.js';
import {
  normalizeArtifactSizeBytes,
  normalizeMetadata,
  normalizeNullableString,
  normalizeStringArray,
  replaceById,
  touchCoreState,
} from './shared.js';
import type {
  CatsCoreState,
  CoreArtifactRecord,
  CoreProjectRecord,
  CoreWorkItemRecord,
} from '../types.js';

export function upsertCoreProject(
  core: CatsCoreState,
  input: CoreProjectWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Project title is required', 'project_title_required');
  }

  const projectId = normalizeNullableString(input.id) ?? `project-${randomUUID()}`;
  const existing = core.projects.find((project) => project.id === projectId);
  const project: CoreProjectRecord = {
    id: projectId,
    title,
    status: input.status ?? existing?.status ?? 'planned',
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existing?.ownerActorId
      ?? core.ownerProfile.actorId,
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    repoPath:
      input.repoPath === undefined
        ? existing?.repoPath ?? null
        : normalizeNullableString(input.repoPath),
    primaryConversationId:
      input.primaryConversationId === undefined
        ? existing?.primaryConversationId ?? null
        : normalizeNullableString(input.primaryConversationId),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.projects, project);

  return {
    core: touchCoreState(
      {
        ...core,
        projects: records,
      },
      nowIso,
    ),
    project,
    created,
  };
}

export function upsertCoreWorkItem(
  core: CatsCoreState,
  input: CoreWorkItemWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; workItem: CoreWorkItemRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError(
      'Work item title is required',
      'work_item_title_required',
    );
  }

  const workItemId = normalizeNullableString(input.id) ?? `work-item-${randomUUID()}`;
  const existing = core.workItems.find((workItem) => workItem.id === workItemId);
  const workItem: CoreWorkItemRecord = {
    id: workItemId,
    title,
    status: input.status ?? existing?.status ?? 'draft',
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    parentWorkItemId:
      input.parentWorkItemId === undefined
        ? existing?.parentWorkItemId ?? null
        : normalizeNullableString(input.parentWorkItemId),
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existing?.ownerActorId
      ?? core.ownerProfile.actorId,
    assignedActorIds:
      input.assignedActorIds === undefined
        ? structuredClone(existing?.assignedActorIds ?? [])
        : normalizeStringArray(input.assignedActorIds),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.workItems, workItem);

  return {
    core: touchCoreState(
      {
        ...core,
        workItems: records,
      },
      nowIso,
    ),
    workItem,
    created,
  };
}

export function linkCoreWorkItemToTask(
  core: CatsCoreState,
  input: {
    workItemId: string | null | undefined;
    taskId: string | null | undefined;
  },
  now: Date = new Date(),
): { core: CatsCoreState; workItem: CoreWorkItemRecord; linked: boolean } {
  const workItemId = normalizeNullableString(input.workItemId);
  if (!workItemId) {
    throw new CoreValidationError('Work item id is required', 'work_item_id_required');
  }

  const taskId = normalizeNullableString(input.taskId);
  if (!taskId) {
    throw new CoreValidationError('Task id is required', 'task_id_required');
  }

  const workItem = core.workItems.find((candidate) => candidate.id === workItemId) ?? null;
  if (!workItem) {
    throw new CoreNotFoundError(`No work item found for id ${workItemId}.`, 'work_item_not_found');
  }

  if (!core.tasks.some((candidate) => candidate.id === taskId)) {
    throw new CoreNotFoundError(`No task found for id ${taskId}.`, 'task_not_found');
  }

  if (workItem.taskId && workItem.taskId !== taskId) {
    throw new CoreConflictError(
      `Work item ${workItemId} is already linked to task ${workItem.taskId}.`,
      'work_item_task_conflict',
    );
  }

  if (workItem.taskId === taskId) {
    return { core, workItem, linked: false };
  }

  const result = upsertCoreWorkItem(
    core,
    {
      id: workItem.id,
      title: workItem.title,
      status: workItem.status,
      projectId: workItem.projectId,
      conversationId: workItem.conversationId,
      taskId,
      parentWorkItemId: workItem.parentWorkItemId,
      ownerActorId: workItem.ownerActorId,
      assignedActorIds: workItem.assignedActorIds,
      summary: workItem.summary,
      createdAt: workItem.createdAt,
      metadata: workItem.metadata,
    },
    now,
  );

  return {
    core: result.core,
    workItem: result.workItem,
    linked: true,
  };
}

export function upsertCoreArtifact(
  core: CatsCoreState,
  input: CoreArtifactWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; artifact: CoreArtifactRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Artifact title is required', 'artifact_title_required');
  }

  const artifactId = normalizeNullableString(input.id) ?? `artifact-${randomUUID()}`;
  const existing = core.artifacts.find((artifact) => artifact.id === artifactId);
  const artifact: CoreArtifactRecord = {
    id: artifactId,
    title,
    kind: input.kind ?? existing?.kind ?? 'document',
    status: input.status ?? existing?.status ?? 'draft',
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined
        ? existing?.workItemId ?? null
        : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    path:
      input.path === undefined
        ? existing?.path ?? null
        : normalizeNullableString(input.path),
    mimeType:
      input.mimeType === undefined
        ? existing?.mimeType ?? null
        : normalizeNullableString(input.mimeType),
    sizeBytes:
      input.sizeBytes === undefined
        ? existing?.sizeBytes ?? null
        : normalizeArtifactSizeBytes(input.sizeBytes),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.artifacts, artifact);

  return {
    core: touchCoreState(
      {
        ...core,
        artifacts: records,
      },
      nowIso,
    ),
    artifact,
    created,
  };
}

/**
 * Hard-delete a project. Work items / tasks pointing at the deleted
 * project keep their FK; the projection layer surfaces the dangling
 * reference as a missing_project_anchor diagnostic.
 */
export function removeCoreProject(
  core: CatsCoreState,
  projectId: string,
  now: Date = new Date(),
): { core: CatsCoreState; removed: boolean } {
  const nowIso = now.toISOString();
  const next = core.projects.filter((project) => project.id !== projectId);
  if (next.length === core.projects.length) {
    return { core, removed: false };
  }
  return {
    core: touchCoreState({ ...core, projects: next }, nowIso),
    removed: true,
  };
}

/**
 * Hard-delete a work item. Tasks anchored on the work item via
 * `WorkItem.taskId` remain in Core; only the work item row is removed.
 */
export function removeCoreWorkItem(
  core: CatsCoreState,
  workItemId: string,
  now: Date = new Date(),
): { core: CatsCoreState; removed: boolean } {
  const nowIso = now.toISOString();
  const next = core.workItems.filter((workItem) => workItem.id !== workItemId);
  if (next.length === core.workItems.length) {
    return { core, removed: false };
  }
  return {
    core: touchCoreState({ ...core, workItems: next }, nowIso),
    removed: true,
  };
}
