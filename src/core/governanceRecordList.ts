import type {
  CatsCoreState,
  CoreApprovalBindingKind,
  CoreApprovalBindingRecord,
  CoreApprovalBindingSubjectKind,
} from './types.js';

export interface CoreApprovalBindingListQuery {
  ids?: string[];
  kinds?: CoreApprovalBindingKind[];
  subjectKinds?: CoreApprovalBindingSubjectKind[];
  approvalTaskIds?: string[];
  subjectIds?: string[];
  projectIds?: string[];
  workItemIds?: string[];
  conversationIds?: string[];
  requestedByActorIds?: string[];
  requestedForActorIds?: string[];
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

function matchesApprovalBindingQuery(
  approvalBinding: CoreApprovalBindingRecord,
  query: CoreApprovalBindingListQuery,
): boolean {
  if (query.ids && !query.ids.includes(approvalBinding.id)) {
    return false;
  }
  if (query.kinds && !query.kinds.includes(approvalBinding.kind)) {
    return false;
  }
  if (
    query.subjectKinds
    && !query.subjectKinds.includes(approvalBinding.subjectKind)
  ) {
    return false;
  }
  if (
    query.approvalTaskIds
    && !query.approvalTaskIds.includes(approvalBinding.approvalTaskId)
  ) {
    return false;
  }
  if (
    query.subjectIds
    && !query.subjectIds.includes(approvalBinding.subjectId)
  ) {
    return false;
  }
  if (
    query.projectIds
    && !query.projectIds.includes(approvalBinding.projectId ?? '')
  ) {
    return false;
  }
  if (
    query.workItemIds
    && !query.workItemIds.includes(approvalBinding.workItemId ?? '')
  ) {
    return false;
  }
  if (
    query.conversationIds
    && !query.conversationIds.includes(approvalBinding.conversationId ?? '')
  ) {
    return false;
  }
  if (
    query.requestedByActorIds
    && !query.requestedByActorIds.includes(approvalBinding.requestedByActorId ?? '')
  ) {
    return false;
  }
  if (
    query.requestedForActorIds
    && !query.requestedForActorIds.includes(approvalBinding.requestedForActorId)
  ) {
    return false;
  }
  return true;
}

export function listApprovalBindings(
  core: CatsCoreState,
  query: CoreApprovalBindingListQuery = {},
): CoreApprovalBindingRecord[] {
  return core.approvalBindings
    .filter((approvalBinding) => matchesApprovalBindingQuery(approvalBinding, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
