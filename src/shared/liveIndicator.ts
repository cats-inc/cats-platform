import {
  normalizeRuntimeContentBlock,
  type LiveIndicatorContentBlock,
} from './runtimeContentBlocks.js';
import { isBrowserLiveTraceEnabled, pushBrowserLiveTrace } from './liveTrace.js';
export type { LiveIndicatorContentBlock } from './runtimeContentBlocks.js';

export interface LiveToolEntry {
  toolName: string;
  toolId: string;
  done: boolean;
}

export interface LiveIndicatorEventEntry {
  eventType: 'progress' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'error';
  label: string;
  text: string;
  tone: 'default' | 'active' | 'success' | 'error';
  kind: string | null;
  toolName: string | null;
  toolId: string | null;
}

export interface LiveIndicatorState {
  active: boolean;
  phase: 'idle' | 'waiting' | 'streaming';
  catId: string | null;
  activeCatIds: string[];
  catName: string | null;
  speakerLabel: string | null;
  progressText: string;
  previewText: string;
  progressKind: string | null;
  tools: LiveToolEntry[];
  contentBlocks: LiveIndicatorContentBlock[];
  events: LiveIndicatorEventEntry[];
}

export interface LiveIndicatorTranscriptMessageLike {
  id: string;
  channelId?: string;
  senderKind: string;
  senderName?: string;
  metadata?: Record<string, unknown> | null | undefined;
  createdAt: string;
}

const MAX_LIVE_INDICATOR_BLOCKS = 12;
const MAX_LIVE_INDICATOR_EVENTS = 8;
const MAX_EVENT_TEXT = 220;

export const EMPTY_LIVE_INDICATOR: LiveIndicatorState = {
  active: false,
  phase: 'idle',
  catId: null,
  activeCatIds: [],
  catName: null,
  speakerLabel: null,
  progressText: '',
  previewText: '',
  progressKind: null,
  tools: [],
  contentBlocks: [],
  events: [],
};

export function createWaitingLiveIndicatorState(input: {
  catId: string | null;
  speakerLabel: string | null;
}): LiveIndicatorState {
  return {
    active: true,
    phase: 'waiting',
    // Waiting is intentionally anonymous until session startup is confirmed.
    catId: null,
    activeCatIds: [],
    catName: null,
    speakerLabel: null,
    progressText: '',
    previewText: '',
    progressKind: null,
    tools: [],
    contentBlocks: [],
    events: [],
  };
}

export function resolveLiveIndicatorSpeakerState(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): Pick<LiveIndicatorState, 'catId' | 'activeCatIds' | 'speakerLabel'> {
  const hasCatId = Object.prototype.hasOwnProperty.call(data, 'catId');
  const hasSpeakerLabel = Object.prototype.hasOwnProperty.call(data, 'speakerLabel');
  const nextCatId = hasCatId
    ? readNullableString(data.catId)
    : previous.catId;
  const nextSpeakerLabel = hasSpeakerLabel
    ? readNullableString(data.speakerLabel)
    : previous.speakerLabel;

  return {
    catId: nextCatId,
    activeCatIds: nextCatId ? [nextCatId] : [],
    speakerLabel: nextSpeakerLabel,
  };
}

export function applyLiveIndicatorEvent(
  previous: LiveIndicatorState,
  eventType: string,
  data: Record<string, unknown>,
): LiveIndicatorState {
  if (!previous.active) {
    return previous;
  }

  const nextSpeakerState = resolveLiveIndicatorSpeakerState(previous, data);
  const nextState = {
    ...previous,
    ...nextSpeakerState,
  };

  switch (eventType) {
    case 'progress':
      return applyProgressEvent(nextState, data);
    case 'text':
      return applyTextEvent(nextState, data);
    case 'tool_use':
      return applyToolUseEvent(nextState, data);
    case 'tool_result':
      return applyToolResultEvent(nextState, data);
    case 'content_block':
      return applyContentBlockEvent(nextState, data);
    case 'result':
      return applyResultEvent(nextState);
    case 'session_closed':
      return nextState.phase === 'waiting' ? nextState : applyResultEvent(nextState);
    case 'error':
      return applyErrorEvent(nextState, data);
    default:
      return nextState;
  }
}

export function buildLiveIndicatorScrollKey(
  liveIndicator: LiveIndicatorState | null | undefined,
): string {
  if (!liveIndicator) {
    return '';
  }

  return [
    liveIndicator.active ? '1' : '0',
    liveIndicator.phase,
    liveIndicator.activeCatIds.join('|'),
    liveIndicator.catId ?? '',
    liveIndicator.speakerLabel ?? '',
    liveIndicator.progressText ?? '',
    liveIndicator.previewText ?? '',
    liveIndicator.tools
      .map((tool) => `${tool.toolId}:${tool.toolName}:${tool.done ? '1' : '0'}`)
      .join('|'),
    liveIndicator.contentBlocks
      .map((block) => [
        block.id,
        String(block.index),
        block.kind,
        block.status,
        block.title ?? '',
        block.text,
        block.toolId ?? '',
      ].join(':'))
      .join('|'),
    liveIndicator.events
      .map((event) => [
        event.eventType,
        event.label,
        event.text,
        event.tone,
        event.kind ?? '',
        event.toolId ?? '',
      ].join(':'))
      .join('|'),
  ].join('::');
}

export function resolveVisibleLiveIndicator<TMessage extends LiveIndicatorTranscriptMessageLike>(
  liveIndicator: LiveIndicatorState | null | undefined,
  messages: ReadonlyArray<TMessage>,
  activeTurnUpdatedAt: string | null | undefined,
): LiveIndicatorState | null {
  if (!liveIndicator?.active) {
    return liveIndicator ?? null;
  }

  if (!activeTurnUpdatedAt) {
    return liveIndicator;
  }

  const activeTurnTimestamp = Date.parse(activeTurnUpdatedAt);
  if (Number.isNaN(activeTurnTimestamp)) {
    return liveIndicator;
  }

  const latestVisibleReplyTimestamp = resolveLatestVisibleReplyTimestamp(messages);
  if (liveIndicator.phase !== 'streaming' || !hasExplicitLiveIndicatorSpeaker(liveIndicator)) {
    const visible = latestVisibleReplyTimestamp < activeTurnTimestamp;
    traceLiveIndicatorVisibility({
      liveIndicator,
      messages,
      activeTurnUpdatedAt,
      visible,
      reason: visible ? 'visible_before_identity' : 'reply_after_active_turn',
      latestReplyTimestamp: latestVisibleReplyTimestamp,
    });
    return visible ? liveIndicator : null;
  }

  const latestSpeakerReplyTimestamp = resolveLatestVisibleReplyTimestamp(
    messages,
    (message) => doesMessageMatchLiveIndicatorSpeaker(message, liveIndicator),
  );
  const visible = latestSpeakerReplyTimestamp < activeTurnTimestamp;
  traceLiveIndicatorVisibility({
    liveIndicator,
    messages,
    activeTurnUpdatedAt,
    visible,
    reason: visible ? 'speaker_still_streaming' : 'same_speaker_reply_visible',
    latestReplyTimestamp: latestSpeakerReplyTimestamp,
  });
  return visible ? liveIndicator : null;
}

export function resolveTranscriptFollowState<TMessage extends LiveIndicatorTranscriptMessageLike>(
  liveIndicator: LiveIndicatorState | null | undefined,
  messages: ReadonlyArray<TMessage>,
  activeTurnUpdatedAt: string | null | undefined,
): {
  visibleLiveIndicator: LiveIndicatorState | null;
  transcriptScrollKey: string;
} {
  const visibleLiveIndicator = resolveVisibleLiveIndicator(
    liveIndicator,
    messages,
    activeTurnUpdatedAt,
  );
  const lastMessage = messages.at(-1);

  return {
    visibleLiveIndicator,
    transcriptScrollKey: [
      messages.length,
      lastMessage?.id ?? '',
      lastMessage?.createdAt ?? '',
      buildLiveIndicatorScrollKey(visibleLiveIndicator),
    ].join('::'),
  };
}

function applyProgressEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const text = summarizeEventText(data.text);
  const metadata = asRecord(data.metadata);
  const kind = typeof metadata?.kind === 'string' ? metadata.kind : null;
  if (!text) {
    return {
      ...previous,
      phase: 'streaming',
      ...(kind ? { progressKind: kind } : {}),
    };
  }

  return {
    ...previous,
    phase: 'streaming',
    progressText: text,
    progressKind: kind,
    events: appendLiveIndicatorEvent(previous.events, {
      eventType: 'progress',
      label: progressLabel(kind),
      text,
      tone: kind === 'reasoning' ? 'default' : 'active',
      kind,
      toolName: null,
      toolId: null,
    }),
  };
}

function applyTextEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const previewText = typeof data.text === 'string' ? data.text : '';
  const summarizedText = summarizeEventText(data.text);
  if (!previewText && !summarizedText) {
    return {
      ...previous,
      phase: 'streaming',
    };
  }

  return {
    ...previous,
    phase: 'streaming',
    previewText: previewText ? `${previous.previewText}${previewText}` : previous.previewText,
    progressText: '',
    progressKind: null,
    events: summarizedText
      ? appendLiveIndicatorEvent(previous.events, {
        eventType: 'text',
        label: 'Text',
        text: summarizedText,
        tone: 'default',
        kind: 'text',
        toolName: null,
        toolId: null,
      })
      : previous.events,
  };
}

function applyToolUseEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const toolName = readString(data.toolName) || 'tool';
  const toolId = readString(data.toolId);
  const nextTools = appendPendingTool(previous.tools, {
    toolName,
    toolId: toolId || toolName,
  });

  return {
    ...previous,
    phase: 'streaming',
    tools: nextTools,
    events: appendLiveIndicatorEvent(previous.events, {
      eventType: 'tool_use',
      label: 'Tool',
      text: `Started ${toolName}`,
      tone: 'active',
      kind: 'tool',
      toolName,
      toolId: toolId || toolName,
    }),
  };
}

function applyToolResultEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const toolId = readString(data.toolId);
  const toolName = readString(data.toolName) || findToolName(previous.tools, toolId) || 'tool';
  const resultText = summarizeEventText(data.text);
  const isError = data.isError === true;
  const nextTools = markToolDone(previous.tools, toolId, toolName);
  const text = resultText
    ? `${isError ? 'Failed' : 'Completed'} ${toolName}: ${resultText}`
    : `${isError ? 'Failed' : 'Completed'} ${toolName}`;

  return {
    ...previous,
    phase: 'streaming',
    tools: nextTools,
    events: appendLiveIndicatorEvent(previous.events, {
      eventType: 'tool_result',
      label: isError ? 'Tool Error' : 'Tool',
      text,
      tone: isError ? 'error' : 'success',
      kind: 'tool',
      toolName,
      toolId: toolId || toolName,
    }),
  };
}

function applyResultEvent(previous: LiveIndicatorState): LiveIndicatorState {
  const text = previous.previewText ? '' : (previous.progressText || 'Finalizing...');
  return {
    ...previous,
    phase: 'streaming',
    progressKind: previous.previewText ? null : 'finalizing',
    progressText: text,
    events: appendLiveIndicatorEvent(previous.events, {
      eventType: 'result',
      label: 'Result',
      text: 'Turn completed.',
      tone: 'success',
      kind: 'finalizing',
      toolName: null,
      toolId: null,
    }),
  };
}

function applyContentBlockEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const block = normalizeRuntimeContentBlock(data);
  if (!block) {
    return previous;
  }

  const withoutBlock = previous.contentBlocks.filter((candidate) => candidate.id !== block.id);
  const nextContentBlocks = [...withoutBlock, block]
    .sort((left, right) => left.index - right.index)
    .slice(-MAX_LIVE_INDICATOR_BLOCKS);

  return {
    ...previous,
    phase: 'streaming',
    contentBlocks: nextContentBlocks,
  };
}

function applyErrorEvent(
  previous: LiveIndicatorState,
  data: Record<string, unknown>,
): LiveIndicatorState {
  const text = summarizeEventText(data.text) || 'Finishing...';
  return {
    ...previous,
    phase: 'streaming',
    progressKind: 'error',
    progressText: text,
    events: appendLiveIndicatorEvent(previous.events, {
      eventType: 'error',
      label: 'Error',
      text,
      tone: 'error',
      kind: 'error',
      toolName: null,
      toolId: null,
    }),
  };
}

function appendPendingTool(
  tools: LiveToolEntry[],
  next: Pick<LiveToolEntry, 'toolName' | 'toolId'>,
): LiveToolEntry[] {
  if (tools.some((tool) => tool.toolId === next.toolId && !tool.done)) {
    return tools;
  }

  return [...tools, { ...next, done: false }];
}

function markToolDone(
  tools: LiveToolEntry[],
  toolId: string | null,
  toolName: string,
): LiveToolEntry[] {
  let matched = false;
  const next = tools.map((tool) => {
    if (
      (toolId && tool.toolId === toolId)
      || (!toolId && !matched && tool.toolName === toolName && !tool.done)
    ) {
      matched = true;
      return { ...tool, done: true };
    }
    return tool;
  });

  if (!matched) {
    return [...next, { toolName, toolId: toolId || toolName, done: true }];
  }

  return next;
}

function findToolName(
  tools: LiveToolEntry[],
  toolId: string | null,
): string | null {
  if (!toolId) {
    return null;
  }
  return tools.find((tool) => tool.toolId === toolId)?.toolName ?? null;
}

function appendLiveIndicatorEvent(
  events: LiveIndicatorEventEntry[],
  next: LiveIndicatorEventEntry,
): LiveIndicatorEventEntry[] {
  if (!next.text) {
    return events;
  }

  const previous = events.at(-1);
  if (
    previous
    && previous.eventType === next.eventType
    && previous.text === next.text
    && previous.toolId === next.toolId
  ) {
    return events;
  }

  if (previous && previous.eventType === 'text' && next.eventType === 'text') {
    const mergedText = summarizeEventText(`${previous.text} ${next.text}`);
    const merged = {
      ...previous,
      text: mergedText,
    } satisfies LiveIndicatorEventEntry;
    return trimLiveIndicatorEvents([...events.slice(0, -1), merged]);
  }

  return trimLiveIndicatorEvents([...events, next]);
}

function trimLiveIndicatorEvents(
  events: LiveIndicatorEventEntry[],
): LiveIndicatorEventEntry[] {
  if (events.length <= MAX_LIVE_INDICATOR_EVENTS) {
    return events;
  }
  return events.slice(events.length - MAX_LIVE_INDICATOR_EVENTS);
}

function progressLabel(kind: string | null): string {
  switch (kind) {
    case 'tool':
      return 'Tool';
    case 'reasoning':
      return 'Reasoning';
    case 'plan':
      return 'Plan';
    case 'command':
      return 'Command';
    case 'files':
      return 'Files';
    case 'model_state':
      return 'Model';
    case 'session':
      return 'Session';
    default:
      return 'Progress';
  }
}

function summarizeEventText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (!singleLine) {
    return '';
  }
  return singleLine.length > MAX_EVENT_TEXT
    ? `${singleLine.slice(0, MAX_EVENT_TEXT - 1)}…`
    : singleLine;
}

function resolveLatestVisibleReplyTimestamp<TMessage extends LiveIndicatorTranscriptMessageLike>(
  messages: ReadonlyArray<TMessage>,
  predicate?: (message: TMessage) => boolean,
): number {
  return messages.reduce((latestTimestamp, message) => {
    if (!isVisibleAssistantReply(message) || (predicate && !predicate(message))) {
      return latestTimestamp;
    }

    const messageTimestamp = Date.parse(message.createdAt);
    if (Number.isNaN(messageTimestamp)) {
      return latestTimestamp;
    }

    return Math.max(latestTimestamp, messageTimestamp);
  }, Number.NEGATIVE_INFINITY);
}

function isVisibleAssistantReply(
  message: LiveIndicatorTranscriptMessageLike,
): boolean {
  return message.senderKind !== 'user' && message.senderKind !== 'system';
}

function hasExplicitLiveIndicatorSpeaker(
  liveIndicator: LiveIndicatorState,
): boolean {
  return Boolean(
    readString(liveIndicator.speakerLabel)
    || liveIndicator.catId
    || liveIndicator.activeCatIds.some((id) => id.trim().length > 0)
  );
}

function doesMessageMatchLiveIndicatorSpeaker(
  message: LiveIndicatorTranscriptMessageLike,
  liveIndicator: LiveIndicatorState,
): boolean {
  const messageTargetId = readMessageTargetId(message);
  const liveTargetId = liveIndicator.catId
    ?? liveIndicator.activeCatIds.find((id) => id.trim().length > 0)
    ?? null;
  if (messageTargetId && liveTargetId && messageTargetId === liveTargetId) {
    return true;
  }

  const liveSpeakerLabel = readString(liveIndicator.speakerLabel);
  if (!liveSpeakerLabel) {
    return false;
  }

  return readString(message.senderName) === liveSpeakerLabel
    || readMessageExecutionLabelSnapshot(message) === liveSpeakerLabel;
}

function traceLiveIndicatorVisibility<TMessage extends LiveIndicatorTranscriptMessageLike>(input: {
  liveIndicator: LiveIndicatorState;
  messages: ReadonlyArray<TMessage>;
  activeTurnUpdatedAt: string;
  visible: boolean;
  reason: string;
  latestReplyTimestamp: number;
}): void {
  if (!isBrowserLiveTraceEnabled()) {
    return;
  }

  const lastMessage = input.messages.at(-1);
  pushBrowserLiveTrace({
    event: 'visibility_decision',
    channelId: lastMessage?.channelId ?? null,
    speakerLabel: input.liveIndicator.speakerLabel,
    catId: input.liveIndicator.catId,
    activeTurnUpdatedAt: input.activeTurnUpdatedAt,
    visible: input.visible,
    reason: input.reason,
    details: {
      phase: input.liveIndicator.phase,
      lastMessageId: lastMessage?.id ?? null,
      latestReplyAt:
        Number.isFinite(input.latestReplyTimestamp) && input.latestReplyTimestamp > Number.NEGATIVE_INFINITY
          ? new Date(input.latestReplyTimestamp).toISOString()
          : null,
    },
    signature: [
      input.liveIndicator.phase,
      input.liveIndicator.speakerLabel ?? '',
      input.liveIndicator.catId ?? '',
      input.activeTurnUpdatedAt,
      input.visible ? '1' : '0',
      input.reason,
      lastMessage?.id ?? '',
    ].join('::'),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readMessageTargetId(
  message: LiveIndicatorTranscriptMessageLike,
): string | null {
  const metadata = asRecord(message.metadata);
  return readString(metadata?.targetId);
}

function readMessageExecutionLabelSnapshot(
  message: LiveIndicatorTranscriptMessageLike,
): string | null {
  const metadata = asRecord(message.metadata);
  return readString(metadata?.executionLabelSnapshot);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function readNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return readString(value);
}
