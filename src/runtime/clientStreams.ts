import type {
  RuntimeMessageResult,
  RuntimeMessageSegment,
  RuntimeSessionStreamEvent,
} from './client.js';

export async function readRuntimeNdjsonResponse(response: Response): Promise<RuntimeMessageResult> {
  if (!response.body) {
    throw new Error('cats-runtime did not provide a response stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const segments: RuntimeMessageSegment[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  function appendTextToSegments(text: string): void {
    if (!text) {
      return;
    }
    const lastSegment = segments.at(-1);
    if (lastSegment?.kind === 'text') {
      lastSegment.text += text;
    } else {
      segments.push({ kind: 'text', text, toolName: null, toolId: null });
    }
  }

  function normalizeSegmentEntry(entry: unknown): RuntimeMessageSegment | null {
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

  function readResultSegments(event: Record<string, unknown>): RuntimeMessageSegment[] {
    const candidates = [
      event.segments,
      event.blocks,
      event.contentBlocks,
      event.content,
      event.result,
    ];
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      const normalized = candidate
        .map((entry) => normalizeSegmentEntry(entry))
        .filter((entry): entry is RuntimeMessageSegment => entry !== null);
      if (normalized.length > 0) {
        return normalized;
      }
    }

    return [];
  }

  function readResultText(event: Record<string, unknown>): string {
    if (typeof event.text === 'string' && event.text.length > 0) {
      return event.text;
    }

    const result = event.result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return '';
    }

    const record = result as Record<string, unknown>;
    return typeof record.text === 'string'
      ? record.text
      : typeof record.content === 'string'
        ? record.content
        : '';
  }

  function processEvent(event: Record<string, unknown>): void {
    const type = String(event.type ?? '');

    if (type === 'text') {
      appendTextToSegments(String(event.text ?? ''));
      return;
    }

    if (type === 'tool_use') {
      segments.push({
        kind: 'tool_use',
        text: '',
        toolName: typeof event.toolName === 'string' ? event.toolName : null,
        toolId: typeof event.toolId === 'string' ? event.toolId : null,
      });
      return;
    }

    if (type === 'tool_result') {
      segments.push({
        kind: 'tool_result',
        text: typeof event.text === 'string' ? event.text : '',
        toolName: typeof event.toolName === 'string' ? event.toolName : null,
        toolId: typeof event.toolId === 'string' ? event.toolId : null,
      });
      return;
    }

    if (type === 'result') {
      const usage = (event.usage ?? {}) as Record<string, unknown>;
      inputTokens = Number(usage.inputTokens ?? 0);
      outputTokens = Number(usage.outputTokens ?? 0);
      const normalizedResultSegments = readResultSegments(event);
      if (normalizedResultSegments.length > 0) {
        if (segments.length === 0) {
          for (const segment of normalizedResultSegments) {
            if (segment.kind === 'text') {
              appendTextToSegments(segment.text);
            } else {
              segments.push(segment);
            }
          }
        } else if (!segments.some((segment) => segment.kind === 'text' && segment.text.length > 0)) {
          for (const segment of normalizedResultSegments) {
            if (segment.kind === 'text') {
              appendTextToSegments(segment.text);
            }
          }
        }
      } else if (!segments.some((segment) => segment.kind === 'text' && segment.text.length > 0)) {
        appendTextToSegments(readResultText(event));
      }
      return;
    }

    if (type === 'error') {
      throw new Error(String(event.text ?? 'Agent turn failed'));
    }
  }

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      processEvent(event);
    }
  }

  const trailing = `${buffer}${decoder.decode()}`.trim();
  if (trailing) {
    try {
      const event = JSON.parse(trailing) as Record<string, unknown>;
      processEvent(event);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
    }
  }

  return {
    segments,
    inputTokens,
    outputTokens,
    tokensUsed: inputTokens + outputTokens,
  };
}

export async function readRuntimeSseResponse(
  response: Response,
  onEvent: (event: RuntimeSessionStreamEvent) => void | Promise<void>,
): Promise<void> {
  if (!response.body) {
    throw new Error('cats-runtime did not provide a response stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });

    while (true) {
      const boundaryIndex = buffer.search(/\r?\n\r?\n/u);
      if (boundaryIndex === -1) {
        break;
      }

      const rawEvent = buffer.slice(0, boundaryIndex);
      const separatorLength = buffer[boundaryIndex] === '\r' ? 4 : 2;
      buffer = buffer.slice(boundaryIndex + separatorLength);

      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of rawEvent.split(/\r?\n/u)) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim() || 'message';
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      const dataText = dataLines.join('\n').trim();
      if (!dataText) {
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(dataText) as Record<string, unknown>;
      } catch {
        continue;
      }

      await onEvent({
        event: eventName,
        data: parsed,
      });
    }
  }
}
