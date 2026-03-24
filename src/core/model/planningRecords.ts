import { randomUUID } from 'node:crypto';

import { CoreValidationError } from '../errors.js';
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
