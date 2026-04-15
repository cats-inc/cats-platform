import type { RuntimeMessageSegment } from './client.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readRuntimeToolName(record: Record<string, unknown>): string | null {
  return readString(record.toolName)
    ?? readString(record.name);
}

function readRuntimeToolId(record: Record<string, unknown>): string | null {
  return readString(record.toolId)
    ?? readString(record.toolUseId)
    ?? readString(record.tool_use_id)
    ?? readString(record.id);
}

function readRuntimeContentArrayText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  return readOutputContentCandidates(value)
    .flatMap((candidate) => {
      if (typeof candidate === 'string') {
        return candidate.length > 0 ? [candidate] : [];
      }

      const record = asRecord(candidate);
      if (!record) {
        return [];
      }

      const text = readString(record.text)
        ?? readString(record.content)
        ?? '';
      return text.length > 0 ? [text] : [];
    })
    .join('');
}

function readRuntimeSegmentText(record: Record<string, unknown>): string {
  return readString(record.text)
    ?? readString(record.content)
    ?? readRuntimeContentArrayText(record.content)
    ?? '';
}

function normalizeRuntimeMessageSegmentEntries(
  entries: readonly unknown[],
): RuntimeMessageSegment[] {
  return entries
    .map((entry) => normalizeRuntimeMessageSegmentEntry(entry))
    .filter((entry): entry is RuntimeMessageSegment => entry !== null);
}

function readOutputContentCandidates(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const candidates: unknown[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      candidates.push(entry);
      continue;
    }

    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const content = record.content;
    if (Array.isArray(content)) {
      candidates.push(...content);
      continue;
    }

    candidates.push(record);
  }

  return candidates;
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
  const normalizedKind = kind === 'output_text'
    ? 'text'
    : kind;
  if (normalizedKind === 'text' || (!normalizedKind && (
    typeof record.text === 'string'
    || typeof record.content === 'string'
  ))) {
    const text = readRuntimeSegmentText(record);
    return text.length > 0
      ? { kind: 'text', text, toolName: null, toolId: null }
      : null;
  }
  if (normalizedKind === 'tool_use') {
    return {
      kind: 'tool_use',
      text: readRuntimeSegmentText(record),
      toolName: readRuntimeToolName(record),
      toolId: readRuntimeToolId(record),
    };
  }
  if (normalizedKind === 'tool_result') {
    return {
      kind: 'tool_result',
      text: readRuntimeSegmentText(record),
      toolName: readRuntimeToolName(record),
      toolId: readRuntimeToolId(record),
    };
  }

  return null;
}

export function readRuntimeMessageResultSegments(value: unknown): RuntimeMessageSegment[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const nestedResult = asRecord(record.result);

  const candidates = [
    record.segments,
    record.blocks,
    record.contentBlocks,
    record.content,
    readOutputContentCandidates(record.output),
    record.result,
    nestedResult?.segments,
    nestedResult?.blocks,
    nestedResult?.contentBlocks,
    nestedResult?.content,
    readOutputContentCandidates(nestedResult?.output),
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const normalized = normalizeRuntimeMessageSegmentEntries(candidate);
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
  if (typeof record.content === 'string' && record.content.length > 0) {
    return record.content;
  }

  const result = asRecord(record.result);
  return typeof result?.text === 'string'
    ? result.text
    : typeof result?.content === 'string'
      ? result.content
      : '';
}
