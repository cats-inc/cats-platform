import type { CoreApprovalDecisionAction } from './types.js';

export interface CoreTaskActionEnvelope {
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}

export function buildTaskApprovalActionEnvelope(
  taskId: string,
  action: CoreApprovalDecisionAction,
): CoreTaskActionEnvelope {
  return {
    method: 'POST',
    path: '/api/core/approvals',
    body: {
      taskId,
      status: action === 'approve' ? 'approved' : 'rejected',
      action,
    },
  };
}

export function buildTaskOperatorActionEnvelope(input: {
  action: 'retry' | 'acknowledge';
  taskId: string;
  runId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
}): CoreTaskActionEnvelope {
  return {
    method: 'POST',
    path: '/api/core/operator-actions',
    body: {
      action: input.action,
      taskId: input.taskId,
      runId: input.runId,
      checkpointId: input.checkpointId,
      outcomeId: input.outcomeId,
    },
  };
}
