import type { RuntimeMessageSegment } from './client.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function normalizeRuntimeMessageSegmentEntry(
  entry: unknown,
): RuntimeMessageSegment | null {
  if (typeof entry === 'string') {
    return entry.length > 0
      ? { kind: 'text', text: entry, toolName: null, toolId: null }
      : null;
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const kind = typeof record.kind === 'string'
    ? record.kind
    : typeof record.type === 'string'
      ? record.type
      : null;
  if (kind === 'text') {
    const text = typeof record.text === 'string'
      ? record.text
      : typeof record.content === 'string'
        ? record.content
        : '';
    return text.length > 0
      ? { kind: 'text', text, toolName: null, toolId: null }
      : null;
  }
  if (kind === 'tool_use') {
    return {
      kind: 'tool_use',
      text: typeof record.text === 'string' ? record.text : '',
      toolName: typeof record.toolName === 'string' ? record.toolName : null,
      toolId: typeof record.toolId === 'string' ? record.toolId : null,
    };
  }
  if (kind === 'tool_result') {
    return {
      kind: 'tool_result',
      text: typeof record.text === 'string' ? record.text : '',
      toolName: typeof record.toolName === 'string' ? record.toolName : null,
      toolId: typeof record.toolId === 'string' ? record.toolId : null,
    };
  }

  return null;
}

export function readRuntimeMessageResultSegments(value: unknown): RuntimeMessageSegment[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const candidates = [
    record.segments,
    record.blocks,
    record.contentBlocks,
    record.content,
    record.result,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const normalized = candidate
      .map((entry) => normalizeRuntimeMessageSegmentEntry(entry))
      .filter((entry): entry is RuntimeMessageSegment => entry !== null);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

export function readRuntimeMessageResultText(value: unknown): string {
  const record = asRecord(value);
  if (!record) {
    return '';
  }
  if (typeof record.text === 'string' && record.text.length > 0) {
    return record.text;
  }

  const result = asRecord(record.result);
  return typeof result?.text === 'string'
    ? result.text
    : typeof result?.content === 'string'
      ? result.content
      : '';
}
