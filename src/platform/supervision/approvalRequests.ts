import {
  upsertCoreApprovalBinding,
  upsertCoreTask,
  writeApprovalDecision,
} from '../../core/model/index.js';
import { CoreNotFoundError } from '../../core/errors.js';
import type {
  CatsCoreState,
  CoreApprovalBindingRecord,
  CoreTaskRecord,
} from '../../core/types.js';

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
