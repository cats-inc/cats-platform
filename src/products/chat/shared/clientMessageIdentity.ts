import { createHash } from 'node:crypto';

import type {
  ChannelMessageMetadata,
  ChatMessage,
  ChatMessageChoiceResponse,
  SendChannelMessageInput,
} from '../api/contracts.js';
import {
  extractChatMessageChoicesFromBody,
  normalizeChatMessageChoiceResponse,
} from './messageChoices.js';

export const CLIENT_MESSAGE_ID_MAX_LENGTH = 128;

export const CLIENT_MESSAGE_AUDIT_METADATA_KEYS = [
  'clientMessageId',
  'clientMessageIdSource',
  'clientMessageFingerprint',
] as const;

export type ClientMessageIdSource = 'client' | 'server_fallback';

export type ClientMessageIdentityFallbackReason =
  | 'invalid-uuid'
  | 'collision-foreign-sender'
  | 'collision-equivalence-mismatch';

export interface ClientMessageAuditMetadata {
  clientMessageId: string;
  clientMessageIdSource: ClientMessageIdSource;
  clientMessageFingerprint: string;
}

export interface NormalizedClientMessageId {
  supplied: boolean;
  value: string | null;
  tooLong: boolean;
  wellFormedV4Uuid: boolean;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ClientMessageIdTooLongError extends Error {
  readonly code = 'client_message_id_too_long';
  readonly statusCode = 400;

  constructor() {
    super(`clientMessageId must be at most ${CLIENT_MESSAGE_ID_MAX_LENGTH} characters.`);
    this.name = 'ClientMessageIdTooLongError';
  }
}

export function normalizeClientMessageId(
  value: SendChannelMessageInput['clientMessageId'],
): NormalizedClientMessageId {
  if (typeof value !== 'string') {
    return {
      supplied: false,
      value: null,
      tooLong: false,
      wellFormedV4Uuid: false,
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      supplied: false,
      value: null,
      tooLong: false,
      wellFormedV4Uuid: false,
    };
  }

  return {
    supplied: true,
    value: trimmed,
    tooLong: trimmed.length > CLIENT_MESSAGE_ID_MAX_LENGTH,
    wellFormedV4Uuid: UUID_V4_PATTERN.test(trimmed),
  };
}

export function assertClientMessageIdLengthCap(
  value: SendChannelMessageInput['clientMessageId'],
): void {
  if (normalizeClientMessageId(value).tooLong) {
    throw new ClientMessageIdTooLongError();
  }
}

export function isClientMessageIdTooLongError(error: unknown): boolean {
  if (error instanceof ClientMessageIdTooLongError) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as { code?: unknown; name?: unknown };
  return record.code === 'client_message_id_too_long'
    || record.name === 'ClientMessageIdTooLongError';
}

export function stripClientMessageAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ChannelMessageMetadata {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (
      key === 'optimistic'
      || CLIENT_MESSAGE_AUDIT_METADATA_KEYS.includes(
        key as (typeof CLIENT_MESSAGE_AUDIT_METADATA_KEYS)[number],
      )
    ) {
      continue;
    }
    stripped[key] = value;
  }

  return stripped as ChannelMessageMetadata;
}

export function buildClientMessageAuditMetadata(input: {
  clientMessageId: string;
  source: ClientMessageIdSource;
  fingerprint: string;
}): ClientMessageAuditMetadata {
  return {
    clientMessageId: input.clientMessageId,
    clientMessageIdSource: input.source,
    clientMessageFingerprint: input.fingerprint,
  };
}

export function buildClientMessageFingerprint(input: {
  senderName: string;
  body: string;
  messageMetadata?: Record<string, unknown> | null;
  choiceResponse?: ChatMessageChoiceResponse | null;
  choices?: ChatMessage['choices'];
}): string {
  const { body, choices } = extractChatMessageChoicesFromBody(
    input.body.trim(),
    input.choices,
  );
  const payload = {
    senderName: input.senderName.trim(),
    body,
    choices: choices ?? null,
    choiceResponse: normalizeChatMessageChoiceResponse(input.choiceResponse) ?? null,
    messageMetadata: stripClientMessageAuditMetadata(input.messageMetadata),
  };

  return createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex');
}

export function readPersistedClientMessageFingerprint(message: ChatMessage): string | null {
  const fingerprint = message.metadata?.clientMessageFingerprint;
  return typeof fingerprint === 'string' && fingerprint.trim().length > 0
    ? fingerprint
    : null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

function stableNormalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (typeof item === 'undefined') {
      continue;
    }
    normalized[key] = stableNormalize(item);
  }

  return normalized;
}
