import { expectJson } from './http.js';
import {
  buildWorkApiProjectPath,
  buildWorkApiTaskPath,
  buildWorkApiWorkItemPath,
  WORK_API_PROJECTS_PATH,
  WORK_API_RAW_PROJECTS_PATH,
  WORK_API_RAW_TASKS_PATH,
  WORK_API_RAW_WORK_ITEMS_PATH,
  WORK_API_TASKS_PATH,
  WORK_API_WORK_ITEMS_PATH,
} from '../../shared/apiPaths.js';
import type {
  CoreProjectRecord,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
} from '../../../../core/types.js';

export type {
  CoreProjectRecord,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
};

export interface CreateProjectInput {
  id?: string;
  title: string;
  status?: CoreProjectStatus;
  ownerActorId?: string;
  summary?: string | null;
  repoPath?: string | null;
  primaryConversationId?: string | null;
}

export interface CreateWorkItemInput {
  id?: string;
  title: string;
  status?: CoreWorkItemStatus;
  ownerActorId?: string;
  projectId?: string | null;
  conversationId?: string | null;
  taskId?: string | null;
  parentWorkItemId?: string | null;
  summary?: string | null;
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  status?: CoreTaskStatus;
  ownerActorId?: string;
  conversationId?: string | null;
  parentTaskId?: string | null;
  summary?: string | null;
}

export async function listWorkProjects(signal?: AbortSignal): Promise<CoreProjectRecord[]> {
  const response = await fetch(WORK_API_RAW_PROJECTS_PATH, { signal });
  const payload = await expectJson<{ projects: CoreProjectRecord[] }>(
    response,
    'Failed to list projects',
  );
  return payload.projects;
}

export async function createWorkProject(
  input: CreateProjectInput,
  signal?: AbortSignal,
): Promise<{ project: CoreProjectRecord; created: boolean }> {
  const response = await fetch(WORK_API_PROJECTS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<{ project: CoreProjectRecord; created: boolean }>(
    response,
    'Failed to create project',
  );
}

export async function removeWorkProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean; projectId: string }> {
  const response = await fetch(buildWorkApiProjectPath(projectId), {
    method: 'DELETE',
    signal,
  });
  return expectJson<{ removed: boolean; projectId: string }>(
    response,
    'Failed to remove project',
  );
}

export async function listWorkItems(signal?: AbortSignal): Promise<CoreWorkItemRecord[]> {
  const response = await fetch(WORK_API_RAW_WORK_ITEMS_PATH, { signal });
  const payload = await expectJson<{ workItems: CoreWorkItemRecord[] }>(
    response,
    'Failed to list work items',
  );
  return payload.workItems;
}

export async function createWorkItem(
  input: CreateWorkItemInput,
  signal?: AbortSignal,
): Promise<{ workItem: CoreWorkItemRecord; created: boolean }> {
  const response = await fetch(WORK_API_WORK_ITEMS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<{ workItem: CoreWorkItemRecord; created: boolean }>(
    response,
    'Failed to create work item',
  );
}

export async function removeWorkItem(
  workItemId: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean; workItemId: string }> {
  const response = await fetch(buildWorkApiWorkItemPath(workItemId), {
    method: 'DELETE',
    signal,
  });
  return expectJson<{ removed: boolean; workItemId: string }>(
    response,
    'Failed to remove work item',
  );
}

export async function listWorkTasks(signal?: AbortSignal): Promise<CoreTaskRecord[]> {
  const response = await fetch(WORK_API_RAW_TASKS_PATH, { signal });
  const payload = await expectJson<{ tasks: CoreTaskRecord[] }>(
    response,
    'Failed to list tasks',
  );
  return payload.tasks;
}

export async function createWorkTask(
  input: CreateTaskInput,
  signal?: AbortSignal,
): Promise<{ task: CoreTaskRecord; created: boolean }> {
  const response = await fetch(WORK_API_TASKS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<{ task: CoreTaskRecord; created: boolean }>(
    response,
    'Failed to create task',
  );
}

export async function removeWorkTask(
  taskId: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean; taskId: string }> {
  const response = await fetch(buildWorkApiTaskPath(taskId), {
    method: 'DELETE',
    signal,
  });
  return expectJson<{ removed: boolean; taskId: string }>(
    response,
    'Failed to remove task',
  );
}
