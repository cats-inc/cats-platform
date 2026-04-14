import type {
  CatsCoreState,
  CoreRecordMetadata,
  SegmentRecord,
  TurnRecord,
} from '../../../core/types.js';
import type { ChatMessage } from '../api/contracts.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';

export type CanonicalChatUserMessage = ChatMessage & { senderKind: 'user' };

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

export function buildCanonicalChatUserMessage(
  core: CatsCoreState,
  channelId: string,
  sourceMessageId: string,
): CanonicalChatUserMessage | null {
  const conversationId = buildChatConversationId(channelId);
  const turn = core.turns
    .filter((candidate) =>
      candidate.conversationId === conversationId
      && readChatCoreTurnMetadataString(candidate, 'sourceSenderKind') === 'user'
      && readChatCoreTurnMetadataString(candidate, 'sourceMessageId') === sourceMessageId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  if (!turn) {
    return null;
  }

  const body = readChatCoreTurnMetadataString(turn, 'sourceMessageBody');
  if (!body) {
    return null;
  }

  const lanes = core.lanes
    .filter((lane) => lane.turnId === turn.id && lane.conversationId === conversationId)
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const recipientParticipantIds = lanes
    .map((lane) => resolveRawChatParticipantId(lane.participantId, conversationId))
    .filter((participantId): participantId is string => Boolean(participantId));
  const workflowShape = readChatCoreTurnMetadataString(turn, 'workflowShape');

  return {
    id: sourceMessageId,
    channelId,
    senderKind: 'user',
    senderName: readChatCoreTurnMetadataString(turn, 'sourceSenderName') ?? 'User',
    body,
    mentions: [],
    metadata: {
      ...(recipientParticipantIds.length > 0
        ? {
            recipientParticipantIds,
          }
        : {}),
      ...(workflowShape
        ? {
            workflowShape,
          }
        : {}),
    },
    usage: null,
    executionProvider: null,
    executionModel: null,
    executionInstance: null,
    createdAt: turn.createdAt,
  };
}
