import {
  createStaticProviderAdvancedModelCatalog,
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../shared/providerCatalog.js';
import {
  parseProviderModelResolution,
  parseProviderModelSelection,
  type ProviderModelResolution,
  type ProviderModelSelection,
} from '../shared/providerSelection.js';
import {
  normalizeRuntimeProviderConfigRegistry,
  readRuntimeErrorText,
} from './clientParsing.js';
import {
  readRuntimeNdjsonResponse,
  readRuntimeSseResponse,
} from './clientStreams.js';

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
  modelSelection?: ProviderModelSelection | null;
  modelResolution?: ProviderModelResolution | null;
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
  roomMode?: 'boss_chat' | 'direct_cat_chat';
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
  modelSelection?: ProviderModelSelection | null;
  cwd?: string | null;
  workspaceKind?: 'source' | 'sandbox' | 'worktree' | null;
  workspaceAccess?: 'read_write' | 'read_only' | null;
  sharingMode?: 'shared' | 'isolated' | null;
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

export interface RuntimeObservedSessionPayload {
  session: Record<string, unknown>;
  historyPath?: string;
  observePath?: string;
  stream?: {
    path?: string;
    available?: boolean;
  };
}

export interface RuntimeSessionStreamEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface RuntimeWakeupTarget {
  sessionId?: string;
}

export interface RuntimeWakeupCreateInput {
  reason: string;
  target: RuntimeWakeupTarget;
  scheduleAt?: string;
  coalesceKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RuntimeWakeupRequestRecord {
  id: string;
  scheduleAt?: string;
  target?: RuntimeWakeupTarget;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeWakeupCreateResult {
  request: RuntimeWakeupRequestRecord;
  coalesced: boolean;
}

export interface RuntimeClient {
  getHealth(): Promise<RuntimeStatusSummary>;
  getProviderConfig(): Promise<RuntimeProviderConfigRegistry>;
  getProviderModels(provider: string, instance?: string | null): Promise<ProviderModelCatalog>;
  getAdvancedProviderModels(provider: string, instance?: string | null): Promise<ProviderAdvancedModelCatalog>;
  createSession(input: RuntimeSessionCreateInput): Promise<RuntimeSessionInfo>;
  sendMessage(
    sessionId: string,
    content: string,
    input?: RuntimeSendMessageInput,
  ): Promise<RuntimeMessageResult>;
  observeSession(sessionId: string): Promise<RuntimeObservedSessionPayload>;
  streamSession(
    sessionId: string,
    onEvent: (event: RuntimeSessionStreamEvent) => void | Promise<void>,
  ): Promise<void>;
  createWakeup(input: RuntimeWakeupCreateInput): Promise<RuntimeWakeupCreateResult>;
  callMcp(request: unknown): Promise<Record<string, unknown> | null>;
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
        readRuntimeErrorText(rawBody, `Failed to fetch provider config (${response.status})`),
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
        readRuntimeErrorText(rawBody, `Failed to fetch provider models (${response.status})`),
        response.status,
      );
    }

    return normalizeProviderModelCatalog(await response.json(), provider);
  }

  async getAdvancedProviderModels(
    provider: string,
    instance?: string | null,
  ): Promise<ProviderAdvancedModelCatalog> {
    const url = new URL(`${this.baseUrl}/providers/${encodeURIComponent(provider)}/models/advanced`);
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
      if (response.status >= 400 && response.status < 500) {
        throw new RuntimeRequestError(
          readRuntimeErrorText(rawBody, `Failed to fetch advanced provider models (${response.status})`),
          response.status,
        );
      }

      return createStaticProviderAdvancedModelCatalog(provider, {
        instance: instance?.trim() || null,
        warnings: [
          readRuntimeErrorText(
            rawBody,
            `Advanced provider catalog unavailable (${response.status})`,
          ),
        ],
      });
    }

    return normalizeProviderAdvancedModelCatalog(await response.json(), provider);
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
    if (input.modelSelection) {
      payload.modelSelection = input.modelSelection;
    }
    if (input.cwd?.trim()) {
      payload.cwd = input.cwd.trim();
    }
    if (input.workspaceKind) {
      payload.workspaceKind = input.workspaceKind;
    } else if (input.sharingMode) {
      payload.workspaceMode = input.sharingMode;
    }
    if (input.workspaceAccess) {
      payload.workspaceAccess = input.workspaceAccess;
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
      throw new Error(readRuntimeErrorText(rawBody, `Failed to create session (${response.status})`));
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      id: String(data.id ?? ''),
      provider: String(data.providerName ?? input.provider),
      model: typeof data.model === 'string' ? data.model : input.model?.trim() || null,
      modelSelection: parseProviderModelSelection(data.modelSelection),
      modelResolution: parseProviderModelResolution(data.modelResolution),
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
      throw new Error(readRuntimeErrorText(rawBody, `Failed to send message (${response.status})`));
    }

    return readRuntimeNdjsonResponse(response);
  }

  async observeSession(sessionId: string): Promise<RuntimeObservedSessionPayload> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/observe`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readRuntimeErrorText(rawBody, `Failed to observe session (${response.status})`));
    }

    return (await response.json()) as RuntimeObservedSessionPayload;
  }

  async streamSession(
    sessionId: string,
    onEvent: (event: RuntimeSessionStreamEvent) => void | Promise<void>,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/stream`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'text/event-stream',
      },
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readRuntimeErrorText(rawBody, `Failed to stream session (${response.status})`));
    }

    await readRuntimeSseResponse(response, onEvent);
  }

  async createWakeup(input: RuntimeWakeupCreateInput): Promise<RuntimeWakeupCreateResult> {
    const response = await fetch(`${this.baseUrl}/wakeups`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        reason: input.reason,
        target: input.target,
        ...(input.scheduleAt ? { scheduleAt: input.scheduleAt } : {}),
        ...(input.coalesceKey ? { coalesceKey: input.coalesceKey } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readRuntimeErrorText(rawBody, `Failed to create wakeup (${response.status})`));
    }

    return (await response.json()) as RuntimeWakeupCreateResult;
  }

  async callMcp(request: unknown): Promise<Record<string, unknown> | null> {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readRuntimeErrorText(rawBody, `Failed to call MCP (${response.status})`));
    }

    return (await response.json()) as Record<string, unknown>;
  }

  async closeSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/close`, {
      method: 'POST',
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok && response.status !== 204) {
      const rawBody = await response.text();
      throw new Error(readRuntimeErrorText(rawBody, `Failed to close session (${response.status})`));
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

