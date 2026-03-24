import type { CoreRecordMetadata } from '../../core/types.js';
import type { OrchestratorTransportContext } from './contracts.js';

const PENDING_ORCHESTRATOR_DISPATCH_METADATA_KEY = 'pendingOrchestratorDispatch';
const PENDING_ORCHESTRATOR_DISPATCH_REASON = 'approval_pending';

export type PendingOrchestratorDispatchReplayState = 'pending' | 'in_progress' | 'failed';
export type PendingOrchestratorDispatchReplayTrigger = 'approve' | 'reroute';

export interface PendingOrchestratorDispatchRequest {
  channelId: string;
  body: string;
  senderName: string | null;
  transport: OrchestratorTransportContext;
  blockedAt: string;
  blockedReason: 'approval_pending';
}

export interface PendingOrchestratorDispatchMetadataOptions {
  replayState?: PendingOrchestratorDispatchReplayState;
  replayTrigger?: PendingOrchestratorDispatchReplayTrigger;
  replayAttemptAt?: string;
  replayError?: string | null;
}

interface StoredPendingOrchestratorDispatchRequest extends PendingOrchestratorDispatchRequest {
  replayState?: PendingOrchestratorDispatchReplayState;
  replayTrigger?: PendingOrchestratorDispatchReplayTrigger;
  replayAttemptAt?: string;
  replayError?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return readNonEmptyString(value);
}

function readTransport(value: unknown): OrchestratorTransportContext | null {
  return value === 'telegram' || value === 'line' || value === 'web'
    ? value
    : null;
}

function readReplayState(value: unknown): PendingOrchestratorDispatchReplayState | null {
  return value === 'pending' || value === 'in_progress' || value === 'failed'
    ? value
    : null;
}

export function buildPendingOrchestratorDispatchRequest(input: {
  channelId: string;
  body: string;
  senderName?: string;
  transport?: OrchestratorTransportContext;
  blockedAt: string;
}): PendingOrchestratorDispatchRequest {
  return {
    channelId: input.channelId,
    body: input.body,
    senderName: input.senderName?.trim() || null,
    transport: input.transport ?? 'web',
    blockedAt: input.blockedAt,
    blockedReason: PENDING_ORCHESTRATOR_DISPATCH_REASON,
  };
}

export function readPendingOrchestratorDispatch(
  metadata: CoreRecordMetadata | null | undefined,
): PendingOrchestratorDispatchRequest | null {
  const record = asRecord(metadata?.[PENDING_ORCHESTRATOR_DISPATCH_METADATA_KEY]);
  if (!record) {
    return null;
  }

  const channelId = readNonEmptyString(record.channelId);
  const body = readNonEmptyString(record.body);
  const transport = readTransport(record.transport);
  const blockedAt = readNonEmptyString(record.blockedAt);
  const replayState = readReplayState(record.replayState);
  const blockedReason = record.blockedReason === PENDING_ORCHESTRATOR_DISPATCH_REASON
    ? PENDING_ORCHESTRATOR_DISPATCH_REASON
    : null;
  if (!channelId || !body || !transport || !blockedAt || !blockedReason) {
    return null;
  }
  if (replayState === 'in_progress') {
    return null;
  }

  return {
    channelId,
    body,
    senderName: readNullableString(record.senderName),
    transport,
    blockedAt,
    blockedReason,
  };
}

export function writePendingOrchestratorDispatchMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  request: PendingOrchestratorDispatchRequest | null,
  options: PendingOrchestratorDispatchMetadataOptions = {},
): CoreRecordMetadata {
  const nextMetadata: CoreRecordMetadata = metadata
    ? structuredClone(metadata)
    : {};

  if (!request) {
    delete nextMetadata[PENDING_ORCHESTRATOR_DISPATCH_METADATA_KEY];
    return nextMetadata;
  }

  const nextRequest: StoredPendingOrchestratorDispatchRequest = {
    channelId: request.channelId,
    body: request.body,
    senderName: request.senderName,
    transport: request.transport,
    blockedAt: request.blockedAt,
    blockedReason: request.blockedReason,
    replayState: options.replayState ?? 'pending',
    ...(options.replayTrigger ? { replayTrigger: options.replayTrigger } : {}),
    ...(options.replayAttemptAt ? { replayAttemptAt: options.replayAttemptAt } : {}),
    ...(options.replayError !== undefined ? { replayError: options.replayError } : {}),
  };
  nextMetadata[PENDING_ORCHESTRATOR_DISPATCH_METADATA_KEY] = nextRequest;
  return nextMetadata;
}
