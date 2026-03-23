import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreApprovalDecisionAction,
  CoreApprovalQueueItem,
  CoreBudgetAlertLevel,
  CoreBudgetAlertSource,
  CoreCheckpointRecord,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
  CoreGovernanceSummary,
  CoreOrchestrationOutcomeRecord,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkflowSummary,
} from '../../../core/types.js';
import {
  deriveCoreGovernanceSummary,
  deriveCoreWorkflowSummary,
  readCoreEffectiveBudgetPolicy,
  readCoreEffectiveDeliveryPolicy,
} from '../../../core/governance.js';

const CORE_DELIVERY_GATE_SET = new Set<string>([
  'manual_review_required',
  'owner_approval_required',
  'publish_artifact_required',
]);

export interface ChatOperatorSnapshot {
  core: CatsCoreState;
  approvals: CoreApprovalQueueItem[];
}

export type ChatOperatorSeverity =
  | 'muted'
  | 'progress'
  | 'attention'
  | 'error'
  | 'success';

export interface ChatOperatorActivityItem {
  id: string;
  label: string;
  message: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  runId: string | null;
  taskId: string | null;
  severity: ChatOperatorSeverity;
  source: 'activity' | 'trace' | 'checkpoint' | 'outcome';
}

export interface ChatRunMetrics {
  dispatchCount: number | null;
  continuationCount: number | null;
  targetCount: number | null;
}

export interface ChatWorkflowBranchView {
  id: string;
  participantName: string;
  status: string;
  handoffReason: string | null;
  branchStrategy: string | null;
  parentCheckpointId: string | null;
  responseMessageId: string | null;
  error: string | null;
}

export interface ChatEffectivePolicyView {
  deliveryMode: CoreDeliveryMode | null;
  deliveryGates: CoreDeliveryGate[];
  deliverySource: CoreEffectivePolicySource | null;
  deliveryRationale: string | null;
  budgetAlertLevel: CoreBudgetAlertLevel | null;
  budgetAlertSource: CoreBudgetAlertSource | null;
  budgetRationale: string | null;
}

export interface ChatApprovalActionView {
  kind: CoreApprovalDecisionAction;
  label: string;
  description: string;
  disabled: boolean;
  taskId: string;
  approvalId: string;
  status: CoreApprovalQueueItem['status'];
}

export interface ChatOperatorActionView {
  kind: 'retry' | 'acknowledge';
  label: string;
  description: string;
  disabled: boolean;
  statusLabel: string | null;
  taskId: string | null;
  runId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
}

export interface ChatRunInspectorView {
  run: CoreRunRecord;
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  approvals: CoreApprovalQueueItem[];
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  guardReason: string | null;
  cooldownLabel: string | null;
  metrics: ChatRunMetrics;
  workflowSummary: CoreWorkflowSummary | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowStageId: string | null;
  workflowShape: string | null;
  reviewRequired: boolean;
  branchStates: ChatWorkflowBranchView[];
  approvalActions: ChatApprovalActionView[];
  incidentActions: ChatOperatorActionView[];
}

export interface ChatOperatorView {
  channelId: string;
  conversationId: string;
  actorNameById: Record<string, string>;
  task: CoreTaskRecord | null;
  approvals: CoreApprovalQueueItem[];
  runs: CoreRunRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  activityFeed: ChatOperatorActivityItem[];
  latestRun: CoreRunRecord | null;
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  latestApproval: CoreApprovalQueueItem | null;
  guardReason: string | null;
  cooldownLabel: string | null;
  effectivePolicy: ChatEffectivePolicyView | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  approvalActions: ChatApprovalActionView[];
  incidentActions: ChatOperatorActionView[];
}

function compareIsoDesc(left: string, right: string): number {
  return right.localeCompare(left);
}

function readMetadataRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

function readMetadataString(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readMetadataNumber(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): number | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readMetadataBoolean(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): boolean {
  if (!metadata) {
    return false;
  }

  return metadata[key] === true;
}

function readMetadataRecordArray(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): CoreRecordMetadata[] {
  if (!metadata) {
    return [];
  }

  const value = metadata[key];
  return Array.isArray(value)
    ? value
        .filter((item): item is CoreRecordMetadata =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
    : [];
}

function uniqueActivityItems(
  items: ChatOperatorActivityItem[],
): ChatOperatorActivityItem[] {
  const seen = new Set<string>();
  const result: ChatOperatorActivityItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

function severityForRunStatus(status: CoreRunRecord['status']): ChatOperatorSeverity {
  switch (status) {
    case 'running':
      return 'progress';
    case 'blocked':
      return 'attention';
    case 'failed':
      return 'error';
    case 'completed':
      return 'success';
    default:
      return 'muted';
  }
}

function severityForOutcome(
  outcome: CoreOrchestrationOutcomeRecord,
): ChatOperatorSeverity {
  switch (outcome.status) {
    case 'blocked':
      return 'attention';
    case 'failed':
      return 'error';
    case 'succeeded':
      return 'success';
    default:
      return 'muted';
  }
}

function severityForTrace(trace: CoreTraceRecord): ChatOperatorSeverity {
  switch (trace.kind) {
    case 'error':
      return 'error';
    case 'approval':
      return 'attention';
    case 'status':
      return 'progress';
    default:
      return 'muted';
  }
}

function severityForActivity(activity: CoreActivityRecord): ChatOperatorSeverity {
  switch (activity.kind) {
    case 'approval_requested':
      return 'attention';
    case 'approval_decided':
      return readMetadataString(activity.metadata, 'action') === 'approve'
        ? 'success'
        : 'attention';
    case 'operator_action':
      return 'progress';
    case 'status_change':
      return 'progress';
    default:
      return 'muted';
  }
}

function severityForCheckpoint(
  checkpoint: CoreCheckpointRecord,
): ChatOperatorSeverity {
  switch (checkpoint.status) {
    case 'open':
      return 'attention';
    case 'completed':
      return 'success';
    default:
      return 'muted';
  }
}

function labelForActivity(activity: CoreActivityRecord): string {
  switch (activity.kind) {
    case 'approval_requested':
      return 'Approval';
    case 'approval_decided':
      return 'Decision';
    case 'operator_action':
      return 'Action';
    case 'checkpoint_recorded':
      return 'Checkpoint';
    case 'status_change':
      return 'Status';
    case 'artifact_recorded':
      return 'Artifact';
    case 'work_item_updated':
      return 'Update';
    default:
      return 'Note';
  }
}

function labelForTrace(trace: CoreTraceRecord): string {
  switch (trace.kind) {
    case 'approval':
      return 'Approval';
    case 'checkpoint':
      return 'Checkpoint';
    case 'dispatch':
      return 'Dispatch';
    case 'error':
      return 'Error';
    case 'outcome':
      return 'Outcome';
    case 'status':
      return 'Status';
    default:
      return 'Trace';
  }
}

function buildActorNameById(core: CatsCoreState): Record<string, string> {
  const actorNameById: Record<string, string> = {
    [core.ownerProfile.actorId]: core.ownerProfile.displayName,
  };

  for (const actor of core.actors) {
    actorNameById[actor.id] = actor.name;
  }

  return actorNameById;
}

function resolveGuardReason(
  run: CoreRunRecord | null,
  latestOutcome: CoreOrchestrationOutcomeRecord | null,
  latestCheckpoint: CoreCheckpointRecord | null,
  traces: CoreTraceRecord[],
): string | null {
  const traceGuard = traces
    .map((trace) => readMetadataString(trace.metadata, 'guard'))
    .find((guard): guard is string => Boolean(guard));

  return readMetadataString(latestOutcome?.metadata, 'guard')
    ?? readMetadataString(latestCheckpoint?.metadata, 'guard')
    ?? readMetadataString(run?.metadata, 'guard')
    ?? traceGuard
    ?? null;
}

function resolveCooldownLabel(
  run: CoreRunRecord | null,
  latestOutcome: CoreOrchestrationOutcomeRecord | null,
  latestCheckpoint: CoreCheckpointRecord | null,
  traces: CoreTraceRecord[],
): string | null {
  const traceReason = traces
    .map((trace) =>
      readMetadataString(trace.metadata, 'cooldownLabel')
      ?? readMetadataString(trace.metadata, 'cooldownReason')
      ?? readMetadataString(trace.metadata, 'cooldownUntil'),
    )
    .find((reason): reason is string => Boolean(reason));

  const outcomeMetadata = readMetadataRecord(latestOutcome?.metadata);
  const checkpointMetadata = readMetadataRecord(latestCheckpoint?.metadata);
  const runMetadata = readMetadataRecord(run?.metadata);

  const cooldownUntil = readMetadataString(outcomeMetadata, 'cooldownUntil')
    ?? readMetadataString(checkpointMetadata, 'cooldownUntil')
    ?? readMetadataString(runMetadata, 'cooldownUntil')
    ?? traceReason;

  if (cooldownUntil) {
    return cooldownUntil;
  }

  if (
    readMetadataBoolean(outcomeMetadata, 'cooldownActive')
    || readMetadataBoolean(checkpointMetadata, 'cooldownActive')
    || readMetadataBoolean(runMetadata, 'cooldownActive')
  ) {
    return 'Cooldown active';
  }

  return readMetadataString(outcomeMetadata, 'cooldownLabel')
    ?? readMetadataString(outcomeMetadata, 'cooldownReason')
    ?? readMetadataString(checkpointMetadata, 'cooldownLabel')
    ?? readMetadataString(checkpointMetadata, 'cooldownReason')
    ?? readMetadataString(runMetadata, 'cooldownLabel')
    ?? readMetadataString(runMetadata, 'cooldownReason')
    ?? null;
}

function metricsForRun(run: CoreRunRecord): ChatRunMetrics {
  const metadata = readMetadataRecord(run.metadata);
  const workflowSummary = deriveCoreWorkflowSummary(run);
  return {
    dispatchCount: workflowSummary?.dispatchCount ?? readMetadataNumber(metadata, 'dispatchCount'),
    continuationCount:
      workflowSummary?.continuationCount ?? readMetadataNumber(metadata, 'continuationCount'),
    targetCount: workflowSummary?.targetCount ?? readMetadataNumber(metadata, 'targetCount'),
  };
}

function buildBranchStates(run: CoreRunRecord | null): ChatWorkflowBranchView[] {
  const metadata = readMetadataRecord(run?.metadata);
  return readMetadataRecordArray(metadata, 'branchStates').map((branch, index) => ({
    id: readMetadataString(branch, 'id') ?? `branch-${index}`,
    participantName:
      readMetadataString(
        readMetadataRecord(branch.participant),
        'participantName',
      ) ?? 'Unknown Cat',
    status: readMetadataString(branch, 'status') ?? 'pending',
    handoffReason: readMetadataString(branch, 'handoffReason'),
    branchStrategy: readMetadataString(branch, 'branchStrategy'),
    parentCheckpointId: readMetadataString(branch, 'parentCheckpointId'),
    responseMessageId: readMetadataString(branch, 'responseMessageId'),
    error: readMetadataString(branch, 'error'),
  }));
}

function buildEffectivePolicyView(task: CoreTaskRecord | null): ChatEffectivePolicyView | null {
  if (!task) {
    return null;
  }

  const metadata = readMetadataRecord(task.metadata);
  const delivery = readCoreEffectiveDeliveryPolicy(metadata);
  const budget = readCoreEffectiveBudgetPolicy(metadata);
  return {
    deliveryMode: delivery?.mode ?? null,
    deliveryGates: delivery?.gates
      ?? (Array.isArray(metadata?.effectiveDeliveryGates)
        ? metadata.effectiveDeliveryGates.filter((gate): gate is CoreDeliveryGate =>
            typeof gate === 'string' && CORE_DELIVERY_GATE_SET.has(gate),
          )
        : []),
    deliverySource: delivery?.source ?? null,
    deliveryRationale: delivery?.rationale ?? null,
    budgetAlertLevel: budget?.alertLevel ?? null,
    budgetAlertSource: budget?.source ?? null,
    budgetRationale: budget?.rationale ?? null,
  };
}

function buildApprovalActions(
  latestApproval: CoreApprovalQueueItem | null,
): ChatApprovalActionView[] {
  if (!latestApproval || latestApproval.status !== 'pending' || !latestApproval.requiresOwnerDecision) {
    return [];
  }

  return latestApproval.decisionOptions.map((option) => ({
    kind: option.action,
    label: option.label,
    description: option.description,
    disabled: false,
    taskId: latestApproval.taskId,
    approvalId: latestApproval.id,
    status: latestApproval.status,
  }));
}

function buildIncidentActions(
  task: CoreTaskRecord | null,
  run: CoreRunRecord | null,
  latestOutcome: CoreOrchestrationOutcomeRecord | null,
  latestCheckpoint: CoreCheckpointRecord | null,
  guardReason: string | null,
  cooldownLabel: string | null,
): ChatOperatorActionView[] {
  if (!run) {
    return [];
  }

  const needsIncidentAction = run.status === 'blocked'
    || run.status === 'failed'
    || Boolean(guardReason)
    || Boolean(cooldownLabel);
  if (!needsIncidentAction) {
    return [];
  }

  const metadata = readMetadataRecord(run.metadata);
  const incidentUpdatedAt = latestOutcome?.updatedAt ?? latestCheckpoint?.updatedAt ?? run.updatedAt;
  const acknowledgedAt = readMetadataString(metadata, 'operatorAcknowledgedAt');
  const retryRequestedAt = readMetadataString(metadata, 'operatorRetryRequestedAt');
  const acknowledgedFresh = Boolean(
    acknowledgedAt && acknowledgedAt.localeCompare(incidentUpdatedAt) >= 0,
  );
  const retryFresh = Boolean(
    retryRequestedAt && retryRequestedAt.localeCompare(incidentUpdatedAt) >= 0,
  );

  return [
    {
      kind: 'retry',
      label: retryFresh ? 'Retry Requested' : 'Request Retry',
      description: 'Record that the operator wants this blocked or failed run retried.',
      disabled: retryFresh,
      statusLabel: retryFresh ? 'Retry requested' : null,
      taskId: task?.id ?? run.taskId,
      runId: run.id,
      checkpointId: latestCheckpoint?.id ?? null,
      outcomeId: latestOutcome?.id ?? null,
    },
    {
      kind: 'acknowledge',
      label: acknowledgedFresh ? 'Acknowledged' : 'Acknowledge',
      description: 'Record that the operator has seen the current guardrail or incident state.',
      disabled: acknowledgedFresh,
      statusLabel: acknowledgedFresh ? 'Acknowledged' : null,
      taskId: task?.id ?? run.taskId,
      runId: run.id,
      checkpointId: latestCheckpoint?.id ?? null,
      outcomeId: latestOutcome?.id ?? null,
    },
  ];
}

function fallbackActivityFeed(
  traces: CoreTraceRecord[],
  checkpoints: CoreCheckpointRecord[],
  outcomes: CoreOrchestrationOutcomeRecord[],
  actorNameById: Record<string, string>,
): ChatOperatorActivityItem[] {
  const traceItems = traces
    .filter((trace) => trace.kind === 'status' || trace.kind === 'approval' || trace.kind === 'error')
    .map((trace) => ({
      id: `trace:${trace.id}`,
      label: labelForTrace(trace),
      message: trace.message,
      createdAt: trace.createdAt,
      actorId: trace.actorId,
      actorName: trace.actorId ? actorNameById[trace.actorId] ?? null : null,
      runId: trace.runId,
      taskId: trace.taskId,
      severity: severityForTrace(trace),
      source: 'trace' as const,
    }));

  const checkpointItems = checkpoints.map((checkpoint) => ({
    id: `checkpoint:${checkpoint.id}`,
    label: 'Checkpoint',
    message: checkpoint.summary ?? checkpoint.label,
    createdAt: checkpoint.updatedAt,
    actorId: null,
    actorName: null,
    runId: checkpoint.runId,
    taskId: checkpoint.taskId,
    severity: severityForCheckpoint(checkpoint),
    source: 'checkpoint' as const,
  }));

  const outcomeItems = outcomes.map((outcome) => ({
    id: `outcome:${outcome.id}`,
    label: 'Outcome',
    message: outcome.summary ?? outcome.title,
    createdAt: outcome.updatedAt,
    actorId: null,
    actorName: null,
    runId: outcome.runId,
    taskId: outcome.taskId,
    severity: severityForOutcome(outcome),
    source: 'outcome' as const,
  }));

  return uniqueActivityItems(
    [...traceItems, ...checkpointItems, ...outcomeItems].sort((left, right) =>
      compareIsoDesc(left.createdAt, right.createdAt),
    ),
  );
}

export function resolveChatConversationId(channelId: string): string {
  return `conversation-channel-${channelId}`;
}

export function buildChatOperatorView(
  snapshot: ChatOperatorSnapshot | null,
  channelId: string,
): ChatOperatorView | null {
  if (!snapshot) {
    return null;
  }

  const conversationId = resolveChatConversationId(channelId);
  const taskId = `task-channel-${channelId}`;
  const actorNameById = buildActorNameById(snapshot.core);
  const task = snapshot.core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const approvals = snapshot.approvals
    .filter((approval) =>
      approval.conversationId === conversationId || approval.taskId === taskId,
    )
    .sort((left, right) =>
      compareIsoDesc(left.requestedAt ?? left.decidedAt ?? '', right.requestedAt ?? right.decidedAt ?? ''),
    );
  const runs = snapshot.core.runs
    .filter((run) => run.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const traces = snapshot.core.traces
    .filter((trace) => trace.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt));
  const checkpoints = snapshot.core.checkpoints
    .filter((checkpoint) => checkpoint.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const outcomes = snapshot.core.outcomes
    .filter((outcome) => outcome.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const activities = snapshot.core.activities
    .filter((activity) => activity.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt));
  const latestRun = runs[0] ?? null;
  const latestOutcome = outcomes[0] ?? null;
  const latestCheckpoint = checkpoints[0] ?? null;
  const latestApproval = approvals[0] ?? null;
  const guardReason = resolveGuardReason(latestRun, latestOutcome, latestCheckpoint, traces);
  const cooldownLabel = resolveCooldownLabel(latestRun, latestOutcome, latestCheckpoint, traces);
  const effectivePolicy = buildEffectivePolicyView(task);
  const workflowSummary = deriveCoreWorkflowSummary(latestRun);
  const governanceSummary = deriveCoreGovernanceSummary(task, latestRun);
  const approvalActions = buildApprovalActions(latestApproval);
  const activityFeed = uniqueActivityItems([
    ...activities.map((activity) => ({
      id: `activity:${activity.id}`,
      label: labelForActivity(activity),
      message: activity.message,
      createdAt: activity.createdAt,
      actorId: activity.actorId,
      actorName: activity.actorId ? actorNameById[activity.actorId] ?? null : null,
      runId: activity.runId,
      taskId: activity.taskId,
      severity: severityForActivity(activity),
      source: 'activity' as const,
    })),
    ...fallbackActivityFeed(traces, checkpoints, outcomes, actorNameById),
  ]).sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt));

  return {
    channelId,
    conversationId,
    actorNameById,
    task,
    approvals,
    runs,
    traces,
    checkpoints,
    outcomes,
    activityFeed,
    latestRun,
    latestOutcome,
    latestCheckpoint,
    latestApproval,
    guardReason,
    cooldownLabel,
    effectivePolicy,
    governanceSummary,
    workflowSummary,
    approvalActions,
    incidentActions: buildIncidentActions(
      task,
      latestRun,
      latestOutcome,
      latestCheckpoint,
      guardReason,
      cooldownLabel,
    ),
  };
}

export function buildRunInspectorView(
  operatorView: ChatOperatorView | null,
  runId: string | null | undefined,
): ChatRunInspectorView | null {
  if (!operatorView) {
    return null;
  }

  const run = operatorView.runs.find((candidate) => candidate.id === runId)
    ?? operatorView.latestRun;
  if (!run) {
    return null;
  }

  const traces = operatorView.traces
    .filter((trace) => trace.runId === run.id)
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt));
  const checkpoints = operatorView.checkpoints
    .filter((checkpoint) => checkpoint.runId === run.id)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const outcomes = operatorView.outcomes
    .filter((outcome) => outcome.runId === run.id)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const approvals = operatorView.approvals.filter((approval) => approval.taskId === run.taskId);
  const latestOutcome = outcomes[0] ?? null;
  const latestCheckpoint = checkpoints[0] ?? null;
  const guardReason = resolveGuardReason(run, latestOutcome, latestCheckpoint, traces);
  const cooldownLabel = resolveCooldownLabel(run, latestOutcome, latestCheckpoint, traces);
  const workflowSummary = deriveCoreWorkflowSummary(run);
  const governanceSummary = deriveCoreGovernanceSummary(operatorView.task, run);
  const latestApproval = approvals[0] ?? operatorView.latestApproval;

  return {
    run,
    traces,
    checkpoints,
    outcomes,
    approvals,
    latestOutcome,
    latestCheckpoint,
    guardReason,
    cooldownLabel,
    metrics: metricsForRun(run),
    workflowSummary,
    governanceSummary,
    workflowStageId: workflowSummary?.stageId ?? null,
    workflowShape: workflowSummary?.shape ?? null,
    reviewRequired: workflowSummary?.reviewRequired ?? false,
    branchStates: buildBranchStates(run),
    approvalActions: buildApprovalActions(latestApproval),
    incidentActions: buildIncidentActions(
      operatorView.task,
      run,
      latestOutcome,
      latestCheckpoint,
      guardReason,
      cooldownLabel,
    ),
  };
}
