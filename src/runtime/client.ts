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

export interface RuntimeClient {
  getHealth(): Promise<RuntimeStatusSummary>;
}

interface RuntimeClientOptions {
  apiKey?: string;
  timeoutMs?: number;
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
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
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
}
