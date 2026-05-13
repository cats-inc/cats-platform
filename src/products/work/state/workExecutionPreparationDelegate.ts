import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreWorkItemRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { SupervisedToolExecutor } from '../../../platform/supervision/toolBoundary.js';
import {
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_TRIAGE_STATUS_VALUES,
  type WorkItemExecutionPreparationProposal,
  type WorkItemPrepareExecutionInput,
  type WorkItemPrepareExecutionResult,
  type WorkItemTriageStatus,
  validateWorkItemPrepareExecutionInput,
} from '../shared/workToolSurface.js';

export interface WorkExecutionPreparationDelegateOptions {
  coreStore: Pick<CoreStore, 'readCore'>;
}

export interface WorkExecutionPreparationDelegate {
  prepareExecution(
    input: WorkItemPrepareExecutionInput,
  ): Promise<ToolResult<WorkItemPrepareExecutionResult>>;
}

export interface WorkExecutionPreparationToolExecutors {
  [WORK_ITEM_PREPARE_EXECUTION_TOOL]: SupervisedToolExecutor<
    WorkItemPrepareExecutionInput,
    WorkItemPrepareExecutionResult
  >;
}

export function createWorkExecutionPreparationDelegate(
  options: WorkExecutionPreparationDelegateOptions,
): WorkExecutionPreparationDelegate {
  return {
    async prepareExecution(input) {
      const core = await options.coreStore.readCore();
      return prepareWorkItemExecution(core, input);
    },
  };
}

export function createWorkExecutionPreparationToolExecutors(
  delegate: WorkExecutionPreparationDelegate,
): WorkExecutionPreparationToolExecutors {
  return {
    [WORK_ITEM_PREPARE_EXECUTION_TOOL]: (input) => delegate.prepareExecution(input),
  };
}

export function prepareWorkItemExecution(
  core: CatsCoreState,
  input: WorkItemPrepareExecutionInput,
): ToolResult<WorkItemPrepareExecutionResult> {
  const validationErrors = validateWorkItemPrepareExecutionInput(input);
  if (validationErrors.length > 0) {
    return rejected('E_SCHEMA_INVALID', 'Invalid work.item.prepare_execution input.', validationErrors);
  }

  const workItemIds = uniqueNonEmpty(input.workItemIds).slice(0, input.maxItems ?? 20);
  const missingIds = workItemIds.filter((workItemId) =>
    !core.workItems.some((workItem) => workItem.id === workItemId));
  if (missingIds.length > 0) {
    return rejected(
      'E_PRECHECK_FAILED',
      `Cannot prepare execution for missing Work Items: ${missingIds.join(', ')}.`,
      { missingIds },
    );
  }

  const invalidStatuses: Array<{ workItemId: string; status: string }> = [];
  const proposals: WorkItemExecutionPreparationProposal[] = [];

  for (const workItemId of workItemIds) {
    const workItem = core.workItems.find((candidate) => candidate.id === workItemId);
    if (!workItem) {
      throw new Error(`Missing Work Item after precheck: ${workItemId}`);
    }
    const status = readExecutionPreparationStatus(workItem);
    if (status === null) {
      invalidStatuses.push({
        workItemId: workItem.id,
        status: workItem.status,
      });
      continue;
    }

    proposals.push(buildExecutionProposal(workItem, status, input.executionGoal));
  }

  if (invalidStatuses.length > 0) {
    return rejected(
      'E_PRECHECK_FAILED',
      'Cannot prepare execution for Work Items outside the triage-to-ready statuses.',
      { invalidStatuses },
    );
  }

  return {
    status: 'applied',
    result: {
      proposals,
    },
  };
}

function buildExecutionProposal(
  workItem: CoreWorkItemRecord,
  status: WorkItemTriageStatus,
  executionGoal: string | undefined,
): WorkItemExecutionPreparationProposal {
  const metadata = readWorkItemPlanningMetadata(workItem);
  const readiness = resolveReadiness(status);
  const blockers = readiness === 'blocked'
    ? ['Work Item is blocked; resolve blockers before creating an execution Task.']
    : [];
  const openQuestions = readiness === 'needs_triage'
    ? [
        ...metadata.openQuestions,
        'Confirm this Work Item is ready before creating an execution Task.',
      ]
    : metadata.openQuestions;

  return {
    workItemId: workItem.id,
    title: workItem.title,
    status,
    projectId: workItem.projectId ?? undefined,
    readiness,
    proposedTaskTitle: workItem.title,
    proposedTaskSummary: buildProposedTaskSummary(workItem, executionGoal),
    openQuestions,
    blockers,
  };
}

function readExecutionPreparationStatus(workItem: CoreWorkItemRecord): WorkItemTriageStatus | null {
  if (!isWorkItemTriageStatus(workItem.status)) {
    return null;
  }

  return workItem.status;
}

function resolveReadiness(status: WorkItemTriageStatus): WorkItemExecutionPreparationProposal['readiness'] {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'blocked':
      return 'blocked';
    case 'draft':
    case 'planned':
      return 'needs_triage';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function buildProposedTaskSummary(
  workItem: CoreWorkItemRecord,
  executionGoal: string | undefined,
): string {
  const parts = [
    workItem.summary?.trim() || null,
    executionGoal?.trim() ? `Owner execution goal: ${executionGoal.trim()}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? parts.join('\n\n')
    : `Prepare execution for Work Item ${workItem.id}.`;
}

function readWorkItemPlanningMetadata(workItem: CoreWorkItemRecord): {
  openQuestions: string[];
} {
  const workTriage = isRecord(workItem.metadata.workTriage)
    ? workItem.metadata.workTriage
    : {};
  const workIntake = isRecord(workItem.metadata.workIntake)
    ? workItem.metadata.workIntake
    : {};

  return {
    openQuestions:
      readMetadataStringArray(workTriage.openQuestions)
      ?? readMetadataStringArray(workIntake.openQuestions)
      ?? [],
  };
}

function isWorkItemTriageStatus(status: string): status is WorkItemTriageStatus {
  return (WORK_ITEM_TRIAGE_STATUS_VALUES as readonly string[]).includes(status);
}

function readMetadataStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return null;
  }

  return value.map((item) => item.trim()).filter((item) => item.length > 0);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function rejected<T>(
  code: 'E_SCHEMA_INVALID' | 'E_PRECHECK_FAILED',
  message: string,
  details?: unknown,
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
