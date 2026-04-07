import {
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
  type ProductProviderEventCapabilities,
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
  appendTaskRuntimeExecutionRequestFields,
  type TaskExecutionCorrelation,
  type TaskRuntimeExecutionRequest,
} from '../shared/taskExecutionBridge.js';
import {
  normalizeRuntimeProviderDiagnosticsPayload,
  normalizeRuntimeProviderConfigRegistry,
  readRuntimeErrorText,
} from './clientParsing.js';
import {
  readRuntimeNdjsonResponse,
  readRuntimeSseResponse,
} from './clientStreams.js';
import type {
  RuntimeSetupReadModel,
  RuntimeSetupScanInput,
} from './setup.js';

export interface RuntimeProviderInstanceConfig {
  id: string;
  target: string | null;
  backend: string | null;
  command: string | null;
  runner: string | null;
  runtime: string | null;
  transport: string | null;
  model: string | null;
  eventCapabilities: ProductProviderEventCapabilities | null;
}

export interface RuntimeProviderConfigEntry {
  defaultInstance: string | null;
  defaultBackend: string | null;
  instances: RuntimeProviderInstanceConfig[];
}

export type RuntimeProviderConfigRegistry = Record<string, RuntimeProviderConfigEntry>;

export type RuntimeProviderAvailabilityStatus =
  | 'ok'
  | 'degraded'
  | 'unavailable'
  | 'unknown';

export interface RuntimeProviderDiagnosticsAvailability {
  status: RuntimeProviderAvailabilityStatus;
  summary: string | null;
  attentionCodes: string[];
}

export interface RuntimeProviderDiagnosticsEntry {
  provider: string;
  backend: string | null;
  instance: string | null;
  availability: RuntimeProviderDiagnosticsAvailability;
}

export interface RuntimeProviderDiagnosticsPayload {
  probe: string;
  providers: RuntimeProviderDiagnosticsEntry[];
}

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

export interface RuntimeExecutionRequestInput {
  requestedStrategy?: string;
  acceptanceCriteria?: string;
  strategyContext?: Record<string, unknown>;
  correlation?: TaskExecutionCorrelation;
}

export interface RuntimeSessionCreateInput extends RuntimeExecutionRequestInput {
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

export interface RuntimeSendMessageInput extends RuntimeExecutionRequestInput {
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

export interface RuntimeSessionStreamOptions {
  signal?: AbortSignal;
}

export interface RuntimeWakeupTarget {
  sessionId?: string;
}

export interface RuntimeWakeupCreateInput extends RuntimeExecutionRequestInput {
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

export interface RuntimeDeleteSessionResult {
  action?: string;
  sessionId: string;
  status: 'deleted' | 'retained';
  reason?: string;
}

export interface RuntimeClient {
  getHealth(): Promise<RuntimeStatusSummary>;
  getSetupState(): Promise<RuntimeSetupReadModel>;
  scanSetup(input?: RuntimeSetupScanInput): Promise<RuntimeSetupReadModel>;
  applySetup(providers: string[]): Promise<RuntimeSetupReadModel>;
  getProviderConfig(): Promise<RuntimeProviderConfigRegistry>;
  getProviderDiagnostics(): Promise<RuntimeProviderDiagnosticsPayload>;
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
    options?: RuntimeSessionStreamOptions,
  ): Promise<void>;
  createWakeup(input: RuntimeWakeupCreateInput): Promise<RuntimeWakeupCreateResult>;
  callMcp(request: unknown): Promise<Record<string, unknown> | null>;
  cancelSession(sessionId: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<RuntimeDeleteSessionResult>;
}

interface RuntimeClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  setupMutationTimeoutMs?: number;
}

const DEFAULT_RUNTIME_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_RUNTIME_SETUP_MUTATION_TIMEOUT_MS = 120_000;

export class RuntimeRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'RuntimeRequestError';
  }
}

export class CatsRuntimeClient implements RuntimeClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly setupMutationTimeoutMs: number;

  constructor(
    private readonly baseUrl: string,
    options: RuntimeClientOptions = {},
  ) {
    this.apiKey = options.apiKey?.trim() || '';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RUNTIME_REQUEST_TIMEOUT_MS;
    this.setupMutationTimeoutMs = options.setupMutationTimeoutMs
      ?? Math.max(this.timeoutMs, DEFAULT_RUNTIME_SETUP_MUTATION_TIMEOUT_MS);
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

  async getProviderDiagnostics(): Promise<RuntimeProviderDiagnosticsPayload> {
    const url = new URL(`${this.baseUrl}/diagnostics/providers`);
    url.searchParams.set('probe', 'light');

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
        readRuntimeErrorText(rawBody, `Failed to fetch provider diagnostics (${response.status})`),
        response.status,
      );
    }

    return normalizeRuntimeProviderDiagnosticsPayload(await response.json());
  }

  async getSetupState(): Promise<RuntimeSetupReadModel> {
    const response = await fetch(`${this.baseUrl}/setup-state`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to fetch runtime setup state (${response.status})`),
        response.status,
      );
    }

    return (await response.json()) as RuntimeSetupReadModel;
  }

  async scanSetup(input: RuntimeSetupScanInput = {}): Promise<RuntimeSetupReadModel> {
    const response = await fetch(`${this.baseUrl}/setup-scan`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        manual: input.manual === true,
      }),
      signal: AbortSignal.timeout(this.setupMutationTimeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to run runtime setup scan (${response.status})`),
        response.status,
      );
    }

    await response.json().catch(() => null);
    return await this.getSetupState();
  }

  async applySetup(providers: string[]): Promise<RuntimeSetupReadModel> {
    const normalizedProviders = providers
      .map((provider) => provider.trim())
      .filter((provider) => provider.length > 0);
    if (normalizedProviders.length === 0) {
      throw new Error('At least one provider is required to apply runtime setup.');
    }

    const response = await fetch(`${this.baseUrl}/setup-apply`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        providers: normalizedProviders,
      }),
      signal: AbortSignal.timeout(this.setupMutationTimeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to apply runtime setup (${response.status})`),
        response.status,
      );
    }

    await response.json().catch(() => null);
    return await this.getSetupState();
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
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to fetch advanced provider models (${response.status})`),
        response.status,
      );
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
    appendTaskRuntimeExecutionRequestFields(payload, input);

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
      modelSelection:
        parseProviderModelSelection(data.modelSelection)
        ?? input.modelSelection
        ?? null,
      modelResolution:
        parseProviderModelResolution(data.modelResolution)
        ?? null,
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
    const payload: Record<string, unknown> = {
      message: content,
    };

    if (input?.instructions?.trim()) {
      payload.instructions = input.instructions.trim();
    }
    if (input?.context) {
      payload.context = input.context;
    }
    if (input?.outputDir?.trim()) {
      payload.outputDir = input.outputDir.trim();
    }
    if (input?.skills) {
      payload.skills = input.skills;
    }
    appendTaskRuntimeExecutionRequestFields(payload, input);

    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(payload),
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
    options?: RuntimeSessionStreamOptions,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/stream`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'text/event-stream',
      },
      signal: options?.signal,
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readRuntimeErrorText(rawBody, `Failed to stream session (${response.status})`));
    }

    await readRuntimeSseResponse(response, onEvent);
  }

  async createWakeup(input: RuntimeWakeupCreateInput): Promise<RuntimeWakeupCreateResult> {
    const payload: Record<string, unknown> = {
      reason: input.reason,
      target: input.target,
      ...(input.scheduleAt ? { scheduleAt: input.scheduleAt } : {}),
      ...(input.coalesceKey ? { coalesceKey: input.coalesceKey } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    appendTaskRuntimeExecutionRequestFields(payload, input);

    const response = await fetch(`${this.baseUrl}/wakeups`, {
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
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to close session (${response.status})`),
        response.status,
      );
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/cancel`, {
      method: 'POST',
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok && response.status !== 204) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to cancel session (${response.status})`),
        response.status,
      );
    }
  }

  async deleteSession(sessionId: string): Promise<RuntimeDeleteSessionResult> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to delete session (${response.status})`),
        response.status,
      );
    }

    const payload = await response.json().catch(() => null) as Partial<RuntimeDeleteSessionResult> | null;
    const status = payload?.status;
    if (status !== 'deleted' && status !== 'retained') {
      throw new RuntimeRequestError(
        'Runtime returned an invalid session delete response.',
        response.status,
      );
    }

    return {
      action: payload?.action,
      sessionId:
        typeof payload?.sessionId === 'string' && payload.sessionId.trim().length > 0
          ? payload.sessionId
          : sessionId,
      status,
      ...(typeof payload?.reason === 'string' && payload.reason.trim().length > 0
        ? { reason: payload.reason }
        : {}),
    };
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
