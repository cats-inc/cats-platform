import type { RuntimeMessageResult, RuntimeSessionStreamEvent } from './client.js';

export async function readRuntimeNdjsonResponse(response: Response): Promise<RuntimeMessageResult> {
  if (!response.body) {
    throw new Error('cats-runtime did not provide a response stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const textParts: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

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

      const type = String(event.type ?? '');
      if (type === 'text') {
        textParts.push(String(event.text ?? ''));
        continue;
      }

      if (type === 'result') {
        const usage = (event.usage ?? {}) as Record<string, unknown>;
        inputTokens = Number(usage.inputTokens ?? 0);
        outputTokens = Number(usage.outputTokens ?? 0);
        continue;
      }

      if (type === 'error') {
        throw new Error(String(event.text ?? 'Agent turn failed'));
      }
    }
  }

  const trailing = `${buffer}${decoder.decode()}`.trim();
  if (trailing) {
    try {
      const event = JSON.parse(trailing) as Record<string, unknown>;
      const type = String(event.type ?? '');
      if (type === 'text') {
        textParts.push(String(event.text ?? ''));
      } else if (type === 'result') {
        const usage = (event.usage ?? {}) as Record<string, unknown>;
        inputTokens = Number(usage.inputTokens ?? 0);
        outputTokens = Number(usage.outputTokens ?? 0);
      } else if (type === 'error') {
        throw new Error(String(event.text ?? 'Agent turn failed'));
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
    }
  }

  return {
    content: textParts.join(''),
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
