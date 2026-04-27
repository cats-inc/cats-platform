import type {
  CatsCoreState,
  CoreRunRecord,
  CoreRunStatus,
  CoreTraceRecord,
  EvidenceEvent,
} from '../../core/types.js';
import type {
  RunBlocker,
  RunPrimaryState,
  SupervisionPolicySnapshot,
  SupervisionPolicySnapshotRef,
  ToolResultStatus,
} from './contracts.js';
import { TOOL_RESULT_STATUS_VALUES } from './contracts.js';
import { createSupervisionPolicySnapshotRef } from './policySnapshots.js';
import {
  deriveRunState,
  type RunApprovalRequestState,
  type RunLifecycleState,
} from './runState.js';
import {
  RUN_LOOP_OBSERVATION_SOURCE_VALUES,
  type ProviderAgentRunLoopRecord,
  type RunLoopDecisionHandoff,
  type RunLoopObservationRef,
} from './runLoopHandoff.js';

export interface SupervisionPolicySnapshotProjection {
  snapshotRef: SupervisionPolicySnapshotRef;
  snapshot: SupervisionPolicySnapshot;
  traceId: string;
  recordedAt: string;
}

export interface SupervisionEvidenceProjection {
  eventId: string;
  source: 'supervision_tool_boundary' | 'provider_agent_run_loop';
  actionId: string | null;
  toolName: string | null;
  status: ToolResultStatus | null;
  occurredAt: string;
  actorRef: string | null;
  policySnapshotRef: SupervisionPolicySnapshotRef | null;
  rejectionCode: string | null;
  approvalRequestId: string | null;
  summary: string | null;
}

export interface SupervisedRunInspectionProjection {
  run: CoreRunRecord;
  primaryState: RunPrimaryState;
  blockers: RunBlocker[];
  approvalRequests: RunApprovalRequestState[];
  terminalCause: string | null;
  providerAgentRunLoop: ProviderAgentRunLoopRecord | null;
  policySnapshots: SupervisionPolicySnapshotProjection[];
  latestPolicySnapshot: SupervisionPolicySnapshotProjection | null;
  evidence: SupervisionEvidenceProjection[];
  counts: {
    policySnapshots: number;
    evidence: number;
    pendingApprovals: number;
    rejectedActions: number;
  };
}

export function buildSupervisedRunInspectionProjection(
  core: CatsCoreState,
  runId: string,
  evidenceEvents: EvidenceEvent[] = [],
): SupervisedRunInspectionProjection | null {
  const run = core.runs.find((candidate) => candidate.id === runId) ?? null;
  if (!run) {
    return null;
  }

  const evidence = evidenceEvents
    .map((event) => readSupervisionEvidenceProjection(event, run.id))
    .filter((event): event is SupervisionEvidenceProjection => event !== null)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const approvalRequests = readApprovalRequests(run, evidence);
  const blockers = readBlockers(run, approvalRequests);
  const state = deriveRunState({
    lifecycle: toRunLifecycle(run.status),
    blockers,
    approvalRequests,
    terminalCause: readTerminalCause(run),
  });
  const policySnapshots = core.traces
    .map((trace) => readPolicySnapshotProjection(trace, run.id))
    .filter((snapshot): snapshot is SupervisionPolicySnapshotProjection => snapshot !== null)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));

  return {
    run,
    primaryState: state.primaryState,
    blockers: state.blockers,
    approvalRequests: state.approvalRequests,
    terminalCause: state.terminalCause ?? null,
    providerAgentRunLoop: readProviderAgentRunLoop(run),
    policySnapshots,
    latestPolicySnapshot: policySnapshots[0] ?? null,
    evidence,
    counts: {
      policySnapshots: policySnapshots.length,
      evidence: evidence.length,
      pendingApprovals: state.approvalRequests.filter((approval) => approval.state === 'pending').length,
      rejectedActions: evidence.filter((event) => event.status === 'rejected').length,
    },
  };
}

function readProviderAgentRunLoop(run: CoreRunRecord): ProviderAgentRunLoopRecord | null {
  const supervision = asRecord(run.metadata.supervision);
  const runLoop = asRecord(supervision?.providerAgentRunLoop);
  if (!runLoop) {
    return null;
  }

  const observations = readRunLoopObservations(runLoop.observations);
  const outcomes = readRunLoopOutcomes(runLoop.outcomes);
  const latestHandoff = readRunLoopDecisionHandoff(runLoop.latestHandoff);
  if (observations.length === 0 && outcomes.length === 0 && !latestHandoff) {
    return null;
  }

  return {
    observations,
    outcomes,
    latestHandoff,
  };
}

function readRunLoopObservations(
  value: unknown,
): ProviderAgentRunLoopRecord['observations'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const observationId = readString(record?.observationId);
    const actionId = readString(record?.actionId);
    const observedAt = readString(record?.observedAt);
    const observationRef = readRunLoopObservationRef(record);

    return observationId && actionId && observedAt && observationRef
      ? [{
          observationId,
          actionId,
          observedAt,
          ...observationRef,
        }]
      : [];
  });
}

function readRunLoopOutcomes(value: unknown): ProviderAgentRunLoopRecord['outcomes'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const outcomeId = readString(record?.outcomeId);
    const actionId = readString(record?.actionId);
    const status = readToolResultStatus(record?.status);
    const sessionId = readString(record?.sessionId);
    const recordedAt = readString(record?.recordedAt);
    const handoff = readRunLoopDecisionHandoff(record?.handoff);

    return outcomeId &&
      actionId &&
      record?.kind === 'runtime_message' &&
      status &&
      sessionId &&
      recordedAt &&
      handoff
      ? [{
          outcomeId,
          actionId,
          kind: 'runtime_message',
          status,
          sessionId,
          ...(typeof record.tokensUsed === 'number' && Number.isFinite(record.tokensUsed)
            ? { tokensUsed: record.tokensUsed }
            : {}),
          recordedAt,
          handoff,
        }]
      : [];
  });
}

function readRunLoopDecisionHandoff(value: unknown): RunLoopDecisionHandoff | null {
  const record = asRecord(value);
  const kind = readString(record?.kind);
  const runId = readString(record?.runId);
  const actionId = readString(record?.actionId);
  if (!record || !runId || !actionId) {
    return null;
  }

  if (kind === 'provider_agent_seam') {
    const observationRef = readRunLoopObservationRef(record.observationRef);
    return observationRef
      ? {
          kind,
          runId,
          actionId,
          observationRef,
        }
      : null;
  }

  if (kind === 'weak_worker_tool_boundary') {
    const observationRef = readRunLoopObservationRef(record.observationRef);
    const toolName = readString(record.toolName);
    return observationRef && toolName
      ? {
          kind,
          runId,
          actionId,
          observationRef,
          toolName,
        }
      : null;
  }

  if (
    kind === 'terminal' &&
    (record.primaryState === 'completed' ||
      record.primaryState === 'failed' ||
      record.primaryState === 'cancelled')
  ) {
    return {
      kind,
      runId,
      actionId,
      primaryState: record.primaryState,
    };
  }

  return null;
}

function readRunLoopObservationRef(value: unknown): RunLoopObservationRef | null {
  const record = asRecord(value);
  const refId = readString(record?.refId);
  const source = readString(record?.source);
  if (
    !refId ||
    !source ||
    !RUN_LOOP_OBSERVATION_SOURCE_VALUES.includes(source as RunLoopObservationRef['source'])
  ) {
    return null;
  }

  return {
    refId,
    source: source as RunLoopObservationRef['source'],
    ...readOptionalRunLoopRefStringProperty(record, 'evidenceRef'),
    ...readOptionalRunLoopRefStringProperty(record, 'summaryRef'),
    ...readOptionalToolResultStatusProperty(record, 'resultStatus'),
    ...readOptionalRunLoopErrorCode(record),
  };
}

function toRunLifecycle(status: CoreRunStatus): RunLifecycleState {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'running':
    case 'blocked':
      return 'active';
    case 'completed':
    case 'failed':
    case 'cancelled':
      return status;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function readPolicySnapshotProjection(
  trace: CoreTraceRecord,
  runId: string,
): SupervisionPolicySnapshotProjection | null {
  if (trace.runId !== runId) {
    return null;
  }
  if (trace.metadata.source !== 'supervision_policy_snapshot') {
    return null;
  }

  const snapshot = readPolicySnapshot(trace.metadata.snapshot);
  if (!snapshot || snapshot.runId !== runId) {
    return null;
  }

  return {
    snapshotRef: readPolicySnapshotRef(trace.metadata.snapshotRef)
      ?? createSupervisionPolicySnapshotRef(snapshot),
    snapshot,
    traceId: trace.id,
    recordedAt: trace.createdAt,
  };
}

function readSupervisionEvidenceProjection(
  event: EvidenceEvent,
  runId: string,
): SupervisionEvidenceProjection | null {
  const payload = event.payload;
  if (payload.runId !== runId) {
    return null;
  }

  if (payload.source === 'provider_agent_run_loop') {
    return {
      eventId: event.id,
      source: 'provider_agent_run_loop',
      actionId: readString(payload.actionId),
      toolName: null,
      status: readToolResultStatus(payload.status),
      occurredAt: event.timestamp,
      actorRef: event.actorId,
      policySnapshotRef: null,
      rejectionCode: readString(payload.rejectionCode),
      approvalRequestId: null,
      summary: readString(payload.summary),
    };
  }

  if (payload.source !== 'supervision_tool_boundary') {
    return null;
  }

  return {
    eventId: event.id,
    source: 'supervision_tool_boundary',
    actionId: readString(payload.actionId),
    toolName: readString(payload.toolName),
    status: readToolResultStatus(payload.status),
    occurredAt: event.timestamp,
    actorRef: event.actorId,
    policySnapshotRef: readPolicySnapshotRef(payload.policySnapshotRef),
    rejectionCode: readString(payload.rejectionCode),
    approvalRequestId: readString(payload.approvalRequestId),
    summary: readString(payload.summary),
  };
}

function readApprovalRequests(
  run: CoreRunRecord,
  evidence: SupervisionEvidenceProjection[],
): RunApprovalRequestState[] {
  const fromMetadata = readRunStateMetadata(run).approvalRequests;
  if (fromMetadata.length > 0) {
    return fromMetadata;
  }

  return evidence
    .filter((event) => event.status === 'pending_approval' && event.approvalRequestId)
    .map((event) => ({
      requestId: event.approvalRequestId!,
      state: 'pending' as const,
      gating: true,
    }));
}

function readBlockers(
  run: CoreRunRecord,
  approvalRequests: RunApprovalRequestState[],
): RunBlocker[] {
  const blockers = readRunStateMetadata(run).blockers;
  if (blockers.length > 0) {
    return blockers;
  }
  if (
    run.status === 'blocked' &&
    !approvalRequests.some((approval) => approval.state === 'pending' && approval.gating)
  ) {
    return [
      {
        code: 'CORE_RUN_BLOCKED',
        message: run.summary ?? 'Core run is blocked.',
      },
    ];
  }
  return [];
}

function readTerminalCause(run: CoreRunRecord): string | undefined {
  const terminalCause = readRunStateMetadata(run).terminalCause;
  if (terminalCause) {
    return terminalCause;
  }
  return run.status === 'failed' || run.status === 'cancelled'
    ? run.summary ?? undefined
    : undefined;
}

function readRunStateMetadata(run: CoreRunRecord): {
  blockers: RunBlocker[];
  approvalRequests: RunApprovalRequestState[];
  terminalCause?: string;
} {
  const supervision = asRecord(run.metadata.supervision);
  const runState = asRecord(supervision?.runState) ?? asRecord(run.metadata.supervisionRunState);

  return {
    blockers: readRunBlockers(runState?.blockers),
    approvalRequests: readRunApprovalRequests(runState?.approvalRequests),
    terminalCause: readString(runState?.terminalCause) ?? undefined,
  };
}

function readRunBlockers(value: unknown): RunBlocker[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const code = readString(record?.code);
    const message = readString(record?.message);

    return code && message
      ? [{
          code,
          message,
          ...(record?.details === undefined ? {} : { details: record.details }),
        }]
      : [];
  });
}

function readRunApprovalRequests(value: unknown): RunApprovalRequestState[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const requestId = readString(record?.requestId);
    const state = readApprovalState(record?.state);

    return requestId && state
      ? [{
          requestId,
          state,
          gating: record?.gating !== false,
        }]
      : [];
  });
}

function readPolicySnapshot(value: unknown): SupervisionPolicySnapshot | null {
  const record = asRecord(value);
  return record
    && typeof record.policyBundleVersion === 'string'
    && typeof record.evaluatedAt === 'string'
    && typeof record.actionId === 'string'
    && typeof record.runId === 'string'
    && typeof record.actorRef === 'string'
    ? record as unknown as SupervisionPolicySnapshot
    : null;
}

function readPolicySnapshotRef(value: unknown): SupervisionPolicySnapshotRef | null {
  const record = asRecord(value);
  const snapshotId = readString(record?.snapshotId);
  const policyBundleVersion = readString(record?.policyBundleVersion);
  const actionId = readString(record?.actionId);
  const runId = readString(record?.runId);

  return snapshotId && policyBundleVersion && actionId && runId
    ? {
        snapshotId,
        policyBundleVersion,
        actionId,
        runId,
      }
    : null;
}

function readToolResultStatus(value: unknown): ToolResultStatus | null {
  return typeof value === 'string' &&
    TOOL_RESULT_STATUS_VALUES.includes(value as ToolResultStatus)
    ? value as ToolResultStatus
    : null;
}

function readApprovalState(value: unknown): RunApprovalRequestState['state'] | null {
  return value === 'pending' ||
    value === 'approved' ||
    value === 'denied' ||
    value === 'cancelled'
    ? value
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readOptionalRunLoopRefStringProperty<K extends 'evidenceRef' | 'summaryRef'>(
  record: Record<string, unknown> | null,
  key: K,
): Pick<RunLoopObservationRef, K> | Record<string, never> {
  const value = readString(record?.[key]);
  return value ? { [key]: value } as Pick<RunLoopObservationRef, K> : {};
}

function readOptionalRunLoopErrorCode(
  record: Record<string, unknown> | null,
): Pick<RunLoopObservationRef, 'errorCode'> | Record<string, never> {
  const value = readString(record?.errorCode);
  return value ? { errorCode: value as RunLoopObservationRef['errorCode'] } : {};
}

function readOptionalToolResultStatusProperty(
  record: Record<string, unknown> | null,
  key: 'resultStatus',
): Pick<RunLoopObservationRef, 'resultStatus'> {
  const value = readToolResultStatus(record?.[key]);
  return value ? { resultStatus: value } : {};
}
