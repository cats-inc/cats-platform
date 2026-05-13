import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreProjectRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { SupervisedToolExecutor } from '../../../platform/supervision/toolBoundary.js';
import {
  WORK_PROJECT_LOOKUP_TOOL,
  type WorkProjectLookupInput,
  type WorkProjectLookupProject,
  type WorkProjectLookupResult,
  validateWorkProjectLookupInput,
} from '../shared/workToolSurface.js';

const DEFAULT_PROJECT_LOOKUP_LIMIT = 10;

export interface WorkTriageDelegateOptions {
  coreStore: Pick<CoreStore, 'readCore'>;
}

export interface WorkTriageDelegate {
  lookupProjects(input: WorkProjectLookupInput): Promise<ToolResult<WorkProjectLookupResult>>;
}

export interface WorkTriageToolExecutors {
  [WORK_PROJECT_LOOKUP_TOOL]: SupervisedToolExecutor<
    WorkProjectLookupInput,
    WorkProjectLookupResult
  >;
}

export function createWorkTriageDelegate(
  options: WorkTriageDelegateOptions,
): WorkTriageDelegate {
  return {
    async lookupProjects(input) {
      const validationErrors = validateWorkProjectLookupInput(input);
      if (validationErrors.length > 0) {
        return rejected('Invalid work.project.lookup input.', validationErrors);
      }

      const core = await options.coreStore.readCore();
      return lookupWorkProjects(core, input);
    },
  };
}

export function createWorkTriageToolExecutors(
  delegate: WorkTriageDelegate,
): WorkTriageToolExecutors {
  return {
    [WORK_PROJECT_LOOKUP_TOOL]: (input) => delegate.lookupProjects(input),
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

function rejected<T>(
  message: string,
  details?: unknown,
): ToolResult<T> {
  return {
    status: 'rejected',
    error: {
      code: 'E_SCHEMA_INVALID',
      message,
      details,
    },
  };
}
