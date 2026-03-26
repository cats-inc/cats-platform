import { buildApprovalQueue } from './model/index.js';
import {
  deriveCoreGovernanceSummary,
  deriveCoreWorkflowSummary,
} from './governance.js';
import {
  buildCoreTaskRecoveryView,
  type CoreTaskRecoveryView,
} from './recovery.js';
import type {
  CatsCoreState,
  CoreApprovalQueueItem,
  CoreCheckpointRecord,
  CoreGovernanceSummary,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkflowSummary,
} from './types.js';

export interface CoreTaskInspectionCounts {
  runs: number;
  outcomes: number;
  checkpoints: number;
  traces: number;
  activities: number;
}

export interface CoreTaskInspectionView {
  approvalQueueItem: CoreApprovalQueueItem | null;
  latestRun: CoreRunRecord | null;
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  counts: CoreTaskInspectionCounts;
}

function compareUpdatedDesc(
  left:
    | Pick<CoreRunRecord, 'updatedAt'>
    | Pick<CoreOrchestrationOutcomeRecord, 'updatedAt'>
    | Pick<CoreCheckpointRecord, 'updatedAt'>
    | Pick<CoreTraceRecord, 'createdAt'>,
  right:
    | Pick<CoreRunRecord, 'updatedAt'>
    | Pick<CoreOrchestrationOutcomeRecord, 'updatedAt'>
    | Pick<CoreCheckpointRecord, 'updatedAt'>
    | Pick<CoreTraceRecord, 'createdAt'>,
): number {
  const leftTimestamp = 'updatedAt' in left ? left.updatedAt : left.createdAt;
  const rightTimestamp = 'updatedAt' in right ? right.updatedAt : right.createdAt;
  return rightTimestamp.localeCompare(leftTimestamp);
}

function findLatestRun(
  core: CatsCoreState,
  taskId: string,
): CoreRunRecord | null {
  return core.runs
    .filter((candidate) => candidate.taskId === taskId)
    .sort(compareUpdatedDesc)[0] ?? null;
}

function findLatestOutcome(
  core: CatsCoreState,
  taskId: string,
  latestRun: CoreRunRecord | null,
): CoreOrchestrationOutcomeRecord | null {
  const runScoped = latestRun
    ? core.outcomes.filter((candidate) => candidate.runId === latestRun.id)
    : [];
  const taskScoped = core.outcomes.filter((candidate) => candidate.taskId === taskId);
  return [...runScoped, ...taskScoped]
    .sort(compareUpdatedDesc)[0] ?? null;
}

function findLatestCheckpoint(
  core: CatsCoreState,
  taskId: string,
  latestRun: CoreRunRecord | null,
): CoreCheckpointRecord | null {
  const runScoped = latestRun
    ? core.checkpoints.filter((candidate) => candidate.runId === latestRun.id)
    : [];
  const taskScoped = core.checkpoints.filter((candidate) => candidate.taskId === taskId);
  return [...runScoped, ...taskScoped]
    .sort(compareUpdatedDesc)[0] ?? null;
}

export function buildCoreTaskInspectionView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskInspectionView {
  const latestRun = findLatestRun(core, task.id);
  const latestOutcome = findLatestOutcome(core, task.id, latestRun);
  const latestCheckpoint = findLatestCheckpoint(core, task.id, latestRun);
  const approvalQueueItem = buildApprovalQueue(core).find((candidate) => candidate.taskId === task.id)
    ?? null;
  const traces = core.traces.filter((candidate) => candidate.taskId === task.id);
  const activities = core.activities.filter((candidate) => candidate.taskId === task.id);

  return {
    approvalQueueItem,
    latestRun,
    latestOutcome,
    latestCheckpoint,
    governanceSummary: deriveCoreGovernanceSummary(task, latestRun),
    workflowSummary: deriveCoreWorkflowSummary(latestRun),
    recovery: buildCoreTaskRecoveryView(core, task),
    counts: {
      runs: core.runs.filter((candidate) => candidate.taskId === task.id).length,
      outcomes: core.outcomes.filter((candidate) => candidate.taskId === task.id).length,
      checkpoints: core.checkpoints.filter((candidate) => candidate.taskId === task.id).length,
      traces: traces.length,
      activities: activities.length,
    },
  };
}
