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
import type {
  RuntimeSessionTransportInput,
} from '../shared/runtimeSessionPolicy.js';
import {
  RuntimeSessionPolicyError,
  validateRuntimeSessionPolicyInput,
} from '../shared/runtimeSessionPolicy.js';
import {
  normalizeRuntimeProviderDiagnosticsPayload,
  normalizeRuntimeProviderConfigRegistry,
  readRuntimeErrorText,
} from './clientParsing.js';
import {
  readRuntimeNdjsonResponse,
  readRuntimeSseResponse,
} from './clientStreams.js';
import type { RuntimeSetupReadModel } from './setup.js';

export interface RuntimeProviderInstanceConfig {
  id: string;
  target: string | null;
  backend: string | null;
  command: string | null;
  args: string[] | null;
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
  defaultTarget: boolean;
  availability: RuntimeProviderDiagnosticsAvailability;
}

export interface RuntimeProviderDiagnosticsPayload {
  probe: string;
  providers: RuntimeProviderDiagnosticsEntry[];
}

export interface RuntimeProviderDiagnosticsQuery {
  provider?: string | null;
  backend?: string | null;
  instance?: string | null;
  defaultOnly?: boolean;
  probe?: 'light' | 'live';
  scope?: 'full' | 'availability';
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

export type RuntimeMessageSegmentKind = 'text' | 'tool_use' | 'tool_result';

export interface RuntimeMessageSegment {
  kind: RuntimeMessageSegmentKind;
  text: string;
  toolName: string | null;
  toolId: string | null;
}

export interface RuntimeMessageResult {
  segments: RuntimeMessageSegment[];
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
}

export function resolveFullResponseText(segments: RuntimeMessageSegment[]): string {
  return segments
    .filter((segment) => segment.kind === 'text')
    .map((segment) => segment.text)
    .join('');
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

interface RuntimeSessionCreateInputBase extends RuntimeExecutionRequestInput {
  provider: string;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
  cwd?: string | null;
  workspaceKind?: RuntimeSessionTransportInput['workspaceKind'];
  sharingMode?: 'shared' | 'isolated' | null;
  instructions?: string | null;
  context?: RuntimeSessionInvocationContext;
  skills?: RuntimeSkillManifest;
}

export type RuntimeSessionCreateInput =
  RuntimeSessionCreateInputBase & RuntimeSessionTransportInput;

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
  getProviderConfig(options?: { selector?: boolean }): Promise<RuntimeProviderConfigRegistry>;
  getProviderDiagnostics(
    query?: RuntimeProviderDiagnosticsQuery,
  ): Promise<RuntimeProviderDiagnosticsPayload>;
  getProviderModels(
    provider: string,
    instance?: string | null,
    options?: { forceRefresh?: boolean },
  ): Promise<ProviderModelCatalog>;
  getAdvancedProviderModels(
    provider: string,
    instance?: string | null,
    options?: { forceRefresh?: boolean },
  ): Promise<ProviderAdvancedModelCatalog>;
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
  resumeSession?(sessionId: string): Promise<RuntimeSessionInfo>;
  createWakeup(input: RuntimeWakeupCreateInput): Promise<RuntimeWakeupCreateResult>;
  callMcp(request: unknown): Promise<Record<string, unknown> | null>;
  cancelSession(sessionId: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<RuntimeDeleteSessionResult>;
}

interface RuntimeClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  sessionCreateTimeoutMs?: number;
  sessionCreateSlowWarningMs?: number;
  messageIdleTimeoutMs?: number;
  providerRegistryTimeoutMs?: number;
  selectorConfigTimeoutMs?: number;
  selectorDiagnosticsTimeoutMs?: number;
  createTimeoutSignal?: RuntimeTimeoutSignalFactory;
  createIdleTimeoutController?: RuntimeIdleTimeoutControllerFactory;
  onClientDiagnostic?: (event: RuntimeClientDiagnosticEvent) => void;
  now?: () => Date;
}

export type RuntimeClientDiagnosticEvent = {
  kind: 'slow_session_create';
  observedAt: string;
  provider: string;
  sessionId: string;
  elapsedMs: number;
  thresholdMs: number;
};

const DEFAULT_RUNTIME_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS = 60_000;
export const DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_RUNTIME_PROVIDER_REGISTRY_TIMEOUT_MS = 10_000;
const DEFAULT_RUNTIME_PROVIDER_CATALOG_REFRESH_TIMEOUT_MS = 60_000;
const DEFAULT_RUNTIME_SELECTOR_CONFIG_TIMEOUT_MS = 5_000;
const DEFAULT_RUNTIME_SELECTOR_DIAGNOSTICS_TIMEOUT_MS = 8_000;
const SESSION_CREATE_SLOW_WARNING_BUDGET_DIVISOR = 6;
const SESSION_CREATE_SLOW_WARNING_MIN_MS = 2_000;

export function resolveDefaultSessionCreateSlowWarningMs(sessionCreateBudgetMs: number): number {
  return Math.max(
    SESSION_CREATE_SLOW_WARNING_MIN_MS,
    Math.floor(sessionCreateBudgetMs / SESSION_CREATE_SLOW_WARNING_BUDGET_DIVISOR),
  );
}

type RuntimeTimeoutSignalFactory = (timeoutMs: number) => AbortSignal;

interface RuntimeIdleTimeoutController {
  signal: AbortSignal;
  reset(): void;
  clear(): void;
}

type RuntimeIdleTimeoutControllerFactory = (timeoutMs: number) => RuntimeIdleTimeoutController;

function createDefaultTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function createDefaultIdleTimeoutController(timeoutMs: number): RuntimeIdleTimeoutController {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      const error = new Error(`Runtime message stream idle timeout after ${timeoutMs}ms`);
      error.name = 'TimeoutError';
      controller.abort(error);
    }, timeoutMs);
    const maybeUnref = (timeout as { unref?: () => void }).unref;
    if (typeof maybeUnref === 'function') {
      maybeUnref.call(timeout);
    }
  };

  arm();

  return {
    signal: controller.signal,
    reset() {
      if (!controller.signal.aborted) {
        arm();
      }
    },
    clear() {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    },
  };
}

export class RuntimeRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'RuntimeRequestError';
  }
}

function readRuntimeSessionInfo(
  data: Record<string, unknown>,
  fallback: {
    provider: string;
    model: string | null;
    modelSelection: ProviderModelSelection | null;
    cwd: string | null;
  },
): RuntimeSessionInfo {
  return {
    id: String(data.id ?? ''),
    provider: String(data.providerName ?? data.provider ?? fallback.provider),
    model: typeof data.model === 'string' ? data.model : fallback.model,
    modelSelection:
      parseProviderModelSelection(data.modelSelection)
      ?? fallback.modelSelection,
    modelResolution:
      parseProviderModelResolution(data.modelResolution)
      ?? null,
    status: typeof data.status === 'string' ? data.status : 'initializing',
    cwd: typeof data.cwd === 'string' ? data.cwd : fallback.cwd,
    skills: data.skills && typeof data.skills === 'object'
      ? data.skills as RuntimeSessionSkillState
      : undefined,
  };
}

export class CatsRuntimeClient implements RuntimeClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly sessionCreateTimeoutMs: number;
  private readonly sessionCreateSlowWarningMs: number;
  private readonly messageIdleTimeoutMs: number;
  private readonly providerRegistryTimeoutMs: number;
  private readonly selectorConfigTimeoutMs: number;
  private readonly selectorDiagnosticsTimeoutMs: number;
  private readonly createTimeoutSignal: RuntimeTimeoutSignalFactory;
  private readonly createIdleTimeoutController: RuntimeIdleTimeoutControllerFactory;
  private readonly onClientDiagnostic?: (event: RuntimeClientDiagnosticEvent) => void;
  private readonly now: () => Date;

  constructor(
    private readonly baseUrl: string,
    options: RuntimeClientOptions = {},
  ) {
    this.apiKey = options.apiKey?.trim() || '';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RUNTIME_REQUEST_TIMEOUT_MS;
    this.sessionCreateTimeoutMs = options.sessionCreateTimeoutMs
      ?? DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS;
    this.sessionCreateSlowWarningMs = options.sessionCreateSlowWarningMs
      ?? resolveDefaultSessionCreateSlowWarningMs(this.sessionCreateTimeoutMs);
    this.messageIdleTimeoutMs = options.messageIdleTimeoutMs
      ?? DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS;
    this.providerRegistryTimeoutMs = options.providerRegistryTimeoutMs
      ?? Math.max(this.timeoutMs, DEFAULT_RUNTIME_PROVIDER_REGISTRY_TIMEOUT_MS);
    this.selectorConfigTimeoutMs = options.selectorConfigTimeoutMs
      ?? DEFAULT_RUNTIME_SELECTOR_CONFIG_TIMEOUT_MS;
    this.selectorDiagnosticsTimeoutMs = options.selectorDiagnosticsTimeoutMs
      ?? DEFAULT_RUNTIME_SELECTOR_DIAGNOSTICS_TIMEOUT_MS;
    this.createTimeoutSignal = options.createTimeoutSignal ?? createDefaultTimeoutSignal;
    this.createIdleTimeoutController =
      options.createIdleTimeoutController ?? createDefaultIdleTimeoutController;
    this.onClientDiagnostic = options.onClientDiagnostic;
    this.now = options.now ?? (() => new Date());
  }

  async getHealth(): Promise<RuntimeStatusSummary> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: this.authHeaders(),
        signal: this.createTimeoutSignal(this.timeoutMs),
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

  async getProviderConfig(
    options: { selector?: boolean } = {},
  ): Promise<RuntimeProviderConfigRegistry> {
    const response = await fetch(`${this.baseUrl}/providers/config`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: this.createTimeoutSignal(
        options.selector ? this.selectorConfigTimeoutMs : this.providerRegistryTimeoutMs,
      ),
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

  async getProviderDiagnostics(
    query: RuntimeProviderDiagnosticsQuery = {},
  ): Promise<RuntimeProviderDiagnosticsPayload> {
    const url = new URL(`${this.baseUrl}/diagnostics/providers`);
    url.searchParams.set('probe', query.probe ?? 'light');
    if (query.scope === 'availability') {
      url.searchParams.set('scope', 'availability');
    }
    if (query.provider?.trim()) {
      url.searchParams.set('provider', query.provider.trim());
    }
    if (query.backend?.trim()) {
      url.searchParams.set('backend', query.backend.trim());
    }
    if (query.instance?.trim()) {
      url.searchParams.set('instance', query.instance.trim());
    }
    if (query.defaultOnly === true) {
      url.searchParams.set('defaultOnly', 'true');
    }

    const response = await fetch(url, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: this.createTimeoutSignal(
        query.scope === 'availability'
          ? this.selectorDiagnosticsTimeoutMs
          : this.providerRegistryTimeoutMs,
      ),
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
      signal: this.createTimeoutSignal(this.timeoutMs),
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

  async getProviderModels(
    provider: string,
    instance?: string | null,
    options: { forceRefresh?: boolean } = {},
  ): Promise<ProviderModelCatalog> {
    const url = new URL(`${this.baseUrl}/providers/${encodeURIComponent(provider)}/models`);
    if (instance?.trim()) {
      url.searchParams.set('instance', instance.trim());
    }
    if (options.forceRefresh) {
      url.searchParams.set('refresh', '1');
    }

    const response = await fetch(url, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: this.createTimeoutSignal(
        options.forceRefresh
          ? DEFAULT_RUNTIME_PROVIDER_CATALOG_REFRESH_TIMEOUT_MS
          : this.providerRegistryTimeoutMs,
      ),
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
    options: { forceRefresh?: boolean } = {},
  ): Promise<ProviderAdvancedModelCatalog> {
    const url = new URL(`${this.baseUrl}/providers/${encodeURIComponent(provider)}/models/advanced`);
    if (instance?.trim()) {
      url.searchParams.set('instance', instance.trim());
    }
    if (options.forceRefresh) {
      url.searchParams.set('refresh', '1');
    }

    const response = await fetch(url, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: this.createTimeoutSignal(
        options.forceRefresh
          ? DEFAULT_RUNTIME_PROVIDER_CATALOG_REFRESH_TIMEOUT_MS
          : this.providerRegistryTimeoutMs,
      ),
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
    // Defensive guard for any untyped caller that bypasses the discriminated
    // transport input. Boundary-owned callers should already be type-safe.
    const runtimePolicyIssue = validateRuntimeSessionPolicyInput({
      workspaceKind: input.workspaceKind,
      workspaceAccess: input.workspaceAccess,
      permissionMode: input.permissionMode,
    });
    if (runtimePolicyIssue) {
      throw new RuntimeSessionPolicyError(runtimePolicyIssue);
    }

    const payload: Record<string, unknown> = {
      provider: input.provider,
      permissionMode: input.permissionMode ?? 'skip',
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

    const startedAt = Date.now();
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: this.createTimeoutSignal(this.sessionCreateTimeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new Error(readRuntimeErrorText(rawBody, `Failed to create session (${response.status})`));
    }

    const data = (await response.json()) as Record<string, unknown>;
    const session = readRuntimeSessionInfo(data, {
      provider: input.provider,
      model: input.model?.trim() || null,
      modelSelection: input.modelSelection ?? null,
      cwd: input.cwd?.trim() || null,
    });
    this.warnOnSlowSessionCreate(startedAt, session.provider, session.id);
    return session;
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

    const idleTimeout = this.createIdleTimeoutController(this.messageIdleTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          ...this.authHeaders(),
          'content-type': 'application/json',
          Accept: 'application/x-ndjson',
        },
        body: JSON.stringify(payload),
        signal: idleTimeout.signal,
      });

      if (!response.ok) {
        const rawBody = await response.text();
        throw new Error(readRuntimeErrorText(rawBody, `Failed to send message (${response.status})`));
      }

      return await readRuntimeNdjsonResponse(response, {
        onChunk: idleTimeout.reset,
      });
    } finally {
      idleTimeout.clear();
    }
  }

  async observeSession(sessionId: string): Promise<RuntimeObservedSessionPayload> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/observe`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: this.createTimeoutSignal(this.timeoutMs),
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

  async resumeSession(sessionId: string): Promise<RuntimeSessionInfo> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/resume`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
      },
      signal: this.createTimeoutSignal(this.timeoutMs),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new RuntimeRequestError(
        readRuntimeErrorText(rawBody, `Failed to resume session (${response.status})`),
        response.status,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    return readRuntimeSessionInfo(data, {
      provider: '',
      model: null,
      modelSelection: null,
      cwd: null,
    });
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
      signal: this.createTimeoutSignal(this.timeoutMs),
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
      signal: this.createTimeoutSignal(this.timeoutMs),
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
      signal: this.createTimeoutSignal(this.timeoutMs),
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
      signal: this.createTimeoutSignal(this.timeoutMs),
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
      signal: this.createTimeoutSignal(this.timeoutMs),
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

  private warnOnSlowSessionCreate(startedAt: number, provider: string, sessionId: string): void {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs <= this.sessionCreateSlowWarningMs) {
      return;
    }

    try {
      this.onClientDiagnostic?.({
        kind: 'slow_session_create',
        observedAt: this.now().toISOString(),
        provider,
        sessionId,
        elapsedMs,
        thresholdMs: this.sessionCreateSlowWarningMs,
      });
    } catch {
      // Diagnostics must never turn a successful session create into a failure.
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
