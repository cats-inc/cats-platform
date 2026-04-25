import {
  upsertCoreApprovalBinding,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../../core/model/index.js';
import { CoreConflictError, CoreNotFoundError } from '../../core/errors.js';
import type {
  CatsCoreState,
  CoreApprovalBindingRecord,
  CoreTaskRecord,
} from '../../core/types.js';
import type {
  RunApprovalRequestState,
} from './runState.js';
import {
  applyApprovalDenied,
  deriveRunState,
  writeRunStateMetadata,
} from './runState.js';
import type { SupervisionFallbackPolicy } from './contracts.js';

export interface PersistSupervisionApprovalRequestInput {
  core: CatsCoreState;
  runId: string;
  approvalRequestId: string;
  actionId: string;
  toolName: string;
  summary: string;
  requestedByActorId: string | null;
  requestedForActorId?: string;
  now?: Date;
}

export interface PersistSupervisionApprovalRequestResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
  approvalBinding: CoreApprovalBindingRecord;
  created: boolean;
}

export interface ApplySupervisionApprovalDecisionInput {
  core: CatsCoreState;
  approvalTaskId: string;
  fallbackPolicy: SupervisionFallbackPolicy;
  now?: Date;
}

export interface ApplySupervisionApprovalDecisionResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
  approvalBinding: CoreApprovalBindingRecord;
  runId: string;
  approvalRequest: RunApprovalRequestState;
}

export function persistSupervisionApprovalRequest(
  input: PersistSupervisionApprovalRequestInput,
): PersistSupervisionApprovalRequestResult {
  const now = input.now ?? new Date();
  const run = input.core.runs.find((candidate) => candidate.id === input.runId) ?? null;

  if (!run) {
    throw new CoreNotFoundError(`Run not found: ${input.runId}`, 'run_not_found');
  }

  const stableId = buildSupervisionApprovalStableId(input);
  const taskResult = upsertCoreTask(
    input.core,
    {
      id: `task-supervision-approval-${stableId}`,
      title: `Approval required for ${input.toolName}`,
      status: 'pending_approval',
      conversationId: run.conversationId,
      parentTaskId: run.taskId,
      ownerActorId: input.requestedForActorId ?? input.core.ownerProfile.actorId,
      orchestratorActorId: input.requestedByActorId,
      summary: input.summary,
      metadata: {
        supervisionApproval: {
          source: 'supervision_tool_boundary',
          runId: input.runId,
          actionId: input.actionId,
          approvalRequestId: input.approvalRequestId,
          toolName: input.toolName,
        },
      },
    },
    now,
  );
  const approvalResult = taskResult.task.approval.status === 'pending'
    ? taskResult
    : writeApprovalDecision(
      taskResult.core,
      {
        taskId: taskResult.task.id,
        status: 'pending',
        requestedByActorId: input.requestedByActorId,
      },
      now,
    );
  const bindingResult = upsertCoreApprovalBinding(
    approvalResult.core,
    {
      id: `approval-binding-supervision-${stableId}`,
      kind: 'owner_decision',
      approvalTaskId: approvalResult.task.id,
      subjectKind: 'run',
      subjectId: run.id,
      conversationId: run.conversationId,
      requestedByActorId: input.requestedByActorId,
      requestedForActorId: input.requestedForActorId ?? input.core.ownerProfile.actorId,
      metadata: {
        supervisionApproval: {
          source: 'supervision_tool_boundary',
          runId: input.runId,
          actionId: input.actionId,
          approvalRequestId: input.approvalRequestId,
          toolName: input.toolName,
        },
      },
    },
    now,
  );

  return {
    core: bindingResult.core,
    task: approvalResult.task,
    approvalBinding: bindingResult.approvalBinding,
    created: taskResult.created || bindingResult.created,
  };
}

export function applySupervisionApprovalDecision(
  input: ApplySupervisionApprovalDecisionInput,
): ApplySupervisionApprovalDecisionResult {
  const now = input.now ?? new Date();
  const task = input.core.tasks.find((candidate) => candidate.id === input.approvalTaskId) ?? null;
  const approvalBinding = input.core.approvalBindings.find((candidate) =>
    candidate.approvalTaskId === input.approvalTaskId &&
    readSupervisionApprovalMetadata(candidate.metadata) !== null) ?? null;

  if (!task) {
    throw new CoreNotFoundError(
      `Approval task not found: ${input.approvalTaskId}`,
      'task_not_found',
    );
  }
  if (!approvalBinding) {
    throw new CoreNotFoundError(
      `Supervision approval binding not found: ${input.approvalTaskId}`,
      'approval_binding_not_found',
    );
  }

  const metadata = readSupervisionApprovalMetadata(approvalBinding.metadata);
  if (!metadata) {
    throw new CoreConflictError(
      `Approval binding is not a supervision request: ${approvalBinding.id}`,
      'approval_binding_invalid',
    );
  }

  const run = input.core.runs.find((candidate) => candidate.id === metadata.runId) ?? null;
  if (!run) {
    throw new CoreNotFoundError(`Run not found: ${metadata.runId}`, 'run_not_found');
  }

  const approvalRequest: RunApprovalRequestState = {
    requestId: metadata.approvalRequestId,
    state: mapApprovalTaskStatus(task),
    gating: true,
  };
  const evaluation = approvalRequest.state === 'denied'
    ? applyApprovalDenied({
      current: {
        lifecycle: toLifecycle(run.status),
        approvalRequests: [{
          ...approvalRequest,
          state: 'pending',
        }],
      },
      requestId: approvalRequest.requestId,
      fallbackPolicy: input.fallbackPolicy,
    })
    : deriveRunState({
      lifecycle: toLifecycle(run.status),
      approvalRequests: [approvalRequest],
    });
  const nextStatus = evaluation.primaryState === 'failed'
    ? 'failed'
    : run.status;
  const next = upsertCoreRun(
    input.core,
    {
      id: run.id,
      title: run.title,
      status: nextStatus,
      metadata: writeRunStateMetadata({
        metadata: run.metadata,
        evaluation,
        evaluatedAt: now.toISOString(),
      }),
    },
    now,
  );

  return {
    core: next.core,
    task,
    approvalBinding,
    runId: run.id,
    approvalRequest,
  };
}

function buildSupervisionApprovalStableId(
  input: Pick<
    PersistSupervisionApprovalRequestInput,
    'runId' | 'actionId' | 'approvalRequestId'
  >,
): string {
  return normalizeIdSegment(`${input.runId}-${input.actionId}-${input.approvalRequestId}`);
}

function normalizeIdSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized.length > 0 ? normalized : 'request';
}

function readSupervisionApprovalMetadata(metadata: unknown): {
  runId: string;
  actionId: string;
  approvalRequestId: string;
  toolName: string;
} | null {
  const supervisionApproval = asRecord(asRecord(metadata)?.supervisionApproval);
  const runId = readString(supervisionApproval?.runId);
  const actionId = readString(supervisionApproval?.actionId);
  const approvalRequestId = readString(supervisionApproval?.approvalRequestId);
  const toolName = readString(supervisionApproval?.toolName);

  return runId && actionId && approvalRequestId && toolName
    ? {
        runId,
        actionId,
        approvalRequestId,
        toolName,
      }
    : null;
}

function mapApprovalTaskStatus(task: CoreTaskRecord): RunApprovalRequestState['state'] {
  switch (task.approval.status) {
    case 'pending':
      return 'pending';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'denied';
    case 'not_requested':
      throw new CoreConflictError(
        `Approval task has no pending decision: ${task.id}`,
        'approval_state_invalid',
      );
    default: {
      const exhaustive: never = task.approval.status;
      return exhaustive;
    }
  }
}

function toLifecycle(
  status: CatsCoreState['runs'][number]['status'],
): 'queued' | 'active' | 'completed' | 'failed' | 'cancelled' {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'running':
    case 'blocked':
      return 'active';
    case 'completed':
    case 'failed':
    case 'cancelled':
      return status;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
