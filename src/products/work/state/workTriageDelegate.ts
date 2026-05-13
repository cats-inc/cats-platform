import { createHash } from 'node:crypto';

import {
  appendCoreActivity,
  upsertCoreProject,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreProjectRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { SupervisedToolExecutor } from '../../../platform/supervision/toolBoundary.js';
import {
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  type WorkProjectCreateInput,
  type WorkProjectCreateResult,
  type WorkProjectLookupInput,
  type WorkProjectLookupProject,
  type WorkProjectLookupResult,
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
  createProject(
    input: WorkProjectCreateInput,
    context: WorkTriageMutationContext,
  ): Promise<ToolResult<WorkProjectCreateResult>>;
}

export interface WorkTriageToolExecutors {
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
    async createProject(input, context) {
      return createWorkProject(options.coreStore, input, context, now);
    },
  };
}

export function createWorkTriageToolExecutors(
  delegate: WorkTriageDelegate,
): WorkTriageToolExecutors {
  return {
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
