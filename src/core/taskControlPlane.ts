import { buildApprovalQueue } from './approvalQueue.js';
import {
  buildCoreTaskRecoveryView,
  CORE_TASK_RECOVERY_REPLAY_PHASES,
  CORE_TASK_RECOVERY_REPLAY_SOURCES,
  CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
  CORE_TASK_RECOVERY_RESUME_REASONS,
  type CoreTaskRecoveryReplayPhase,
  type CoreTaskRecoveryReplaySource,
  type CoreTaskRecoveryReplayTrigger,
  type CoreTaskRecoveryResumeReason,
  type CoreTaskRecoveryView,
} from './recovery.js';
import {
  buildCoreTaskInspectionView,
  type CoreTaskInspectionFamilyView,
  type CoreTaskInspectionPlanningView,
  type CoreTaskInspectionRuntimeBridgeView,
} from './taskInspection.js';
import {
  buildTaskApprovalActionEnvelope,
  buildTaskOperatorActionEnvelope,
  type CoreTaskActionEnvelope,
} from './taskActionEnvelopes.js';
import {
  CORE_TASK_TIMELINE_CATEGORIES,
  CORE_TASK_TIMELINE_ITEM_KINDS,
  type CoreTaskTimelineCategory,
  type CoreTaskTimelineItem,
  type CoreTaskTimelineItemKind,
} from './taskTimeline.js';
import {
  applyCoreTaskViewLimit,
  buildCoreTaskStatusCounts,
  countCoreTaskViewConversations,
  type CoreTaskViewCommonQuery,
} from './taskViewQuery.js';
import {
  asRecord,
  buildAttention,
  buildRuntimeDeliveryIntent,
  buildWorkflowContinuationState,
  compareControlPlaneViews,
  hasVisibleControlPlaneSignal,
  matchesControlPlaneListOptions,
  readContinuationSource,
  readEffectiveWorkflowConvergeTargetId,
  readEffectiveWorkflowReviewRequired,
  readEffectiveWorkflowShape,
  readEffectiveWorkflowUnresolvedTargets,
  readExecutionProduct,
  readLatestReplayPhase,
  readLatestReplayResumeReason,
  readLatestReplaySource,
  readLatestReplayTrigger,
  readMetadataRecord,
  readRequestedStrategy,
  readString,
  resolveLatestWorkflowRecommendation,
} from './taskControlPlaneProjection.js';
import { summarizeCoreTaskControlPlaneViewsWithSupport } from './taskControlPlaneSummary.js';
import {
  WORKFLOW_CONTINUATION_REPLAY_SOURCES,
  WORKFLOW_CONTINUATION_REPLAY_BLOCKED_REASONS,
  type WorkflowContinuationReplayBlockedReason,
  type WorkflowContinuationReplaySource,
} from '../platform/orchestration/workflowContinuationReplay.js';
import type {
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalQueueItem,
  CoreApprovalStatus,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
  CoreGovernanceSummary,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreRuntimeDeliveryAction,
  CoreTaskRecord,
  CoreWorkflowSummary,
} from './types.js';
import type { TaskExecutionProduct } from '../shared/taskPlanning.js';

export type CoreTaskControlPlaneSeverity =
  | 'muted'
  | 'progress'
  | 'attention'
  | 'error'
  | 'success';

export type CoreTaskControlPlaneReason =
  | 'approval_pending'
  | 'run_blocked'
  | 'run_failed'
  | 'retry_available'
  | 'workflow_review_required'
  | 'child_tasks_in_progress';

export type CoreTaskWorkflowShape = 'sequential' | 'concurrent' | 'converge';

export const CORE_TASK_CONTROL_PLANE_SEVERITIES = [
  'muted',
  'progress',
  'attention',
  'error',
  'success',
] as const satisfies readonly CoreTaskControlPlaneSeverity[];

export const CORE_TASK_CONTROL_PLANE_REASONS = [
  'approval_pending',
  'run_blocked',
  'run_failed',
  'retry_available',
  'workflow_review_required',
  'child_tasks_in_progress',
] as const satisfies readonly CoreTaskControlPlaneReason[];

export const CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS = [
  'approve',
  'reroute',
  'reject',
  'retry',
  'acknowledge',
  'wait',
  'complete',
] as const satisfies readonly CoreTaskControlPlaneNextAction['kind'][];

export const CORE_TASK_CONTROL_PLANE_DELIVERY_MODES = [
  'artifact_only',
  'commit_only',
  'push_branch',
  'pr_with_checks',
  'deploy_preview',
] as const satisfies readonly CoreDeliveryMode[];

export const CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS = [
  'prepare_artifact',
  'create_commit',
  'push_branch',
  'open_pull_request',
  'wait_for_checks',
  'publish_preview',
] as const satisfies readonly CoreRuntimeDeliveryAction[];

export const CORE_TASK_WORKFLOW_SHAPES = [
  'sequential',
  'concurrent',
  'converge',
] as const satisfies readonly CoreTaskWorkflowShape[];

const TASK_EXECUTION_PRODUCTS = [
  'chat',
  'work',
  'code',
] as const satisfies readonly TaskExecutionProduct[];

export const CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS =
  WORKFLOW_CONTINUATION_REPLAY_BLOCKED_REASONS;

export interface CoreTaskControlPlaneApprovalAction {
  kind: CoreApprovalDecisionAction;
  label: string;
  description: string;
  disabled: boolean;
  status: CoreApprovalStatus;
  action: CoreTaskActionEnvelope;
}

export interface CoreTaskControlPlaneIncidentAction {
  kind: 'retry' | 'acknowledge';
  label: string;
  description: string;
  disabled: boolean;
  statusLabel: string | null;
  action: CoreTaskActionEnvelope;
}

export interface CoreTaskControlPlaneNextAction {
  kind: 'approve' | 'reroute' | 'reject' | 'retry' | 'acknowledge' | 'wait' | 'complete';
  label: string;
  blocking: boolean;
  action: CoreTaskActionEnvelope | null;
}

export interface CoreTaskControlPlaneAttention {
  severity: CoreTaskControlPlaneSeverity;
  reasons: CoreTaskControlPlaneReason[];
  needsOperatorAttention: boolean;
}

export interface CoreTaskControlPlaneWorkflowRecommendationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
}

export interface CoreTaskControlPlaneWorkflowContinuationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
  laneId: string | null;
  sessionId: string | null;
}

export interface CoreTaskControlPlaneWorkflowRecommendationView {
  source: 'checkpoint' | 'boss_replan' | 'system_inference' | null;
  workflowShape: 'sequential' | 'concurrent' | 'converge' | null;
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  branchStrategy: string | null;
  rationale: string | null;
  reviewRequired: boolean;
  candidateTargets: CoreTaskControlPlaneWorkflowRecommendationTargetView[];
  unresolvedTargets: string[];
}

export interface CoreTaskControlPlaneWorkflowContinuationView {
  checkpointId: string | null;
  stageId: string | null;
  workflowShape: 'sequential' | 'concurrent' | 'converge' | null;
  sourceMessageId: string | null;
  sourceTurnId: string | null;
  sourceLaneId: string | null;
  sourceAssistantTurnId: string | null;
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  reviewRequired: boolean;
  convergeTargetId: string | null;
  blockedReason: WorkflowContinuationReplayBlockedReason | null;
  targets: CoreTaskControlPlaneWorkflowContinuationTargetView[];
  targetCount: number;
  targetNames: string[];
  unresolvedTargets: string[];
  replayState: 'ready' | 'in_progress' | 'failed' | null;
  replayTrigger: 'retry' | null;
  replayError: string | null;
  retryAvailable: boolean;
}

export interface CoreTaskControlPlaneRuntimeDeliveryIntentView {
  mode: CoreDeliveryMode | null;
  source: CoreEffectivePolicySource | null;
  rationale: string | null;
  gates: CoreDeliveryGate[];
  requestedActions: CoreRuntimeDeliveryAction[];
  strict: boolean;
  requiresOwnerDecision: boolean;
  approvalPending: boolean;
  channelId: string | null;
  containerId: string | null;
  conversationId: string | null;
  taskId: string | null;
  roomMode: string | null;
  transport: string | null;
  workflowStageId: string | null;
  workflowShape: string | null;
}

export interface CoreTaskControlPlaneView {
  taskId: string;
  containerId: string | null;
  conversationId: string | null;
  taskStatus: CoreTaskRecord['status'];
  lastUpdatedAt: string;
  latestRunId: string | null;
  latestCheckpointId: string | null;
  latestOutcomeId: string | null;
  latestTimelineItem: CoreTaskTimelineItem | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  family: CoreTaskInspectionFamilyView;
  planning: CoreTaskInspectionPlanningView;
  runtimeBridge: CoreTaskInspectionRuntimeBridgeView;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
  workflowContinuation: CoreTaskControlPlaneWorkflowContinuationView | null;
  runtimeDeliveryIntent: CoreTaskControlPlaneRuntimeDeliveryIntentView | null;
  approvalActions: CoreTaskControlPlaneApprovalAction[];
  incidentActions: CoreTaskControlPlaneIncidentAction[];
  nextActions: CoreTaskControlPlaneNextAction[];
  attention: CoreTaskControlPlaneAttention;
}

export interface CoreTaskControlPlaneListOptions extends CoreTaskViewCommonQuery {
  executionProducts?: TaskExecutionProduct[];
  requestedStrategies?: string[];
  severities?: CoreTaskControlPlaneSeverity[];
  reasons?: CoreTaskControlPlaneReason[];
  needsOperatorAttention?: boolean | null;
  nextActions?: CoreTaskControlPlaneNextAction['kind'][];
  deliveryModes?: CoreDeliveryMode[];
  deliveryActions?: CoreRuntimeDeliveryAction[];
  workflowStageIds?: string[];
  workflowShapes?: CoreTaskWorkflowShape[];
  workflowReviewRequired?: boolean | null;
  workflowConvergeTargetIds?: string[];
  sourceMessageIds?: string[];
  sourceTurnIds?: string[];
  sourceLaneIds?: string[];
  sourceAssistantTurnIds?: string[];
  workflowContinuationSources?: WorkflowContinuationReplaySource[];
  workflowContinuationBlockedReasons?: WorkflowContinuationReplayBlockedReason[];
  workflowUnresolvedTargets?: string[];
  hasUnresolvedWorkflowTargets?: boolean | null;
  latestReplaySources?: CoreTaskRecoveryReplaySource[];
  latestReplayTriggers?: CoreTaskRecoveryReplayTrigger[];
  latestReplayPhases?: CoreTaskRecoveryReplayPhase[];
  latestReplayResumeReasons?: CoreTaskRecoveryResumeReason[];
  latestTimelineCategories?: CoreTaskTimelineCategory[];
  latestTimelineKinds?: CoreTaskTimelineItemKind[];
  rootTaskIds?: string[];
  parentTaskIds?: string[];
  hasChildren?: boolean | null;
  hasActiveChildren?: boolean | null;
}

export interface CoreTaskControlPlaneListSummary {
  totalAvailable: number;
  matching: number;
  returned: number;
  conversationCount: number;
  needsOperatorAttentionCount: number;
  taskStatusCounts: Record<CoreTaskRecord['status'], number>;
  executionProductCounts: Record<TaskExecutionProduct, number>;
  requestedStrategyCounts: Record<string, number>;
  attentionSeverityCounts: Record<CoreTaskControlPlaneSeverity, number>;
  reasonCounts: Record<CoreTaskControlPlaneReason, number>;
  nextActionCounts: Record<CoreTaskControlPlaneNextAction['kind'], number>;
  deliveryModeCounts: Record<CoreDeliveryMode, number>;
  deliveryActionCounts: Record<CoreRuntimeDeliveryAction, number>;
  workflowStageCounts: Record<string, number>;
  workflowShapeCounts: Record<CoreTaskWorkflowShape, number>;
  workflowReviewRequiredCount: number;
  workflowConvergeTargetCount: number;
  workflowContinuationSourceCounts: Record<WorkflowContinuationReplaySource, number>;
  workflowContinuationBlockedReasonCounts: Record<WorkflowContinuationReplayBlockedReason, number>;
  withUnresolvedWorkflowTargetsCount: number;
  latestReplaySourceCounts: Record<CoreTaskRecoveryReplaySource, number>;
  latestReplayTriggerCounts: Record<CoreTaskRecoveryReplayTrigger, number>;
  latestReplayPhaseCounts: Record<CoreTaskRecoveryReplayPhase, number>;
  latestReplayResumeReasonCounts: Record<CoreTaskRecoveryResumeReason, number>;
  latestTimelineCategoryCounts: Record<CoreTaskTimelineCategory, number>;
  latestTimelineKindCounts: Record<CoreTaskTimelineItemKind, number>;
  withChildrenCount: number;
  withActiveChildrenCount: number;
}

function buildApprovalActions(
  approval: CoreApprovalQueueItem | null,
): CoreTaskControlPlaneApprovalAction[] {
  if (!approval || approval.status !== 'pending' || !approval.requiresOwnerDecision) {
    return [];
  }

  return approval.decisionOptions.map((option) => ({
    kind: option.action,
    label: option.label,
    description: option.description,
    disabled: false,
    status: approval.status,
    action: buildTaskApprovalActionEnvelope(approval.taskId, option.action),
  }));
}

function buildIncidentActions(input: {
  task: CoreTaskRecord;
  latestRun: CoreRunRecord | null;
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpointId: string | null;
  recovery: CoreTaskRecoveryView;
}): CoreTaskControlPlaneIncidentAction[] {
  const { latestRun, latestOutcome, latestCheckpointId, recovery, task } = input;
  if (!latestRun) {
    return [];
  }

  const needsIncidentAction = latestRun.status === 'blocked'
    || latestRun.status === 'failed'
    || recovery.canRetry;
  if (!needsIncidentAction) {
    return [];
  }

  const taskMetadata = asRecord(task.metadata);
  const runMetadata = asRecord(latestRun.metadata);
  const incidentUpdatedAt = latestOutcome?.updatedAt ?? latestRun.updatedAt;
  const acknowledgedAt = readString(runMetadata?.operatorAcknowledgedAt)
    ?? readString(taskMetadata?.operatorAcknowledgedAt);
  const retryRequestedAt = readString(taskMetadata?.operatorRetryRequestedAt)
    ?? readString(runMetadata?.operatorRetryRequestedAt);
  const acknowledgedFresh = Boolean(
    acknowledgedAt && acknowledgedAt.localeCompare(incidentUpdatedAt) >= 0,
  );
  const retryReplayState = recovery.workflowContinuationReplay?.replayState
    ?? recovery.dispatchReplay?.replayState
    ?? null;
  const retryReplayError = recovery.workflowContinuationReplay?.replayError
    ?? recovery.dispatchReplay?.replayError
    ?? null;
  const retryFresh = Boolean(
    retryRequestedAt && retryRequestedAt.localeCompare(incidentUpdatedAt) >= 0,
  );
  const retryStatusLabel = retryFresh
    ? retryReplayState === 'in_progress'
      ? 'Retry in progress'
      : retryReplayState === 'failed'
        ? retryReplayError
          ? `Retry failed: ${retryReplayError}`
          : 'Retry failed'
        : retryReplayState
          ? 'Retry dispatched'
          : 'Retry requested'
    : null;
  const retryDisabled = retryFresh && retryReplayState !== 'failed';
  const retryLabel = retryFresh && retryReplayState === 'failed'
    ? 'Retry Again'
    : retryFresh && retryReplayState === 'in_progress'
      ? 'Retrying'
      : retryFresh
        ? 'Retry Requested'
        : 'Request Retry';

  return [
    {
      kind: 'retry',
      label: retryLabel,
      description: retryReplayState === 'failed'
        ? 'Retry failed. Operators can request another replay of the stored dispatch.'
        : 'Record that the operator wants this blocked or failed task retried.',
      disabled: retryDisabled,
      statusLabel: retryStatusLabel,
      action: buildTaskOperatorActionEnvelope({
        action: 'retry',
        taskId: task.id,
        runId: latestRun.id,
        checkpointId: latestCheckpointId,
        outcomeId: latestOutcome?.id ?? null,
      }),
    },
    {
      kind: 'acknowledge',
      label: acknowledgedFresh ? 'Acknowledged' : 'Acknowledge',
      description: 'Record that the operator has seen the current blocked or failed state.',
      disabled: acknowledgedFresh,
      statusLabel: acknowledgedFresh ? 'Acknowledged' : null,
      action: buildTaskOperatorActionEnvelope({
        action: 'acknowledge',
        taskId: task.id,
        runId: latestRun.id,
        checkpointId: latestCheckpointId,
        outcomeId: latestOutcome?.id ?? null,
      }),
    },
  ];
}

function buildNextActions(input: {
  task: CoreTaskRecord;
  approvalActions: CoreTaskControlPlaneApprovalAction[];
  incidentActions: CoreTaskControlPlaneIncidentAction[];
  latestRun: CoreRunRecord | null;
  family: CoreTaskInspectionFamilyView;
}): CoreTaskControlPlaneNextAction[] {
  const actions: CoreTaskControlPlaneNextAction[] = [
    ...input.approvalActions.map((action) => ({
      kind: action.kind,
      label: action.label,
      blocking: true,
      action: action.action,
    })),
    ...input.incidentActions.map((action) => ({
      kind: action.kind,
      label: action.label,
      blocking: action.kind === 'retry',
      action: action.disabled ? null : action.action,
    })),
  ];

  if (actions.length > 0) {
    return actions;
  }

  if (input.family.childCount > 0 && !input.family.allChildrenTerminal) {
    return [
      {
        kind: 'wait',
        label: 'Wait for child tasks',
        blocking: false,
        action: null,
      },
    ];
  }

  if (input.latestRun?.status === 'running') {
    return [
      {
        kind: 'wait',
        label: 'Wait for active run',
        blocking: false,
        action: null,
      },
    ];
  }

  if (input.task.status === 'completed') {
    return [
      {
        kind: 'complete',
        label: 'Task completed',
        blocking: false,
        action: null,
      },
    ];
  }

  return [];
}

export function summarizeCoreTaskControlPlaneViews(input: {
  totalAvailable: number;
  matching: number;
  views: CoreTaskControlPlaneView[];
}): CoreTaskControlPlaneListSummary {
  return summarizeCoreTaskControlPlaneViewsWithSupport({
    ...input,
    attentionSeverities: CORE_TASK_CONTROL_PLANE_SEVERITIES,
    executionProducts: TASK_EXECUTION_PRODUCTS,
    reasons: CORE_TASK_CONTROL_PLANE_REASONS,
    nextActionKinds: CORE_TASK_CONTROL_PLANE_NEXT_ACTION_KINDS,
    deliveryModes: CORE_TASK_CONTROL_PLANE_DELIVERY_MODES,
    deliveryActions: CORE_TASK_CONTROL_PLANE_DELIVERY_ACTIONS,
    workflowShapes: CORE_TASK_WORKFLOW_SHAPES,
    workflowContinuationBlockedReasons: CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS,
    workflowContinuationSources: WORKFLOW_CONTINUATION_REPLAY_SOURCES,
    latestReplayPhases: CORE_TASK_RECOVERY_REPLAY_PHASES,
    latestReplayTriggers: CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
    latestReplaySources: CORE_TASK_RECOVERY_REPLAY_SOURCES,
    latestReplayResumeReasons: CORE_TASK_RECOVERY_RESUME_REASONS,
    latestTimelineCategories: CORE_TASK_TIMELINE_CATEGORIES,
    latestTimelineKinds: CORE_TASK_TIMELINE_ITEM_KINDS,
    readExecutionProduct,
    readRequestedStrategy,
    readEffectiveWorkflowShape,
    readEffectiveWorkflowReviewRequired,
    readEffectiveWorkflowConvergeTargetId,
    readEffectiveWorkflowUnresolvedTargets,
    readContinuationSource,
    readLatestReplayPhase,
    readLatestReplayTrigger,
    readLatestReplaySource,
    readLatestReplayResumeReason,
  });
}

export function buildCoreTaskControlPlaneView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskControlPlaneView {
  const inspection = buildCoreTaskInspectionView(core, task);
  const approval = buildApprovalQueue(core).find((candidate) => candidate.taskId === task.id) ?? null;
  const approvalActions = buildApprovalActions(approval);
  const latestWorkflowRecommendation = resolveLatestWorkflowRecommendation({
    latestCheckpointMetadata: inspection.latestCheckpoint?.metadata,
    latestOutcomeMetadata: inspection.latestOutcome?.metadata,
    latestRunMetadata: inspection.latestRun?.metadata,
    traces: core.traces
      .filter((candidate) => candidate.taskId === task.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  });
  const workflowContinuation = buildWorkflowContinuationState({
    latestCheckpointId: inspection.latestCheckpoint?.id ?? null,
    workflowSummary: inspection.workflowSummary,
    recovery: inspection.recovery,
    latestWorkflowRecommendation,
  });
  const runtimeDeliveryIntent = buildRuntimeDeliveryIntent({
    governanceSummary: inspection.governanceSummary,
    workflowSummary: inspection.workflowSummary,
    workflowContinuation,
  });
  const incidentActions = buildIncidentActions({
    task,
    latestRun: inspection.latestRun,
    latestOutcome: inspection.latestOutcome,
    latestCheckpointId: inspection.latestCheckpoint?.id ?? null,
    recovery: inspection.recovery,
  });
  const nextActions = buildNextActions({
    task,
    approvalActions,
    incidentActions,
    latestRun: inspection.latestRun,
    family: inspection.family,
  });
  const attention = buildAttention({
    task,
    latestRun: inspection.latestRun,
    workflowSummary: inspection.workflowSummary,
    recovery: inspection.recovery,
    latestWorkflowRecommendation,
    family: inspection.family,
  });
  const containerId = typeof task.metadata?.containerId === 'string'
    && task.metadata.containerId.trim().length > 0
    ? task.metadata.containerId
    : runtimeDeliveryIntent?.containerId ?? null;

  return {
    taskId: task.id,
    containerId,
    conversationId: task.conversationId,
    taskStatus: task.status,
    lastUpdatedAt:
      inspection.latestOutcome?.updatedAt
      ?? inspection.latestCheckpoint?.updatedAt
      ?? inspection.latestRun?.updatedAt
      ?? task.updatedAt,
    latestRunId: inspection.latestRun?.id ?? null,
    latestCheckpointId: inspection.latestCheckpoint?.id ?? null,
    latestOutcomeId: inspection.latestOutcome?.id ?? null,
    latestTimelineItem: inspection.latestTimelineItem,
    governanceSummary: inspection.governanceSummary,
    workflowSummary: inspection.workflowSummary,
    recovery: inspection.recovery,
    family: inspection.family,
    planning: inspection.planning,
    runtimeBridge: inspection.runtimeBridge,
    latestWorkflowRecommendation,
    workflowContinuation,
    runtimeDeliveryIntent,
    approvalActions,
    incidentActions,
    nextActions,
    attention,
  };
}

export function listCoreTaskControlPlaneViews(
  core: CatsCoreState,
): CoreTaskControlPlaneView[] {
  return core.tasks
    .map((task) => buildCoreTaskControlPlaneView(core, task))
    .filter(hasVisibleControlPlaneSignal)
    .sort(compareControlPlaneViews);
}

export function queryCoreTaskControlPlaneViews(
  core: CatsCoreState,
  options: CoreTaskControlPlaneListOptions = {},
): {
  tasks: CoreTaskControlPlaneView[];
  summary: CoreTaskControlPlaneListSummary;
} {
  const tasks = listCoreTaskControlPlaneViews(core);
  const matching = tasks.filter((view) => matchesControlPlaneListOptions(view, options));
  const returned = applyCoreTaskViewLimit(matching, options.limit);

  return {
    tasks: returned,
    summary: summarizeCoreTaskControlPlaneViews({
      totalAvailable: tasks.length,
      matching: matching.length,
      views: returned,
    }),
  };
}
