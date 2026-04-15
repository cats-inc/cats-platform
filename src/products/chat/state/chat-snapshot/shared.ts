import type {
  ParticipantExecutionState,
  ParticipantExecutionLease,
} from '../../api/contracts.js';
import type {
  CoreRecordMetadata,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
} from '../../../../core/types.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from '../defaults.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function normalizeMetadata(value: unknown): CoreRecordMetadata {
  return asRecord(value) ?? {};
}

export function normalizeExecutionTarget(
  rawTarget: unknown,
  fallbackTarget: ExecutionTargetSummary,
): ExecutionTargetSummary {
  const targetRecord = asRecord(rawTarget);
  const provider =
    readString(targetRecord?.provider, fallbackTarget.provider).trim()
    || fallbackTarget.provider;

  return {
    provider,
    instance: readNullableString(targetRecord?.instance) ?? fallbackTarget.instance,
    model: readNullableString(targetRecord?.model) ?? fallbackTarget.model,
  };
}

export function normalizeExecutionLease(
  rawLease: unknown,
  fallbackTarget: ExecutionTargetSummary,
): ParticipantExecutionLease {
  const defaultLease = createEmptyExecutionLease();
  const leaseRecord = asRecord(rawLease);
  const rawStatus = readString(leaseRecord?.status, defaultLease.status);
  const status = (
    rawStatus === 'ready'
    || rawStatus === 'initializing'
    || rawStatus === 'error'
    || rawStatus === 'closed'
    || rawStatus === 'removed'
    || rawStatus === 'not_started'
  )
    ? rawStatus
    : defaultLease.status;

  return {
    sessionId: readNullableString(leaseRecord?.sessionId),
    status,
    cwd: readNullableString(leaseRecord?.cwd),
    lastError: readNullableString(leaseRecord?.lastError),
    laneId: readNullableString(leaseRecord?.laneId),
    provider: readNullableString(leaseRecord?.provider) ?? fallbackTarget.provider,
    model: readNullableString(leaseRecord?.model) ?? fallbackTarget.model,
    startedAt: readNullableString(leaseRecord?.startedAt),
    lastUsedAt: readNullableString(leaseRecord?.lastUsedAt),
  };
}

export function normalizeMemoryCheckpoint(rawMemory: unknown): MemoryCheckpointSummary {
  const memoryRecord = asRecord(rawMemory);

  return {
    summary: readNullableString(memoryRecord?.summary),
    facts: readStringArray(memoryRecord?.facts),
    openLoops: readStringArray(memoryRecord?.openLoops),
    updatedAt: readNullableString(memoryRecord?.updatedAt),
  };
}

export function normalizeExecutionState(
  rawExecution: unknown,
  fallbackTarget: ExecutionTargetSummary,
): ParticipantExecutionState {
  const executionRecord = asRecord(rawExecution);
  const target = normalizeExecutionTarget(
    executionRecord?.target ?? rawExecution,
    fallbackTarget,
  );

  return {
    target,
    lease: normalizeExecutionLease(
      executionRecord?.lease ?? rawExecution,
      target,
    ),
  };
}
