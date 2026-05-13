import { createHash } from 'node:crypto';

import {
  appendCoreActivity,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreProjectRecord, CoreWorkItemRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { SupervisedToolExecutor } from '../../../platform/supervision/toolBoundary.js';
import {
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_ITEM_TRIAGE_STATUS_VALUES,
  type WorkItemTriageStatus,
  type WorkItemUpdateInput,
  type WorkItemUpdateResult,
  type WorkProjectCreateInput,
  type WorkProjectCreateResult,
  type WorkProjectLookupInput,
  type WorkProjectLookupProject,
  type WorkProjectLookupResult,
  validateWorkItemUpdateInput,
  validateWorkProjectCreateInput,
  validateWorkProjectLookupInput,
} from '../shared/workToolSurface.js';

const DEFAULT_PROJECT_LOOKUP_LIMIT = 10;
const WORK_TRIAGE_METADATA_KEY = 'workTriage';
const WORK_TRIAGE_METADATA_VERSION = 1;

export interface WorkTriageDelegateOptions {
  coreStore: CoreStore;
  now?: () => Date;
}

export interface WorkTriageMutationContext {
  actorRef: string;
  actionId?: string;
  runId?: string;
}

export interface WorkTriageDelegate {
  lookupProjects(input: WorkProjectLookupInput): Promise<ToolResult<WorkProjectLookupResult>>;
  updateWorkItem(
    input: WorkItemUpdateInput,
    context: WorkTriageMutationContext,
  ): Promise<ToolResult<WorkItemUpdateResult>>;
  createProject(
    input: WorkProjectCreateInput,
    context: WorkTriageMutationContext,
  ): Promise<ToolResult<WorkProjectCreateResult>>;
}

export interface WorkTriageToolExecutors {
  [WORK_ITEM_UPDATE_TOOL]: SupervisedToolExecutor<
    WorkItemUpdateInput,
    WorkItemUpdateResult
  >;
  [WORK_PROJECT_LOOKUP_TOOL]: SupervisedToolExecutor<
    WorkProjectLookupInput,
    WorkProjectLookupResult
  >;
  [WORK_PROJECT_CREATE_TOOL]: SupervisedToolExecutor<
    WorkProjectCreateInput,
    WorkProjectCreateResult
  >;
}

export function createWorkTriageDelegate(
  options: WorkTriageDelegateOptions,
): WorkTriageDelegate {
  const now = options.now ?? (() => new Date());

  return {
    async lookupProjects(input) {
      const validationErrors = validateWorkProjectLookupInput(input);
      if (validationErrors.length > 0) {
        return rejected('Invalid work.project.lookup input.', validationErrors);
      }

      const core = await options.coreStore.readCore();
      return lookupWorkProjects(core, input);
    },
    async updateWorkItem(input, context) {
      return updateWorkItem(options.coreStore, input, context, now);
    },
    async createProject(input, context) {
      return createWorkProject(options.coreStore, input, context, now);
    },
  };
}

export function createWorkTriageToolExecutors(
  delegate: WorkTriageDelegate,
): WorkTriageToolExecutors {
  return {
    [WORK_ITEM_UPDATE_TOOL]: (input, context) => delegate.updateWorkItem(input, context),
    [WORK_PROJECT_LOOKUP_TOOL]: (input) => delegate.lookupProjects(input),
    [WORK_PROJECT_CREATE_TOOL]: (input, context) => delegate.createProject(input, context),
  };
}

export function lookupWorkProjects(
  core: CatsCoreState,
  input: WorkProjectLookupInput,
): ToolResult<WorkProjectLookupResult> {
  const validationErrors = validateWorkProjectLookupInput(input);
  if (validationErrors.length > 0) {
    return rejected('Invalid work.project.lookup input.', validationErrors);
  }

  const query = normalizeQuery(input.query);
  const limit = input.limit ?? DEFAULT_PROJECT_LOOKUP_LIMIT;
  const projects = core.projects
    .filter((project) => input.includeArchived === true || project.status !== 'archived')
    .filter((project) => projectMatchesQuery(project, query))
    .sort(compareProjectsForLookup)
    .slice(0, limit)
    .map((project) => projectToLookupProject(core, project));

  return {
    status: 'applied',
    result: {
      projects,
    },
  };
}

export async function updateWorkItem(
  coreStore: CoreStore,
  input: WorkItemUpdateInput,
  context: WorkTriageMutationContext,
  now: () => Date = () => new Date(),
): Promise<ToolResult<WorkItemUpdateResult>> {
  const validationErrors = validateWorkItemUpdateInput(input);
  if (validationErrors.length > 0) {
    return rejected('Invalid work.item.update input.', validationErrors);
  }

  const updatedAt = now();
  const idempotencyKey = createWorkItemUpdateIdempotencyKey(input);
  let workItem: CoreWorkItemRecord | null = null;
  let updated = false;

  try {
    const persisted = await coreStore.updateCore((core) => {
      const existing = core.workItems.find((candidate) => candidate.id === input.workItemId) ?? null;
      if (existing === null) {
        throw new WorkTriagePrecheckError(`No Work Item found for id ${input.workItemId}.`);
      }
      if (!isWorkItemTriageStatus(existing.status)) {
        throw new WorkTriagePrecheckError(
          `Work Item ${input.workItemId} is not in a triage-editable status: ${existing.status}.`,
        );
      }

      const nextStatus = input.status ?? existing.status;
      if (!isWorkItemTriageStatus(nextStatus)) {
        throw new WorkTriagePrecheckError(
          `Work Item ${input.workItemId} cannot be moved to status: ${nextStatus}.`,
        );
      }

      const nextFields = buildNextWorkItemUpdateFields(existing, input);
      if (!hasWorkItemUpdateChange(existing, nextFields)) {
        workItem = existing;
        updated = false;
        return core;
      }

      const workItemWrite = upsertCoreWorkItem(
        core,
        {
          id: existing.id,
          title: nextFields.title,
          status: nextStatus,
          ownerActorId: existing.ownerActorId,
          projectId: existing.projectId,
          conversationId: existing.conversationId,
          taskId: existing.taskId,
          parentWorkItemId: existing.parentWorkItemId,
          assignedActorIds: existing.assignedActorIds,
          summary: nextFields.summary,
          createdAt: existing.createdAt,
          metadata: buildWorkItemUpdateMetadata(
            existing,
            input,
            context,
            idempotencyKey,
            updatedAt,
          ),
        },
        updatedAt,
      );
      const activityWrite = appendCoreActivity(
        workItemWrite.core,
        {
          kind: 'work_item_updated',
          actorId: context.actorRef,
          projectId: workItemWrite.workItem.projectId,
          workItemId: workItemWrite.workItem.id,
          conversationId: workItemWrite.workItem.conversationId,
          message: `Updated Work Item: ${workItemWrite.workItem.title}`,
          metadata: {
            [WORK_TRIAGE_METADATA_KEY]: {
              schemaVersion: WORK_TRIAGE_METADATA_VERSION,
              phase: 'triage',
              toolName: WORK_ITEM_UPDATE_TOOL,
              idempotencyKey,
              actionId: context.actionId ?? null,
              runId: context.runId ?? null,
            },
          },
        },
        updatedAt,
      );

      workItem = workItemWrite.workItem;
      updated = true;
      return activityWrite.core;
    });

    workItem =
      workItem
      ?? persisted.workItems.find((candidate) => candidate.id === input.workItemId)
      ?? null;
    if (workItem === null) {
      return rejected(
        `Updated Work Item was not found after write: ${input.workItemId}`,
        undefined,
        'E_PRECHECK_FAILED',
      );
    }
    if (!isWorkItemTriageStatus(workItem.status)) {
      return rejected(
        `Updated Work Item is not in a triage status: ${workItem.status}`,
        undefined,
        'E_PRECHECK_FAILED',
      );
    }

    return {
      status: 'applied',
      result: {
        workItemId: workItem.id,
        status: workItem.status,
        updated,
      },
    };
  } catch (error) {
    return rejected(
      error instanceof Error ? error.message : 'Work item update failed.',
      undefined,
      'E_PRECHECK_FAILED',
    );
  }
}

export async function createWorkProject(
  coreStore: CoreStore,
  input: WorkProjectCreateInput,
  context: WorkTriageMutationContext,
  now: () => Date = () => new Date(),
): Promise<ToolResult<WorkProjectCreateResult>> {
  const validationErrors = validateWorkProjectCreateInput(input);
  if (validationErrors.length > 0) {
    return rejected('Invalid work.project.create input.', validationErrors);
  }

  const createdAt = now();
  const idempotencyKey = createProjectIdempotencyKey(input);
  const projectId = createProjectId(idempotencyKey);
  let project: CoreProjectRecord | null = null;
  let created = false;

  try {
    const persisted = await coreStore.updateCore((core) => {
      const existing = core.projects.find((candidate) => candidate.id === projectId) ?? null;
      if (existing !== null) {
        project = existing;
        created = false;
        return core;
      }

      const projectWrite = upsertCoreProject(
        core,
        {
          id: projectId,
          title: input.title,
          status: input.status ?? 'planned',
          ownerActorId: core.ownerProfile.actorId,
          summary: input.summary ?? null,
          repoPath: input.repoPath ?? null,
          primaryConversationId: input.primaryConversationId ?? null,
          metadata: {
            [WORK_TRIAGE_METADATA_KEY]: buildWorkTriageMetadata(
              input,
              context,
              idempotencyKey,
              createdAt,
            ),
          },
        },
        createdAt,
      );
      const activityWrite = appendCoreActivity(
        projectWrite.core,
        {
          id: createProjectCreatedActivityId(projectId),
          kind: 'note',
          actorId: context.actorRef,
          projectId: projectWrite.project.id,
          conversationId: projectWrite.project.primaryConversationId,
          message: `Created Project: ${projectWrite.project.title}`,
          metadata: {
            [WORK_TRIAGE_METADATA_KEY]: {
              schemaVersion: WORK_TRIAGE_METADATA_VERSION,
              phase: 'triage',
              toolName: WORK_PROJECT_CREATE_TOOL,
              idempotencyKey,
              actionId: context.actionId ?? null,
              runId: context.runId ?? null,
            },
          },
        },
        createdAt,
      );

      project = projectWrite.project;
      created = projectWrite.created;
      return activityWrite.core;
    });

    project = project ?? persisted.projects.find((candidate) => candidate.id === projectId) ?? null;
    if (project === null) {
      return rejected(
        `Created Project was not found after write: ${projectId}`,
        undefined,
        'E_PRECHECK_FAILED',
      );
    }
    if (project.status === 'archived') {
      return rejected(
        `Project is archived and cannot satisfy work.project.create: ${projectId}`,
        undefined,
        'E_PRECHECK_FAILED',
      );
    }

    return {
      status: 'applied',
      result: {
        projectId: project.id,
        status: project.status,
        created,
      },
    };
  } catch (error) {
    return rejected(
      error instanceof Error ? error.message : 'Work project create failed.',
      undefined,
      'E_PRECHECK_FAILED',
    );
  }
}

function projectToLookupProject(
  core: CatsCoreState,
  project: CoreProjectRecord,
): WorkProjectLookupProject {
  return {
    projectId: project.id,
    title: project.title,
    status: project.status,
    summary: project.summary ?? undefined,
    repoPath: project.repoPath ?? undefined,
    primaryConversationId: project.primaryConversationId ?? undefined,
    workItemCount: core.workItems.filter((workItem) => workItem.projectId === project.id).length,
  };
}

function projectMatchesQuery(project: CoreProjectRecord, query: string | null): boolean {
  if (!query) {
    return true;
  }

  return [
    project.title,
    project.summary ?? '',
    project.repoPath ?? '',
  ].some((value) => value.toLowerCase().includes(query));
}

function compareProjectsForLookup(
  left: CoreProjectRecord,
  right: CoreProjectRecord,
): number {
  const statusRank = projectStatusRank(left.status) - projectStatusRank(right.status);
  if (statusRank !== 0) {
    return statusRank;
  }

  return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title);
}

function projectStatusRank(status: CoreProjectRecord['status']): number {
  switch (status) {
    case 'active':
      return 0;
    case 'planned':
      return 1;
    case 'paused':
      return 2;
    case 'archived':
      return 3;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function normalizeQuery(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

interface NextWorkItemUpdateFields {
  title: string;
  summary: string | null;
  status: WorkItemTriageStatus;
  metadataKind: string | null;
  metadataPriority: string | null;
  metadataAssignmentHint: string | null;
  metadataOpenQuestions: string[];
}

function buildNextWorkItemUpdateFields(
  existing: CoreWorkItemRecord,
  input: WorkItemUpdateInput,
): NextWorkItemUpdateFields {
  const existingTriage = readExistingWorkItemTriageMetadata(existing);

  return {
    title: input.title === undefined ? existing.title : input.title.trim(),
    summary: input.summary === undefined ? existing.summary : normalizeNullableString(input.summary),
    status: input.status ?? readCurrentTriageStatus(existing),
    metadataKind: input.kind ?? existingTriage.kind,
    metadataPriority: input.priority ?? existingTriage.priority,
    metadataAssignmentHint:
      input.assignmentHint === undefined
        ? existingTriage.assignmentHint
        : normalizeNullableString(input.assignmentHint),
    metadataOpenQuestions: input.openQuestions ?? existingTriage.openQuestions,
  };
}

function readCurrentTriageStatus(existing: CoreWorkItemRecord): WorkItemTriageStatus {
  if (isWorkItemTriageStatus(existing.status)) {
    return existing.status;
  }

  throw new WorkTriagePrecheckError(
    `Work Item ${existing.id} is not in a triage-editable status: ${existing.status}.`,
  );
}

function hasWorkItemUpdateChange(
  existing: CoreWorkItemRecord,
  next: NextWorkItemUpdateFields,
): boolean {
  const existingTriage = readExistingWorkItemTriageMetadata(existing);

  return (
    existing.title !== next.title
    || existing.summary !== next.summary
    || existing.status !== next.status
    || existingTriage.kind !== next.metadataKind
    || existingTriage.priority !== next.metadataPriority
    || existingTriage.assignmentHint !== next.metadataAssignmentHint
    || !stringArraysEqual(existingTriage.openQuestions, next.metadataOpenQuestions)
  );
}

function buildWorkItemUpdateMetadata(
  existing: CoreWorkItemRecord,
  input: WorkItemUpdateInput,
  context: WorkTriageMutationContext,
  idempotencyKey: string,
  updatedAt: Date,
): Record<string, unknown> {
  const next = buildNextWorkItemUpdateFields(existing, input);

  return {
    ...existing.metadata,
    [WORK_TRIAGE_METADATA_KEY]: {
      schemaVersion: WORK_TRIAGE_METADATA_VERSION,
      phase: 'triage',
      toolName: WORK_ITEM_UPDATE_TOOL,
      idempotencyKey,
      producingActorRef: context.actorRef,
      actionId: context.actionId ?? null,
      runId: context.runId ?? null,
      updatedAt: updatedAt.toISOString(),
      kind: next.metadataKind,
      priority: next.metadataPriority,
      assignmentHint: next.metadataAssignmentHint,
      openQuestions: next.metadataOpenQuestions,
    },
  };
}

function readExistingWorkItemTriageMetadata(workItem: CoreWorkItemRecord): {
  kind: string | null;
  priority: string | null;
  assignmentHint: string | null;
  openQuestions: string[];
} {
  const workTriage = isRecord(workItem.metadata.workTriage)
    ? workItem.metadata.workTriage
    : {};
  const workIntake = isRecord(workItem.metadata.workIntake)
    ? workItem.metadata.workIntake
    : {};

  return {
    kind: readNullableMetadataString(workTriage.kind) ?? readNullableMetadataString(workIntake.kind),
    priority:
      readNullableMetadataString(workTriage.priority)
      ?? readNullableMetadataString(workIntake.priority),
    assignmentHint: readNullableMetadataString(workTriage.assignmentHint),
    openQuestions:
      readMetadataStringArray(workTriage.openQuestions)
      ?? readMetadataStringArray(workIntake.openQuestions)
      ?? [],
  };
}

function readNullableMetadataString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readMetadataStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return null;
  }

  return value.map((item) => item.trim()).filter((item) => item.length > 0);
}

function normalizeNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function isWorkItemTriageStatus(status: string): status is WorkItemTriageStatus {
  return (WORK_ITEM_TRIAGE_STATUS_VALUES as readonly string[]).includes(status);
}

function createWorkItemUpdateIdempotencyKey(input: WorkItemUpdateInput): string {
  return [
    WORK_ITEM_UPDATE_TOOL,
    input.workItemId.trim(),
    input.title?.trim().toLowerCase() ?? '',
    input.summary?.trim().toLowerCase() ?? '',
    input.status ?? '',
    input.kind ?? '',
    input.priority ?? '',
    input.assignmentHint?.trim().toLowerCase() ?? '',
    ...(input.openQuestions ?? []).map((question) => question.trim().toLowerCase()),
  ].join('\n');
}

function createProjectIdempotencyKey(input: WorkProjectCreateInput): string {
  return [
    WORK_PROJECT_CREATE_TOOL,
    input.title.trim().toLowerCase(),
    input.repoPath?.trim().toLowerCase() ?? '',
    input.primaryConversationId?.trim() ?? '',
  ].join('\n');
}

function createProjectId(idempotencyKey: string): string {
  return `project-triage-${stableHash(idempotencyKey).slice(0, 20)}`;
}

function createProjectCreatedActivityId(projectId: string): string {
  return `activity-${projectId}-created`;
}

function buildWorkTriageMetadata(
  input: WorkProjectCreateInput,
  context: WorkTriageMutationContext,
  idempotencyKey: string,
  createdAt: Date,
): Record<string, unknown> {
  return {
    schemaVersion: WORK_TRIAGE_METADATA_VERSION,
    phase: 'triage',
    toolName: WORK_PROJECT_CREATE_TOOL,
    idempotencyKey,
    producingActorRef: context.actorRef,
    actionId: context.actionId ?? null,
    runId: context.runId ?? null,
    createdAt: createdAt.toISOString(),
    requestedStatus: input.status ?? 'planned',
  };
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

class WorkTriagePrecheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkTriagePrecheckError';
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function rejected<T>(
  message: string,
  details?: unknown,
  code: 'E_SCHEMA_INVALID' | 'E_PRECHECK_FAILED' = 'E_SCHEMA_INVALID',
): ToolResult<T> {
  return {
    status: 'rejected',
    error: {
      code,
      message,
      details,
    },
  };
}
