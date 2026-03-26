import { buildApprovalQueue } from './model/index.js';
import {
  deriveCoreGovernanceSummary,
  deriveCoreWorkflowSummary,
} from './governance.js';
import {
  buildCoreTaskRecoveryView,
  type CoreTaskRecoveryView,
} from './recovery.js';
import {
  buildCoreTaskTimelineView,
  type CoreTaskTimelineItem,
} from './taskTimeline.js';
import {
  buildTaskRuntimeExecutionRequest,
  resolveTaskExecutionProduct,
  type TaskRuntimeExecutionRequest,
} from '../shared/taskExecutionBridge.js';
import {
  readTaskPlanningMetadataFromTask,
  resolveEffectiveTaskStrategy,
  type TaskExecutionProduct,
  type TaskPlanningTransfer,
} from '../shared/taskPlanning.js';
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

export interface CoreTaskInspectionFamilyMemberView {
  taskId: string;
  title: string;
  status: CoreTaskRecord['status'];
  conversationId: string | null;
  parentTaskId: string | null;
  assignedActorIds: string[];
  updatedAt: string;
}

export interface CoreTaskInspectionFamilyView {
  rootTaskId: string;
  depth: number;
  parent: CoreTaskInspectionFamilyMemberView | null;
  children: CoreTaskInspectionFamilyMemberView[];
  siblingCount: number;
  childCount: number;
  terminalChildCount: number;
  allChildrenTerminal: boolean;
  childStatusCounts: Record<CoreTaskRecord['status'], number>;
  convergenceStatus: CoreTaskRecord['status'] | null;
  convergedAt: string | null;
}

export interface CoreTaskInspectionPlanningView {
  strategyHint: string | null;
  acceptanceCriteria: string | null;
  strategyContext: Record<string, unknown> | null;
  dependsOnTaskIds: string[];
  productHint: TaskExecutionProduct | null;
  transfer: TaskPlanningTransfer | null;
  effectiveProduct: TaskExecutionProduct | null;
  effectiveStrategy: string | null;
}

export interface CoreTaskInspectionRuntimeBridgeView {
  product: TaskExecutionProduct | null;
  request: TaskRuntimeExecutionRequest;
}

export interface CoreTaskInspectionView {
  approvalQueueItem: CoreApprovalQueueItem | null;
  latestRun: CoreRunRecord | null;
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  latestTimelineItem: CoreTaskTimelineItem | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  family: CoreTaskInspectionFamilyView;
  planning: CoreTaskInspectionPlanningView;
  runtimeBridge: CoreTaskInspectionRuntimeBridgeView;
  counts: CoreTaskInspectionCounts;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
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

function buildFamilyMemberView(
  task: CoreTaskRecord,
): CoreTaskInspectionFamilyMemberView {
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    conversationId: task.conversationId,
    parentTaskId: task.parentTaskId ?? null,
    assignedActorIds: [...task.assignedActorIds],
    updatedAt: task.updatedAt,
  };
}

function isTerminalTaskStatus(
  status: CoreTaskRecord['status'],
): boolean {
  return status === 'completed'
    || status === 'blocked'
    || status === 'cancelled'
    || status === 'archived';
}

function buildChildStatusCounts(
  children: CoreTaskRecord[],
): Record<CoreTaskRecord['status'], number> {
  return children.reduce<Record<CoreTaskRecord['status'], number>>((counts, child) => {
    counts[child.status] += 1;
    return counts;
  }, {
    draft: 0,
    pending_approval: 0,
    approved: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    archived: 0,
  });
}

function compareTaskFamilyMemberDesc(
  left: CoreTaskRecord,
  right: CoreTaskRecord,
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }

  const createdComparison = right.createdAt.localeCompare(left.createdAt);
  if (createdComparison !== 0) {
    return createdComparison;
  }

  return left.id.localeCompare(right.id);
}

export function buildCoreTaskInspectionFamilyView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskInspectionFamilyView {
  let depth = 0;
  let rootTaskId = task.id;
  let cursor = task;

  while (cursor.parentTaskId) {
    const parent = core.tasks.find((candidate) => candidate.id === cursor.parentTaskId) ?? null;
    if (!parent) {
      rootTaskId = cursor.parentTaskId;
      break;
    }
    depth += 1;
    rootTaskId = parent.id;
    cursor = parent;
  }

  const parent = task.parentTaskId
    ? core.tasks.find((candidate) => candidate.id === task.parentTaskId) ?? null
    : null;
  const children = core.tasks
    .filter((candidate) => candidate.parentTaskId === task.id)
    .sort(compareTaskFamilyMemberDesc);
  const childStatusCounts = buildChildStatusCounts(children);
  const convergence = asRecord(asRecord(asRecord(task.metadata)?.taskLifecycle)?.convergence);

  return {
    rootTaskId,
    depth,
    parent: parent ? buildFamilyMemberView(parent) : null,
    children: children.map((child) => buildFamilyMemberView(child)),
    siblingCount: parent
      ? core.tasks.filter((candidate) =>
        candidate.parentTaskId === parent.id && candidate.id !== task.id).length
      : 0,
    childCount: children.length,
    terminalChildCount: children.filter((child) => isTerminalTaskStatus(child.status)).length,
    allChildrenTerminal: children.length > 0 && children.every((child) => isTerminalTaskStatus(child.status)),
    childStatusCounts,
    convergenceStatus: (() => {
      const status = readString(convergence?.status);
      return status === 'draft'
        || status === 'pending_approval'
        || status === 'approved'
        || status === 'in_progress'
        || status === 'blocked'
        || status === 'completed'
        || status === 'cancelled'
        || status === 'archived'
        ? status
        : null;
    })(),
    convergedAt: readString(convergence?.convergedAt),
  };
}

export function buildCoreTaskInspectionView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskInspectionView {
  const planning = readTaskPlanningMetadataFromTask(task);
  const effectiveProduct = resolveTaskExecutionProduct({ core, task });
  const latestRun = findLatestRun(core, task.id);
  const latestOutcome = findLatestOutcome(core, task.id, latestRun);
  const latestCheckpoint = findLatestCheckpoint(core, task.id, latestRun);
  const approvalQueueItem = buildApprovalQueue(core).find((candidate) => candidate.taskId === task.id)
    ?? null;
  const traces = core.traces.filter((candidate) => candidate.taskId === task.id);
  const activities = core.activities.filter((candidate) => candidate.taskId === task.id);
  const latestTimelineItem = buildCoreTaskTimelineView(core, task).items[0] ?? null;

  return {
    approvalQueueItem,
    latestRun,
    latestOutcome,
    latestCheckpoint,
    latestTimelineItem,
    governanceSummary: deriveCoreGovernanceSummary(task, latestRun),
    workflowSummary: deriveCoreWorkflowSummary(latestRun),
    recovery: buildCoreTaskRecoveryView(core, task),
    family: buildCoreTaskInspectionFamilyView(core, task),
    planning: {
      strategyHint: planning.strategyHint,
      acceptanceCriteria: planning.acceptanceCriteria,
      strategyContext: planning.strategyContext
        ? structuredClone(planning.strategyContext)
        : null,
      dependsOnTaskIds: [...planning.dependsOnTaskIds],
      productHint: planning.productHint,
      transfer: planning.transfer
        ? structuredClone(planning.transfer)
        : null,
      effectiveProduct,
      effectiveStrategy: resolveEffectiveTaskStrategy(effectiveProduct, planning),
    },
    runtimeBridge: {
      product: effectiveProduct,
      request: buildTaskRuntimeExecutionRequest({
        core,
        task,
        ...(effectiveProduct ? { product: effectiveProduct } : {}),
      }),
    },
    counts: {
      runs: core.runs.filter((candidate) => candidate.taskId === task.id).length,
      outcomes: core.outcomes.filter((candidate) => candidate.taskId === task.id).length,
      checkpoints: core.checkpoints.filter((candidate) => candidate.taskId === task.id).length,
      traces: traces.length,
      activities: activities.length,
    },
  };
}
