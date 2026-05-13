import type { CoreRecordMetadata } from '../../core/types.js';
import type {
  OrchestratorChoiceResponse,
  OrchestratorTransportContext,
} from './contracts.js';
import { normalizeOrchestratorChoiceResponse } from './choiceResponseMetadata.js';

const ORCHESTRATOR_DISPATCH_REPLAY_METADATA_KEY = 'orchestratorDispatchReplay';

export type OrchestratorDispatchReplayState = 'ready' | 'in_progress' | 'failed';
export type OrchestratorDispatchReplayTrigger =
  | 'dispatch'
  | 'approve'
  | 'reroute'
  | 'retry';

export interface OrchestratorDispatchReplayRequest {
  channelId: string;
  body: string;
  senderName: string | null;
  transport: OrchestratorTransportContext;
  recordedAt: string;
  choiceResponse?: OrchestratorChoiceResponse | null;
}

export interface OrchestratorDispatchReplayMetadataOptions {
  replayState?: OrchestratorDispatchReplayState;
  replayTrigger?: OrchestratorDispatchReplayTrigger;
  replayAttemptAt?: string | null;
  replayError?: string | null;
  sourceMessageId?: string | null;
}

export interface OrchestratorDispatchReplaySnapshot extends OrchestratorDispatchReplayRequest {
  replayState: OrchestratorDispatchReplayState;
  replayTrigger: OrchestratorDispatchReplayTrigger;
  replayAttemptAt: string | null;
  replayError: string | null;
  sourceMessageId: string | null;
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

function readReplayState(value: unknown): OrchestratorDispatchReplayState | null {
  return value === 'ready' || value === 'in_progress' || value === 'failed'
    ? value
    : null;
}

function readReplayTrigger(value: unknown): OrchestratorDispatchReplayTrigger | null {
  return value === 'dispatch'
    || value === 'approve'
    || value === 'reroute'
    || value === 'retry'
    ? value
    : null;
}

export function buildOrchestratorDispatchReplayRequest(input: {
  channelId: string;
  body: string;
  senderName?: string;
  transport?: OrchestratorTransportContext;
  recordedAt: string;
  choiceResponse?: OrchestratorChoiceResponse | null;
}): OrchestratorDispatchReplayRequest {
  const choiceResponse = normalizeOrchestratorChoiceResponse(input.choiceResponse);
  return {
    channelId: input.channelId,
    body: input.body,
    senderName: input.senderName?.trim() || null,
    transport: input.transport ?? 'web',
    recordedAt: input.recordedAt,
    ...(choiceResponse ? { choiceResponse } : {}),
  };
}

export function readOrchestratorDispatchReplay(
  metadata: CoreRecordMetadata | null | undefined,
  options: {
    includeInProgress?: boolean;
  } = {},
): OrchestratorDispatchReplaySnapshot | null {
  const record = asRecord(metadata?.[ORCHESTRATOR_DISPATCH_REPLAY_METADATA_KEY]);
  if (!record) {
    return null;
  }

  const channelId = readNonEmptyString(record.channelId);
  const body = readNonEmptyString(record.body);
  const transport = readTransport(record.transport);
  const recordedAt = readNonEmptyString(record.recordedAt);
  const replayState = readReplayState(record.replayState);
  const replayTrigger = readReplayTrigger(record.replayTrigger);
  if (
    !channelId
    || !body
    || !transport
    || !recordedAt
    || !replayState
    || !replayTrigger
  ) {
    return null;
  }
  if (replayState === 'in_progress' && !options.includeInProgress) {
    return null;
  }

  return {
    channelId,
    body,
    senderName: readNullableString(record.senderName),
    transport,
    recordedAt,
    replayState,
    replayTrigger,
    replayAttemptAt: readNullableString(record.replayAttemptAt),
    replayError: readNullableString(record.replayError),
    sourceMessageId: readNullableString(record.sourceMessageId),
    choiceResponse: normalizeOrchestratorChoiceResponse(record.choiceResponse),
  };
}

export function writeOrchestratorDispatchReplayMetadata(
  metadata: CoreRecordMetadata | null | undefined,
  request: OrchestratorDispatchReplayRequest | null,
  options: OrchestratorDispatchReplayMetadataOptions = {},
): CoreRecordMetadata {
  const nextMetadata: CoreRecordMetadata = metadata
    ? structuredClone(metadata)
    : {};

  if (!request) {
    delete nextMetadata[ORCHESTRATOR_DISPATCH_REPLAY_METADATA_KEY];
    return nextMetadata;
  }

  const replayMetadata: Record<string, unknown> = {
    channelId: request.channelId,
    body: request.body,
    senderName: request.senderName,
    transport: request.transport,
    recordedAt: request.recordedAt,
    replayState: options.replayState ?? 'ready',
    replayTrigger: options.replayTrigger ?? 'dispatch',
    replayAttemptAt: options.replayAttemptAt ?? null,
    replayError: options.replayError ?? null,
    sourceMessageId: options.sourceMessageId ?? null,
  };
  const choiceResponse = normalizeOrchestratorChoiceResponse(request.choiceResponse);
  if (choiceResponse) {
    replayMetadata.choiceResponse = choiceResponse;
  }
  nextMetadata[ORCHESTRATOR_DISPATCH_REPLAY_METADATA_KEY] = replayMetadata;
  return nextMetadata;
}
