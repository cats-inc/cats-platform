import { createHash } from 'node:crypto';

import {
  appendCoreActivity,
  linkCoreWorkItemToTask,
  upsertCoreApprovalBinding,
  upsertCoreTask,
  writeApprovalDecision,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreTaskRecord, CoreWorkItemRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { SupervisedToolExecutor } from '../../../platform/supervision/toolBoundary.js';
import {
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  type WorkTaskCreateFromWorkItemInput,
  type WorkTaskCreateFromWorkItemResult,
  validateWorkTaskCreateFromWorkItemInput,
} from '../shared/workToolSurface.js';

const WORK_EXECUTION_METADATA_KEY = 'workExecution';
const WORK_EXECUTION_METADATA_VERSION = 1;

export interface WorkExecutionTaskDelegateOptions {
  coreStore: CoreStore;
  now?: () => Date;
}

export interface WorkExecutionTaskMutationContext {
  actorRef: string;
  actionId?: string;
  runId?: string;
}

export interface WorkExecutionTaskDelegate {
  createTaskFromWorkItem(
    input: WorkTaskCreateFromWorkItemInput,
    context: WorkExecutionTaskMutationContext,
  ): Promise<ToolResult<WorkTaskCreateFromWorkItemResult>>;
}

export interface WorkExecutionTaskToolExecutors {
  [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL]: SupervisedToolExecutor<
    WorkTaskCreateFromWorkItemInput,
    WorkTaskCreateFromWorkItemResult
  >;
}

export function createWorkExecutionTaskDelegate(
  options: WorkExecutionTaskDelegateOptions,
): WorkExecutionTaskDelegate {
  const now = options.now ?? (() => new Date());

  return {
    async createTaskFromWorkItem(input, context) {
      return createTaskFromWorkItem(options.coreStore, input, context, now);
    },
  };
}

export function createWorkExecutionTaskToolExecutors(
  delegate: WorkExecutionTaskDelegate,
): WorkExecutionTaskToolExecutors {
  return {
    [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL]: (input, context) =>
      delegate.createTaskFromWorkItem(input, context),
  };
}

export async function createTaskFromWorkItem(
  coreStore: CoreStore,
  input: WorkTaskCreateFromWorkItemInput,
  context: WorkExecutionTaskMutationContext,
  now: () => Date = () => new Date(),
): Promise<ToolResult<WorkTaskCreateFromWorkItemResult>> {
  const validationErrors = validateWorkTaskCreateFromWorkItemInput(input);
  if (validationErrors.length > 0) {
    return rejected('Invalid work.task.create_from_work_item input.', validationErrors);
  }

  const createdAt = now();
  const workItemId = input.workItemId.trim();
  const idempotencyKey = createTaskFromWorkItemIdempotencyKey(input);
  const taskId = createTaskFromWorkItemTaskId(idempotencyKey);
  let task: CoreTaskRecord | null = null;
  let created = false;
  let linked = false;

  try {
    const persisted = await coreStore.updateCore((core) => {
      const workItem = core.workItems.find((candidate) => candidate.id === workItemId) ?? null;
      if (workItem === null) {
        throw new WorkExecutionTaskPrecheckError(`No Work Item found for id ${workItemId}.`);
      }
      assertWorkItemExitedIntakeBoundary(workItem, context);
      if (workItem.status !== 'ready') {
        throw new WorkExecutionTaskPrecheckError(
          `Work Item ${workItemId} must be ready before Task creation; current status is `
          + `${workItem.status}.`,
        );
      }
      if (workItem.taskId) {
        task = readLinkedPendingTask(core, workItem);
        created = false;
        linked = false;
        return core;
      }

      const existingTask = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
      const taskWrite = existingTask === null
        ? upsertCoreTask(
          core,
          {
            id: taskId,
            title: input.title?.trim() || workItem.title,
            status: 'pending_approval',
            conversationId: workItem.conversationId,
            ownerActorId: workItem.ownerActorId,
            orchestratorActorId: context.actorRef,
            assignedActorIds: resolveExecutionTaskAssignedActors(workItem, context),
            summary: input.summary?.trim() || workItem.summary,
            metadata: {
              [WORK_EXECUTION_METADATA_KEY]: buildWorkExecutionTaskMetadata(
                workItem,
                input,
                context,
                idempotencyKey,
                createdAt,
              ),
            },
          },
          createdAt,
        )
        : { core, task: existingTask, created: false };
      const approvalWrite = writeApprovalDecision(
        taskWrite.core,
        {
          taskId: taskWrite.task.id,
          status: 'pending',
          requestedByActorId: context.actorRef,
          notes: input.approvalNote ?? `Approve execution Task for Work Item ${workItem.id}.`,
        },
        createdAt,
      );
      const bindingWrite = upsertCoreApprovalBinding(
        approvalWrite.core,
        {
          id: createTaskApprovalBindingId(taskWrite.task.id),
          kind: 'owner_decision',
          approvalTaskId: taskWrite.task.id,
          subjectKind: 'work_item',
          subjectId: workItem.id,
          projectId: workItem.projectId,
          workItemId: workItem.id,
          conversationId: workItem.conversationId,
          requestedByActorId: context.actorRef,
          requestedForActorId: workItem.ownerActorId,
          metadata: {
            [WORK_EXECUTION_METADATA_KEY]: {
              schemaVersion: WORK_EXECUTION_METADATA_VERSION,
              phase: 'execution_preparation',
              toolName: WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
              idempotencyKey,
              actionId: context.actionId ?? null,
              runId: context.runId ?? null,
              workItemId: workItem.id,
              taskId: taskWrite.task.id,
            },
          },
        },
        createdAt,
      );
      const linkWrite = linkCoreWorkItemToTask(
        bindingWrite.core,
        {
          workItemId: workItem.id,
          taskId: taskWrite.task.id,
        },
        createdAt,
      );
      const activityWrite = appendTaskCreationActivityIfMissing(
        linkWrite.core,
        workItem,
        approvalWrite.task,
        context,
        idempotencyKey,
        createdAt,
      );

      task = approvalWrite.task;
      created = taskWrite.created;
      linked = linkWrite.linked;
      return activityWrite.core;
    });

    task = task ?? persisted.tasks.find((candidate) => candidate.id === taskId) ?? null;
    if (task === null) {
      return rejected(
        `Created Task was not found after write: ${taskId}.`,
        undefined,
        'E_PRECHECK_FAILED',
      );
    }
    if (task.status !== 'pending_approval' || task.approval.status !== 'pending') {
      return rejected(
        `Task ${task.id} is not waiting for owner approval.`,
        {
          taskId: task.id,
          taskStatus: task.status,
          approvalStatus: task.approval.status,
        },
        'E_PRECHECK_FAILED',
      );
    }

    return {
      status: 'applied',
      result: {
        workItemId,
        taskId: task.id,
        created,
        linked,
        taskStatus: 'pending_approval',
        approvalStatus: 'pending',
      },
    };
  } catch (error) {
    return rejected(
      error instanceof Error ? error.message : 'Work Task creation failed.',
      undefined,
      'E_PRECHECK_FAILED',
    );
  }
}

function readLinkedPendingTask(
  core: CatsCoreState,
  workItem: CoreWorkItemRecord,
): CoreTaskRecord {
  const existingTask = core.tasks.find((candidate) => candidate.id === workItem.taskId) ?? null;
  if (existingTask === null) {
    throw new WorkExecutionTaskPrecheckError(
      `Work Item ${workItem.id} is linked to missing Task ${workItem.taskId}.`,
    );
  }
  if (existingTask.status !== 'pending_approval' || existingTask.approval.status !== 'pending') {
    throw new WorkExecutionTaskPrecheckError(
      `Work Item ${workItem.id} is already linked to Task ${existingTask.id} with status `
      + `${existingTask.status}.`,
    );
  }

  return existingTask;
}

function resolveExecutionTaskAssignedActors(
  workItem: CoreWorkItemRecord,
  context: WorkExecutionTaskMutationContext,
): string[] {
  return workItem.assignedActorIds.length > 0
    ? workItem.assignedActorIds
    : [context.actorRef];
}

function assertWorkItemExitedIntakeBoundary(
  workItem: CoreWorkItemRecord,
  context: WorkExecutionTaskMutationContext,
): void {
  const intakeBoundary = readWorkIntakeBoundary(workItem.metadata);
  if (intakeBoundary === null) {
    return;
  }
  if (context.runId && intakeBoundary.runId === context.runId) {
    throw new WorkExecutionTaskPrecheckError(
      `Work Item ${workItem.id} was captured in the same supervised run; wait for an `
      + 'owner-visible acknowledgement boundary before creating an execution Task.',
    );
  }
  if (context.actionId && intakeBoundary.actionId === context.actionId) {
    throw new WorkExecutionTaskPrecheckError(
      `Work Item ${workItem.id} was captured in the same supervised action; wait for an `
      + 'owner-visible acknowledgement boundary before creating an execution Task.',
    );
  }
}

function readWorkIntakeBoundary(metadata: unknown): {
  actionId: string | null;
  runId: string | null;
} | null {
  const workIntake = isRecord(metadata) && isRecord(metadata.workIntake)
    ? metadata.workIntake
    : null;
  if (workIntake === null) {
    return null;
  }

  return {
    actionId: readMetadataString(workIntake.actionId),
    runId: readMetadataString(workIntake.runId),
  };
}

function buildWorkExecutionTaskMetadata(
  workItem: CoreWorkItemRecord,
  input: WorkTaskCreateFromWorkItemInput,
  context: WorkExecutionTaskMutationContext,
  idempotencyKey: string,
  createdAt: Date,
): Record<string, unknown> {
  return {
    schemaVersion: WORK_EXECUTION_METADATA_VERSION,
    phase: 'execution_preparation',
    toolName: WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
    idempotencyKey,
    producingActorRef: context.actorRef,
    actionId: context.actionId ?? null,
    runId: context.runId ?? null,
    createdAt: createdAt.toISOString(),
    workItemId: workItem.id,
    projectId: workItem.projectId,
    sourceWorkItem: {
      title: workItem.title,
      status: workItem.status,
      createdAt: workItem.createdAt,
      metadata: structuredClone(workItem.metadata),
    },
    requestedTitle: input.title?.trim() || null,
    requestedSummary: input.summary?.trim() || null,
    approvalNote: input.approvalNote?.trim() || null,
  };
}

function appendTaskCreationActivityIfMissing(
  core: CatsCoreState,
  workItem: CoreWorkItemRecord,
  task: CoreTaskRecord,
  context: WorkExecutionTaskMutationContext,
  idempotencyKey: string,
  createdAt: Date,
): { core: CatsCoreState } {
  const activityId = createTaskCreationActivityId(task.id);
  if (core.activities.some((activity) => activity.id === activityId)) {
    return { core };
  }

  return appendCoreActivity(
    core,
    {
      id: activityId,
      kind: 'approval_requested',
      actorId: context.actorRef,
      projectId: workItem.projectId,
      workItemId: workItem.id,
      conversationId: workItem.conversationId,
      taskId: task.id,
      message: `Requested execution approval for Work Item: ${workItem.title}`,
      metadata: {
        [WORK_EXECUTION_METADATA_KEY]: {
          schemaVersion: WORK_EXECUTION_METADATA_VERSION,
          phase: 'execution_preparation',
          toolName: WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
          idempotencyKey,
          actionId: context.actionId ?? null,
          runId: context.runId ?? null,
          workItemId: workItem.id,
          taskId: task.id,
        },
      },
    },
    createdAt,
  );
}

function createTaskFromWorkItemIdempotencyKey(input: WorkTaskCreateFromWorkItemInput): string {
  return [
    WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
    input.workItemId.trim(),
    input.title?.trim().toLowerCase() ?? '',
    input.summary?.trim().toLowerCase() ?? '',
  ].join('\n');
}

function createTaskFromWorkItemTaskId(idempotencyKey: string): string {
  return `task-work-item-${stableHash(idempotencyKey).slice(0, 20)}`;
}

function createTaskApprovalBindingId(taskId: string): string {
  return `approval-binding-${taskId}`;
}

function createTaskCreationActivityId(taskId: string): string {
  return `activity-${taskId}-approval-requested`;
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readMetadataString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

class WorkExecutionTaskPrecheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkExecutionTaskPrecheckError';
  }
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
