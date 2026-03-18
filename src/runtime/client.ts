import {
  normalizeProviderModelCatalog,
  type ProviderModelCatalog,
} from '../shared/providerCatalog.js';

export interface RuntimeHealthPayload {
  service?: string;
  status?: string;
  backend?: unknown;
}

export interface RuntimeStatusSummary {
  baseUrl: string;
  reachable: boolean;
  status: string;
  service?: string;
  backend?: unknown;
  error?: string;
}

export interface RuntimeSessionInfo {
  id: string;
  provider: string;
  model: string | null;
  status: string;
  cwd: string | null;
}

export interface RuntimeMessageResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
}

export interface RuntimeSessionCreateInput {
  provider: string;
  model?: string | null;
  cwd?: string | null;
  workspaceMode?: 'shared' | null;
}

export interface RuntimeClient {
  getHealth(): Promise<RuntimeStatusSummary>;
  getProviderModels(provider: string, instance?: string | null): Promise<ProviderModelCatalog>;
  createSession(input: RuntimeSessionCreateInput): Promise<RuntimeSessionInfo>;
  sendMessage(sessionId: string, content: string): Promise<RuntimeMessageResult>;
  closeSession(sessionId: string): Promise<void>;
}

interface RuntimeClientOptions {
  apiKey?: string;
  timeoutMs?: number;
}

export class RuntimeRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'RuntimeRequestError';
  }
}

function readErrorText(body: string, fallback: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const payload = JSON.parse(trimmed) as { error?: string };
    return typeof payload.error === 'string' ? payload.error : trimmed;
  } catch {
    return trimmed;
  }
}

async function readNdjsonResponse(response: Response): Promise<RuntimeMessageResult> {
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

export class CatsRuntimeClient implements RuntimeClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly baseUrl: string,
    options: RuntimeClientOptions = {},
  ) {
    this.apiKey = options.apiKey?.trim() || '';
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async getHealth(): Promise<RuntimeStatusSummary> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          baseUrl: this.baseUrl,
          reachable: false,
          status: 'error',
          error: `cats-runtime returned ${response.status}`,
        };
      }

      const payload = (await response.json()) as RuntimeHealthPayload;

      return {
        baseUrl: this.baseUrl,
        reachable: true,
        status: typeof payload.status === 'string' ? payload.status : 'ok',
        service: typeof payload.service === 'string' ? payload.service : 'cats-runtime',
        backend: payload.backend,
      };
    } catch (error) {
      return {
        baseUrl: this.baseUrl,
        reachable: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown runtime error',
      };
    }
  }

  async getProviderModels(
    provider: string,
    instance?: string | null,
  ): Promise<ProviderModelCatalog> {
    const url = new URL(`${this.baseUrl}/providers/${encodeURIComponent(provider)}/models`);
    if (instance?.trim()) {
      url.searchParams.set('instance', instance.trim());
    }

    const response = await fetch(url, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readErrorText(rawBody, `Failed to fetch provider models (${response.status})`),
        response.status,
      );
    }

    return normalizeProviderModelCatalog(await response.json(), provider);
  }

  async createSession(input: RuntimeSessionCreateInput): Promise<RuntimeSessionInfo> {
    const payload: Record<string, unknown> = {
      provider: input.provider,
      permissionMode: 'skip',
    };

    if (input.model?.trim()) {
      payload.model = input.model.trim();
    }
    if (input.cwd?.trim()) {
      payload.cwd = input.cwd.trim();
    }
    if (input.workspaceMode) {
      payload.workspaceMode = input.workspaceMode;
    }

    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readErrorText(rawBody, `Failed to create session (${response.status})`));
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      id: String(data.id ?? ''),
      provider: String(data.providerName ?? input.provider),
      model: typeof data.model === 'string' ? data.model : input.model?.trim() || null,
      status: typeof data.status === 'string' ? data.status : 'initializing',
      cwd: typeof data.cwd === 'string' ? data.cwd : input.cwd?.trim() || null,
    };
  }

  async sendMessage(sessionId: string, content: string): Promise<RuntimeMessageResult> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({ message: content }),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readErrorText(rawBody, `Failed to send message (${response.status})`));
    }

    return readNdjsonResponse(response);
  }

  async closeSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/close`, {
      method: 'POST',
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok && response.status !== 204) {
      const rawBody = await response.text();
      throw new Error(readErrorText(rawBody, `Failed to close session (${response.status})`));
    }
  }

  private authHeaders(): Record<string, string> {
    if (!this.apiKey) {
      return {};
    }

    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }
}
