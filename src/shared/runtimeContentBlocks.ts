export type LiveIndicatorContentBlockKind = 'text' | 'tool' | 'status';
export type LiveIndicatorContentBlockStatus = 'streaming' | 'complete' | 'error';

export interface LiveIndicatorContentBlock {
  id: string;
  index: number;
  kind: LiveIndicatorContentBlockKind;
  status: LiveIndicatorContentBlockStatus;
  title: string | null;
  text: string;
  toolName: string | null;
  toolId: string | null;
  metadata: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readKind(value: unknown): LiveIndicatorContentBlockKind | null {
  return value === 'text' || value === 'tool' || value === 'status' ? value : null;
}

function readStatus(value: unknown): LiveIndicatorContentBlockStatus | null {
  return value === 'streaming' || value === 'complete' || value === 'error' ? value : null;
}

export function normalizeRuntimeContentBlock(
  data: Record<string, unknown>,
): LiveIndicatorContentBlock | null {
  const block = asRecord(data.block);
  if (!block) {
    return null;
  }

  const id = readString(block.id);
  const kind = readKind(block.kind);
  const status = readStatus(block.status);
  const index = typeof block.index === 'number' && Number.isFinite(block.index)
    ? block.index
    : null;
  if (!id || !kind || !status || index === null) {
    return null;
  }

  return {
    id,
    index,
    kind,
    status,
    title: readString(block.title),
    text: readString(block.text) ?? '',
    toolName: readString(block.toolName),
    toolId: readString(block.toolId),
    metadata: asRecord(block.metadata),
  };
}
