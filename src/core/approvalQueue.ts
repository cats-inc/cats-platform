import type {
  CatsCoreState,
  CoreApprovalDecisionOptionRecord,
  CoreApprovalQueueItem,
} from './types.js';

const DEFAULT_APPROVAL_DECISION_OPTIONS: CoreApprovalDecisionOptionRecord[] = [
  {
    action: 'approve',
    label: 'Approve',
    description: 'Allow the orchestrator plan to proceed.',
  },
  {
    action: 'reroute',
    label: 'Reroute',
    description: 'Send the plan back for a different handoff or dispatch path.',
  },
  {
    action: 'reject',
    label: 'Reject',
    description: 'Do not allow the plan to proceed.',
  },
];

export function buildApprovalQueue(core: CatsCoreState): CoreApprovalQueueItem[] {
  return core.tasks
    .filter(
      (task) =>
        task.status === 'pending_approval' && task.approval.status === 'pending',
    )
    .map((task) => ({
      id: `approval-${task.id}`,
      kind: 'dispatch_plan',
      taskId: task.id,
      conversationId: task.conversationId,
      status: task.approval.status,
      title: task.title,
      summary: task.summary,
      requestedByActorId: task.orchestratorActorId,
      requestedForActorId: task.ownerActorId,
      requestedAt: task.approval.requestedAt,
      decidedAt: task.approval.decidedAt,
      decidedByActorId: task.approval.decidedByActorId,
      decisionAction: task.approval.decisionAction,
      notes: task.approval.notes,
      requiresOwnerDecision: task.approval.status === 'pending',
      decisionOptions: DEFAULT_APPROVAL_DECISION_OPTIONS.map((option) => ({
        ...option,
      })),
    }));
}
