import type {
  ConversationId,
  LaneId,
  SessionId,
  TurnId,
} from '../../core/types.js';
import type {
  RuntimeMessageResult,
  RuntimeMessageSegment,
  RuntimeSessionStreamEvent,
} from '../../runtime/client.js';
import { normalizeRuntimeContentBlock } from '../../shared/runtimeContentBlocks.js';
import {
  ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION,
  type NormalizedRuntimeDeliveryEvent,
  type NormalizedRuntimeDeliveryKind,
  type RuntimeDeliveryContentBlock,
} from './contracts.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readFiniteIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cloneRuntimeDeliveryContentBlock(
  value: RuntimeDeliveryContentBlock | null,
): RuntimeDeliveryContentBlock | null {
  return value ? { ...value } : null;
}

function toRuntimeDeliveryContentBlock(
  event: RuntimeSessionStreamEvent,
): RuntimeDeliveryContentBlock | null {
  const normalized = normalizeRuntimeContentBlock(event.data);
  if (!normalized) {
    return null;
  }

  return {
    id: normalized.id,
    index: normalized.index,
    kind: normalized.kind,
    status: normalized.status,
    title: normalized.title,
    text: normalized.text,
    toolName: normalized.toolName,
    toolId: normalized.toolId,
    metadata: normalized.metadata,
  };
}

function resolveNormalizedRuntimeDeliveryKind(input: {
  event: RuntimeSessionStreamEvent;
  contentBlock: RuntimeDeliveryContentBlock | null;
}): NormalizedRuntimeDeliveryKind {
  if (input.event.event === 'error') {
    return 'error';
  }
  if (input.event.event === 'result') {
    return 'result';
  }
  if (
    input.event.event === 'session_started'
    || input.event.event === 'session_closed'
    || readString(asRecord(input.event.data.metadata)?.event) === 'session_started'
  ) {
    return 'session_status';
  }
  if (input.contentBlock) {
    return 'content_block';
  }

  return 'progress';
}

function resolveNormalizedRuntimeDeliverySegmentIndex(input: {
  event: RuntimeSessionStreamEvent;
  contentBlock: RuntimeDeliveryContentBlock | null;
}): number {
  return readFiniteIndex(input.event.data.segmentIndex)
    ?? input.contentBlock?.index
    ?? 0;
}

function buildResultContentBlock(
  segment: RuntimeMessageSegment,
  index: number,
): RuntimeDeliveryContentBlock {
  return {
    id: `result-block-${index}`,
    index,
    kind: segment.kind === 'text' ? 'text' : 'tool',
    status: 'complete',
    title: segment.kind === 'text' ? null : segment.toolName,
    text: segment.text,
    toolName: segment.toolName,
    toolId: segment.toolId,
    metadata: {
      source: 'runtime_result',
      segmentKind: segment.kind,
    },
  };
}

export interface BuildNormalizedRuntimeDeliveryEventInput {
  conversationId: ConversationId;
  turnId: TurnId;
  laneId: LaneId;
  sessionId?: SessionId | null;
  event: RuntimeSessionStreamEvent;
  eventIndex: number;
  emittedAt?: string | null;
}

export interface BuildNormalizedRuntimeDeliveryEventsFromResultInput {
  conversationId: ConversationId;
  turnId: TurnId;
  laneId: LaneId;
  sessionId?: SessionId | null;
  result: RuntimeMessageResult;
  emittedAt?: string | null;
}

export function buildNormalizedRuntimeDeliveryEvent(
  input: BuildNormalizedRuntimeDeliveryEventInput,
): NormalizedRuntimeDeliveryEvent {
  const contentBlock = toRuntimeDeliveryContentBlock(input.event);
  const kind = resolveNormalizedRuntimeDeliveryKind({
    event: input.event,
    contentBlock,
  });
  const segmentIndex = resolveNormalizedRuntimeDeliverySegmentIndex({
    event: input.event,
    contentBlock,
  });
  const emittedAt = readString(input.emittedAt) ?? new Date().toISOString();

  return {
    version: ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION,
    conversationId: input.conversationId,
    turnId: input.turnId,
    laneId: input.laneId,
    sessionId: input.sessionId ?? null,
    kind,
    sourceEvent: input.event.event,
    eventId: `${input.turnId}:${input.laneId}:${input.eventIndex}:${input.event.event}`,
    emittedAt,
    sequence: {
      segmentIndex,
      blockIndex: contentBlock?.index ?? null,
      eventIndex: input.eventIndex,
    },
    payload: { ...input.event.data },
    contentBlock: cloneRuntimeDeliveryContentBlock(contentBlock),
  };
}

export function buildNormalizedRuntimeDeliveryEventsFromResult(
  input: BuildNormalizedRuntimeDeliveryEventsFromResultInput,
): NormalizedRuntimeDeliveryEvent[] {
  const emittedAt = readString(input.emittedAt) ?? new Date().toISOString();
  const events: NormalizedRuntimeDeliveryEvent[] = input.result.segments.map((segment, index) => {
    const contentBlock = buildResultContentBlock(segment, index);
    return {
      version: ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION,
      conversationId: input.conversationId,
      turnId: input.turnId,
      laneId: input.laneId,
      sessionId: input.sessionId ?? null,
      kind: 'content_block',
      sourceEvent: 'result',
      eventId: `${input.turnId}:${input.laneId}:result-block:${index}`,
      emittedAt,
      sequence: {
        segmentIndex: index,
        blockIndex: index,
        eventIndex: index,
      },
      payload: {
        segmentIndex: index,
        result: {
          inputTokens: input.result.inputTokens,
          outputTokens: input.result.outputTokens,
          tokensUsed: input.result.tokensUsed,
        },
      },
      contentBlock,
    };
  });

  events.push({
    version: ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION,
    conversationId: input.conversationId,
    turnId: input.turnId,
    laneId: input.laneId,
    sessionId: input.sessionId ?? null,
    kind: 'result',
    sourceEvent: 'result',
    eventId: `${input.turnId}:${input.laneId}:result`,
    emittedAt,
    sequence: {
      segmentIndex: input.result.segments.length,
      blockIndex: null,
      eventIndex: input.result.segments.length,
    },
    payload: {
      inputTokens: input.result.inputTokens,
      outputTokens: input.result.outputTokens,
      tokensUsed: input.result.tokensUsed,
      segmentCount: input.result.segments.length,
    },
    contentBlock: null,
  });

  return events;
}
