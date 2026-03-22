import {
  normalizeProviderModelCatalog,
  type ProviderModelCatalog,
} from '../shared/providerCatalog.js';

export interface RuntimeProviderInstanceConfig {
  id: string;
  target: string | null;
  backend: string | null;
  command: string | null;
  runner: string | null;
  runtime: string | null;
  transport: string | null;
  model: string | null;
}

export interface RuntimeProviderConfigEntry {
  defaultInstance: string | null;
  defaultBackend: string | null;
  instances: RuntimeProviderInstanceConfig[];
}

export type RuntimeProviderConfigRegistry = Record<string, RuntimeProviderConfigEntry>;

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
  skills?: RuntimeSessionSkillState;
}

export interface RuntimeMessageResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
}

export interface RuntimeSkillManifestContext {
  catId?: string;
  roomMode?: 'boss_chat' | 'direct_cat_chat' | 'transport_inbox';
  transport?: 'telegram' | 'line' | 'web' | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface RuntimeSkillManifest {
  profileId?: string;
  requestedSkills: string[];
  context?: RuntimeSkillManifestContext;
  strict?: boolean;
}

export interface RuntimeResolvedSkill {
  id: string;
  title: string;
  status: 'resolved' | 'missing';
  deliveryMode: 'instructions' | 'none';
  source: 'runtime_catalog';
  skillPath?: string;
  warning?: string;
}

export interface RuntimeSessionSkillState {
  profileId?: string;
  requestedSkills: string[];
  resolvedSkills: RuntimeResolvedSkill[];
  strict: boolean;
  warnings: string[];
  appliedSkillIds: string[];
  updatedAt: string;
}

export interface RuntimeSessionInvocationContext {
  source?: 'interactive' | 'timer' | 'callback' | 'assignment' | 'automation';
  reason?: string;
  taskId?: string;
  issueId?: string;
  commentId?: string;
  approvalId?: string;
  workspace?: {
    cwd?: string;
    workspaceId?: string;
    repoUrl?: string;
    repoRef?: string;
  };
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface RuntimeSessionCreateInput {
  provider: string;
  instance?: string | null;
  model?: string | null;
  cwd?: string | null;
  sharingMode?: 'shared' | null;
  instructions?: string | null;
  context?: RuntimeSessionInvocationContext;
  skills?: RuntimeSkillManifest;
}

export interface RuntimeSendMessageInput {
  instructions?: string | null;
  context?: RuntimeSessionInvocationContext;
  outputDir?: string | null;
  skills?: RuntimeSkillManifest;
}

export interface RuntimeClient {
  getHealth(): Promise<RuntimeStatusSummary>;
  getProviderConfig(): Promise<RuntimeProviderConfigRegistry>;
  getProviderModels(provider: string, instance?: string | null): Promise<ProviderModelCatalog>;
  createSession(input: RuntimeSessionCreateInput): Promise<RuntimeSessionInfo>;
  sendMessage(
    sessionId: string,
    content: string,
    input?: RuntimeSendMessageInput,
  ): Promise<RuntimeMessageResult>;
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

function normalizeRuntimeProviderConfigRegistry(payload: unknown): RuntimeProviderConfigRegistry {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const root = payload as Record<string, unknown>;
  const providers = root.providers;
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(providers)
      .map(([provider, rawEntry]) => {
        if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
          return null;
        }

        const entry = rawEntry as Record<string, unknown>;
        const rawInstances = Array.isArray(entry.instances) ? entry.instances : [];
        return [
          provider,
          {
            defaultInstance:
              typeof entry.defaultInstance === 'string' && entry.defaultInstance.trim().length > 0
                ? entry.defaultInstance
                : null,
            defaultBackend:
              typeof entry.defaultBackend === 'string' && entry.defaultBackend.trim().length > 0
                ? entry.defaultBackend
                : null,
            instances: rawInstances
              .map((rawInstance) => {
                if (!rawInstance || typeof rawInstance !== 'object' || Array.isArray(rawInstance)) {
                  return null;
                }

                const instance = rawInstance as Record<string, unknown>;
                const id = typeof instance.id === 'string' ? instance.id.trim() : '';
                if (!id) {
                  return null;
                }

                return {
                  id,
                  target:
                    typeof instance.target === 'string' && instance.target.trim().length > 0
                      ? instance.target
                      : null,
                  backend:
                    typeof instance.backend === 'string' && instance.backend.trim().length > 0
                      ? instance.backend
                      : null,
                  command:
                    typeof instance.command === 'string' && instance.command.trim().length > 0
                      ? instance.command
                      : null,
                  runner:
                    typeof instance.runner === 'string' && instance.runner.trim().length > 0
                      ? instance.runner
                      : null,
                  runtime:
                    typeof instance.runtime === 'string' && instance.runtime.trim().length > 0
                      ? instance.runtime
                      : null,
                  transport:
                    typeof instance.transport === 'string' && instance.transport.trim().length > 0
                      ? instance.transport
                      : null,
                  model:
                    typeof instance.model === 'string' && instance.model.trim().length > 0
                      ? instance.model
                      : null,
                };
              })
              .filter((instance): instance is RuntimeProviderInstanceConfig => instance !== null),
          } satisfies RuntimeProviderConfigEntry,
        ] as const;
      })
      .filter((entry): entry is readonly [string, RuntimeProviderConfigEntry] => entry !== null),
  );
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

  async getProviderConfig(): Promise<RuntimeProviderConfigRegistry> {
    const response = await fetch(`${this.baseUrl}/providers/config`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readErrorText(rawBody, `Failed to fetch provider config (${response.status})`),
        response.status,
      );
    }

    return normalizeRuntimeProviderConfigRegistry(await response.json());
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

    if (input.instance?.trim()) {
      payload.instance = input.instance.trim();
    }
    if (input.model?.trim()) {
      payload.model = input.model.trim();
    }
    if (input.cwd?.trim()) {
      payload.cwd = input.cwd.trim();
    }
    if (input.sharingMode) {
      payload.workspaceMode = input.sharingMode;
    }
    if (input.instructions?.trim()) {
      payload.instructions = input.instructions.trim();
    }
    if (input.context) {
      payload.context = input.context;
    }
    if (input.skills) {
      payload.skills = input.skills;
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
      skills: data.skills && typeof data.skills === 'object'
        ? data.skills as RuntimeSessionSkillState
        : undefined,
    };
  }

  async sendMessage(
    sessionId: string,
    content: string,
    input?: RuntimeSendMessageInput,
  ): Promise<RuntimeMessageResult> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({
        message: content,
        ...(input?.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
        ...(input?.context ? { context: input.context } : {}),
        ...(input?.outputDir?.trim() ? { outputDir: input.outputDir.trim() } : {}),
        ...(input?.skills ? { skills: input.skills } : {}),
      }),
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

