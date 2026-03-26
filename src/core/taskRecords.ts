import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreApprovalBindingRecord,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
} from './types.js';

export interface CoreTaskRecordsView {
  taskId: string;
  conversationId: string | null;
  approvalBindings: CoreApprovalBindingRecord[];
  runs: CoreRunRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  activities: CoreActivityRecord[];
}

function compareByUpdatedDesc(
  left:
    | CoreApprovalBindingRecord
    | CoreRunRecord
    | CoreCheckpointRecord
    | CoreOrchestrationOutcomeRecord,
  right:
    | CoreApprovalBindingRecord
    | CoreRunRecord
    | CoreCheckpointRecord
    | CoreOrchestrationOutcomeRecord,
): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function compareByCreatedDesc(
  left: CoreTraceRecord | CoreActivityRecord,
  right: CoreTraceRecord | CoreActivityRecord,
): number {
  return right.createdAt.localeCompare(left.createdAt);
}

export function buildCoreTaskRecordsView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskRecordsView {
  return {
    taskId: task.id,
    conversationId: task.conversationId,
    approvalBindings: core.approvalBindings
      .filter((candidate) => candidate.approvalTaskId === task.id)
      .sort(compareByUpdatedDesc),
    runs: core.runs
      .filter((candidate) => candidate.taskId === task.id)
      .sort(compareByUpdatedDesc),
    traces: core.traces
      .filter((candidate) => candidate.taskId === task.id)
      .sort(compareByCreatedDesc),
    checkpoints: core.checkpoints
      .filter((candidate) => candidate.taskId === task.id)
      .sort(compareByUpdatedDesc),
    outcomes: core.outcomes
      .filter((candidate) => candidate.taskId === task.id)
      .sort(compareByUpdatedDesc),
    activities: core.activities
      .filter((candidate) => candidate.taskId === task.id)
      .sort(compareByCreatedDesc),
  };
}
