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
  applyCoreTaskViewLimit,
  buildCoreTaskStatusCounts,
  countCoreTaskViewConversations,
  matchesCoreTaskViewCommonQuery,
  type CoreTaskViewCommonQuery,
} from './taskViewQuery.js';
import {
  readOrchestratorDispatchReplay,
} from '../platform/orchestration/dispatchReplay.js';
import {
  readPendingOrchestratorDispatchSnapshot,
} from '../platform/orchestration/pendingDispatch.js';
import {
  readWorkflowContinuationReplay,
} from '../platform/orchestration/workflowContinuationReplay.js';

const BODY_PREVIEW_LIMIT = 160;

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
  replayState: string;
  replayTrigger: string | null;
  replayAttemptAt: string | null;
  replayError: string | null;
}

export interface CoreTaskRecoveryActivityView {
  id: string;
  source: string | null;
  phase: string;
  trigger: string | null;
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
  channelId: string | null;
  transport: 'telegram' | 'line' | 'web' | null;
  roomMode: string | null;
}

export interface CoreTaskRecoveryView {
  taskId: string;
  taskStatus: CoreTaskRecord['status'];
  conversationId: string | null;
  approval: CoreTaskRecoveryApprovalView;
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
  actionKinds?: CoreTaskRecoveryActionKind[];
  deliveryModes?: CoreDeliveryMode[];
  deliveryActions?: CoreRuntimeDeliveryAction[];
  workflowStageIds?: string[];
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
  actionKindCounts: Record<CoreTaskRecoveryActionKind, number>;
  deliveryModeCounts: Record<CoreDeliveryMode, number>;
  deliveryActionCounts: Record<CoreRuntimeDeliveryAction, number>;
  workflowStageCounts: Record<string, number>;
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

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function summarizeBody(body: string): {
  bodyPreview: string;
  bodyLength: number;
} {
  const trimmed = body.trim();
  return {
    bodyPreview: trimmed.length > BODY_PREVIEW_LIMIT
      ? `${trimmed.slice(0, BODY_PREVIEW_LIMIT - 1)}...`
      : trimmed,
    bodyLength: trimmed.length,
  };
}

function buildLatestRecoveryActivity(
  core: CatsCoreState,
  taskId: string,
): CoreTaskRecoveryActivityView | null {
  const latest = core.activities
    .filter((activity) =>
      activity.taskId === taskId && readString(asRecord(activity.metadata)?.replayPhase),
    )
    .sort(compareActivityDesc)[0] ?? null;
  if (!latest) {
    return null;
  }

  const metadata = asRecord(latest.metadata);
  return {
    id: latest.id,
    source: readString(metadata?.source),
    phase: readString(metadata?.replayPhase) ?? 'unknown',
    trigger: readString(metadata?.replayTrigger),
    createdAt: latest.createdAt,
    message: latest.message,
    error: readString(metadata?.error),
    blockedReason: readString(metadata?.blockedReason),
    resultCount: readNumber(metadata?.resultCount),
  };
}

function compareActivityDesc(
  left: CoreActivityRecord,
  right: CoreActivityRecord,
): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function buildPendingDispatchView(
  task: CoreTaskRecord,
): CoreTaskPendingDispatchRecoveryView | null {
  const snapshot = readPendingOrchestratorDispatchSnapshot(task.metadata, {
    includeInProgress: true,
  });
  if (!snapshot) {
    return null;
  }

  return {
    channelId: snapshot.channelId,
    transport: snapshot.transport,
    senderName: snapshot.senderName,
    blockedAt: snapshot.blockedAt,
    blockedReason: snapshot.blockedReason,
    ...summarizeBody(snapshot.body),
    replayState: snapshot.replayState,
    replayTrigger: snapshot.replayTrigger,
    replayAttemptAt: snapshot.replayAttemptAt,
    replayError: snapshot.replayError,
  };
}

function buildDispatchReplayView(
  task: CoreTaskRecord,
): CoreTaskDispatchReplayView | null {
  const snapshot = readOrchestratorDispatchReplay(task.metadata, {
    includeInProgress: true,
  });
  if (!snapshot) {
    return null;
  }

  return {
    channelId: snapshot.channelId,
    transport: snapshot.transport,
    senderName: snapshot.senderName,
    recordedAt: snapshot.recordedAt,
    sourceMessageId: snapshot.sourceMessageId,
    ...summarizeBody(snapshot.body),
    replayState: snapshot.replayState,
    replayTrigger: snapshot.replayTrigger,
    replayAttemptAt: snapshot.replayAttemptAt,
    replayError: snapshot.replayError,
  };
}

function buildWorkflowContinuationReplayView(
  task: CoreTaskRecord,
): CoreTaskWorkflowContinuationRecoveryView | null {
  const snapshot = readWorkflowContinuationReplay(task.metadata, {
    includeInProgress: true,
  });
  if (!snapshot) {
    return null;
  }

  return {
    channelId: snapshot.channelId,
    checkpointId: snapshot.checkpointId,
    recordedAt: snapshot.recordedAt,
    sourceMessageId: snapshot.sourceMessageId,
    sourceParticipant: {
      participantKind: snapshot.sourceParticipant.participantKind,
      participantId: snapshot.sourceParticipant.participantId,
      participantName: snapshot.sourceParticipant.participantName,
    },
    targets: snapshot.targets.map((target) => ({
      participantKind: target.participantKind,
      participantId: target.participantId,
      participantName: target.participantName,
    })),
    mentionNames: [...snapshot.mentionNames],
    trigger: snapshot.trigger,
    branchStrategy: snapshot.branchStrategy,
    workflowStageId: snapshot.workflowStageId,
    workflowShape: snapshot.workflowShape,
    reviewRequired: snapshot.reviewRequired,
    continuationSource: snapshot.continuationSource,
    unresolvedTargets: [...snapshot.unresolvedTargets],
    replayState: snapshot.replayState,
    replayTrigger: snapshot.replayTrigger,
    replayAttemptAt: snapshot.replayAttemptAt,
    replayError: snapshot.replayError,
  };
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
  const roomMode = manifest?.context.roomMode ?? null;

  if (
    !delivery
    && !manifest
    && !channelId
    && !transport
    && !workflowStageId
    && !workflowShape
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

  return true;
}

function buildRecoveryActionKindCounts(
  recoveries: CoreTaskRecoveryView[],
): Record<CoreTaskRecoveryActionKind, number> {
  const counts = Object.fromEntries(
    CORE_TASK_RECOVERY_ACTION_KINDS.map((kind) => [kind, 0]),
  ) as Record<CoreTaskRecoveryActionKind, number>;

  for (const recovery of recoveries) {
    for (const action of recovery.approvalActions) {
      counts[action.kind] += 1;
    }
    for (const action of recovery.incidentActions) {
      counts[action.kind] += 1;
    }
  }

  return counts;
}

function buildRecoveryDeliveryModeCounts(
  recoveries: CoreTaskRecoveryView[],
): Record<CoreDeliveryMode, number> {
  const counts = Object.fromEntries(
    CORE_TASK_RECOVERY_DELIVERY_MODES.map((mode) => [mode, 0]),
  ) as Record<CoreDeliveryMode, number>;

  for (const recovery of recoveries) {
    if (recovery.context?.deliveryMode) {
      counts[recovery.context.deliveryMode] += 1;
    }
  }

  return counts;
}

function buildRecoveryDeliveryActionCounts(
  recoveries: CoreTaskRecoveryView[],
): Record<CoreRuntimeDeliveryAction, number> {
  const counts = Object.fromEntries(
    CORE_TASK_RECOVERY_DELIVERY_ACTIONS.map((action) => [action, 0]),
  ) as Record<CoreRuntimeDeliveryAction, number>;

  for (const recovery of recoveries) {
    for (const action of recovery.context?.deliveryActions ?? []) {
      counts[action] += 1;
    }
  }

  return counts;
}

function buildRecoveryWorkflowStageCounts(
  recoveries: CoreTaskRecoveryView[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const recovery of recoveries) {
    const stageId = recovery.context?.workflowStageId;
    if (!stageId) {
      continue;
    }
    counts[stageId] = (counts[stageId] ?? 0) + 1;
  }

  return counts;
}

export function summarizeCoreTaskRecoveryViews(input: {
  totalAvailable: number;
  matching: number;
  recoveries: CoreTaskRecoveryView[];
}): CoreTaskRecoveryListSummary {
  return {
    totalAvailable: input.totalAvailable,
    matching: input.matching,
    returned: input.recoveries.length,
    conversationCount: countCoreTaskViewConversations(input.recoveries),
    taskStatusCounts: buildCoreTaskStatusCounts(input.recoveries),
    canRetryCount: input.recoveries.filter((recovery) => recovery.canRetry).length,
    canResumeViaApprovalCount: input.recoveries.filter((recovery) => recovery.canResumeViaApproval)
      .length,
    withPendingDispatchCount: input.recoveries.filter((recovery) => recovery.pendingDispatch).length,
    withDispatchReplayCount: input.recoveries.filter((recovery) => recovery.dispatchReplay).length,
    withWorkflowContinuationReplayCount: input.recoveries.filter((recovery) =>
      recovery.workflowContinuationReplay).length,
    actionKindCounts: buildRecoveryActionKindCounts(input.recoveries),
    deliveryModeCounts: buildRecoveryDeliveryModeCounts(input.recoveries),
    deliveryActionCounts: buildRecoveryDeliveryActionCounts(input.recoveries),
    workflowStageCounts: buildRecoveryWorkflowStageCounts(input.recoveries),
  };
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
