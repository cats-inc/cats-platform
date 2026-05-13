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
  CoreApprovalDecisionAction,
  CoreApprovalRecord,
  CoreProjectRecord,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
} from '../../../../core/types.js';
import type { CoreTaskActionEnvelope } from '../../../../core/taskActionEnvelopes.js';
import type { WorkSupervisedRunLaunchProjection } from '../../api/projection.js';

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
  metadata?: Record<string, unknown>;
  workItemId?: string | null;
}

export interface DecideWorkTaskApprovalInput {
  action: Extract<CoreApprovalDecisionAction, 'approve' | 'reject'>;
  decidedByActorId?: string | null;
  notes?: string | null;
}

export interface WorkTaskApprovalDecisionResponse {
  task: CoreTaskRecord;
  approval: CoreApprovalRecord;
}

export async function listWorkProjects(
  errorMessage: string,
  signal?: AbortSignal,
): Promise<CoreProjectRecord[]> {
  const response = await fetch(WORK_API_RAW_PROJECTS_PATH, { signal });
  const payload = await expectJson<{ projects: CoreProjectRecord[] }>(
    response,
    errorMessage,
  );
  return payload.projects;
}

export async function createWorkProject(
  input: CreateProjectInput,
  errorMessage: string,
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
    errorMessage,
  );
}

export async function removeWorkProject(
  projectId: string,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean; projectId: string }> {
  const response = await fetch(buildWorkApiProjectPath(projectId), {
    method: 'DELETE',
    signal,
  });
  return expectJson<{ removed: boolean; projectId: string }>(
    response,
    errorMessage,
  );
}

export async function listWorkItems(
  errorMessage: string,
  signal?: AbortSignal,
): Promise<CoreWorkItemRecord[]> {
  const response = await fetch(WORK_API_RAW_WORK_ITEMS_PATH, { signal });
  const payload = await expectJson<{ workItems: CoreWorkItemRecord[] }>(
    response,
    errorMessage,
  );
  return payload.workItems;
}

export async function createWorkItem(
  input: CreateWorkItemInput,
  errorMessage: string,
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
    errorMessage,
  );
}

export async function removeWorkItem(
  workItemId: string,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean; workItemId: string }> {
  const response = await fetch(buildWorkApiWorkItemPath(workItemId), {
    method: 'DELETE',
    signal,
  });
  return expectJson<{ removed: boolean; workItemId: string }>(
    response,
    errorMessage,
  );
}

export async function listWorkTasks(
  errorMessage: string,
  signal?: AbortSignal,
): Promise<CoreTaskRecord[]> {
  const response = await fetch(WORK_API_RAW_TASKS_PATH, { signal });
  const payload = await expectJson<{ tasks: CoreTaskRecord[] }>(
    response,
    errorMessage,
  );
  return payload.tasks;
}

export async function createWorkTask(
  input: CreateTaskInput,
  errorMessage: string,
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
    errorMessage,
  );
}

export async function removeWorkTask(
  taskId: string,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean; taskId: string }> {
  const response = await fetch(buildWorkApiTaskPath(taskId), {
    method: 'DELETE',
    signal,
  });
  return expectJson<{ removed: boolean; taskId: string }>(
    response,
    errorMessage,
  );
}

export async function decideWorkTaskApproval(
  taskId: string,
  input: DecideWorkTaskApprovalInput,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<WorkTaskApprovalDecisionResponse> {
  const response = await fetch('/api/core/approvals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      taskId,
      status: input.action === 'approve' ? 'approved' : 'rejected',
      action: input.action,
      decidedByActorId: input.decidedByActorId ?? null,
      notes: input.notes ?? null,
      taskStatus: input.action === 'approve' ? 'approved' : 'cancelled',
    }),
    signal,
  });
  return expectJson<WorkTaskApprovalDecisionResponse>(response, errorMessage);
}

export async function startWorkTaskSupervisedRun(
  taskId: string,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<WorkSupervisedRunLaunchProjection> {
  const response = await fetch(`${buildWorkApiTaskPath(taskId)}/supervised-run`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });
  return expectJson<WorkSupervisedRunLaunchProjection>(response, errorMessage);
}

export async function performWorkTaskActionEnvelope(
  action: CoreTaskActionEnvelope,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(action.path, {
    method: action.method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(action.body),
    signal,
  });
  return expectJson<unknown>(response, errorMessage);
}
