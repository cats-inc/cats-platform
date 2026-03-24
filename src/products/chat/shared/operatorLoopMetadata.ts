import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTraceRecord,
} from '../../../core/types.js';
import {
  deriveCoreWorkflowSummary,
} from '../../../core/governance.js';
import type {
  ChatOperatorActivityItem,
  ChatOperatorSeverity,
  ChatRunMetrics,
  ChatWorkflowBranchView,
} from './operatorLoopTypes.js';

export function compareIsoDesc(left: string, right: string): number {
  return right.localeCompare(left);
}

export function readMetadataRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

export function readMetadataString(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readMetadataNumber(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): number | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readMetadataBoolean(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): boolean {
  if (!metadata) {
    return false;
  }

  return metadata[key] === true;
}

export function readMetadataRecordArray(
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

export function uniqueActivityItems(
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

export function severityForOutcome(
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

export function severityForTrace(trace: CoreTraceRecord): ChatOperatorSeverity {
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

export function severityForActivity(activity: CoreActivityRecord): ChatOperatorSeverity {
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

export function severityForCheckpoint(
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

export function labelForActivity(activity: CoreActivityRecord): string {
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

export function labelForTrace(trace: CoreTraceRecord): string {
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

export function buildActorNameById(core: CatsCoreState): Record<string, string> {
  const actorNameById: Record<string, string> = {
    [core.ownerProfile.actorId]: core.ownerProfile.displayName,
  };

  for (const actor of core.actors) {
    actorNameById[actor.id] = actor.name;
  }

  return actorNameById;
}

export function resolveGuardReason(
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

export function resolveCooldownLabel(
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

export function metricsForRun(run: CoreRunRecord): ChatRunMetrics {
  const metadata = readMetadataRecord(run.metadata);
  const workflowSummary = deriveCoreWorkflowSummary(run);
  return {
    dispatchCount: workflowSummary?.dispatchCount ?? readMetadataNumber(metadata, 'dispatchCount'),
    continuationCount:
      workflowSummary?.continuationCount ?? readMetadataNumber(metadata, 'continuationCount'),
    targetCount: workflowSummary?.targetCount ?? readMetadataNumber(metadata, 'targetCount'),
  };
}

export function buildBranchStates(run: CoreRunRecord | null): ChatWorkflowBranchView[] {
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
