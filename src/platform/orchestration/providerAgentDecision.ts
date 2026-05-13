import type {
  AddressableTarget,
  BudgetEnvelope,
  SchemaRef,
  SupervisedToolManifest,
  SupervisionFallbackPolicy,
  SupervisionPolicy,
  SupervisionPolicySnapshotRef,
  SupervisionToolScope,
} from '../supervision/contracts.js';
import {
  ADDRESSABLE_TARGET_KIND_VALUES,
  SUPERVISED_TOOL_APPROVAL_VALUES,
  SUPERVISED_TOOL_BLOCKING_VALUES,
  SUPERVISED_TOOL_CANCELLATION_VALUES,
  SUPERVISED_TOOL_EVIDENCE_VALUES,
  SUPERVISED_TOOL_PREFLIGHT_VALUES,
  SUPERVISED_TOOL_SIDE_EFFECT_VALUES,
  SUPERVISION_FALLBACK_POLICY_VALUES,
} from '../supervision/contracts.js';

export const PROVIDER_AGENT_DECISION_CONTRACT_VERSION = 1;
export const PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH = 280;
export const PROVIDER_AGENT_MAX_SUMMARIES = 24;
export const PROVIDER_AGENT_MAX_SUMMARY_KEY_LENGTH = 80;
export const PROVIDER_AGENT_MAX_GOAL_LENGTH = 2000;
export const PROVIDER_AGENT_MAX_CONTEXT_REFS = 64;
export const PROVIDER_AGENT_MAX_CONTEXT_REF_LENGTH = 240;
export const PROVIDER_AGENT_MAX_INVARIANTS = 24;
export const PROVIDER_AGENT_MAX_INVARIANT_LENGTH = 320;
export const PROVIDER_AGENT_MAX_TOOL_REASON_LENGTH = 280;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_HINTS = 8;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_HINT_LENGTH = 400;
export const PROVIDER_AGENT_MAX_TOOL_NAME_LENGTH = 160;
export const PROVIDER_AGENT_MAX_TOOL_DESCRIPTION_LENGTH = 500;
export const PROVIDER_AGENT_MAX_TOOL_MANIFEST_VERSION_LENGTH = 40;
export const PROVIDER_AGENT_MAX_TOOL_FAILURE_CODES = 16;
export const PROVIDER_AGENT_MAX_TOOL_FAILURE_CODE_LENGTH = 80;
export const PROVIDER_AGENT_MAX_SEMANTIC_PLAN_STEPS = 12;
export const PROVIDER_AGENT_MAX_STEP_DEPENDENCIES = 8;
export const PROVIDER_AGENT_MAX_STEP_DEPENDENCY_LENGTH = 80;
export const PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH = 120;
export const PROVIDER_AGENT_MAX_SCHEMA_REF_ID_LENGTH = 160;
export const PROVIDER_AGENT_MAX_SCHEMA_REF_VERSION_LENGTH = 40;
export const PROVIDER_AGENT_MAX_SCHEMA_REF_URI_LENGTH = 1000;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_DEPTH = 6;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_OBJECT_KEYS = 32;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_ARRAY_ITEMS = 32;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_KEY_LENGTH = 80;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_STRING_LENGTH = 4000;
export const PROVIDER_AGENT_DECISION_CONFIDENCE_VALUES = ['low', 'medium', 'high'] as const;
export const PROVIDER_AGENT_TASK_RISK_VALUES = ['low', 'medium', 'high'] as const;
export const PROVIDER_AGENT_TASK_KIND_VALUES = [
  'chat_turn',
  'work_run',
  'code_task',
  'code_relay',
] as const;
export const PROVIDER_AGENT_SUMMARY_KIND_VALUES = [
  'count',
  'ratio',
  'enumerated_outcome',
  'opaque_ref',
] as const;
export const PROVIDER_AGENT_DECISION_KIND_VALUES = [
  'semantic_plan',
  'tool_request',
  'delegation_request',
  'recovery_decision',
] as const;
export const PROVIDER_AGENT_SEMANTIC_PLAN_STEP_ACTION_VALUES = [
  'call_tool',
  'delegate_run',
  'request_approval',
  'respond',
] as const;
export const PROVIDER_AGENT_DELEGATION_BLOCKING_VALUES = ['blocking', 'async'] as const;
export const PROVIDER_AGENT_TARGET_PROJECTION_VALUES = ['chat', 'work', 'code'] as const;

export type ProviderAgentDecisionConfidence =
  (typeof PROVIDER_AGENT_DECISION_CONFIDENCE_VALUES)[number];
export type ProviderAgentTaskRisk = (typeof PROVIDER_AGENT_TASK_RISK_VALUES)[number];
export type ProviderAgentTaskKind = (typeof PROVIDER_AGENT_TASK_KIND_VALUES)[number];
export type ProviderAgentSummaryKind = (typeof PROVIDER_AGENT_SUMMARY_KIND_VALUES)[number];
export type ProviderAgentDecisionKind = (typeof PROVIDER_AGENT_DECISION_KIND_VALUES)[number];

export interface ProviderAgentObservationSummary {
  key: string;
  kind: ProviderAgentSummaryKind;
  value: number | string | boolean | null;
  sourceRef?: string;
}

export interface ProviderAgentToolDescriptor {
  manifest: SupervisedToolManifest;
  reason: string;
  inputHints?: string[];
}

export interface ProviderAgentBoundedObservation {
  contractVersion: typeof PROVIDER_AGENT_DECISION_CONTRACT_VERSION;
  observationId: string;
  runId: string;
  goal: string;
  task: {
    kind: ProviderAgentTaskKind;
    risk: ProviderAgentTaskRisk;
  };
  actor: {
    actorRef: string;
    target: AddressableTarget;
    capabilityProfileRef: string;
    providerRef?: string;
  };
  policy: {
    snapshotRef?: SupervisionPolicySnapshotRef;
    dials: SupervisionPolicy;
    parentToolScope?: SupervisionToolScope;
    allowedFallbacks: SupervisionFallbackPolicy[];
  };
  availableTools: ProviderAgentToolDescriptor[];
  contextRefs: string[];
  summaries: ProviderAgentObservationSummary[];
  budget: BudgetEnvelope;
  invariants: string[];
}

export interface ProviderAgentSemanticPlanStep {
  stepId: string;
  summary: string;
  action: 'call_tool' | 'delegate_run' | 'request_approval' | 'respond';
  toolName?: string;
  target?: AddressableTarget;
  input?: unknown;
  expectedOutputSchemaRef?: SchemaRef;
  dependsOn?: string[];
}

export interface ProviderAgentSemanticPlanDecision {
  contractVersion: typeof PROVIDER_AGENT_DECISION_CONTRACT_VERSION;
  kind: 'semantic_plan';
  decisionId: string;
  planId: string;
  confidence: ProviderAgentDecisionConfidence;
  rationaleSummary: string;
  steps: ProviderAgentSemanticPlanStep[];
}

export interface ProviderAgentToolRequestDecision {
  contractVersion: typeof PROVIDER_AGENT_DECISION_CONTRACT_VERSION;
  kind: 'tool_request';
  decisionId: string;
  confidence: ProviderAgentDecisionConfidence;
  toolName: string;
  target: AddressableTarget;
  input: unknown;
  expectedOutputSchemaRef?: SchemaRef;
  rationaleSummary: string;
}

export interface ProviderAgentDelegationRequestDecision {
  contractVersion: typeof PROVIDER_AGENT_DECISION_CONTRACT_VERSION;
  kind: 'delegation_request';
  decisionId: string;
  confidence: ProviderAgentDecisionConfidence;
  target: AddressableTarget;
  goalSummary: string;
  blocking: 'blocking' | 'async';
  budget: BudgetEnvelope;
  rationaleSummary: string;
}

export interface ProviderAgentRecoveryDecision {
  contractVersion: typeof PROVIDER_AGENT_DECISION_CONTRACT_VERSION;
  kind: 'recovery_decision';
  decisionId: string;
  confidence: ProviderAgentDecisionConfidence;
  rejectedActionId: string;
  selectedFallback: SupervisionFallbackPolicy;
  correctedInput?: unknown;
  rationaleSummary: string;
}

export type ProviderAgentDecision =
  | ProviderAgentSemanticPlanDecision
  | ProviderAgentToolRequestDecision
  | ProviderAgentDelegationRequestDecision
  | ProviderAgentRecoveryDecision;

export interface ProviderAgentDecisionValidationInput {
  observation: ProviderAgentBoundedObservation;
  decision: ProviderAgentDecision;
}

export function validateProviderAgentBoundedObservation(
  observation: ProviderAgentBoundedObservation,
): string[] {
  const errors: string[] = [];

  validateRequiredString(errors, 'observationId', observation.observationId);
  validateRequiredString(errors, 'runId', observation.runId);
  validateBoundedString(errors, 'goal', observation.goal, PROVIDER_AGENT_MAX_GOAL_LENGTH);
  validateEnumValue(errors, 'task.kind', observation.task.kind, PROVIDER_AGENT_TASK_KIND_VALUES);
  validateEnumValue(errors, 'task.risk', observation.task.risk, PROVIDER_AGENT_TASK_RISK_VALUES);
  validateRequiredString(errors, 'actor.actorRef', observation.actor.actorRef);
  validateRequiredString(
    errors,
    'actor.capabilityProfileRef',
    observation.actor.capabilityProfileRef,
  );
  validateAddressableTarget(errors, 'actor.target', observation.actor.target);
  validateAllowedFallbacks(
    errors,
    observation.policy.allowedFallbacks,
    observation.policy.dials.fallbackPolicy,
  );
  validateBudgetEnvelope(errors, observation.budget);

  if (observation.contractVersion !== PROVIDER_AGENT_DECISION_CONTRACT_VERSION) {
    errors.push(`contractVersion must be ${PROVIDER_AGENT_DECISION_CONTRACT_VERSION}`);
  }
  if (!Array.isArray(observation.availableTools)) {
    errors.push('availableTools must be an array');
  } else {
    const manifestNames = observation.availableTools
      .map((tool) => readToolDescriptorManifestName(tool))
      .filter((name): name is string => name !== null);
    if (new Set(manifestNames).size !== manifestNames.length) {
      errors.push('availableTools must not contain duplicate manifest names');
    }
    observation.availableTools.forEach((tool, index) => {
      validateToolDescriptor(errors, tool, index);
    });
  }
  validateBoundedStringArray(
    errors,
    'contextRefs',
    observation.contextRefs,
    PROVIDER_AGENT_MAX_CONTEXT_REFS,
    PROVIDER_AGENT_MAX_CONTEXT_REF_LENGTH,
  );
  validateBoundedStringArray(
    errors,
    'invariants',
    observation.invariants,
    PROVIDER_AGENT_MAX_INVARIANTS,
    PROVIDER_AGENT_MAX_INVARIANT_LENGTH,
  );

  if (!Array.isArray(observation.summaries)) {
    errors.push('summaries must be an array');
  } else {
    if (observation.summaries.length > PROVIDER_AGENT_MAX_SUMMARIES) {
      errors.push(`summaries must contain ${PROVIDER_AGENT_MAX_SUMMARIES} entries or fewer`);
    }
    for (const summary of observation.summaries) {
      validateObservationSummary(errors, summary);
    }
  }

  return errors;
}

export function validateProviderAgentDecision(
  input: ProviderAgentDecisionValidationInput,
): string[] {
  const errors = validateProviderAgentBoundedObservation(input.observation);
  const availableToolNames = new Set(
    input.observation.availableTools.map((tool) => tool.manifest.name),
  );
  const availableToolByName = new Map(
    input.observation.availableTools.map((tool) => [tool.manifest.name, tool.manifest]),
  );

  validateBoundedString(
    errors,
    'decisionId',
    input.decision.decisionId,
    PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
  );
  validateEnumValue(
    errors,
    'decision.kind',
    input.decision.kind,
    PROVIDER_AGENT_DECISION_KIND_VALUES,
  );
  validateEnumValue(
    errors,
    'decision.confidence',
    input.decision.confidence,
    PROVIDER_AGENT_DECISION_CONFIDENCE_VALUES,
  );
  if (input.decision.contractVersion !== PROVIDER_AGENT_DECISION_CONTRACT_VERSION) {
    errors.push(`decision contractVersion must be ${PROVIDER_AGENT_DECISION_CONTRACT_VERSION}`);
  }

  switch (input.decision.kind) {
    case 'semantic_plan':
      validateSemanticPlanDecision(
        errors,
        input.decision,
        availableToolNames,
        availableToolByName,
      );
      break;
    case 'tool_request':
      validateToolRequestDecision(
        errors,
        input.decision,
        availableToolNames,
        availableToolByName,
      );
      break;
    case 'delegation_request':
      validateDelegationTarget(errors, input.decision);
      validateBoundedString(
        errors,
        'goalSummary',
        input.decision.goalSummary,
        PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
      );
      validateBoundedString(
        errors,
        'rationaleSummary',
        input.decision.rationaleSummary,
        PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
      );
      validateEnumValue(
        errors,
        'delegation_request.blocking',
        input.decision.blocking,
        PROVIDER_AGENT_DELEGATION_BLOCKING_VALUES,
      );
      validateBudgetEnvelope(errors, input.decision.budget, 'delegation_request.budget');
      break;
    case 'recovery_decision':
      validateRecoveryDecision(errors, input.observation, input.decision);
      break;
    default:
      return errors;
  }

  return errors;
}

function validateSemanticPlanDecision(
  errors: string[],
  decision: ProviderAgentSemanticPlanDecision,
  availableToolNames: Set<string>,
  availableToolByName: Map<string, SupervisedToolManifest>,
): void {
  validateBoundedString(errors, 'planId', decision.planId, PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH);
  validateBoundedString(
    errors,
    'rationaleSummary',
    decision.rationaleSummary,
    PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
  );

  if (!Array.isArray(decision.steps)) {
    errors.push('semantic_plan.steps must be an array');
    return;
  }
  if (decision.steps.length === 0) {
    errors.push('semantic_plan.steps must not be empty');
  }
  if (decision.steps.length > PROVIDER_AGENT_MAX_SEMANTIC_PLAN_STEPS) {
    errors.push(
      `semantic_plan.steps must contain ${PROVIDER_AGENT_MAX_SEMANTIC_PLAN_STEPS} entries or fewer`,
    );
  }
  const stepRecords = decision.steps.filter(
    (step, index): step is ProviderAgentSemanticPlanStep => {
      if (!isRecord(step)) {
        errors.push(`semantic_plan.steps[${index}] must be an object`);
        return false;
      }
      return true;
    },
  );
  const validStepIds = stepRecords
    .map((step) => step.stepId)
    .filter((stepId): stepId is string => typeof stepId === 'string' && stepId.trim() !== '');
  if (new Set(validStepIds).size !== validStepIds.length) {
    errors.push('semantic_plan.steps must have unique stepId values');
  }
  const stepIds = new Set(validStepIds);

  for (const step of stepRecords) {
    validateBoundedString(
      errors,
      'step.stepId',
      step.stepId,
      PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
    );
    validateEnumValue(
      errors,
      `step ${step.stepId}.action`,
      step.action,
      PROVIDER_AGENT_SEMANTIC_PLAN_STEP_ACTION_VALUES,
    );
    validateBoundedString(
      errors,
      `step ${step.stepId} summary`,
      step.summary,
      PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
    );
    if (step.input !== undefined) {
      validateBoundedToolInputObject(errors, `step ${step.stepId}.input`, step.input, false);
    }
    validateSemanticPlanStepTarget(errors, step);

    if (step.action === 'call_tool') {
      validateToolName(errors, step.toolName, availableToolNames, `step ${step.stepId}`);
      validateExpectedOutputSchemaRef(
        errors,
        `step ${step.stepId}`,
        step.expectedOutputSchemaRef,
        step.toolName ? availableToolByName.get(step.toolName) : undefined,
      );
    }
    if (step.dependsOn !== undefined) {
      if (!Array.isArray(step.dependsOn)) {
        errors.push(`step ${step.stepId}.dependsOn must be an array`);
      } else {
        const dependencyShapeErrorCount = errors.length;
        validateBoundedStringArray(
          errors,
          `step ${step.stepId}.dependsOn`,
          step.dependsOn,
          PROVIDER_AGENT_MAX_STEP_DEPENDENCIES,
          PROVIDER_AGENT_MAX_STEP_DEPENDENCY_LENGTH,
        );
        if (errors.length === dependencyShapeErrorCount) {
          validateStepDependencies(errors, step, stepIds);
        }
      }
    }
  }
}

function validateSemanticPlanStepTarget(
  errors: string[],
  step: ProviderAgentSemanticPlanStep,
): void {
  if (step.target === undefined) {
    return;
  }
  const target = validateAddressableTarget(errors, `step ${step.stepId}.target`, step.target);
  if (!target) {
    return;
  }

  if (step.action === 'call_tool') {
    if (target.kind !== 'worker_tool') {
      errors.push(`step ${step.stepId}.target.kind must be worker_tool for call_tool`);
      return;
    }
    if (target.toolName !== step.toolName) {
      errors.push(`step ${step.stepId}.target.toolName must match step toolName ${step.toolName}`);
    }
    return;
  }

  if (target.kind === 'worker_tool') {
    errors.push(`step ${step.stepId}.target.kind must not be worker_tool unless action is call_tool`);
  }
}

function validateToolRequestDecision(
  errors: string[],
  decision: ProviderAgentToolRequestDecision,
  availableToolNames: Set<string>,
  availableToolByName: Map<string, SupervisedToolManifest>,
): void {
  validateToolName(errors, decision.toolName, availableToolNames, 'tool_request');
  validateToolRequestTarget(errors, decision);
  validateExpectedOutputSchemaRef(
    errors,
    'tool_request',
    decision.expectedOutputSchemaRef,
    availableToolByName.get(decision.toolName),
  );
  validateBoundedToolInputObject(errors, 'tool_request.input', decision.input, true);
  validateBoundedString(
    errors,
    'rationaleSummary',
    decision.rationaleSummary,
    PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
  );
}

function validateExpectedOutputSchemaRef(
  errors: string[],
  field: string,
  schemaRef: unknown,
  manifest: SupervisedToolManifest | undefined,
): void {
  if (schemaRef === undefined || schemaRef === null) {
    return;
  }
  if (!validateSchemaRef(errors, `${field}.expectedOutputSchemaRef`, schemaRef)) {
    return;
  }
  if (!manifest) {
    return;
  }

  if (
    schemaRef.id !== manifest.outputSchema.id
    || schemaRef.version !== manifest.outputSchema.version
    || schemaRef.format !== manifest.outputSchema.format
  ) {
    errors.push(
      `${field}.expectedOutputSchemaRef must match ${manifest.name} outputSchema`,
    );
  }
}

function validateSchemaRef(
  errors: string[],
  field: string,
  value: unknown,
): value is SchemaRef {
  if (!isRecord(value)) {
    errors.push(`${field} must be an object`);
    return false;
  }

  const previousErrorCount = errors.length;
  validateBoundedString(
    errors,
    `${field}.id`,
    value.id,
    PROVIDER_AGENT_MAX_SCHEMA_REF_ID_LENGTH,
  );
  validateBoundedString(
    errors,
    `${field}.version`,
    value.version,
    PROVIDER_AGENT_MAX_SCHEMA_REF_VERSION_LENGTH,
  );
  validateEnumValue(errors, `${field}.format`, value.format, ['json_schema']);
  validateOptionalBoundedString(
    errors,
    `${field}.uri`,
    value.uri,
    PROVIDER_AGENT_MAX_SCHEMA_REF_URI_LENGTH,
  );

  return errors.length === previousErrorCount;
}

function validateToolRequestTarget(
  errors: string[],
  decision: ProviderAgentToolRequestDecision,
): void {
  const target = validateAddressableTarget(errors, 'tool_request.target', decision.target);
  if (!target) {
    return;
  }
  if (target.kind !== 'worker_tool') {
    errors.push('tool_request.target.kind must be worker_tool');
    return;
  }
  if (target.toolName !== decision.toolName) {
    errors.push(`tool_request.target.toolName must match tool_request.toolName ${decision.toolName}`);
  }
}

function validateDelegationTarget(
  errors: string[],
  decision: ProviderAgentDelegationRequestDecision,
): void {
  const target = validateAddressableTarget(
    errors,
    'delegation_request.target',
    decision.target,
  );
  if (target?.kind === 'worker_tool') {
    errors.push('delegation_request.target.kind must not be worker_tool');
  }
}

function validateRecoveryDecision(
  errors: string[],
  observation: ProviderAgentBoundedObservation,
  decision: ProviderAgentRecoveryDecision,
): void {
  validateBoundedString(
    errors,
    'rejectedActionId',
    decision.rejectedActionId,
    PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
  );
  validateBoundedString(
    errors,
    'rationaleSummary',
    decision.rationaleSummary,
    PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
  );

  if (!observation.policy.allowedFallbacks.includes(decision.selectedFallback)) {
    errors.push(
      `recovery selectedFallback ${decision.selectedFallback} is outside allowedFallbacks`,
    );
  }
  if (decision.correctedInput !== undefined) {
    validateBoundedToolInputObject(errors, 'correctedInput', decision.correctedInput, false);
  }
}

function validateStepDependencies(
  errors: string[],
  step: ProviderAgentSemanticPlanStep,
  stepIds: Set<string>,
): void {
  if (!step.dependsOn) {
    return;
  }

  const dependencies = new Set<string>();
  for (const dependency of step.dependsOn) {
    if (dependencies.has(dependency)) {
      errors.push(`step ${step.stepId}.dependsOn must not repeat ${dependency}`);
      continue;
    }
    dependencies.add(dependency);
    if (dependency === step.stepId) {
      errors.push(`step ${step.stepId}.dependsOn must not reference itself`);
    }
    if (!stepIds.has(dependency)) {
      errors.push(`step ${step.stepId}.dependsOn references unknown step ${dependency}`);
    }
  }
}

function validateAddressableTarget(
  errors: string[],
  field: string,
  value: unknown,
): AddressableTarget | null {
  if (!isRecord(value)) {
    errors.push(`${field} must be an object`);
    return null;
  }

  const kind = value.kind;
  validateEnumValue(errors, `${field}.kind`, kind, ADDRESSABLE_TARGET_KIND_VALUES);
  if (
    typeof kind !== 'string'
    || !(ADDRESSABLE_TARGET_KIND_VALUES as readonly string[]).includes(kind)
  ) {
    return null;
  }

  switch (kind) {
    case 'durable_agent':
      validateBoundedString(
        errors,
        `${field}.agentId`,
        value.agentId,
        PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
      );
      validateOptionalEnumValue(
        errors,
        `${field}.projection`,
        value.projection,
        PROVIDER_AGENT_TARGET_PROJECTION_VALUES,
      );
      break;
    case 'execution_target':
      validateBoundedString(
        errors,
        `${field}.provider`,
        value.provider,
        PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
      );
      validateBoundedString(
        errors,
        `${field}.model`,
        value.model,
        PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
      );
      validateOptionalBoundedString(
        errors,
        `${field}.control`,
        value.control,
        PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
      );
      break;
    case 'temporary_participant':
      validateBoundedString(
        errors,
        `${field}.participantId`,
        value.participantId,
        PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
      );
      validateOptionalBoundedString(
        errors,
        `${field}.roleHint`,
        value.roleHint,
        PROVIDER_AGENT_MAX_SUMMARY_KEY_LENGTH,
      );
      validateOptionalBoundedString(
        errors,
        `${field}.displayName`,
        value.displayName,
        PROVIDER_AGENT_MAX_SUMMARY_KEY_LENGTH,
      );
      validateOptionalBoundedString(
        errors,
        `${field}.avatarHint`,
        value.avatarHint,
        PROVIDER_AGENT_MAX_SUMMARY_KEY_LENGTH,
      );
      break;
    case 'worker_tool':
      validateBoundedString(
        errors,
        `${field}.toolName`,
        value.toolName,
        PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
      );
      validateOptionalBoundedString(
        errors,
        `${field}.workerProfileId`,
        value.workerProfileId,
        PROVIDER_AGENT_MAX_IDENTIFIER_LENGTH,
      );
      break;
    default:
      return null;
  }

  return value as AddressableTarget;
}

function validateBudgetEnvelope(
  errors: string[],
  budget: unknown,
  field = 'budget',
): void {
  if (!isRecord(budget)) {
    errors.push(`${field} must be an object`);
    return;
  }

  validateOptionalPositiveNumber(errors, `${field}.maxCostUsd`, budget.maxCostUsd);
  validateOptionalPositiveInteger(errors, `${field}.maxTokens`, budget.maxTokens);
  validateOptionalPositiveInteger(errors, `${field}.maxDurationMs`, budget.maxDurationMs);

  if (
    budget.maxCostUsd === undefined
    && budget.maxTokens === undefined
    && budget.maxDurationMs === undefined
  ) {
    errors.push(`${field} must include at least one maxCostUsd, maxTokens, or maxDurationMs limit`);
  }
  if (budget.hardStop !== true) {
    errors.push(`${field}.hardStop must be true for provider-agent observations`);
  }
}

function validateAllowedFallbacks(
  errors: string[],
  allowedFallbacks: unknown,
  policyFallback: SupervisionFallbackPolicy,
): void {
  if (!Array.isArray(allowedFallbacks)) {
    errors.push('policy.allowedFallbacks must be an array');
    return;
  }
  if (allowedFallbacks.length === 0) {
    errors.push('policy.allowedFallbacks must not be empty');
  }
  if (new Set(allowedFallbacks).size !== allowedFallbacks.length) {
    errors.push('policy.allowedFallbacks must not contain duplicate values');
  }

  allowedFallbacks.forEach((fallback, index) => {
    if (!SUPERVISION_FALLBACK_POLICY_VALUES.includes(fallback)) {
      errors.push(`policy.allowedFallbacks[${index}] is unsupported: ${fallback}`);
    }
  });

  if (!allowedFallbacks.includes(policyFallback)) {
    errors.push(
      `policy.allowedFallbacks must include policy.dials.fallbackPolicy ${policyFallback}`,
    );
  }
}

function validateToolDescriptor(
  errors: string[],
  descriptor: unknown,
  index: number,
): void {
  if (!isRecord(descriptor)) {
    errors.push(`availableTools[${index}] must be an object`);
    return;
  }
  if (!isRecord(descriptor.manifest)) {
    errors.push(`availableTools[${index}].manifest must be an object`);
  } else {
    validateToolManifest(errors, descriptor.manifest, index);
  }
  validateBoundedString(
    errors,
    `availableTools[${index}].reason`,
    descriptor.reason,
    PROVIDER_AGENT_MAX_TOOL_REASON_LENGTH,
  );

  if (!descriptor.inputHints) {
    return;
  }
  if (!Array.isArray(descriptor.inputHints)) {
    errors.push(`availableTools[${index}].inputHints must be an array`);
    return;
  }

  if (descriptor.inputHints.length > PROVIDER_AGENT_MAX_TOOL_INPUT_HINTS) {
    errors.push(
      `availableTools[${index}].inputHints must contain `
      + `${PROVIDER_AGENT_MAX_TOOL_INPUT_HINTS} entries or fewer`,
    );
  }

  descriptor.inputHints.forEach((hint, hintIndex) => {
    validateBoundedString(
      errors,
      `availableTools[${index}].inputHints[${hintIndex}]`,
      hint,
      PROVIDER_AGENT_MAX_TOOL_INPUT_HINT_LENGTH,
    );
  });
}

function validateToolManifest(
  errors: string[],
  manifest: Record<string, unknown>,
  index: number,
): void {
  const field = `availableTools[${index}].manifest`;
  validateBoundedString(
    errors,
    `${field}.name`,
    manifest.name,
    PROVIDER_AGENT_MAX_TOOL_NAME_LENGTH,
  );
  validateBoundedString(
    errors,
    `${field}.manifestVersion`,
    manifest.manifestVersion,
    PROVIDER_AGENT_MAX_TOOL_MANIFEST_VERSION_LENGTH,
  );
  validateBoundedString(
    errors,
    `${field}.description`,
    manifest.description,
    PROVIDER_AGENT_MAX_TOOL_DESCRIPTION_LENGTH,
  );
  validateEnumValue(
    errors,
    `${field}.sideEffect`,
    manifest.sideEffect,
    SUPERVISED_TOOL_SIDE_EFFECT_VALUES,
  );
  validateEnumValue(
    errors,
    `${field}.preflight`,
    manifest.preflight,
    SUPERVISED_TOOL_PREFLIGHT_VALUES,
  );
  validateEnumValue(
    errors,
    `${field}.blocking`,
    manifest.blocking,
    SUPERVISED_TOOL_BLOCKING_VALUES,
  );
  validateEnumValue(
    errors,
    `${field}.cancellation`,
    manifest.cancellation,
    SUPERVISED_TOOL_CANCELLATION_VALUES,
  );
  validateEnumValue(
    errors,
    `${field}.approval`,
    manifest.approval,
    SUPERVISED_TOOL_APPROVAL_VALUES,
  );
  validateEnumValue(
    errors,
    `${field}.evidence`,
    manifest.evidence,
    SUPERVISED_TOOL_EVIDENCE_VALUES,
  );
  validateBoundedStringArray(
    errors,
    `${field}.failureCodes`,
    manifest.failureCodes,
    PROVIDER_AGENT_MAX_TOOL_FAILURE_CODES,
    PROVIDER_AGENT_MAX_TOOL_FAILURE_CODE_LENGTH,
  );
  validateSchemaRef(errors, `${field}.inputSchema`, manifest.inputSchema);
  validateSchemaRef(errors, `${field}.outputSchema`, manifest.outputSchema);
}

function readToolDescriptorManifestName(descriptor: unknown): string | null {
  if (!isRecord(descriptor) || !isRecord(descriptor.manifest)) {
    return null;
  }

  return typeof descriptor.manifest.name === 'string'
    ? descriptor.manifest.name
    : null;
}

function validateObservationSummary(
  errors: string[],
  summary: ProviderAgentObservationSummary,
): void {
  validateBoundedString(
    errors,
    'summary.key',
    summary.key,
    PROVIDER_AGENT_MAX_SUMMARY_KEY_LENGTH,
  );
  validateEnumValue(errors, 'summary.kind', summary.kind, PROVIDER_AGENT_SUMMARY_KIND_VALUES);

  if (/(?:raw|transcript|message|prompt|body|content)/i.test(summary.key)) {
    errors.push(`summary ${summary.key} appears to describe raw conversation content`);
  }
  if (typeof summary.value === 'string') {
    validateBoundedString(
      errors,
      `summary ${summary.key}`,
      summary.value,
      PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
    );
  }
}

function validateToolName(
  errors: string[],
  toolName: string | undefined,
  availableToolNames: Set<string>,
  field: string,
): void {
  validateRequiredString(errors, `${field}.toolName`, toolName ?? '');
  if (toolName && !availableToolNames.has(toolName)) {
    errors.push(`${field}.toolName ${toolName} is outside the bounded tool surface`);
  }
}

function validateRequiredString(errors: string[], field: string, value: unknown): value is string {
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return false;
  }
  if (value.trim().length === 0) {
    errors.push(`${field} is required`);
    return false;
  }
  return true;
}

function validateEnumValue(
  errors: string[],
  field: string,
  value: unknown,
  allowedValues: readonly string[],
): void {
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    errors.push(`${field} is unsupported: ${String(value)}`);
  }
}

function validateOptionalEnumValue(
  errors: string[],
  field: string,
  value: unknown,
  allowedValues: readonly string[],
): void {
  if (value === undefined || value === null) {
    return;
  }
  validateEnumValue(errors, field, value, allowedValues);
}

function validateBoundedString(
  errors: string[],
  field: string,
  value: unknown,
  maxLength: number,
): void {
  if (!validateRequiredString(errors, field, value)) {
    return;
  }
  if (value.length > maxLength) {
    errors.push(`${field} must be ${maxLength} characters or less`);
  }
}

function validateOptionalBoundedString(
  errors: string[],
  field: string,
  value: unknown,
  maxLength: number,
): void {
  if (value === undefined || value === null) {
    return;
  }
  validateBoundedString(errors, field, value, maxLength);
}

function validateBoundedStringArray(
  errors: string[],
  field: string,
  values: unknown,
  maxEntries: number,
  maxLength: number,
): void {
  if (!Array.isArray(values)) {
    errors.push(`${field} must be an array`);
    return;
  }
  if (values.length > maxEntries) {
    errors.push(`${field} must contain ${maxEntries} entries or fewer`);
  }

  values.forEach((value, index) => {
    validateBoundedString(errors, `${field}[${index}]`, value, maxLength);
  });
}

function validateBoundedJsonValue(
  errors: string[],
  field: string,
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (value === null || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'string') {
    if (value.length > PROVIDER_AGENT_MAX_TOOL_INPUT_STRING_LENGTH) {
      errors.push(
        `${field} must be ${PROVIDER_AGENT_MAX_TOOL_INPUT_STRING_LENGTH} characters or less`,
      );
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(`${field} must be a finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    validateBoundedJsonArray(errors, field, value, depth, seen);
    return;
  }
  if (isRecord(value)) {
    validateBoundedJsonObject(errors, field, value, depth, seen);
    return;
  }

  errors.push(`${field} must be JSON-compatible`);
}

function validateBoundedToolInputObject(
  errors: string[],
  field: string,
  value: unknown,
  required: boolean,
): void {
  if (value === undefined) {
    if (required) {
      errors.push(`${field} must be an object`);
    }
    return;
  }
  if (value === null) {
    errors.push(`${field} must be an object`);
    return;
  }
  if (!isRecord(value) || !isPlainJsonObject(value)) {
    errors.push(`${field} must be an object`);
    return;
  }

  validateBoundedJsonValue(errors, field, value);
}

function validateBoundedJsonArray(
  errors: string[],
  field: string,
  value: unknown[],
  depth: number,
  seen: WeakSet<object>,
): void {
  if (depth >= PROVIDER_AGENT_MAX_TOOL_INPUT_DEPTH) {
    errors.push(`${field} must not exceed depth ${PROVIDER_AGENT_MAX_TOOL_INPUT_DEPTH}`);
    return;
  }
  if (seen.has(value)) {
    errors.push(`${field} must not contain circular references`);
    return;
  }

  seen.add(value);
  if (value.length > PROVIDER_AGENT_MAX_TOOL_INPUT_ARRAY_ITEMS) {
    errors.push(
      `${field} must contain ${PROVIDER_AGENT_MAX_TOOL_INPUT_ARRAY_ITEMS} entries or fewer`,
    );
  }
  value
    .slice(0, PROVIDER_AGENT_MAX_TOOL_INPUT_ARRAY_ITEMS)
    .forEach((entry, index) =>
      validateBoundedJsonValue(errors, `${field}[${index}]`, entry, depth + 1, seen));
  seen.delete(value);
}

function validateBoundedJsonObject(
  errors: string[],
  field: string,
  value: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): void {
  if (depth >= PROVIDER_AGENT_MAX_TOOL_INPUT_DEPTH) {
    errors.push(`${field} must not exceed depth ${PROVIDER_AGENT_MAX_TOOL_INPUT_DEPTH}`);
    return;
  }
  if (!isPlainJsonObject(value)) {
    errors.push(`${field} must be a plain JSON object`);
    return;
  }
  if (seen.has(value)) {
    errors.push(`${field} must not contain circular references`);
    return;
  }

  seen.add(value);
  const entries = Object.entries(value);
  if (entries.length > PROVIDER_AGENT_MAX_TOOL_INPUT_OBJECT_KEYS) {
    errors.push(
      `${field} must contain ${PROVIDER_AGENT_MAX_TOOL_INPUT_OBJECT_KEYS} keys or fewer`,
    );
  }

  entries
    .slice(0, PROVIDER_AGENT_MAX_TOOL_INPUT_OBJECT_KEYS)
    .forEach(([key, entry]) => {
      if (key.trim() === '') {
        errors.push(`${field} keys must not be blank`);
        return;
      }
      if (key.length > PROVIDER_AGENT_MAX_TOOL_INPUT_KEY_LENGTH) {
        errors.push(
          `${field} keys must be ${PROVIDER_AGENT_MAX_TOOL_INPUT_KEY_LENGTH} characters or less`,
        );
        return;
      }
      validateBoundedJsonValue(errors, `${field}.${key}`, entry, depth + 1, seen);
    });
  seen.delete(value);
}

function validateOptionalPositiveNumber(
  errors: string[],
  field: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`${field} must be greater than 0`);
  }
}

function validateOptionalPositiveInteger(
  errors: string[],
  field: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(`${field} must be a positive integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPlainJsonObject(value: Record<string, unknown>): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
