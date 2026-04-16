import type { ChatMessage } from '../../../api/contracts.js';
import type { SelectedChannelView } from '../../chatUtils.js';
import { buildChatLaneId } from '../../../../../shared/chatCoreIds.js';
import type {
  RoomWorkflowState,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../../../../shared/roomRouting.js';
import {
  createLiveIndicatorSegmentState,
  type LiveIndicatorContentBlock,
  type LiveIndicatorSegmentState,
} from '../../../../../shared/liveIndicator.js';

export interface TranscriptMessageRenderItem {
  kind: 'message';
  key: string;
  message: SelectedChannelView['messages'][number];
}

export interface ConcurrentClusterRenderItem {
  kind: 'concurrent_cluster';
  key: string;
  turnId: string;
  sourceMessageId: string;
  segments: LiveIndicatorSegmentState[];
}

export type ChatTranscriptRenderItem =
  | TranscriptMessageRenderItem
  | ConcurrentClusterRenderItem;

interface DurableConcurrentClusterProjection {
  item: ConcurrentClusterRenderItem;
  firstVisibleMessageId: string | null;
  visibleMessageIds: Set<string>;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readMessageEvent(message: Pick<ChatMessage, 'metadata'>): string | null {
  return readString(message.metadata?.event);
}

function readMessageTurnId(message: Pick<ChatMessage, 'metadata'>): string | null {
  return readString(message.metadata?.turnId);
}

function readMessageTargetStateId(message: Pick<ChatMessage, 'metadata'>): string | null {
  return readString(message.metadata?.targetStateId);
}

function readMessageLaneId(message: Pick<ChatMessage, 'metadata'>): string | null {
  return readString(message.metadata?.laneId);
}

function readMessageTargetId(message: Pick<ChatMessage, 'metadata'>): string | null {
  return readString(message.metadata?.targetId);
}

function readMessageSourceMessageId(message: Pick<ChatMessage, 'metadata'>): string | null {
  return readString(message.metadata?.sourceMessageId);
}

function readMessageSegmentIndex(message: Pick<ChatMessage, 'metadata'>): number | null {
  return readNumber(message.metadata?.segmentIndex);
}

function isTopLevelConcurrentTurn(turn: RoomWorkflowTurn): boolean {
  if (turn.workflowShape !== 'concurrent') {
    return false;
  }
  return turn.targetStatuses.filter((target) =>
    target.depth === 0 && target.source === null).length > 1;
}

function resolveTopLevelTargets(turn: RoomWorkflowTurn): RoomWorkflowTargetState[] {
  return turn.targetStatuses.filter((target) =>
    target.depth === 0 && target.source === null);
}

function resolveTargetLaneId(
  turn: RoomWorkflowTurn,
  target: RoomWorkflowTargetState,
): string {
  return target.laneId?.trim() || buildChatLaneId(
    turn.id,
    target.id,
    target.participant.participantId,
  );
}

function buildTextContentBlock(id: string, text: string): LiveIndicatorContentBlock {
  return {
    id,
    index: 0,
    kind: 'text',
    status: 'complete',
    title: null,
    text,
    toolName: null,
    toolId: null,
    metadata: null,
  };
}

function collectTargetMessages(input: {
  turn: RoomWorkflowTurn;
  target: RoomWorkflowTargetState;
  visibleMessages: SelectedChannelView['messages'];
}): SelectedChannelView['messages'] {
  const { turn, target, visibleMessages } = input;
  const responseMessageIds = new Set(target.response?.messageIds ?? []);
  const laneId = resolveTargetLaneId(turn, target);
  const matched = visibleMessages.filter((message) => {
    if (readMessageEvent(message) !== 'assistant_turn_segment') {
      return false;
    }
    if (responseMessageIds.has(message.id)) {
      return true;
    }
    if (readMessageTurnId(message) !== turn.id) {
      return false;
    }

    const messageTargetStateId = readMessageTargetStateId(message);
    if (messageTargetStateId && messageTargetStateId === target.id) {
      return true;
    }

    const messageLaneId = readMessageLaneId(message);
    if (messageLaneId && messageLaneId === laneId) {
      return true;
    }

    return readMessageSourceMessageId(message) === turn.sourceMessageId
      && readMessageTargetId(message) === target.participant.participantId;
  });

  return matched.sort((left, right) => {
    const leftIndex = readMessageSegmentIndex(left) ?? 0;
    const rightIndex = readMessageSegmentIndex(right) ?? 0;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function buildDurableClusterProjection(input: {
  turn: RoomWorkflowTurn;
  visibleMessages: SelectedChannelView['messages'];
  visibleMessageIndexById: Map<string, number>;
}): DurableConcurrentClusterProjection | null {
  const { turn, visibleMessages, visibleMessageIndexById } = input;
  const targets = resolveTopLevelTargets(turn);
  if (targets.length <= 1) {
    return null;
  }

  const segments: LiveIndicatorSegmentState[] = [];
  const visibleMessageIds = new Set<string>();
  let firstVisibleMessageId: string | null = null;
  let firstVisibleMessageIndex = Number.POSITIVE_INFINITY;

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex]!;
    const targetMessages = collectTargetMessages({
      turn,
      target,
      visibleMessages,
    });
    const fullText = target.response?.fullText ?? targetMessages.map((message) => message.body).join('');
    const normalizedText = fullText.trim();

    if (!normalizedText && targetMessages.length === 0) {
      continue;
    }

    for (const message of targetMessages) {
      visibleMessageIds.add(message.id);
      const messageIndex = visibleMessageIndexById.get(message.id) ?? Number.POSITIVE_INFINITY;
      if (messageIndex < firstVisibleMessageIndex) {
        firstVisibleMessageIndex = messageIndex;
        firstVisibleMessageId = message.id;
      }
    }

    segments.push(createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: turn.sourceMessageId,
      laneId: resolveTargetLaneId(turn, target),
      targetStateId: target.id,
      segmentIndex: targetIndex,
      sessionId: target.sessionId,
      participantId: target.participant.participantId,
      speakerLabel: target.participant.participantName,
      contentBlocks: normalizedText
        ? [buildTextContentBlock(`${turn.id}:${target.id}:text`, fullText)]
        : [],
    }));
  }

  if (segments.length <= 1 || firstVisibleMessageId == null) {
    return null;
  }

  return {
    item: {
      kind: 'concurrent_cluster',
      key: `concurrent-cluster:${turn.id}`,
      turnId: turn.id,
      sourceMessageId: turn.sourceMessageId,
      segments,
    },
    firstVisibleMessageId,
    visibleMessageIds,
  };
}

function resolveDurableConcurrentClusterProjections(input: {
  visibleMessages: SelectedChannelView['messages'];
  workflow: RoomWorkflowState;
}): DurableConcurrentClusterProjection[] {
  const visibleMessageIndexById = new Map(
    input.visibleMessages.map((message, index) => [message.id, index]),
  );
  const turnHistory = Array.isArray(input.workflow.turnHistory)
    ? input.workflow.turnHistory
    : [];

  return [...turnHistory]
    .reverse()
    .filter(isTopLevelConcurrentTurn)
    .map((turn) =>
      buildDurableClusterProjection({
        turn,
        visibleMessages: input.visibleMessages,
        visibleMessageIndexById,
      }))
    .filter((projection): projection is DurableConcurrentClusterProjection => projection != null);
}

export function resolveDurableConcurrentClusterMaxSegmentCount(input: {
  visibleMessages: SelectedChannelView['messages'];
  workflow: RoomWorkflowState;
}): number {
  return resolveDurableConcurrentClusterProjections(input).reduce(
    (maxSegments, projection) => Math.max(maxSegments, projection.item.segments.length),
    0,
  );
}

export function buildConcurrentTranscriptRenderItems(input: {
  visibleMessages: SelectedChannelView['messages'];
  workflow: RoomWorkflowState;
}): ChatTranscriptRenderItem[] {
  const clusterByFirstVisibleMessageId = new Map<string, ConcurrentClusterRenderItem>();
  const clusteredMessageIds = new Set<string>();

  for (const projection of resolveDurableConcurrentClusterProjections(input)) {
    if (projection.firstVisibleMessageId) {
      clusterByFirstVisibleMessageId.set(
        projection.firstVisibleMessageId,
        projection.item,
      );
    }
    for (const messageId of projection.visibleMessageIds) {
      clusteredMessageIds.add(messageId);
    }
  }

  const items: ChatTranscriptRenderItem[] = [];
  for (const message of input.visibleMessages) {
    const cluster = clusterByFirstVisibleMessageId.get(message.id);
    if (cluster) {
      items.push(cluster);
      continue;
    }
    if (clusteredMessageIds.has(message.id)) {
      continue;
    }
    items.push({
      kind: 'message',
      key: message.id,
      message,
    });
  }

  return items;
}
