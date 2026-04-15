import type {
  CatsCoreState,
  CoreRecordMetadata,
  SegmentRecord,
  TurnRecord,
} from '../../../core/types.js';
import type { ChatMessage } from '../api/contracts.js';
import { resolveChannelCanonicalIdentity } from './model/index.js';
import { isAssistantTurnSegmentMessage } from './assistantTurnSegments.js';

export type CanonicalChatUserMessage = ChatMessage & { senderKind: 'user' };

interface CanonicalToolMetadata {
  toolName: string | null;
  toolId: string | null;
}

function resolveCanonicalConversationId(channelId: string): string {
  return resolveChannelCanonicalIdentity(null, channelId).conversationId;
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
  const conversationId = resolveCanonicalConversationId(channelId);
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
      conversationId,
      ...(readChatCoreTurnMetadataString(turn, 'containerId')
        ? { containerId: readChatCoreTurnMetadataString(turn, 'containerId') }
        : {}),
      turnId: turn.id,
      ...(readChatCoreTurnMetadataString(turn, 'transportBindingId')
        ? { transportBindingId: readChatCoreTurnMetadataString(turn, 'transportBindingId') }
        : {}),
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
  const conversationId = resolveCanonicalConversationId(channelId);
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
      conversationId,
      ...(assistantTurnId ? { assistantTurnId } : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'targetStateId')
        ? { targetStateId: readChatCoreMetadataString(segment.metadata, 'targetStateId') }
        : {}),
      ...(targetKind ? { targetKind } : {}),
      ...(targetId ? { targetId } : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'containerId')
        || readChatCoreMetadataString(lane?.metadata ?? null, 'containerId')
        ? {
            containerId: readChatCoreMetadataString(segment.metadata, 'containerId')
              ?? readChatCoreMetadataString(lane?.metadata ?? null, 'containerId')
          }
        : {}),
      ...(segment.sessionId ? { sessionId: segment.sessionId } : {}),
      ...(segment.turnId ? { turnId: segment.turnId } : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'sourceTurnId')
        ? { sourceTurnId: readChatCoreMetadataString(segment.metadata, 'sourceTurnId') }
        : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'sourceLaneId')
        ? { sourceLaneId: readChatCoreMetadataString(segment.metadata, 'sourceLaneId') }
        : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'sourceAssistantTurnId')
        ? { sourceAssistantTurnId: readChatCoreMetadataString(segment.metadata, 'sourceAssistantTurnId') }
        : {}),
      ...(readChatCoreMetadataString(segment.metadata, 'transportBindingId')
        ? { transportBindingId: readChatCoreMetadataString(segment.metadata, 'transportBindingId') }
        : {}),
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

function pickPreferredCanonicalTextSegment(
  segments: ReadonlyArray<SegmentRecord>,
): SegmentRecord | null {
  const sortedSegments = [...segments].sort(compareChatCoreSegmentsDescending);
  return sortedSegments.find((candidate) =>
    readChatCoreMetadataBoolean(candidate.metadata, 'terminal') === true,
  ) ?? sortedSegments[0] ?? null;
}

function buildCanonicalChatSegmentMessageFromAssistantTurn(input: {
  core: CatsCoreState;
  channelId: string;
  sourceTurnId?: string | null;
  sourceLaneId?: string | null;
  sourceAssistantTurnId: string;
}): ChatMessage | null {
  const conversationId = resolveCanonicalConversationId(input.channelId);
  const matchingSegments = input.core.segments.filter((candidate) =>
    candidate.conversationId === conversationId
    && candidate.kind === 'text'
    && readChatCoreMetadataString(candidate.metadata, 'assistantTurnId') === input.sourceAssistantTurnId);
  const terminalSegment = pickPreferredCanonicalTextSegment(
    (input.sourceTurnId && input.sourceLaneId
      ? matchingSegments.filter((candidate) =>
        candidate.turnId === input.sourceTurnId && candidate.laneId === input.sourceLaneId)
      : [])
    ?? [],
  )
    ?? pickPreferredCanonicalTextSegment(
      input.sourceTurnId
        ? matchingSegments.filter((candidate) => candidate.turnId === input.sourceTurnId)
        : [],
    )
    ?? pickPreferredCanonicalTextSegment(
      input.sourceLaneId
        ? matchingSegments.filter((candidate) => candidate.laneId === input.sourceLaneId)
        : [],
    )
    ?? pickPreferredCanonicalTextSegment(matchingSegments);
  const sourceMessageId = readChatCoreMetadataString(terminalSegment?.metadata, 'chatMessageId');
  return sourceMessageId
    ? buildCanonicalChatSegmentMessage(input.core, input.channelId, sourceMessageId)
    : null;
}

function buildCanonicalChatSegmentMessageFromLane(input: {
  core: CatsCoreState;
  channelId: string;
  sourceTurnId?: string | null;
  sourceLaneId: string;
}): ChatMessage | null {
  const conversationId = resolveCanonicalConversationId(input.channelId);
  const lane = input.core.lanes.find((candidate) =>
    candidate.conversationId === conversationId
    && candidate.id === input.sourceLaneId
    && (input.sourceTurnId ? candidate.turnId === input.sourceTurnId : true)) ?? null;
  if (!lane) {
    return null;
  }

  const responseAssistantTurnId = readChatCoreMetadataString(
    lane.metadata,
    'responseAssistantTurnId',
  );
  if (responseAssistantTurnId) {
    const message = buildCanonicalChatSegmentMessageFromAssistantTurn({
      core: input.core,
      channelId: input.channelId,
      sourceTurnId: lane.turnId,
      sourceLaneId: lane.id,
      sourceAssistantTurnId: responseAssistantTurnId,
    });
    if (message) {
      return message;
    }
  }

  const terminalSegment = pickPreferredCanonicalTextSegment(input.core.segments
    .filter((candidate) =>
      candidate.conversationId === conversationId
      && candidate.kind === 'text'
      && candidate.laneId === lane.id
      && (input.sourceTurnId ? candidate.turnId === input.sourceTurnId : true)));
  const sourceMessageId = readChatCoreMetadataString(terminalSegment?.metadata, 'chatMessageId');
  return sourceMessageId
    ? buildCanonicalChatSegmentMessage(input.core, input.channelId, sourceMessageId)
    : null;
}

function buildCanonicalChatTurnMessageFromTurnId(
  core: CatsCoreState,
  channelId: string,
  sourceTurnId: string,
): ChatMessage | null {
  const conversationId = resolveCanonicalConversationId(channelId);
  const turn = core.turns.find((candidate) =>
    candidate.conversationId === conversationId && candidate.id === sourceTurnId) ?? null;
  const sourceMessageId = readChatCoreTurnMetadataString(turn, 'sourceMessageId');
  return sourceMessageId
    ? buildCanonicalChatTurnMessage(core, channelId, sourceMessageId)
    : null;
}

function buildCanonicalChatMessageFromSourceIdentity(input: {
  core: CatsCoreState;
  channelId: string;
  sourceTurnId?: string | null;
  sourceLaneId?: string | null;
  sourceAssistantTurnId?: string | null;
}): ChatMessage | null {
  return (input.sourceAssistantTurnId
    ? buildCanonicalChatSegmentMessageFromAssistantTurn({
      core: input.core,
      channelId: input.channelId,
      sourceTurnId: input.sourceTurnId,
      sourceLaneId: input.sourceLaneId,
      sourceAssistantTurnId: input.sourceAssistantTurnId,
    })
    : null)
    ?? (input.sourceLaneId
      ? buildCanonicalChatSegmentMessageFromLane({
        core: input.core,
        channelId: input.channelId,
        sourceTurnId: input.sourceTurnId,
        sourceLaneId: input.sourceLaneId,
      })
      : null)
    ?? (input.sourceTurnId
      ? buildCanonicalChatTurnMessageFromTurnId(
        input.core,
        input.channelId,
        input.sourceTurnId,
      )
      : null);
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

function compareConversationMessagePhase(
  left: ChatMessage,
  right: ChatMessage,
): number {
  const phaseOrder = (message: ChatMessage): number => {
    switch (message.senderKind) {
      case 'user':
        return 0;
      case 'system':
        return 1;
      default:
        return 2;
    }
  };

  return phaseOrder(left) - phaseOrder(right);
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

function buildCanonicalConversationTurnMessages(
  core: CatsCoreState,
  channelId: string,
): ChatMessage[] {
  const conversationId = resolveCanonicalConversationId(channelId);
  return core.turns
    .filter((turn) =>
      turn.conversationId === conversationId
      && readTurnSourceSenderKind(turn) === 'user'
      && readChatCoreTurnMetadataString(turn, 'sourceMessageId') !== null)
    .flatMap((turn) => {
      const sourceMessageId = readChatCoreTurnMetadataString(turn, 'sourceMessageId');
      if (!sourceMessageId) {
        return [];
      }

      const message = buildCanonicalChatTurnMessage(core, channelId, sourceMessageId);
      return message ? [message] : [];
    });
}

function buildCanonicalConversationAssistantMessages(
  core: CatsCoreState,
  channelId: string,
): ChatMessage[] {
  const conversationId = resolveCanonicalConversationId(channelId);
  const assistantMessageIds = new Set<string>();

  for (const segment of core.segments) {
    if (segment.conversationId !== conversationId || segment.kind !== 'text') {
      continue;
    }

    const chatMessageId = readChatCoreMetadataString(segment.metadata, 'chatMessageId');
    if (!chatMessageId) {
      continue;
    }

    if (readChatCoreMetadataBoolean(segment.metadata, 'terminal') === true) {
      assistantMessageIds.add(chatMessageId);
      continue;
    }

    const assistantTurnId = readChatCoreMetadataString(segment.metadata, 'assistantTurnId');
    if (!assistantTurnId) {
      assistantMessageIds.add(chatMessageId);
    }
  }

  return [...assistantMessageIds]
    .flatMap((messageId) => {
      const message = buildCanonicalChatSegmentMessage(core, channelId, messageId);
      return message ? [message] : [];
    });
}

export function buildCanonicalConversationMessages(
  core: CatsCoreState,
  channelId: string,
): ChatMessage[] {
  const dedupedMessages = new Map<string, ChatMessage>();

  for (const message of [
    ...buildCanonicalConversationTurnMessages(core, channelId),
    ...buildCanonicalConversationAssistantMessages(core, channelId),
  ]) {
    dedupedMessages.set(message.id, message);
  }

  return [...dedupedMessages.values()].sort((left, right) => {
    const createdComparison = left.createdAt.localeCompare(right.createdAt);
    if (createdComparison !== 0) {
      return createdComparison;
    }

    const phaseComparison = compareConversationMessagePhase(left, right);
    if (phaseComparison !== 0) {
      return phaseComparison;
    }

    return left.id.localeCompare(right.id);
  });
}

export function resolveTranscriptOrCanonicalConversationMessages(input: {
  core: CatsCoreState | null | undefined;
  channelId: string;
  transcriptMessages: ReadonlyArray<ChatMessage>;
}): ChatMessage[] {
  if (!input.core) {
    return [...input.transcriptMessages];
  }

  const canonicalMessages = buildCanonicalConversationMessages(input.core, input.channelId);
  const canonicalMessageIds = new Set(canonicalMessages.map((message) => message.id));
  const canonicalAssistantTurnIds = new Set(
    canonicalMessages.flatMap((message) => {
      if (!isAssistantTurnSegmentMessage(message)) {
        return [];
      }

      const assistantTurnId = typeof message.metadata?.assistantTurnId === 'string'
        ? message.metadata.assistantTurnId.trim()
        : '';
      return assistantTurnId.length > 0 ? [assistantTurnId] : [];
    }),
  );
  const transcriptIndexById = new Map<string, number>();
  const dedupedMessages = new Map<string, ChatMessage>();
  input.transcriptMessages.forEach((message, index) => {
    if (isAssistantTurnSegmentMessage(message)) {
      const assistantTurnId = typeof message.metadata?.assistantTurnId === 'string'
        ? message.metadata.assistantTurnId.trim()
        : '';
      if (
        assistantTurnId.length > 0
        && canonicalAssistantTurnIds.has(assistantTurnId)
        && !canonicalMessageIds.has(message.id)
      ) {
        return;
      }
    }
    transcriptIndexById.set(message.id, index);
    dedupedMessages.set(message.id, message);
  });

  for (const message of canonicalMessages) {
    if (!dedupedMessages.has(message.id)) {
      dedupedMessages.set(message.id, message);
    }
  }

  return [...dedupedMessages.values()].sort((left, right) => {
    const createdComparison = left.createdAt.localeCompare(right.createdAt);
    if (createdComparison !== 0) {
      return createdComparison;
    }

    const phaseComparison = compareConversationMessagePhase(left, right);
    if (phaseComparison !== 0) {
      return phaseComparison;
    }

    const leftTranscriptIndex = transcriptIndexById.get(left.id);
    const rightTranscriptIndex = transcriptIndexById.get(right.id);
    if (leftTranscriptIndex !== undefined && rightTranscriptIndex !== undefined) {
      return leftTranscriptIndex - rightTranscriptIndex;
    }
    if (leftTranscriptIndex !== undefined) {
      return -1;
    }
    if (rightTranscriptIndex !== undefined) {
      return 1;
    }

    return left.id.localeCompare(right.id);
  });
}

export function resolveTranscriptOrCanonicalChatMessage(input: {
  core: CatsCoreState | null | undefined;
  channelId: string;
  transcriptMessages: ReadonlyArray<ChatMessage>;
  sourceMessageId: string;
  sourceTurnId?: string | null;
  sourceLaneId?: string | null;
  sourceAssistantTurnId?: string | null;
}): ChatMessage | null {
  const transcriptMessage = input.transcriptMessages.find(
    (message) => message.id === input.sourceMessageId,
  ) ?? null;
  if (transcriptMessage && !isAssistantTurnSegmentMessage(transcriptMessage)) {
    return transcriptMessage;
  }
  const identityMessage = input.core
    ? buildCanonicalChatMessageFromSourceIdentity({
      core: input.core,
      channelId: input.channelId,
      sourceTurnId: input.sourceTurnId,
      sourceLaneId: input.sourceLaneId,
      sourceAssistantTurnId: input.sourceAssistantTurnId,
    })
    : null;
  const canonicalMessage = input.core
    ? buildCanonicalChatMessage(input.core, input.channelId, input.sourceMessageId)
    : null;
  return identityMessage ?? canonicalMessage ?? transcriptMessage;
}
