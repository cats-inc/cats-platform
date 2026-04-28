import type { SupervisionRejectionCode, SupervisionRejectionError } from './errors.js';

export interface SupervisionSchemaVersion {
  major: number;
  minor: number;
}

export const DEFAULT_SUPERVISION_SCHEMA_VERSION: SupervisionSchemaVersion = {
  major: 1,
  minor: 0,
};

export const SUPERVISION_AUTONOMY_VALUES = [
  'none',
  'single_step',
  'milestone_plan',
  'outcome_delegation',
] as const;

export const SUPERVISION_TASK_GRANULARITY_VALUES = [
  'tiny',
  'step',
  'milestone',
  'outcome',
] as const;

export const SUPERVISION_TOOL_SCOPE_VALUES = [
  'none',
  'read_only',
  'narrow_write',
  'broad_write',
] as const;

export const SUPERVISION_SCAFFOLDING_VALUES = [
  'none',
  'few_shot',
  'grammar_forced',
  'sop_template',
] as const;

export const SUPERVISION_VALIDATION_VALUES = [
  'best_effort',
  'schema_required',
  'semantic_check',
] as const;

export const SUPERVISION_CHECKPOINT_CADENCE_VALUES = [
  'every_step',
  'milestone',
  'on_risk',
  'final',
] as const;

export const SUPERVISION_APPROVAL_THRESHOLD_VALUES = [
  'low',
  'medium',
  'high',
] as const;

export const SUPERVISION_FALLBACK_POLICY_VALUES = [
  'retry',
  'ask_human',
  'escalate_model',
  'delegate_other',
] as const;

export type SupervisionAutonomy = (typeof SUPERVISION_AUTONOMY_VALUES)[number];
export type SupervisionTaskGranularity = (typeof SUPERVISION_TASK_GRANULARITY_VALUES)[number];
export type SupervisionToolScope = (typeof SUPERVISION_TOOL_SCOPE_VALUES)[number];
export type SupervisionScaffolding = (typeof SUPERVISION_SCAFFOLDING_VALUES)[number];
export type SupervisionValidation = (typeof SUPERVISION_VALIDATION_VALUES)[number];
export type SupervisionCheckpointCadence = (typeof SUPERVISION_CHECKPOINT_CADENCE_VALUES)[number];
export type SupervisionApprovalThreshold = (typeof SUPERVISION_APPROVAL_THRESHOLD_VALUES)[number];
export type SupervisionFallbackPolicy = (typeof SUPERVISION_FALLBACK_POLICY_VALUES)[number];

export interface SupervisionPolicy {
  autonomy: SupervisionAutonomy;
  taskGranularity: SupervisionTaskGranularity;
  toolScope: SupervisionToolScope;
  scaffolding: SupervisionScaffolding;
  validation: SupervisionValidation;
  checkpointCadence: SupervisionCheckpointCadence;
  approvalThreshold: SupervisionApprovalThreshold;
  fallbackPolicy: SupervisionFallbackPolicy;
}

export interface PolicyContextSummary {
  actorRef: string;
  targetRef: string;
  providerRef?: string;
  actionType: string;
  sideEffect: SupervisedToolSideEffect;
  capabilityConfidence: CapabilityConfidenceLevel;
  deliveryObservability?: string;
  budgetState?: string;
  approvalState?: string;
  recentReliability?: string;
}

export interface SupervisionPolicySnapshot {
  schemaVersion: SupervisionSchemaVersion;
  policyBundleVersion: string;
  dialVersions?: Partial<Record<keyof SupervisionPolicy, string>>;
  experimentId?: string;
  evaluatedAt: string;
  actionId: string;
  runId: string;
  actorRef: string;
  policy: SupervisionPolicy;
  contextSummary: PolicyContextSummary;
  reasons: string[];
}

export interface SupervisionPolicySnapshotRef {
  snapshotId: string;
  policyBundleVersion: string;
  actionId: string;
  runId: string;
}

export const CAPABILITY_DIMENSION_VALUES = [
  'tool_use_accuracy',
  'json_fidelity',
  'reasoning_depth',
  'context_reliability',
  'recovery_reliability',
] as const;

export type CapabilityDimension = (typeof CAPABILITY_DIMENSION_VALUES)[number];

export const CAPABILITY_CONFIDENCE_LEVEL_VALUES = [
  'unknown',
  'catalog_only',
  'evaluated',
  'observed',
] as const;

export type CapabilityConfidenceLevel = (typeof CAPABILITY_CONFIDENCE_LEVEL_VALUES)[number];

export interface CapabilityClaim {
  level: CapabilityConfidenceLevel;
  summary: string;
}

export const CAPABILITY_SOURCE_VALUES = [
  'bootstrap_config',
  'provider_catalog',
  'operator_override',
  'eval_suite',
  'session_history',
] as const;

export type CapabilitySource = (typeof CAPABILITY_SOURCE_VALUES)[number];

export interface CapabilitySourceEvidence {
  evidenceId: string;
  source: CapabilitySource;
  observedAt: string;
  claims: Partial<Record<CapabilityDimension, CapabilityClaim>>;
  metadata?: {
    catalogVersion?: string;
    bootstrapConfigRuleId?: string;
    bootstrapConfigVersion?: string;
    bootstrapConfigPath?: string;
    bootstrapConfigReason?: string;
    evalSuiteId?: string;
    evalRunId?: string;
    historyWindow?: { startedAt: string; endedAt: string; runIds: string[] };
    overrideId?: string;
    overrideReason?: string;
    overrideExpiresAt?: string;
  };
}

export const CAPABILITY_AGGREGATE_METHOD = 'conservative_per_dimension' as const;

export type CapabilityAggregateMethod = typeof CAPABILITY_AGGREGATE_METHOD;

export interface CapabilityConflict {
  dimension: CapabilityDimension;
  evidenceIds: string[];
  selectedLevel: CapabilityConfidenceLevel;
  reason: string;
}

export interface CapabilityAssessment {
  schemaVersion: SupervisionSchemaVersion;
  assessedAt: string;
  confidenceLevel: CapabilityConfidenceLevel;
  confidenceSources: CapabilitySourceEvidence[];
  aggregateMethod: CapabilityAggregateMethod;
  conflicts: CapabilityConflict[];
}

export type SupervisionDiagnosticSeverity = 'info' | 'warning' | 'error';

export type SupervisionDiagnosticCode =
  | 'missing_config'
  | 'parse_failed'
  | 'duplicate_rule_id'
  | 'invalid_treatment'
  | 'invalid_confidence'
  | 'ambiguous_match'
  | 'losing_tie_rule'
  | 'matched_rule';

export interface SupervisionDiagnosticRecord {
  id: string;
  kind: 'provider_capability_bootstrap_config';
  severity: SupervisionDiagnosticSeverity;
  code: SupervisionDiagnosticCode;
  observedAt: string;
  configPath?: string;
  ruleIds?: string[];
  target?: {
    provider: string;
    instance?: string | null;
    model?: string | null;
    control?: string | null;
  };
  message: string;
}

export const TOOL_RESULT_STATUS_VALUES = [
  'applied',
  'pending_approval',
  'rejected',
] as const;

export type ToolResultStatus = (typeof TOOL_RESULT_STATUS_VALUES)[number];

export type ToolResult<T> =
  | { status: 'applied'; result: T }
  | { status: 'pending_approval'; requestId: string; summary: string }
  | { status: 'rejected'; error: SupervisionRejectionError };

export interface RunRef {
  kind: 'run';
  runId: string;
  parentRunId?: string | null;
}

export interface LifecycleRequestRef {
  kind: 'lifecycle_request';
  requestId: string;
  requestedAt: string;
  target: AddressableTarget;
}

export type AsyncLifecycleRequestResult = ToolResult<RunRef | LifecycleRequestRef>;

export const ADDRESSABLE_TARGET_KIND_VALUES = [
  'durable_agent',
  'execution_target',
  'temporary_participant',
  'worker_tool',
] as const;

export type AddressableTargetKind = (typeof ADDRESSABLE_TARGET_KIND_VALUES)[number];

export type AddressableTarget =
  | { kind: 'durable_agent'; agentId: string; projection?: 'chat' | 'work' | 'code' }
  | { kind: 'execution_target'; provider: string; model: string; control?: string }
  | {
      kind: 'temporary_participant';
      participantId: string;
      roleHint?: string;
      displayName?: string;
      avatarHint?: string;
    }
  | { kind: 'worker_tool'; toolName: string; workerProfileId?: string };

export interface BudgetEnvelope {
  maxCostUsd?: number;
  maxTokens?: number;
  maxDurationMs?: number;
  hardStop?: boolean;
}

export interface SchemaRef {
  id: string;
  version: string;
  format: 'json_schema';
  uri?: string;
}

export const SUPERVISED_TOOL_SIDE_EFFECT_VALUES = [
  'none',
  'local_state',
  'external_visible',
  'destructive',
  'expensive',
] as const;

export type SupervisedToolSideEffect = (typeof SUPERVISED_TOOL_SIDE_EFFECT_VALUES)[number];

export const SUPERVISED_TOOL_PREFLIGHT_VALUES = [
  'required',
  'available',
  'not_supported',
] as const;

export type SupervisedToolPreflight = (typeof SUPERVISED_TOOL_PREFLIGHT_VALUES)[number];

export const SUPERVISED_TOOL_BLOCKING_VALUES = [
  'blocking',
  'async',
] as const;

export type SupervisedToolBlocking = (typeof SUPERVISED_TOOL_BLOCKING_VALUES)[number];

export const SUPERVISED_TOOL_CANCELLATION_VALUES = [
  'cooperative',
  'best_effort',
  'not_supported',
] as const;

export type SupervisedToolCancellation = (typeof SUPERVISED_TOOL_CANCELLATION_VALUES)[number];

export const SUPERVISED_TOOL_APPROVAL_VALUES = [
  'never',
  'policy',
  'always',
] as const;

export type SupervisedToolApproval = (typeof SUPERVISED_TOOL_APPROVAL_VALUES)[number];

export const SUPERVISED_TOOL_EVIDENCE_VALUES = [
  'none',
  'summary',
  'pre_post_snapshot',
  'artifact_reference',
] as const;

export type SupervisedToolEvidence = (typeof SUPERVISED_TOOL_EVIDENCE_VALUES)[number];

export interface SupervisedToolManifest {
  schemaVersion: SupervisionSchemaVersion;
  name: string;
  manifestVersion: string;
  description: string;
  sideEffect: SupervisedToolSideEffect;
  preflight: SupervisedToolPreflight;
  blocking: SupervisedToolBlocking;
  cancellation: SupervisedToolCancellation;
  approval: SupervisedToolApproval;
  evidence: SupervisedToolEvidence;
  failureCodes: SupervisionRejectionCode[];
  maxBudgetHint?: BudgetEnvelope;
  inputSchema: SchemaRef;
  outputSchema: SchemaRef;
}

export const RUN_PRIMARY_STATE_VALUES = [
  'queued',
  'running',
  'waiting_for_approval',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const;

export type RunPrimaryState = (typeof RUN_PRIMARY_STATE_VALUES)[number];

export interface RunBlocker {
  code: string;
  message: string;
  details?: unknown;
}

export const CANCELLATION_TOOL_CONTEXT_VALUES = [
  'cooperative_requested',
  'best_effort_requested',
  'not_supported',
] as const;

export type CancellationToolContext = (typeof CANCELLATION_TOOL_CONTEXT_VALUES)[number];

export const CANCELLATION_EFFECT_LANDED_VALUES = [
  'before_cancel_request',
  'after_cancel_request',
  'not_applied',
] as const;

export type CancellationEffectLanded = (typeof CANCELLATION_EFFECT_LANDED_VALUES)[number];

export const CANCELLATION_REASON_CODE_VALUES = [
  'operator_decision',
  'budget_hard_stop',
  'policy_violation',
  'external_event',
  'other',
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODE_VALUES)[number];

export interface CancellationContext {
  requestedAt: string;
  requestedBy: string;
  runStateAtRequest: Exclude<RunPrimaryState, 'completed' | 'failed' | 'cancelled'>;
  toolCancellation: CancellationToolContext;
  effectLanded: CancellationEffectLanded;
  reasonCode: CancellationReasonCode;
  reasonNote?: string;
}
