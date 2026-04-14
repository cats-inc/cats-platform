import type {
  CoreRecordMetadata,
  SegmentRecord,
  TurnRecord,
} from '../../../core/types.js';

export function readChatCoreMetadataString(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function readChatCoreMetadataNumber(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): number | null {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null;
}

export function readChatCoreTurnMetadataString(
  turn: Pick<TurnRecord, 'metadata'> | null | undefined,
  key: string,
): string | null {
  return readChatCoreMetadataString(turn?.metadata, key);
}

export function resolveRawChatParticipantId(
  canonicalParticipantId: string | null | undefined,
  conversationId: string,
): string | null {
  if (!canonicalParticipantId) {
    return null;
  }

  const prefix = `participant-${conversationId}-`;
  if (canonicalParticipantId.startsWith(prefix)) {
    const rawParticipantId = canonicalParticipantId.slice(prefix.length).trim();
    return rawParticipantId.length > 0 ? rawParticipantId : null;
  }

  const normalizedParticipantId = canonicalParticipantId.trim();
  return normalizedParticipantId.length > 0 ? normalizedParticipantId : null;
}

export function compareChatCoreSegmentsAscending(
  left: SegmentRecord,
  right: SegmentRecord,
): number {
  const sequenceComparison = left.sequence - right.sequence;
  if (sequenceComparison !== 0) {
    return sequenceComparison;
  }
  const createdComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdComparison !== 0) {
    return createdComparison;
  }
  return left.id.localeCompare(right.id);
}

export function compareChatCoreSegmentsDescending(
  left: SegmentRecord,
  right: SegmentRecord,
): number {
  const createdComparison = right.createdAt.localeCompare(left.createdAt);
  if (createdComparison !== 0) {
    return createdComparison;
  }
  const sequenceComparison = right.sequence - left.sequence;
  if (sequenceComparison !== 0) {
    return sequenceComparison;
  }
  return left.id.localeCompare(right.id);
}
