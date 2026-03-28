import {
  normalizeRuntimeContentBlock,
  type LiveIndicatorContentBlock,
} from './runtimeContentBlocks.js';
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
  catName: string | null;
  speakerLabel: string | null;
  progressText: string;
  progressKind: string | null;
  tools: LiveToolEntry[];
  contentBlocks: LiveIndicatorContentBlock[];
  events: LiveIndicatorEventEntry[];
}

const MAX_LIVE_INDICATOR_BLOCKS = 12;
const MAX_LIVE_INDICATOR_EVENTS = 8;
const MAX_TEXT_PREVIEW = 200;
const MAX_EVENT_TEXT = 220;

export const EMPTY_LIVE_INDICATOR: LiveIndicatorState = {
  active: false,
  phase: 'idle',
  catId: null,
  catName: null,
  speakerLabel: null,
  progressText: '',
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
    catId: input.catId,
    catName: null,
    speakerLabel: input.speakerLabel,
    progressText: '',
    progressKind: null,
    tools: [],
    contentBlocks: [],
    events: [],
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

  switch (eventType) {
    case 'progress':
      return applyProgressEvent(previous, data);
    case 'text':
      return applyTextEvent(previous, data);
    case 'tool_use':
      return applyToolUseEvent(previous, data);
    case 'tool_result':
      return applyToolResultEvent(previous, data);
    case 'content_block':
      return applyContentBlockEvent(previous, data);
    case 'result':
      return applyResultEvent(previous);
    case 'session_closed':
      return previous.phase === 'waiting' ? previous : applyResultEvent(previous);
    case 'error':
      return applyErrorEvent(previous, data);
    default:
      return previous;
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
    liveIndicator.catId ?? '',
    liveIndicator.speakerLabel ?? '',
    liveIndicator.progressText ?? '',
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
  const rawText = summarizeEventText(data.text);
  if (!rawText) {
    return {
      ...previous,
      phase: 'streaming',
    };
  }

  const nextProgressText = previous.phase === 'waiting' || !previous.progressText
    ? rawText.slice(0, MAX_TEXT_PREVIEW)
    : previous.progressText;
  const nextProgressKind = previous.phase === 'waiting' || !previous.progressKind
    ? 'text'
    : previous.progressKind;

  return {
    ...previous,
    phase: 'streaming',
    progressText: nextProgressText,
    progressKind: nextProgressKind,
    events: appendLiveIndicatorEvent(previous.events, {
      eventType: 'text',
      label: 'Text',
      text: rawText,
      tone: 'default',
      kind: 'text',
      toolName: null,
      toolId: null,
    }),
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
  const text = previous.progressText || 'Finalizing...';
  return {
    ...previous,
    phase: 'streaming',
    progressKind: 'finalizing',
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}
