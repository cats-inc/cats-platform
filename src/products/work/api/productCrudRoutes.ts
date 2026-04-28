import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import {
  removeCoreProject,
  removeCoreTask,
  removeCoreWorkItem,
  upsertCoreProject,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../../../core/model/index.js';
import type {
  CoreProjectRecord,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
} from '../../../core/types.js';
import { handleCoreError } from '../../../core/api/shared.js';
import {
  WORK_API_GRAPH_PATH,
  WORK_API_PROJECT_DETAIL_PATTERN,
  WORK_API_PROJECTS_PATH,
  WORK_API_RAW_PROJECTS_PATH,
  WORK_API_RAW_TASKS_PATH,
  WORK_API_RAW_WORK_ITEMS_PATH,
  WORK_API_TASK_DETAIL_PATTERN,
  WORK_API_TASKS_PATH,
  WORK_API_WORK_ITEM_DETAIL_PATTERN,
  WORK_API_WORK_ITEMS_PATH,
} from '../shared/apiPaths.js';
import { buildWorkGraphProjection } from './workGraphProjection.js';
import type { WorkApiDependencies } from './index.js';

const PROJECT_STATUSES: ReadonlyArray<CoreProjectStatus> = [
  'planned',
  'active',
  'paused',
  'archived',
];

const WORK_ITEM_STATUSES: ReadonlyArray<CoreWorkItemStatus> = [
  'draft',
  'planned',
  'ready',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
  'archived',
];

const TASK_STATUSES: ReadonlyArray<CoreTaskStatus> = [
  'draft',
  'pending_approval',
  'approved',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
  'archived',
];

interface CreateProjectPayload {
  id?: string;
  title: string;
  status?: CoreProjectStatus;
  ownerActorId?: string;
  summary?: string | null;
  repoPath?: string | null;
  primaryConversationId?: string | null;
}

interface CreateWorkItemPayload {
  id?: string;
  title: string;
  status?: CoreWorkItemStatus;
  ownerActorId?: string;
  projectId?: string | null;
  conversationId?: string | null;
  taskId?: string | null;
  parentWorkItemId?: string | null;
  summary?: string | null;
  assignedActorIds?: string[];
}

interface CreateTaskPayload {
  id?: string;
  title: string;
  status?: CoreTaskStatus;
  ownerActorId?: string;
  conversationId?: string | null;
  parentTaskId?: string | null;
  summary?: string | null;
  assignedActorIds?: string[];
  metadata?: Record<string, unknown>;
}

export async function routeWorkProductCrudApi(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  // GET /api/work/graph — full WorkGraphProjection (System Map / Cockpit /
  // Broken Links / detail page consumer).
  if (context.method === 'GET' && context.url.pathname === WORK_API_GRAPH_PATH) {
    const core = await context.dependencies.coreStore.readCore();
    sendJson(context.response, 200, buildWorkGraphProjection(core));
    return true;
  }
  // GET /api/work/raw/{projects,work-items,tasks} — full record arrays
  if (context.method === 'GET') {
    if (context.url.pathname === WORK_API_RAW_PROJECTS_PATH) {
      const core = await context.dependencies.coreStore.readCore();
      sendJson(context.response, 200, { projects: core.projects });
      return true;
    }
    if (context.url.pathname === WORK_API_RAW_WORK_ITEMS_PATH) {
      const core = await context.dependencies.coreStore.readCore();
      sendJson(context.response, 200, { workItems: core.workItems });
      return true;
    }
    if (context.url.pathname === WORK_API_RAW_TASKS_PATH) {
      const core = await context.dependencies.coreStore.readCore();
      sendJson(context.response, 200, { tasks: core.tasks });
      return true;
    }
  }
  // GET on these paths with non-GET method → fall through to allow
  // POST/DELETE handlers below.

  // POST /api/work/projects
  if (context.url.pathname === WORK_API_PROJECTS_PATH && context.method === 'POST') {
    return handleCreateProject(context);
  }
  // DELETE /api/work/projects/:projectId
  const projectDeleteMatch =
    context.method === 'DELETE'
      ? matchRoute(context.url.pathname, WORK_API_PROJECT_DETAIL_PATTERN)
      : null;
  if (projectDeleteMatch) {
    return handleRemoveProject(context, projectDeleteMatch[0] ?? '');
  }
  // POST /api/work/work-items
  if (context.url.pathname === WORK_API_WORK_ITEMS_PATH && context.method === 'POST') {
    return handleCreateWorkItem(context);
  }
  // DELETE /api/work/work-items/:workItemId
  const workItemDeleteMatch =
    context.method === 'DELETE'
      ? matchRoute(context.url.pathname, WORK_API_WORK_ITEM_DETAIL_PATTERN)
      : null;
  if (workItemDeleteMatch) {
    return handleRemoveWorkItem(context, workItemDeleteMatch[0] ?? '');
  }
  // POST /api/work/tasks
  if (context.url.pathname === WORK_API_TASKS_PATH && context.method === 'POST') {
    return handleCreateTask(context);
  }
  // DELETE /api/work/tasks/:taskId
  const taskDeleteMatch =
    context.method === 'DELETE'
      ? matchRoute(context.url.pathname, WORK_API_TASK_DETAIL_PATTERN)
      : null;
  if (taskDeleteMatch) {
    return handleRemoveTask(context, taskDeleteMatch[0] ?? '');
  }
  return false;
}

async function handleCreateProject(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  const body = await readJsonBody<Record<string, unknown>>(context.request);
  const validation = validateCreateProject(body);
  if (validation.error !== null || !validation.payload) {
    sendJson(context.response, 400, {
      error: { code: 'invalid_project_input', message: validation.error ?? 'Invalid input' },
    });
    return true;
  }
  try {
    const now = context.dependencies.now?.() ?? new Date();
    const core = await context.dependencies.coreStore.readCore();
    const ownerActorId =
      validation.payload.ownerActorId ?? core.ownerProfile.actorId;
    const result = upsertCoreProject(
      core,
      {
        id: validation.payload.id,
        title: validation.payload.title,
        status: validation.payload.status,
        ownerActorId,
        summary: validation.payload.summary ?? null,
        repoPath: validation.payload.repoPath ?? null,
        primaryConversationId: validation.payload.primaryConversationId ?? null,
      },
      now,
    );
    if (result.created) {
      await context.dependencies.coreStore.writeCore(result.core);
    }
    const status = result.created ? 201 : 200;
    sendJson(context.response, status, {
      project: result.project,
      created: result.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}

async function handleRemoveProject(
  context: RouteContext<WorkApiDependencies>,
  projectId: string,
): Promise<boolean> {
  if (!projectId) {
    sendJson(context.response, 400, {
      error: { code: 'invalid_project_id', message: 'Project id is required.' },
    });
    return true;
  }
  const now = context.dependencies.now?.() ?? new Date();
  const core = await context.dependencies.coreStore.readCore();
  const result = removeCoreProject(core, projectId, now);
  if (!result.removed) {
    sendJson(context.response, 404, {
      error: { code: 'project_not_found', message: `No project with id ${projectId}.` },
    });
    return true;
  }
  await context.dependencies.coreStore.writeCore(result.core);
  sendJson(context.response, 200, { removed: true, projectId });
  return true;
}

async function handleCreateWorkItem(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  const body = await readJsonBody<Record<string, unknown>>(context.request);
  const validation = validateCreateWorkItem(body);
  if (validation.error !== null || !validation.payload) {
    sendJson(context.response, 400, {
      error: { code: 'invalid_work_item_input', message: validation.error ?? 'Invalid input' },
    });
    return true;
  }
  try {
    const now = context.dependencies.now?.() ?? new Date();
    const core = await context.dependencies.coreStore.readCore();
    const ownerActorId =
      validation.payload.ownerActorId ?? core.ownerProfile.actorId;
    const result = upsertCoreWorkItem(
      core,
      {
        id: validation.payload.id,
        title: validation.payload.title,
        status: validation.payload.status,
        ownerActorId,
        projectId: validation.payload.projectId ?? null,
        conversationId: validation.payload.conversationId ?? null,
        taskId: validation.payload.taskId ?? null,
        parentWorkItemId: validation.payload.parentWorkItemId ?? null,
        summary: validation.payload.summary ?? null,
        assignedActorIds: validation.payload.assignedActorIds,
      },
      now,
    );
    if (result.created) {
      await context.dependencies.coreStore.writeCore(result.core);
    }
    const status = result.created ? 201 : 200;
    sendJson(context.response, status, {
      workItem: result.workItem,
      created: result.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}

async function handleRemoveWorkItem(
  context: RouteContext<WorkApiDependencies>,
  workItemId: string,
): Promise<boolean> {
  if (!workItemId) {
    sendJson(context.response, 400, {
      error: { code: 'invalid_work_item_id', message: 'Work item id is required.' },
    });
    return true;
  }
  const now = context.dependencies.now?.() ?? new Date();
  const core = await context.dependencies.coreStore.readCore();
  const result = removeCoreWorkItem(core, workItemId, now);
  if (!result.removed) {
    sendJson(context.response, 404, {
      error: { code: 'work_item_not_found', message: `No work item with id ${workItemId}.` },
    });
    return true;
  }
  await context.dependencies.coreStore.writeCore(result.core);
  sendJson(context.response, 200, { removed: true, workItemId });
  return true;
}

async function handleCreateTask(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  const body = await readJsonBody<Record<string, unknown>>(context.request);
  const validation = validateCreateTask(body);
  if (validation.error !== null || !validation.payload) {
    sendJson(context.response, 400, {
      error: { code: 'invalid_task_input', message: validation.error ?? 'Invalid input' },
    });
    return true;
  }
  try {
    const now = context.dependencies.now?.() ?? new Date();
    const core = await context.dependencies.coreStore.readCore();
    const ownerActorId =
      validation.payload.ownerActorId ?? core.ownerProfile.actorId;
    const result = upsertCoreTask(
      core,
      {
        id: validation.payload.id,
        title: validation.payload.title,
        status: validation.payload.status,
        ownerActorId,
        conversationId: validation.payload.conversationId ?? null,
        parentTaskId: validation.payload.parentTaskId ?? null,
        summary: validation.payload.summary ?? null,
        assignedActorIds: validation.payload.assignedActorIds,
        metadata: validation.payload.metadata,
      },
      now,
    );
    if (result.created) {
      await context.dependencies.coreStore.writeCore(result.core);
    }
    const status = result.created ? 201 : 200;
    sendJson(context.response, status, {
      task: result.task,
      created: result.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}

async function handleRemoveTask(
  context: RouteContext<WorkApiDependencies>,
  taskId: string,
): Promise<boolean> {
  if (!taskId) {
    sendJson(context.response, 400, {
      error: { code: 'invalid_task_id', message: 'Task id is required.' },
    });
    return true;
  }
  const now = context.dependencies.now?.() ?? new Date();
  const core = await context.dependencies.coreStore.readCore();
  const result = removeCoreTask(core, taskId, now);
  if (!result.removed) {
    sendJson(context.response, 404, {
      error: { code: 'task_not_found', message: `No task with id ${taskId}.` },
    });
    return true;
  }
  await context.dependencies.coreStore.writeCore(result.core);
  sendJson(context.response, 200, { removed: true, taskId });
  return true;
}

function validateCreateProject(
  body: Record<string, unknown>,
): { payload: CreateProjectPayload; error: null } | { payload: null; error: string } {
  const title = readNonEmptyString(body.title);
  if (!title) return { payload: null, error: 'title is required.' };
  const status = readEnum(body.status, PROJECT_STATUSES);
  if (status.error) return { payload: null, error: status.error };
  const ownerActorId = readOptionalString(body.ownerActorId);
  if (ownerActorId.error) return { payload: null, error: ownerActorId.error };
  const id = readOptionalString(body.id);
  if (id.error) return { payload: null, error: id.error };
  const summary = readNullableString(body.summary, 'summary');
  if (summary.error) return { payload: null, error: summary.error };
  const repoPath = readNullableString(body.repoPath, 'repoPath');
  if (repoPath.error) return { payload: null, error: repoPath.error };
  const primaryConversationId = readNullableString(
    body.primaryConversationId,
    'primaryConversationId',
  );
  if (primaryConversationId.error) {
    return { payload: null, error: primaryConversationId.error };
  }
  return {
    payload: {
      title,
      status: status.value,
      ownerActorId: ownerActorId.value,
      id: id.value,
      summary: summary.value,
      repoPath: repoPath.value,
      primaryConversationId: primaryConversationId.value,
    },
    error: null,
  };
}

function validateCreateWorkItem(
  body: Record<string, unknown>,
): { payload: CreateWorkItemPayload; error: null } | { payload: null; error: string } {
  const title = readNonEmptyString(body.title);
  if (!title) return { payload: null, error: 'title is required.' };
  const status = readEnum(body.status, WORK_ITEM_STATUSES);
  if (status.error) return { payload: null, error: status.error };
  const ownerActorId = readOptionalString(body.ownerActorId);
  if (ownerActorId.error) return { payload: null, error: ownerActorId.error };
  const id = readOptionalString(body.id);
  if (id.error) return { payload: null, error: id.error };
  const projectId = readNullableString(body.projectId, 'projectId');
  if (projectId.error) return { payload: null, error: projectId.error };
  const conversationId = readNullableString(body.conversationId, 'conversationId');
  if (conversationId.error) return { payload: null, error: conversationId.error };
  const taskId = readNullableString(body.taskId, 'taskId');
  if (taskId.error) return { payload: null, error: taskId.error };
  const parentWorkItemId = readNullableString(body.parentWorkItemId, 'parentWorkItemId');
  if (parentWorkItemId.error) return { payload: null, error: parentWorkItemId.error };
  const summary = readNullableString(body.summary, 'summary');
  if (summary.error) return { payload: null, error: summary.error };
  const assignedActorIds = readStringArray(body.assignedActorIds, 'assignedActorIds');
  if (assignedActorIds.error) return { payload: null, error: assignedActorIds.error };
  return {
    payload: {
      title,
      status: status.value,
      ownerActorId: ownerActorId.value,
      id: id.value,
      projectId: projectId.value,
      conversationId: conversationId.value,
      taskId: taskId.value,
      parentWorkItemId: parentWorkItemId.value,
      summary: summary.value,
      assignedActorIds: assignedActorIds.value,
    },
    error: null,
  };
}

function validateCreateTask(
  body: Record<string, unknown>,
): { payload: CreateTaskPayload; error: null } | { payload: null; error: string } {
  const title = readNonEmptyString(body.title);
  if (!title) return { payload: null, error: 'title is required.' };
  const status = readEnum(body.status, TASK_STATUSES);
  if (status.error) return { payload: null, error: status.error };
  const ownerActorId = readOptionalString(body.ownerActorId);
  if (ownerActorId.error) return { payload: null, error: ownerActorId.error };
  const id = readOptionalString(body.id);
  if (id.error) return { payload: null, error: id.error };
  const conversationId = readNullableString(body.conversationId, 'conversationId');
  if (conversationId.error) return { payload: null, error: conversationId.error };
  const parentTaskId = readNullableString(body.parentTaskId, 'parentTaskId');
  if (parentTaskId.error) return { payload: null, error: parentTaskId.error };
  const summary = readNullableString(body.summary, 'summary');
  if (summary.error) return { payload: null, error: summary.error };
  const assignedActorIds = readStringArray(body.assignedActorIds, 'assignedActorIds');
  if (assignedActorIds.error) return { payload: null, error: assignedActorIds.error };
  const metadata = readMetadata(body.metadata);
  if (metadata.error) return { payload: null, error: metadata.error };
  return {
    payload: {
      title,
      status: status.value,
      ownerActorId: ownerActorId.value,
      id: id.value,
      conversationId: conversationId.value,
      parentTaskId: parentTaskId.value,
      summary: summary.value,
      assignedActorIds: assignedActorIds.value,
      metadata: metadata.value,
    },
    error: null,
  };
}

function readMetadata(
  value: unknown,
):
  | { value: Record<string, unknown> | undefined; error: null }
  | { value: undefined; error: string } {
  if (value === undefined || value === null) return { value: undefined, error: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { value: undefined, error: 'metadata must be an object when provided.' };
  }
  return { value: value as Record<string, unknown>, error: null };
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalString(value: unknown):
  | { value: string | undefined; error: null }
  | { value: undefined; error: string } {
  if (value === undefined || value === null) return { value: undefined, error: null };
  if (typeof value !== 'string') {
    return { value: undefined, error: 'must be a string when provided.' };
  }
  const trimmed = value.trim();
  return { value: trimmed.length > 0 ? trimmed : undefined, error: null };
}

function readNullableString(
  value: unknown,
  fieldName: string,
):
  | { value: string | null | undefined; error: null }
  | { value: undefined; error: string } {
  if (value === undefined) return { value: undefined, error: null };
  if (value === null) return { value: null, error: null };
  if (typeof value !== 'string') {
    return { value: undefined, error: `${fieldName} must be a string or null.` };
  }
  const trimmed = value.trim();
  return { value: trimmed.length > 0 ? trimmed : null, error: null };
}

function readEnum<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
):
  | { value: T | undefined; error: null }
  | { value: undefined; error: string } {
  if (value === undefined || value === null) return { value: undefined, error: null };
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return {
      value: undefined,
      error: `must be one of: ${allowed.join(', ')}.`,
    };
  }
  return { value: value as T, error: null };
}

function readStringArray(
  value: unknown,
  fieldName: string,
):
  | { value: string[] | undefined; error: null }
  | { value: undefined; error: string } {
  if (value === undefined || value === null) return { value: undefined, error: null };
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return { value: undefined, error: `${fieldName} must be a string[].` };
  }
  return { value: value as string[], error: null };
}

export type { CoreProjectRecord, CoreTaskRecord, CoreWorkItemRecord };
