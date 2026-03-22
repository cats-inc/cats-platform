import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreApprovalQueueItem,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTraceRecord,
} from '../../../core/types.js';

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
}

export interface ChatOperatorView {
  channelId: string;
  conversationId: string;
  actorNameById: Record<string, string>;
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
      return 'success';
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
  return {
    dispatchCount: readMetadataNumber(metadata, 'dispatchCount'),
    continuationCount: readMetadataNumber(metadata, 'continuationCount'),
    targetCount: readMetadataNumber(metadata, 'targetCount'),
  };
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
    approvals,
    runs,
    traces,
    checkpoints,
    outcomes,
    activityFeed,
    latestRun,
    latestOutcome,
    latestCheckpoint,
    latestApproval: approvals[0] ?? null,
    guardReason: resolveGuardReason(latestRun, latestOutcome, latestCheckpoint, traces),
    cooldownLabel: resolveCooldownLabel(latestRun, latestOutcome, latestCheckpoint, traces),
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

  return {
    run,
    traces,
    checkpoints,
    outcomes,
    approvals,
    latestOutcome,
    latestCheckpoint,
    guardReason: resolveGuardReason(run, latestOutcome, latestCheckpoint, traces),
    cooldownLabel: resolveCooldownLabel(run, latestOutcome, latestCheckpoint, traces),
    metrics: metricsForRun(run),
  };
}
