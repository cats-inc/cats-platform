// Runtime SPEC-039 v1 wire contract, pinned to source b75da37b. No Runtime implementation imports.
/** Host-facing interaction contract. Native provider request IDs stay in the adapter. */
export const INTERACTION_KINDS = [
  'command_approval', 'file_approval', 'permission_grant', 'user_input', 'mcp_form', 'mcp_url',
] as const;
export type InteractionKind = typeof INTERACTION_KINDS[number];
export type InteractionStatus = 'pending' | 'responding' | 'resolved' | 'expired'
  | 'cancelled' | 'interrupted' | 'unsupported';

export interface InteractionHost {
  version: 1;
  kinds: InteractionKind[];
  timeoutMs: number;
}

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
}

export interface InteractionField {
  id: string;
  label: string;
  description?: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'strings';
  required: boolean;
  secret?: boolean;
  options?: InteractionOption[];
  allowOther?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface InteractionPrompt {
  kind: InteractionKind;
  title: string;
  message?: string;
  command?: string;
  cwd?: string;
  server?: string;
  url?: string;
  choices?: InteractionOption[];
  fields?: InteractionField[];
  /** Provider-normalized permission units. Granting one never grants another unit. */
  permissions?: InteractionOption[];
  scopes?: ('turn' | 'session')[];
}

export interface ProviderInteraction {
  interactionId: string;
  sessionId: string;
  workerGeneration: string;
  executionId: string;
  revision: number;
  createdAt: string;
  expiresAt: string;
  status: InteractionStatus;
  prompt?: InteractionPrompt;
  /** Terminal receipts retain the kind, but discard prompt and answer contents. */
  kind: InteractionKind;
  reason?: string;
  decision?: InteractionAnswer['action'];
  providerConfirmed?: boolean;
}

export interface InteractionAnswer {
  action: 'accept' | 'decline' | 'cancel';
  choice?: string;
  values?: Record<string, string | number | boolean | string[]>;
  grants?: string[];
  scope?: 'turn' | 'session';
}

export interface InteractionResponse {
  expectedRevision: number;
  idempotencyKey: string;
  answer: InteractionAnswer;
}

export interface InteractionSnapshot {
  version: 1;
  sessionId: string;
  workerGeneration: string | null;
  revision: number;
  interactions: ProviderInteraction[];
}

export const EXECUTION_ACCESS = ['read-only', 'workspace-write', 'full-access'] as const;
export type ExecutionAccess = typeof EXECUTION_ACCESS[number];
export type ExecutionApproval = 'never' | 'untrusted' | 'on-request';
export type SessionExecutionPolicy = { version: 1; mode: 'provider';
  constraints: { maxAccess: ExecutionAccess; network: boolean } }
  | { version: 1; mode: 'explicit'; access: ExecutionAccess; network: boolean; approval: ExecutionApproval };

export interface EffectiveExecutionPolicy {
  requested?: SessionExecutionPolicy;
  source: 'legacy' | 'provider' | 'explicit';
  status: 'not_observed' | 'verified' | 'mismatch' | 'unsupported';
  observed?: { access: ExecutionAccess; network: boolean; approval: string; reviewer: string };
  coverage: 'local-process-only';
  reason?: string;
  configurationSources: string[];
}

export interface SessionToolServer {
  name: string;
  source: 'provider-configured' | 'session-injected';
  connection: 'notStarted' | 'starting' | 'connected' | 'authenticationRequired' | 'failed' | 'cancelled' | 'disabled' | 'unknown';
  /** An unsupported auth mechanism does not imply unsupported tools. */
  auth: 'unknown' | 'unsupported' | 'notLoggedIn' | 'bearerToken' | 'oAuth';
  tools: Array<{ name: string; qualifiedName: string }>;
  discovery: 'advertised' | 'failed' | 'truncated';
  invocation: 'not_verified';
}

export interface SessionToolInventory {
  state: 'not_observed' | 'observed' | 'partial' | 'unavailable';
  observedAt: string | null;
  stale: boolean;
  /** Top-level discovery cannot enumerate tools lazily exposed inside code-mode hosts. */
  coverage: 'top-level-mcp';
  pages: number;
  servers: SessionToolServer[];
  dynamicTools: Array<{ name: string; source: 'runtime-dynamic' }>;
  builtins: 'not_exposed_by_provider';
  reason?: string;
}

export interface ProviderSessionCapabilities {
  interactions: { version: 1; supported: InteractionKind[]; host?: InteractionHost };
  policy: EffectiveExecutionPolicy;
  inventory: SessionToolInventory;
  dependencies: Array<{ kind: 'computer_use' | 'browser'; status: 'available' | 'unavailable' | 'unknown';
    evidence: string; remediation: string }>;
}

export interface SessionCapabilitiesSnapshot {
  version: 1;
  sessionId: string;
  workerGeneration: string | null;
  supported: boolean;
  observation?: ProviderSessionCapabilities;
  reason?: string;
}


export const PLATFORM_INTERACTION_HOST: InteractionHost = { version: 1, kinds: [...INTERACTION_KINDS], timeoutMs: 30 * 60_000 };

export interface ProviderInteractionBinding {
  conversationId: string;
  sessionId: string;
  participantId: string | null;
  laneId: string | null;
  turnId: string | null;
  runId: string | null;
  label: string;
}
export interface BoundProviderInteraction extends ProviderInteraction { binding: ProviderInteractionBinding }
export interface ProviderConversationSnapshot { version: 1; conversationId: string; supported: boolean;
  reason?: string; interactions: BoundProviderInteraction[]; sessions: ProviderInteractionBinding[] }
export interface BoundInteractionResponse extends InteractionResponse {
  binding: ProviderInteractionBinding;
  workerGeneration: string;
  executionId: string;
}
