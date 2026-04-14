import type {
  CatsCoreState,
  CoreRecordMetadata,
  SegmentRecord,
  TurnRecord,
} from '../../../core/types.js';
import type { ChatMessage } from '../api/contracts.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { isAssistantTurnSegmentMessage } from './assistantTurnSegments.js';

export type CanonicalChatUserMessage = ChatMessage & { senderKind: 'user' };

interface CanonicalToolMetadata {
  toolName: string | null;
  toolId: string | null;
}

function readTurnSourceSenderKind(
  turn: TurnRecord,
): ChatMessage['senderKind'] {
  const metadataKind = readChatCoreTurnMetadataString(turn, 'sourceSenderKind');
  switch (metadataKind) {
    case 'agent':
    case 'system':
    case 'orchestrator':
      return metadataKind;
    default:
      return 'user';
  }
}

function buildCanonicalChatTurnMessage(
  core: CatsCoreState,
  channelId: string,
  sourceMessageId: string,
): ChatMessage | null {
  const conversationId = buildChatConversationId(channelId);
  const turn = core.turns
    .filter((candidate) =>
      candidate.conversationId === conversationId
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
    senderKind: readTurnSourceSenderKind(turn),
    senderName: readChatCoreTurnMetadataString(turn, 'sourceSenderName') ?? turn.kind,
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

function buildCanonicalChatSegmentMessage(
  core: CatsCoreState,
  channelId: string,
  sourceMessageId: string,
): ChatMessage | null {
  const conversationId = buildChatConversationId(channelId);
  const segment = core.segments
    .filter((candidate) =>
      candidate.conversationId === conversationId
      && readChatCoreMetadataString(candidate.metadata, 'chatMessageId') === sourceMessageId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  if (!segment) {
    return null;
  }

  const lane = core.lanes.find((candidate) =>
    candidate.id === segment.laneId
    && candidate.conversationId === conversationId) ?? null;
  const assistantTurnId = readChatCoreMetadataString(segment.metadata, 'assistantTurnId');
  const laneSegments = core.segments
    .filter((candidate) =>
      candidate.conversationId === conversationId
      && candidate.laneId === segment.laneId
      && candidate.kind === 'text'
      && (
        assistantTurnId
          ? readChatCoreMetadataString(candidate.metadata, 'assistantTurnId') === assistantTurnId
          : true
      ))
    .sort(compareChatCoreSegmentsAscending);
  const fullText = laneSegments
    .map((candidate) => candidate.content ?? '')
    .join('');
  if (!fullText.trim()) {
    return null;
  }
  const terminalSegment = laneSegments.at(-1) ?? segment;
  const workflowRecommendation = readChatCoreMetadataRecord(
    segment.metadata,
    'workflowRecommendation',
  ) ?? readChatCoreMetadataRecord(
    terminalSegment.metadata,
    'workflowRecommendation',
  );
  const precedingTools = collectCanonicalPrecedingTools(laneSegments);

  const targetKind = readChatCoreMetadataString(segment.metadata, 'targetKind')
    ?? readChatCoreMetadataString(lane?.metadata ?? null, 'participantKind');
  const targetId = readChatCoreMetadataString(segment.metadata, 'targetId')
    ?? resolveRawChatParticipantId(lane?.participantId ?? null, conversationId);
  const senderKind: ChatMessage['senderKind'] = targetKind === 'orchestrator'
    ? 'orchestrator'
    : 'agent';

  return {
    id: sourceMessageId,
    channelId,
    senderKind,
    senderName: readChatCoreMetadataString(lane?.metadata ?? null, 'speakerLabel') ?? senderKind,
    body: fullText,
    mentions: [],
    metadata: {
      event: 'assistant_turn_segment',
      ...(assistantTurnId ? { assistantTurnId } : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'targetStateId')
        ? { targetStateId: readChatCoreMetadataString(segment.metadata, 'targetStateId') }
        : {}),
      ...(targetKind ? { targetKind } : {}),
      ...(targetId ? { targetId } : {}),
      ...(segment.sessionId ? { sessionId: segment.sessionId } : {}),
      ...(segment.turnId ? { turnId: segment.turnId } : {}),
      ...(readChatCoreMetadataBoolean(segment.metadata, 'terminal') === true
        || readChatCoreMetadataBoolean(terminalSegment.metadata, 'terminal') === true
        ? { terminal: true }
        : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'routingTrigger')
        ? { routingTrigger: readChatCoreMetadataString(segment.metadata, 'routingTrigger') }
        : {}),
      ...(readChatCoreMetadataNumber(segment.metadata, 'dispatchDepth') !== null
        ? { dispatchDepth: readChatCoreMetadataNumber(segment.metadata, 'dispatchDepth') }
        : {}),
      ...(precedingTools.length > 0
        ? { precedingTools }
        : {}),
      ...(workflowRecommendation
        ? { workflowRecommendation }
        : {}),
    },
    usage: null,
    executionProvider: readChatCoreMetadataString(segment.metadata, 'executionProvider'),
    executionModel: readChatCoreMetadataString(segment.metadata, 'executionModel'),
    executionInstance: readChatCoreMetadataString(segment.metadata, 'executionInstance'),
    createdAt: segment.createdAt,
  };
}

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

export function readChatCoreMetadataBoolean(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): boolean | null {
  const value = metadata?.[key];
  return typeof value === 'boolean'
    ? value
    : null;
}

export function readChatCoreMetadataRecord(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = metadata?.[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : null;
}

function readChatCoreToolMetadataArray(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): CanonicalToolMetadata[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return [];
    }

    const toolName = typeof entry.toolName === 'string' ? entry.toolName : null;
    const toolId = typeof entry.toolId === 'string' ? entry.toolId : null;
    if (!toolName && !toolId) {
      return [];
    }

    return [{ toolName, toolId }];
  });
}

function collectCanonicalPrecedingTools(
  segments: ReadonlyArray<Pick<SegmentRecord, 'metadata'>>,
): CanonicalToolMetadata[] {
  const tools: CanonicalToolMetadata[] = [];

  for (const segment of segments) {
    tools.push(...readChatCoreToolMetadataArray(segment.metadata, 'precedingTools'));
  }

  return tools;
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
  const message = buildCanonicalChatTurnMessage(core, channelId, sourceMessageId);
  if (!message || message.senderKind !== 'user') {
    return null;
  }
  return message as CanonicalChatUserMessage;
}

export function buildCanonicalChatMessage(
  core: CatsCoreState,
  channelId: string,
  sourceMessageId: string,
): ChatMessage | null {
  return buildCanonicalChatSegmentMessage(core, channelId, sourceMessageId)
    ?? buildCanonicalChatTurnMessage(core, channelId, sourceMessageId);
}

export function resolveTranscriptOrCanonicalChatMessage(input: {
  core: CatsCoreState | null | undefined;
  channelId: string;
  transcriptMessages: ReadonlyArray<ChatMessage>;
  sourceMessageId: string;
}): ChatMessage | null {
  const transcriptMessage = input.transcriptMessages.find(
    (message) => message.id === input.sourceMessageId,
  ) ?? null;
  const canonicalMessage = input.core
    ? buildCanonicalChatMessage(input.core, input.channelId, input.sourceMessageId)
    : null;
  if (transcriptMessage && !isAssistantTurnSegmentMessage(transcriptMessage)) {
    return transcriptMessage;
  }
  return canonicalMessage ?? transcriptMessage;
}
