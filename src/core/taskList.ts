import type {
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalStatus,
  CoreTaskRecord,
  CoreTaskStatus,
} from './types.js';

export interface CoreTaskListQuery {
  statuses?: CoreTaskStatus[];
  conversationIds?: string[];
  parentTaskIds?: string[];
  ownerActorIds?: string[];
  orchestratorActorIds?: string[];
  assignedActorIds?: string[];
  approvalStatuses?: CoreApprovalStatus[];
  approvalDecisionActions?: CoreApprovalDecisionAction[];
  limit?: number;
}

function compareByUpdatedAt(
  left: { updatedAt: string; id: string },
  right: { updatedAt: string; id: string },
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return left.id.localeCompare(right.id);
}

function matchesTaskQuery(
  task: CoreTaskRecord,
  query: CoreTaskListQuery,
): boolean {
  if (query.statuses && !query.statuses.includes(task.status)) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(task.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.parentTaskIds
    && !query.parentTaskIds.includes(task.parentTaskId ?? '')
  ) {
    return false;
  }
  if (
    query.ownerActorIds
    && !query.ownerActorIds.includes(task.ownerActorId)
  ) {
    return false;
  }
  if (
    query.orchestratorActorIds
    && !query.orchestratorActorIds.includes(task.orchestratorActorId ?? '')
  ) {
    return false;
  }
  if (
    query.assignedActorIds
    && !task.assignedActorIds.some((actorId) => query.assignedActorIds?.includes(actorId))
  ) {
    return false;
  }
  if (
    query.approvalStatuses
    && !query.approvalStatuses.includes(task.approval.status)
  ) {
    return false;
  }
  if (
    query.approvalDecisionActions
    && (
      task.approval.decisionAction === null
      || !query.approvalDecisionActions.includes(task.approval.decisionAction)
    )
  ) {
    return false;
  }
  return true;
}

export function listTasks(
  core: CatsCoreState,
  query: CoreTaskListQuery = {},
): CoreTaskRecord[] {
  return core.tasks
    .filter((task) => matchesTaskQuery(task, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
