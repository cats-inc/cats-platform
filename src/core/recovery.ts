import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreApprovalDecisionAction,
  CoreApprovalStatus,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
  CoreRuntimeDeliveryAction,
  CoreTaskRecord,
} from './types.js';
import {
  buildRuntimeDeliveryManifestSummary,
  readCoreEffectiveDeliveryPolicy,
  readCoreRuntimeDeliveryManifestSummary,
} from './governance.js';
import {
  buildTaskApprovalActionEnvelope,
  buildTaskOperatorActionEnvelope,
  type CoreTaskActionEnvelope,
} from './taskActionEnvelopes.js';
import {
  buildCoreTaskInspectionFamilyView,
  type CoreTaskInspectionFamilyView,
} from './taskInspection.js';
import {
  applyCoreTaskViewLimit,
  matchesCoreTaskViewCommonQuery,
  type CoreTaskViewCommonQuery,
} from './taskViewQuery.js';
import {
  buildDispatchReplayView,
  buildLatestRecoveryActivity,
  buildPendingDispatchView,
  readReplayPhase,
  readReplaySource,
  readReplayTrigger,
  readResumeReason,
  readString,
  buildWorkflowContinuationReplayView,
  readWorkflowShape,
} from './taskRecoveryProjection.js';
import { summarizeCoreTaskRecoveryViewsWithSupport } from './taskRecoverySummary.js';
import {
  type OrchestratorDispatchReplayTrigger,
  type OrchestratorDispatchReplayState,
  readOrchestratorDispatchReplay,
} from '../platform/orchestration/dispatchReplay.js';
import {
  type PendingOrchestratorDispatchReplayState,
  readPendingOrchestratorDispatchSnapshot,
} from '../platform/orchestration/pendingDispatch.js';
import {
  WORKFLOW_CONTINUATION_REPLAY_SOURCES,
  WORKFLOW_CONTINUATION_REPLAY_BLOCKED_REASONS,
  type WorkflowContinuationReplayBlockedReason,
  type WorkflowContinuationReplaySource,
  type WorkflowContinuationReplayState,
  readWorkflowContinuationReplay,
} from '../platform/orchestration/workflowContinuationReplay.js';
import {
  ORCHESTRATOR_REPLAY_ACTIVITY_PHASES,
  ORCHESTRATOR_REPLAY_ACTIVITY_SOURCES,
  ORCHESTRATOR_REPLAY_ACTIVITY_TRIGGERS,
  type OrchestratorReplayActivityPhase,
  type OrchestratorReplayActivitySource,
} from '../platform/orchestration/replayActivity.js';

export interface CoreTaskRecoveryApprovalView {
  status: CoreApprovalStatus;
  latestDecisionAction: 'approve' | 'reroute' | 'reject' | null;
  notes: string | null;
}

export interface CoreTaskRecoveryApprovalAction {
  kind: CoreApprovalDecisionAction;
  label: string;
  description: string;
  action: CoreTaskActionEnvelope;
}

export interface CoreTaskRecoveryIncidentAction {
  kind: 'retry';
  label: string;
  description: string;
  action: CoreTaskActionEnvelope;
}

export type CoreTaskRecoveryActionKind =
  | CoreTaskRecoveryApprovalAction['kind']
  | CoreTaskRecoveryIncidentAction['kind'];

export const CORE_TASK_RECOVERY_ACTION_KINDS = [
  'approve',
  'reroute',
  'reject',
  'retry',
] as const satisfies readonly CoreTaskRecoveryActionKind[];

export const CORE_TASK_RECOVERY_DELIVERY_MODES = [
  'artifact_only',
  'commit_only',
  'push_branch',
  'pr_with_checks',
  'deploy_preview',
] as const satisfies readonly CoreDeliveryMode[];

export const CORE_TASK_RECOVERY_DELIVERY_ACTIONS = [
  'prepare_artifact',
  'create_commit',
  'push_branch',
  'open_pull_request',
  'wait_for_checks',
  'publish_preview',
] as const satisfies readonly CoreRuntimeDeliveryAction[];

export type CoreTaskRecoveryWorkflowShape = 'sequential' | 'concurrent' | 'converge';
export type CoreTaskRecoveryResumeReason = 'target_recovered';
export type CoreTaskRecoveryReplayPhase = OrchestratorReplayActivityPhase;
export type CoreTaskRecoveryReplaySource = OrchestratorReplayActivitySource;
export type CoreTaskRecoveryReplayTrigger = OrchestratorDispatchReplayTrigger;

export const CORE_TASK_RECOVERY_WORKFLOW_SHAPES = [
  'sequential',
  'concurrent',
  'converge',
] as const satisfies readonly CoreTaskRecoveryWorkflowShape[];

export const CORE_TASK_RECOVERY_RESUME_REASONS = [
  'target_recovered',
] as const satisfies readonly CoreTaskRecoveryResumeReason[];
export const CORE_TASK_RECOVERY_REPLAY_SOURCES =
  ORCHESTRATOR_REPLAY_ACTIVITY_SOURCES;
export const CORE_TASK_RECOVERY_REPLAY_TRIGGERS =
  ORCHESTRATOR_REPLAY_ACTIVITY_TRIGGERS;
export const CORE_TASK_RECOVERY_REPLAY_PHASES =
  ORCHESTRATOR_REPLAY_ACTIVITY_PHASES;

export const CORE_TASK_PENDING_DISPATCH_REPLAY_STATES = [
  'pending',
  'in_progress',
  'failed',
] as const satisfies readonly PendingOrchestratorDispatchReplayState[];

export const CORE_TASK_DISPATCH_REPLAY_STATES = [
  'ready',
  'in_progress',
  'failed',
] as const satisfies readonly OrchestratorDispatchReplayState[];

export const CORE_TASK_WORKFLOW_CONTINUATION_REPLAY_STATES = [
  'ready',
  'in_progress',
  'failed',
] as const satisfies readonly WorkflowContinuationReplayState[];

export const CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS =
  WORKFLOW_CONTINUATION_REPLAY_BLOCKED_REASONS;

export interface CoreTaskRecoveryMessageReplayView {
  channelId: string;
  transport: 'telegram' | 'line' | 'web';
  senderName: string | null;
  bodyPreview: string;
  bodyLength: number;
  replayState: string;
  replayTrigger: string | null;
  replayAttemptAt: string | null;
  replayError: string | null;
}

export interface CoreTaskPendingDispatchRecoveryView
  extends CoreTaskRecoveryMessageReplayView {
  blockedAt: string;
  blockedReason: 'approval_pending';
}

export interface CoreTaskDispatchReplayView
  extends CoreTaskRecoveryMessageReplayView {
  recordedAt: string;
  sourceMessageId: string | null;
}

export interface CoreTaskRecoveryParticipantView {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
}

export interface CoreTaskWorkflowContinuationRecoveryView {
  channelId: string;
  checkpointId: string;
  recordedAt: string;
  sourceMessageId: string;
  sourceParticipant: CoreTaskRecoveryParticipantView;
  targets: CoreTaskRecoveryParticipantView[];
  mentionNames: string[];
  trigger: string;
  branchStrategy: string | null;
  workflowStageId: string | null;
  workflowShape: string;
  reviewRequired: boolean;
  continuationSource: string | null;
  unresolvedTargets: string[];
  blockedReason: WorkflowContinuationReplayBlockedReason | null;
  replayState: string;
  replayTrigger: string | null;
  replayAttemptAt: string | null;
  replayError: string | null;
}

export interface CoreTaskRecoveryActivityView {
  id: string;
  source: CoreTaskRecoveryReplaySource | null;
  phase: string;
  trigger: CoreTaskRecoveryReplayTrigger | null;
  resumeReason: CoreTaskRecoveryResumeReason | null;
  createdAt: string;
  message: string;
  error: string | null;
  blockedReason: string | null;
  resultCount: number | null;
}

export interface CoreTaskRecoveryContextView {
  deliveryMode: CoreDeliveryMode | null;
  deliverySource: CoreEffectivePolicySource | null;
  deliveryGates: CoreDeliveryGate[];
  deliveryActions: CoreRuntimeDeliveryAction[];
  workflowStageId: string | null;
  workflowShape: string | null;
  workflowReviewRequired: boolean;
  workflowConvergeTargetId: string | null;
  channelId: string | null;
  transport: 'telegram' | 'line' | 'web' | null;
  roomMode: string | null;
}

export interface CoreTaskRecoveryView {
  taskId: string;
  taskStatus: CoreTaskRecord['status'];
  conversationId: string | null;
  approval: CoreTaskRecoveryApprovalView;
  family: CoreTaskInspectionFamilyView;
  context: CoreTaskRecoveryContextView | null;
  pendingDispatch: CoreTaskPendingDispatchRecoveryView | null;
  dispatchReplay: CoreTaskDispatchReplayView | null;
  workflowContinuationReplay: CoreTaskWorkflowContinuationRecoveryView | null;
  latestActivity: CoreTaskRecoveryActivityView | null;
  approvalActions: CoreTaskRecoveryApprovalAction[];
  incidentActions: CoreTaskRecoveryIncidentAction[];
  canResumeViaApproval: boolean;
  canRetry: boolean;
  recoveryRequired: boolean;
}

export interface CoreTaskRecoveryListOptions extends CoreTaskViewCommonQuery {
  canRetry?: boolean | null;
  canResumeViaApproval?: boolean | null;
  hasPendingDispatch?: boolean | null;
  hasDispatchReplay?: boolean | null;
  hasWorkflowContinuationReplay?: boolean | null;
  pendingDispatchReplayStates?: PendingOrchestratorDispatchReplayState[];
  dispatchReplayStates?: OrchestratorDispatchReplayState[];
  workflowContinuationReplayStates?: WorkflowContinuationReplayState[];
  workflowContinuationBlockedReasons?: WorkflowContinuationReplayBlockedReason[];
  actionKinds?: CoreTaskRecoveryActionKind[];
  deliveryModes?: CoreDeliveryMode[];
  deliveryActions?: CoreRuntimeDeliveryAction[];
  workflowStageIds?: string[];
  workflowShapes?: CoreTaskRecoveryWorkflowShape[];
  workflowReviewRequired?: boolean | null;
  workflowConvergeTargetIds?: string[];
  workflowContinuationSources?: WorkflowContinuationReplaySource[];
  workflowUnresolvedTargets?: string[];
  hasUnresolvedWorkflowTargets?: boolean | null;
  latestReplaySources?: CoreTaskRecoveryReplaySource[];
  latestReplayTriggers?: CoreTaskRecoveryReplayTrigger[];
  latestReplayPhases?: CoreTaskRecoveryReplayPhase[];
  latestReplayResumeReasons?: CoreTaskRecoveryResumeReason[];
  rootTaskIds?: string[];
  parentTaskIds?: string[];
  hasChildren?: boolean | null;
  hasActiveChildren?: boolean | null;
}

export interface CoreTaskRecoveryListSummary {
  totalAvailable: number;
  matching: number;
  returned: number;
  conversationCount: number;
  taskStatusCounts: Record<CoreTaskRecord['status'], number>;
  canRetryCount: number;
  canResumeViaApprovalCount: number;
  withPendingDispatchCount: number;
  withDispatchReplayCount: number;
  withWorkflowContinuationReplayCount: number;
  pendingDispatchReplayStateCounts: Record<PendingOrchestratorDispatchReplayState, number>;
  dispatchReplayStateCounts: Record<OrchestratorDispatchReplayState, number>;
  workflowContinuationReplayStateCounts: Record<WorkflowContinuationReplayState, number>;
  workflowContinuationBlockedReasonCounts: Record<WorkflowContinuationReplayBlockedReason, number>;
  actionKindCounts: Record<CoreTaskRecoveryActionKind, number>;
  deliveryModeCounts: Record<CoreDeliveryMode, number>;
  deliveryActionCounts: Record<CoreRuntimeDeliveryAction, number>;
  workflowStageCounts: Record<string, number>;
  workflowShapeCounts: Record<CoreTaskRecoveryWorkflowShape, number>;
  latestReplaySourceCounts: Record<CoreTaskRecoveryReplaySource, number>;
  latestReplayTriggerCounts: Record<CoreTaskRecoveryReplayTrigger, number>;
  latestReplayPhaseCounts: Record<CoreTaskRecoveryReplayPhase, number>;
  latestReplayResumeReasonCounts: Record<CoreTaskRecoveryResumeReason, number>;
  workflowReviewRequiredCount: number;
  workflowConvergeTargetCount: number;
  workflowContinuationSourceCounts: Record<WorkflowContinuationReplaySource, number>;
  withUnresolvedWorkflowTargetsCount: number;
  withChildrenCount: number;
  withActiveChildrenCount: number;
}

function buildRecoveryContext(input: {
  task: CoreTaskRecord;
  pendingDispatch: CoreTaskPendingDispatchRecoveryView | null;
  dispatchReplay: CoreTaskDispatchReplayView | null;
  workflowContinuationReplay: CoreTaskWorkflowContinuationRecoveryView | null;
}): CoreTaskRecoveryContextView | null {
  const delivery = readCoreEffectiveDeliveryPolicy(input.task.metadata);
  const manifest = readCoreRuntimeDeliveryManifestSummary(input.task.metadata)
    ?? (delivery
      ? buildRuntimeDeliveryManifestSummary({
          deliveryMode: delivery.mode,
          deliveryGates: delivery.gates,
          channelId:
            input.workflowContinuationReplay?.channelId
            ?? input.dispatchReplay?.channelId
            ?? input.pendingDispatch?.channelId
            ?? readString(input.task.metadata?.channelId),
          conversationId: input.task.conversationId,
          taskId: input.task.id,
          roomMode: readString(input.task.metadata?.roomRoutingMode),
          transport:
            input.dispatchReplay?.transport
            ?? input.pendingDispatch?.transport
            ?? readString(input.task.metadata?.transport),
          workflowStageId:
            input.workflowContinuationReplay?.workflowStageId
            ?? readString(input.task.metadata?.workflowStageId),
          workflowShape:
            input.workflowContinuationReplay?.workflowShape
            ?? readString(input.task.metadata?.workflowShape),
        })
      : null);
  const channelId = input.workflowContinuationReplay?.channelId
    ?? input.dispatchReplay?.channelId
    ?? input.pendingDispatch?.channelId
    ?? manifest?.context.channelId
    ?? null;
  const transport = input.dispatchReplay?.transport
    ?? input.pendingDispatch?.transport
    ?? (() => {
      const value = manifest?.context.transport;
      return value === 'telegram' || value === 'line' || value === 'web'
        ? value
        : null;
    })();
  const workflowStageId = input.workflowContinuationReplay?.workflowStageId
    ?? manifest?.context.workflowStageId
    ?? null;
  const workflowShape = input.workflowContinuationReplay?.workflowShape
    ?? manifest?.context.workflowShape
    ?? null;
  const workflowReviewRequired = input.workflowContinuationReplay?.reviewRequired
    ?? input.task.metadata?.workflowReviewRequired === true;
  const workflowConvergeTargetId = (
    input.workflowContinuationReplay?.workflowShape === 'converge'
    && input.workflowContinuationReplay.targets.length === 1
  )
    ? input.workflowContinuationReplay.targets[0]?.participantId ?? null
    : readString(input.task.metadata?.workflowConvergeTargetId);
  const roomMode = manifest?.context.roomMode ?? null;

  if (
    !delivery
    && !manifest
    && !channelId
    && !transport
    && !workflowStageId
    && !workflowShape
    && !workflowReviewRequired
    && !workflowConvergeTargetId
    && !roomMode
  ) {
    return null;
  }

  return {
    deliveryMode: delivery?.mode ?? null,
    deliverySource: delivery?.source ?? null,
    deliveryGates: [...(delivery?.gates ?? manifest?.gates ?? [])],
    deliveryActions: [...(manifest?.requestedActions ?? [])],
    workflowStageId,
    workflowShape,
    workflowReviewRequired,
    workflowConvergeTargetId,
    channelId,
    transport,
    roomMode,
  };
}

function buildRecoveryApprovalActions(
  task: CoreTaskRecord,
  canResumeViaApproval: boolean,
): CoreTaskRecoveryApprovalAction[] {
  if (!canResumeViaApproval || task.approval.status !== 'pending') {
    return [];
  }

  return [
    {
      kind: 'approve',
      label: 'Approve',
      description: 'Allow the stored approval-blocked dispatch to resume.',
      action: buildTaskApprovalActionEnvelope(task.id, 'approve'),
    },
    {
      kind: 'reroute',
      label: 'Reroute',
      description: 'Reject the current plan and ask the orchestrator to reroute it.',
      action: buildTaskApprovalActionEnvelope(task.id, 'reroute'),
    },
    {
      kind: 'reject',
      label: 'Reject',
      description: 'Reject the current approval-blocked dispatch without rerouting it.',
      action: buildTaskApprovalActionEnvelope(task.id, 'reject'),
    },
  ];
}

function buildRecoveryIncidentActions(
  task: CoreTaskRecord,
  canRetry: boolean,
): CoreTaskRecoveryIncidentAction[] {
  if (!canRetry) {
    return [];
  }

  return [
    {
      kind: 'retry',
      label: 'Request Retry',
      description: 'Replay the stored dispatch or workflow continuation through the existing operator seam.',
      action: buildTaskOperatorActionEnvelope({
        action: 'retry',
        taskId: task.id,
        runId: null,
        checkpointId: null,
        outcomeId: null,
      }),
    },
  ];
}

export function buildCoreTaskRecoveryView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskRecoveryView {
  const pendingDispatch = buildPendingDispatchView(task);
  const dispatchReplay = buildDispatchReplayView(task);
  const workflowContinuationReplay = buildWorkflowContinuationReplayView(task);
  const context = buildRecoveryContext({
    task,
    pendingDispatch,
    dispatchReplay,
    workflowContinuationReplay,
  });
  const latestActivity = buildLatestRecoveryActivity(core, task.id);
  const family = buildCoreTaskInspectionFamilyView(core, task);
  const canResumeViaApproval = Boolean(
    pendingDispatch && task.approval.status === 'pending',
  );
  const canRetry = Boolean(
    (dispatchReplay && dispatchReplay.replayState !== 'in_progress')
    || (workflowContinuationReplay && workflowContinuationReplay.replayState !== 'in_progress'),
  );
  const approvalActions = buildRecoveryApprovalActions(task, canResumeViaApproval);
  const incidentActions = buildRecoveryIncidentActions(task, canRetry);

  return {
    taskId: task.id,
    taskStatus: task.status,
    conversationId: task.conversationId,
    approval: {
      status: task.approval.status,
      latestDecisionAction: task.approval.decisionAction ?? null,
      notes: task.approval.notes ?? null,
    },
    family,
    context,
    pendingDispatch,
    dispatchReplay,
    workflowContinuationReplay,
    latestActivity,
    approvalActions,
    incidentActions,
    canResumeViaApproval,
    canRetry,
    recoveryRequired: Boolean(
      pendingDispatch
      || dispatchReplay
      || workflowContinuationReplay
      || latestActivity,
    ),
  };
}

function matchesRecoveryListOptions(
  recovery: CoreTaskRecoveryView,
  options: CoreTaskRecoveryListOptions,
): boolean {
  if (!matchesCoreTaskViewCommonQuery(recovery, options)) {
    return false;
  }

  if (
    options.canRetry !== undefined
    && options.canRetry !== null
    && recovery.canRetry !== options.canRetry
  ) {
    return false;
  }

  if (
    options.canResumeViaApproval !== undefined
    && options.canResumeViaApproval !== null
    && recovery.canResumeViaApproval !== options.canResumeViaApproval
  ) {
    return false;
  }

  if (
    options.hasPendingDispatch !== undefined
    && options.hasPendingDispatch !== null
    && Boolean(recovery.pendingDispatch) !== options.hasPendingDispatch
  ) {
    return false;
  }

  if (
    options.hasDispatchReplay !== undefined
    && options.hasDispatchReplay !== null
    && Boolean(recovery.dispatchReplay) !== options.hasDispatchReplay
  ) {
    return false;
  }

  if (
    options.hasWorkflowContinuationReplay !== undefined
    && options.hasWorkflowContinuationReplay !== null
    && Boolean(recovery.workflowContinuationReplay) !== options.hasWorkflowContinuationReplay
  ) {
    return false;
  }

  if (
    options.pendingDispatchReplayStates?.length
    && (!recovery.pendingDispatch
      || !options.pendingDispatchReplayStates.includes(
        recovery.pendingDispatch.replayState as PendingOrchestratorDispatchReplayState,
      ))
  ) {
    return false;
  }

  if (
    options.dispatchReplayStates?.length
    && (!recovery.dispatchReplay
      || !options.dispatchReplayStates.includes(
        recovery.dispatchReplay.replayState as OrchestratorDispatchReplayState,
      ))
  ) {
    return false;
  }

  if (
    options.workflowContinuationReplayStates?.length
    && (!recovery.workflowContinuationReplay
      || !options.workflowContinuationReplayStates.includes(
        recovery.workflowContinuationReplay.replayState as WorkflowContinuationReplayState,
      ))
  ) {
    return false;
  }

  if (
    options.workflowContinuationBlockedReasons?.length
    && (!recovery.workflowContinuationReplay?.blockedReason
      || !options.workflowContinuationBlockedReasons.includes(
        recovery.workflowContinuationReplay.blockedReason as WorkflowContinuationReplayBlockedReason,
      ))
  ) {
    return false;
  }

  if (
    options.actionKinds?.length
    && ![
      ...recovery.approvalActions.map((action) => action.kind),
      ...recovery.incidentActions.map((action) => action.kind),
    ].some((kind) => options.actionKinds?.includes(kind))
  ) {
    return false;
  }

  if (
    options.deliveryModes?.length
    && (!recovery.context?.deliveryMode || !options.deliveryModes.includes(recovery.context.deliveryMode))
  ) {
    return false;
  }

  if (
    options.deliveryActions?.length
    && !recovery.context?.deliveryActions.some((action) => options.deliveryActions?.includes(action))
  ) {
    return false;
  }

  if (
    options.workflowStageIds?.length
    && !options.workflowStageIds.includes(recovery.context?.workflowStageId ?? '')
  ) {
    return false;
  }

  if (
    options.workflowShapes?.length
    && (!readWorkflowShape(recovery.context?.workflowShape)
      || !options.workflowShapes.includes(
        readWorkflowShape(recovery.context?.workflowShape)!,
      ))
  ) {
    return false;
  }

  if (
    options.workflowReviewRequired !== undefined
    && options.workflowReviewRequired !== null
    && (recovery.context?.workflowReviewRequired ?? false) !== options.workflowReviewRequired
  ) {
    return false;
  }

  if (
    options.workflowConvergeTargetIds?.length
    && !options.workflowConvergeTargetIds.includes(
      recovery.context?.workflowConvergeTargetId ?? '',
    )
  ) {
    return false;
  }

  if (
    options.workflowContinuationSources?.length
    && (!recovery.workflowContinuationReplay?.continuationSource
      || !options.workflowContinuationSources.includes(
        recovery.workflowContinuationReplay.continuationSource as WorkflowContinuationReplaySource,
      ))
  ) {
    return false;
  }

  if (
    options.workflowUnresolvedTargets?.length
    && !recovery.workflowContinuationReplay?.unresolvedTargets.some((target) =>
      options.workflowUnresolvedTargets?.includes(target))
  ) {
    return false;
  }

  if (
    options.hasUnresolvedWorkflowTargets !== undefined
    && options.hasUnresolvedWorkflowTargets !== null
    && ((recovery.workflowContinuationReplay?.unresolvedTargets.length ?? 0) > 0)
      !== options.hasUnresolvedWorkflowTargets
  ) {
    return false;
  }

  if (
    options.latestReplaySources?.length
    && (!readReplaySource(recovery.latestActivity?.source)
      || !options.latestReplaySources.includes(readReplaySource(recovery.latestActivity?.source)!))
  ) {
    return false;
  }

  if (
    options.latestReplayTriggers?.length
    && (!readReplayTrigger(recovery.latestActivity?.trigger)
      || !options.latestReplayTriggers.includes(readReplayTrigger(recovery.latestActivity?.trigger)!))
  ) {
    return false;
  }

  if (
    options.latestReplayPhases?.length
    && (!readReplayPhase(recovery.latestActivity?.phase)
      || !options.latestReplayPhases.includes(readReplayPhase(recovery.latestActivity?.phase)!))
  ) {
    return false;
  }

  if (
    options.latestReplayResumeReasons?.length
    && (!recovery.latestActivity?.resumeReason
      || !options.latestReplayResumeReasons.includes(recovery.latestActivity.resumeReason))
  ) {
    return false;
  }

  if (
    options.rootTaskIds?.length
    && !options.rootTaskIds.includes(recovery.family.rootTaskId)
  ) {
    return false;
  }

  if (
    options.parentTaskIds?.length
    && !options.parentTaskIds.includes(recovery.family.parent?.taskId ?? '')
  ) {
    return false;
  }

  if (
    options.hasChildren !== undefined
    && options.hasChildren !== null
    && (recovery.family.childCount > 0) !== options.hasChildren
  ) {
    return false;
  }

  if (
    options.hasActiveChildren !== undefined
    && options.hasActiveChildren !== null
    && (recovery.family.childCount > 0 && !recovery.family.allChildrenTerminal)
      !== options.hasActiveChildren
  ) {
    return false;
  }

  return true;
}

export function summarizeCoreTaskRecoveryViews(input: {
  totalAvailable: number;
  matching: number;
  recoveries: CoreTaskRecoveryView[];
}): CoreTaskRecoveryListSummary {
  return summarizeCoreTaskRecoveryViewsWithSupport({
    ...input,
    pendingDispatchReplayStates: CORE_TASK_PENDING_DISPATCH_REPLAY_STATES,
    dispatchReplayStates: CORE_TASK_DISPATCH_REPLAY_STATES,
    workflowContinuationReplayStates: CORE_TASK_WORKFLOW_CONTINUATION_REPLAY_STATES,
    workflowContinuationBlockedReasons: CORE_TASK_WORKFLOW_CONTINUATION_BLOCKED_REASONS,
    actionKinds: CORE_TASK_RECOVERY_ACTION_KINDS,
    deliveryModes: CORE_TASK_RECOVERY_DELIVERY_MODES,
    deliveryActions: CORE_TASK_RECOVERY_DELIVERY_ACTIONS,
    workflowShapes: CORE_TASK_RECOVERY_WORKFLOW_SHAPES,
    replayResumeReasons: CORE_TASK_RECOVERY_RESUME_REASONS,
    replayPhases: CORE_TASK_RECOVERY_REPLAY_PHASES,
    replayTriggers: CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
    replaySources: CORE_TASK_RECOVERY_REPLAY_SOURCES,
    continuationSources: WORKFLOW_CONTINUATION_REPLAY_SOURCES,
    readWorkflowShape,
    readResumeReason,
    readReplayPhase,
    readReplayTrigger,
    readReplaySource,
  });
}

export function listCoreTaskRecoveryViews(
  core: CatsCoreState,
): CoreTaskRecoveryView[] {
  return core.tasks
    .map((task) => buildCoreTaskRecoveryView(core, task))
    .filter((recovery) => recovery.recoveryRequired)
    .sort((left, right) => {
      const leftTimestamp = left.latestActivity?.createdAt
        ?? left.workflowContinuationReplay?.replayAttemptAt
        ?? left.dispatchReplay?.replayAttemptAt
        ?? left.pendingDispatch?.replayAttemptAt
        ?? left.workflowContinuationReplay?.recordedAt
        ?? left.dispatchReplay?.recordedAt
        ?? left.pendingDispatch?.blockedAt
        ?? '';
      const rightTimestamp = right.latestActivity?.createdAt
        ?? right.workflowContinuationReplay?.replayAttemptAt
        ?? right.dispatchReplay?.replayAttemptAt
        ?? right.pendingDispatch?.replayAttemptAt
        ?? right.workflowContinuationReplay?.recordedAt
        ?? right.dispatchReplay?.recordedAt
        ?? right.pendingDispatch?.blockedAt
        ?? '';
      return rightTimestamp.localeCompare(leftTimestamp);
    });
}

export function queryCoreTaskRecoveryViews(
  core: CatsCoreState,
  options: CoreTaskRecoveryListOptions = {},
): {
  recoveries: CoreTaskRecoveryView[];
  summary: CoreTaskRecoveryListSummary;
} {
  const recoveries = listCoreTaskRecoveryViews(core);
  const matching = recoveries.filter((recovery) => matchesRecoveryListOptions(recovery, options));
  const returned = applyCoreTaskViewLimit(matching, options.limit);

  return {
    recoveries: returned,
    summary: summarizeCoreTaskRecoveryViews({
      totalAvailable: recoveries.length,
      matching: matching.length,
      recoveries: returned,
    }),
  };
}
