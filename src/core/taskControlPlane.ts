import { buildApprovalQueue } from './model/index.js';
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
  matchesCoreTaskViewCommonQuery,
  type CoreTaskViewCommonQuery,
} from './taskViewQuery.js';
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
  CoreRecordMetadata,
  CoreRunRecord,
  CoreRuntimeDeliveryAction,
  CoreTaskRecord,
  CoreTraceRecord,
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
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  reviewRequired: boolean;
  convergeTargetId: string | null;
  blockedReason: WorkflowContinuationReplayBlockedReason | null;
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
  conversationId: string | null;
  taskId: string | null;
  roomMode: string | null;
  transport: string | null;
  workflowStageId: string | null;
  workflowShape: string | null;
}

export interface CoreTaskControlPlaneView {
  taskId: string;
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

function asRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readMetadataRecord(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): CoreRecordMetadata | null {
  return asRecord(metadata?.[key]);
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

function readWorkflowRecommendationFromMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): CoreTaskControlPlaneWorkflowRecommendationView | null {
  const recommendation = readMetadataRecord(metadata, 'workflowRecommendation');
  if (!recommendation) {
    return null;
  }

  const workflowShape = readString(recommendation.workflowShape);
  const source = readString(recommendation.source);
  const continuationSource = readString(metadata?.continuationSource);
  const candidateTargets = Array.isArray(recommendation.candidateTargets)
    ? recommendation.candidateTargets
      .map((target) => asRecord(target))
      .filter((target): target is CoreRecordMetadata => target !== null)
      .map((target) => ({
        participantKind: (() => {
          const participantKind = readString(target.participantKind);
          if (participantKind === 'orchestrator' || participantKind === 'cat') {
            return participantKind as 'orchestrator' | 'cat';
          }
          return null;
        })(),
        participantId: readString(target.participantId),
        participantName: readString(target.participantName),
      }))
    : [];

  return {
    source:
      source === 'checkpoint' || source === 'boss_replan' || source === 'system_inference'
        ? source
        : null,
    workflowShape:
      workflowShape === 'sequential'
      || workflowShape === 'concurrent'
      || workflowShape === 'converge'
        ? workflowShape
        : workflowShape === 'parallel'
          ? ('concurrent' as CoreTaskWorkflowShape)
          : null,
    continuationSource:
      continuationSource === 'explicit_mentions'
      || continuationSource === 'workflow_recommendation'
        ? continuationSource
        : null,
    branchStrategy: readString(recommendation.branchStrategy),
    rationale: readString(recommendation.rationale),
    reviewRequired: readBoolean(recommendation.reviewRequired),
    candidateTargets,
    unresolvedTargets: readStringArray(metadata?.unresolvedTargets),
  };
}

function resolveLatestWorkflowRecommendation(input: {
  latestCheckpointMetadata: CoreRecordMetadata | null | undefined;
  latestOutcomeMetadata: CoreRecordMetadata | null | undefined;
  latestRunMetadata: CoreRecordMetadata | null | undefined;
  traces: CoreTraceRecord[];
}): CoreTaskControlPlaneWorkflowRecommendationView | null {
  return readWorkflowRecommendationFromMetadata(input.latestCheckpointMetadata)
    ?? readWorkflowRecommendationFromMetadata(input.latestOutcomeMetadata)
    ?? readWorkflowRecommendationFromMetadata(input.latestRunMetadata)
    ?? input.traces
      .map((trace) => readWorkflowRecommendationFromMetadata(trace.metadata))
      .find((recommendation): recommendation is CoreTaskControlPlaneWorkflowRecommendationView =>
        Boolean(recommendation),
      )
    ?? null;
}

function readWorkflowShape(
  value: unknown,
): CoreTaskWorkflowShape | null {
  return value === 'sequential' || value === 'concurrent' || value === 'converge'
    ? (value as CoreTaskWorkflowShape)
    : value === 'parallel'
      ? ('concurrent' as CoreTaskWorkflowShape)
      : null;
}

function readEffectiveWorkflowShape(
  view: Pick<
    CoreTaskControlPlaneView,
    'workflowContinuation' | 'runtimeDeliveryIntent' | 'workflowSummary'
  >,
): CoreTaskWorkflowShape | null {
  return view.workflowContinuation?.workflowShape
    ?? readWorkflowShape(view.runtimeDeliveryIntent?.workflowShape)
    ?? readWorkflowShape(view.workflowSummary?.shape)
    ?? null;
}

function readExecutionProduct(
  view: Pick<CoreTaskControlPlaneView, 'runtimeBridge'>,
): TaskExecutionProduct | null {
  return view.runtimeBridge.product ?? null;
}

function readRequestedStrategy(
  view: Pick<CoreTaskControlPlaneView, 'runtimeBridge'>,
): string | null {
  const requestedStrategy = view.runtimeBridge.request.requestedStrategy;
  return typeof requestedStrategy === 'string' && requestedStrategy.trim().length > 0
    ? requestedStrategy
    : null;
}

function readEffectiveWorkflowReviewRequired(
  view: Pick<CoreTaskControlPlaneView, 'workflowContinuation' | 'workflowSummary'>,
): boolean {
  return view.workflowContinuation?.reviewRequired
    ?? view.workflowSummary?.reviewRequired
    ?? false;
}

function readEffectiveWorkflowConvergeTargetId(
  view: Pick<CoreTaskControlPlaneView, 'workflowContinuation' | 'workflowSummary'>,
): string | null {
  return view.workflowContinuation?.convergeTargetId
    ?? view.workflowSummary?.convergeTargetId
    ?? null;
}

function readEffectiveWorkflowUnresolvedTargets(
  view: Pick<CoreTaskControlPlaneView, 'workflowContinuation'>,
): string[] {
  return view.workflowContinuation?.unresolvedTargets.length
    ? [...view.workflowContinuation.unresolvedTargets]
    : [];
}

function readContinuationSource(
  value: unknown,
): 'explicit_mentions' | 'workflow_recommendation' | null {
  return value === 'explicit_mentions' || value === 'workflow_recommendation'
    ? value
    : null;
}

function readWorkflowContinuationReplayState(
  value: unknown,
): 'ready' | 'in_progress' | 'failed' | null {
  return value === 'ready' || value === 'in_progress' || value === 'failed'
    ? value
    : null;
}

function readLatestReplayPhase(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryReplayPhase | null {
  const phase = view.recovery.latestActivity?.phase;
  return typeof phase === 'string'
    && CORE_TASK_RECOVERY_REPLAY_PHASES.includes(phase as CoreTaskRecoveryReplayPhase)
    ? phase as CoreTaskRecoveryReplayPhase
    : null;
}

function readLatestReplaySource(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryReplaySource | null {
  const source = view.recovery.latestActivity?.source;
  return typeof source === 'string'
    && CORE_TASK_RECOVERY_REPLAY_SOURCES.includes(source as CoreTaskRecoveryReplaySource)
    ? source as CoreTaskRecoveryReplaySource
    : null;
}

function readLatestReplayTrigger(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryReplayTrigger | null {
  const trigger = view.recovery.latestActivity?.trigger;
  return typeof trigger === 'string'
    && CORE_TASK_RECOVERY_REPLAY_TRIGGERS.includes(trigger as CoreTaskRecoveryReplayTrigger)
    ? trigger as CoreTaskRecoveryReplayTrigger
    : null;
}

function readLatestReplayResumeReason(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryResumeReason | null {
  const reason = view.recovery.latestActivity?.resumeReason;
  return typeof reason === 'string'
    && CORE_TASK_RECOVERY_RESUME_REASONS.includes(reason as CoreTaskRecoveryResumeReason)
    ? reason as CoreTaskRecoveryResumeReason
    : null;
}

function readWorkflowContinuationReplayTrigger(
  value: unknown,
): 'retry' | null {
  return value === 'retry' ? value : null;
}

function buildWorkflowContinuationState(input: {
  latestCheckpointId: string | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
}): CoreTaskControlPlaneWorkflowContinuationView | null {
  const replay = input.recovery.workflowContinuationReplay;
  const candidateTargetNames = input.latestWorkflowRecommendation?.candidateTargets
    .map((target) => target.participantName)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    ?? [];
  const replayTargetNames = replay?.targets
    .map((target) => target.participantName)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    ?? [];
  const targetNames = candidateTargetNames.length > 0
    ? candidateTargetNames
    : replayTargetNames;
  const unresolvedTargets = input.latestWorkflowRecommendation?.unresolvedTargets.length
    ? [...input.latestWorkflowRecommendation.unresolvedTargets]
    : replay?.unresolvedTargets
      ? [...replay.unresolvedTargets]
      : [];
  const workflowShape = input.latestWorkflowRecommendation?.workflowShape
    ?? readWorkflowShape(replay?.workflowShape)
    ?? readWorkflowShape(input.workflowSummary?.shape)
    ?? null;
  const continuationSource = input.latestWorkflowRecommendation?.continuationSource
    ?? readContinuationSource(replay?.continuationSource)
    ?? null;
  const reviewRequired = input.latestWorkflowRecommendation?.reviewRequired
    ?? replay?.reviewRequired
    ?? input.workflowSummary?.reviewRequired
    ?? false;
  const checkpointId = replay?.checkpointId
    ?? input.latestCheckpointId
    ?? input.workflowSummary?.lastCheckpointId
    ?? null;
  const stageId = replay?.workflowStageId
    ?? input.workflowSummary?.stageId
    ?? null;
  const convergeTargetId = input.workflowSummary?.convergeTargetId
    ?? (
      replay?.workflowShape === 'converge'
      && replay.targets.length === 1
      ? replay.targets[0]?.participantId ?? null
      : null
    )
    ?? (
      workflowShape === 'converge'
      && input.latestWorkflowRecommendation?.candidateTargets.length === 1
      ? input.latestWorkflowRecommendation.candidateTargets[0]?.participantId ?? null
      : null
    );

  if (
    !replay
    && !input.latestWorkflowRecommendation
    && !checkpointId
    && !stageId
    && targetNames.length === 0
    && unresolvedTargets.length === 0
    && !reviewRequired
  ) {
    return null;
  }

  return {
    checkpointId,
    stageId,
    workflowShape,
    continuationSource,
    reviewRequired,
    convergeTargetId,
    blockedReason: replay?.blockedReason ?? null,
    targetCount: targetNames.length,
    targetNames: [...targetNames],
    unresolvedTargets,
    replayState: readWorkflowContinuationReplayState(replay?.replayState),
    replayTrigger: readWorkflowContinuationReplayTrigger(replay?.replayTrigger),
    replayError: replay?.replayError ?? null,
    retryAvailable: Boolean(replay && input.recovery.canRetry),
  };
}

function buildRuntimeDeliveryIntent(input: {
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  workflowContinuation: CoreTaskControlPlaneWorkflowContinuationView | null;
}): CoreTaskControlPlaneRuntimeDeliveryIntentView | null {
  const delivery = input.governanceSummary?.delivery ?? null;
  const manifest = input.governanceSummary?.runtimeDeliveryManifest ?? null;
  if (!delivery && !manifest) {
    return null;
  }

  return {
    mode: delivery?.mode ?? null,
    source: delivery?.source ?? null,
    rationale: delivery?.rationale ?? null,
    gates: [...(delivery?.gates ?? manifest?.gates ?? [])],
    requestedActions: [...(manifest?.requestedActions ?? [])],
    strict: manifest?.strict ?? Boolean((delivery?.gates.length ?? 0) > 0),
    requiresOwnerDecision: input.governanceSummary?.approval.requiresOwnerDecision ?? false,
    approvalPending: input.governanceSummary?.approval.pending ?? false,
    channelId: manifest?.context.channelId ?? null,
    conversationId: manifest?.context.conversationId ?? null,
    taskId: manifest?.context.taskId ?? null,
    roomMode: manifest?.context.roomMode ?? null,
    transport: manifest?.context.transport ?? null,
    workflowStageId:
      manifest?.context.workflowStageId
      ?? input.workflowContinuation?.stageId
      ?? input.workflowSummary?.stageId
      ?? null,
    workflowShape:
      readWorkflowShape(manifest?.context.workflowShape)
      ?? input.workflowContinuation?.workflowShape
      ?? readWorkflowShape(input.workflowSummary?.shape)
      ?? null,
  };
}

function buildAttention(input: {
  task: CoreTaskRecord;
  latestRun: CoreRunRecord | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
  family: CoreTaskInspectionFamilyView;
}): CoreTaskControlPlaneAttention {
  const reasons: CoreTaskControlPlaneReason[] = [];

  if (input.task.approval.status === 'pending') {
    reasons.push('approval_pending');
  }
  if (input.latestRun?.status === 'failed') {
    reasons.push('run_failed');
  } else if (input.latestRun?.status === 'blocked') {
    reasons.push('run_blocked');
  }
  if (input.recovery.canRetry) {
    reasons.push('retry_available');
  }
  if (
    input.latestWorkflowRecommendation?.reviewRequired
    || input.workflowSummary?.reviewRequired
  ) {
    reasons.push('workflow_review_required');
  }
  if (input.family.childCount > 0 && !input.family.allChildrenTerminal) {
    reasons.push('child_tasks_in_progress');
  }

  let severity: CoreTaskControlPlaneSeverity = 'muted';
  if (reasons.includes('run_failed')) {
    severity = 'error';
  } else if (
    reasons.includes('approval_pending')
    || reasons.includes('run_blocked')
    || reasons.includes('retry_available')
    || reasons.includes('workflow_review_required')
  ) {
    severity = 'attention';
  } else if (reasons.includes('child_tasks_in_progress')) {
    severity = 'progress';
  } else if (input.latestRun?.status === 'running') {
    severity = 'progress';
  } else if (input.task.status === 'completed') {
    severity = 'success';
  }

  return {
    severity,
    reasons,
    needsOperatorAttention: severity === 'attention' || severity === 'error',
  };
}

function hasGovernanceSignal(summary: CoreGovernanceSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return summary.approval.pending
    || summary.approval.requiresOwnerDecision
    || summary.approval.latestDecisionAction !== null
    || summary.delivery !== null
    || summary.budget !== null
    || summary.runtimeDeliveryManifest !== null
    || summary.latestOperatorAction !== null;
}

function hasVisibleControlPlaneSignal(view: CoreTaskControlPlaneView): boolean {
  return view.attention.severity !== 'muted'
    || view.approvalActions.length > 0
    || view.incidentActions.length > 0
    || view.latestWorkflowRecommendation !== null
    || view.workflowSummary !== null
    || view.recovery.recoveryRequired
    || hasGovernanceSignal(view.governanceSummary);
}

function compareControlPlaneViews(
  left: CoreTaskControlPlaneView,
  right: CoreTaskControlPlaneView,
): number {
  const leftTimestamp = left.recovery.latestActivity?.createdAt
    ?? left.recovery.workflowContinuationReplay?.replayAttemptAt
    ?? left.recovery.dispatchReplay?.replayAttemptAt
    ?? left.recovery.pendingDispatch?.replayAttemptAt
    ?? left.lastUpdatedAt;
  const rightTimestamp = right.recovery.latestActivity?.createdAt
    ?? right.recovery.workflowContinuationReplay?.replayAttemptAt
    ?? right.recovery.dispatchReplay?.replayAttemptAt
    ?? right.recovery.pendingDispatch?.replayAttemptAt
    ?? right.lastUpdatedAt;

  const severityRank = (value: CoreTaskControlPlaneSeverity): number => {
    switch (value) {
      case 'error':
        return 4;
      case 'attention':
        return 3;
      case 'progress':
        return 2;
      case 'success':
        return 1;
      case 'muted':
      default:
        return 0;
    }
  };

  const severityDiff = severityRank(right.attention.severity) - severityRank(left.attention.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  return rightTimestamp.localeCompare(leftTimestamp);
}

function matchesControlPlaneListOptions(
  view: CoreTaskControlPlaneView,
  options: CoreTaskControlPlaneListOptions,
): boolean {
  if (!matchesCoreTaskViewCommonQuery(view, options)) {
    return false;
  }

  if (
    options.executionProducts?.length
    && (!readExecutionProduct(view)
      || !options.executionProducts.includes(readExecutionProduct(view)!))
  ) {
    return false;
  }

  if (
    options.requestedStrategies?.length
    && (!readRequestedStrategy(view)
      || !options.requestedStrategies.includes(readRequestedStrategy(view)!))
  ) {
    return false;
  }

  if (
    options.severities?.length
    && !options.severities.includes(view.attention.severity)
  ) {
    return false;
  }

  if (
    options.reasons?.length
    && !view.attention.reasons.some((reason) => options.reasons?.includes(reason))
  ) {
    return false;
  }

  if (
    options.needsOperatorAttention !== undefined
    && options.needsOperatorAttention !== null
    && view.attention.needsOperatorAttention !== options.needsOperatorAttention
  ) {
    return false;
  }

  if (
    options.nextActions?.length
    && !view.nextActions.some((action) => options.nextActions?.includes(action.kind))
  ) {
    return false;
  }

  if (
    options.deliveryModes?.length
    && (!view.runtimeDeliveryIntent?.mode || !options.deliveryModes.includes(view.runtimeDeliveryIntent.mode))
  ) {
    return false;
  }

  if (
    options.deliveryActions?.length
    && !view.runtimeDeliveryIntent?.requestedActions.some((action) =>
      options.deliveryActions?.includes(action))
  ) {
    return false;
  }

  if (
    options.workflowStageIds?.length
    && !options.workflowStageIds.includes(
      view.workflowContinuation?.stageId
      ?? view.runtimeDeliveryIntent?.workflowStageId
      ?? view.workflowSummary?.stageId
      ?? '',
    )
  ) {
    return false;
  }

  if (
    options.workflowShapes?.length
    && (!readEffectiveWorkflowShape(view)
      || !options.workflowShapes.includes(readEffectiveWorkflowShape(view)!))
  ) {
    return false;
  }

  if (
    options.workflowReviewRequired !== undefined
    && options.workflowReviewRequired !== null
    && readEffectiveWorkflowReviewRequired(view) !== options.workflowReviewRequired
  ) {
    return false;
  }

  if (
    options.workflowConvergeTargetIds?.length
    && !options.workflowConvergeTargetIds.includes(
      readEffectiveWorkflowConvergeTargetId(view) ?? '',
    )
  ) {
    return false;
  }

  if (
    options.workflowContinuationSources?.length
    && (!readContinuationSource(view.workflowContinuation?.continuationSource)
      || !options.workflowContinuationSources.includes(
        readContinuationSource(view.workflowContinuation?.continuationSource)!,
      ))
  ) {
    return false;
  }

  if (
    options.workflowContinuationBlockedReasons?.length
    && (!view.workflowContinuation?.blockedReason
      || !options.workflowContinuationBlockedReasons.includes(
        view.workflowContinuation.blockedReason,
      ))
  ) {
    return false;
  }

  const unresolvedTargets = readEffectiveWorkflowUnresolvedTargets(view);
  if (
    options.workflowUnresolvedTargets?.length
    && !unresolvedTargets.some((target) => options.workflowUnresolvedTargets?.includes(target))
  ) {
    return false;
  }

  if (
    options.hasUnresolvedWorkflowTargets !== undefined
    && options.hasUnresolvedWorkflowTargets !== null
    && (unresolvedTargets.length > 0) !== options.hasUnresolvedWorkflowTargets
  ) {
    return false;
  }

  if (
    options.latestReplaySources?.length
    && (!readLatestReplaySource(view)
      || !options.latestReplaySources.includes(readLatestReplaySource(view)!))
  ) {
    return false;
  }

  if (
    options.latestReplayTriggers?.length
    && (!readLatestReplayTrigger(view)
      || !options.latestReplayTriggers.includes(readLatestReplayTrigger(view)!))
  ) {
    return false;
  }

  if (
    options.latestReplayPhases?.length
    && (!readLatestReplayPhase(view)
      || !options.latestReplayPhases.includes(readLatestReplayPhase(view)!))
  ) {
    return false;
  }

  if (
    options.latestReplayResumeReasons?.length
    && (!readLatestReplayResumeReason(view)
      || !options.latestReplayResumeReasons.includes(readLatestReplayResumeReason(view)!))
  ) {
    return false;
  }

  if (
    options.latestTimelineCategories?.length
    && (!view.latestTimelineItem?.category
      || !options.latestTimelineCategories.includes(view.latestTimelineItem.category))
  ) {
    return false;
  }

  if (
    options.latestTimelineKinds?.length
    && (!view.latestTimelineItem?.kind
      || !options.latestTimelineKinds.includes(view.latestTimelineItem.kind))
  ) {
    return false;
  }

  if (
    options.rootTaskIds?.length
    && !options.rootTaskIds.includes(view.family.rootTaskId)
  ) {
    return false;
  }

  if (
    options.parentTaskIds?.length
    && !options.parentTaskIds.includes(view.family.parent?.taskId ?? '')
  ) {
    return false;
  }

  if (
    options.hasChildren !== undefined
    && options.hasChildren !== null
    && (view.family.childCount > 0) !== options.hasChildren
  ) {
    return false;
  }

  if (
    options.hasActiveChildren !== undefined
    && options.hasActiveChildren !== null
    && (view.family.childCount > 0 && !view.family.allChildrenTerminal) !== options.hasActiveChildren
  ) {
    return false;
  }

  return true;
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

  return {
    taskId: task.id,
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
