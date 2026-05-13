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

export const PROVIDER_AGENT_DECISION_CONTRACT_VERSION = 1;
export const PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH = 280;
export const PROVIDER_AGENT_MAX_GOAL_LENGTH = 2000;
export const PROVIDER_AGENT_MAX_TOOL_REASON_LENGTH = 280;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_HINTS = 8;
export const PROVIDER_AGENT_MAX_TOOL_INPUT_HINT_LENGTH = 400;

export type ProviderAgentDecisionConfidence = 'low' | 'medium' | 'high';
export type ProviderAgentTaskRisk = 'low' | 'medium' | 'high';
export type ProviderAgentTaskKind = 'chat_turn' | 'work_run' | 'code_task' | 'code_relay';
export type ProviderAgentSummaryKind = 'count' | 'ratio' | 'enumerated_outcome' | 'opaque_ref';
export type ProviderAgentDecisionKind =
  | 'semantic_plan'
  | 'tool_request'
  | 'delegation_request'
  | 'recovery_decision';

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
  validateRequiredString(errors, 'actor.actorRef', observation.actor.actorRef);
  validateRequiredString(
    errors,
    'actor.capabilityProfileRef',
    observation.actor.capabilityProfileRef,
  );

  if (observation.contractVersion !== PROVIDER_AGENT_DECISION_CONTRACT_VERSION) {
    errors.push(`contractVersion must be ${PROVIDER_AGENT_DECISION_CONTRACT_VERSION}`);
  }
  if (new Set(observation.availableTools.map((tool) => tool.manifest.name)).size
    !== observation.availableTools.length) {
    errors.push('availableTools must not contain duplicate manifest names');
  }
  observation.availableTools.forEach((tool, index) => {
    validateToolDescriptor(errors, tool, index);
  });

  for (const summary of observation.summaries) {
    validateObservationSummary(errors, summary);
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

  validateRequiredString(errors, 'decisionId', input.decision.decisionId);
  if (input.decision.contractVersion !== PROVIDER_AGENT_DECISION_CONTRACT_VERSION) {
    errors.push(`decision contractVersion must be ${PROVIDER_AGENT_DECISION_CONTRACT_VERSION}`);
  }

  switch (input.decision.kind) {
    case 'semantic_plan':
      validateSemanticPlanDecision(errors, input.decision, availableToolNames);
      break;
    case 'tool_request':
      validateToolRequestDecision(errors, input.decision, availableToolNames);
      break;
    case 'delegation_request':
      validateRequiredString(errors, 'goalSummary', input.decision.goalSummary);
      break;
    case 'recovery_decision':
      validateRecoveryDecision(errors, input.observation, input.decision);
      break;
    default: {
      const exhaustive: never = input.decision;
      return exhaustive;
    }
  }

  return errors;
}

function validateSemanticPlanDecision(
  errors: string[],
  decision: ProviderAgentSemanticPlanDecision,
  availableToolNames: Set<string>,
): void {
  validateRequiredString(errors, 'planId', decision.planId);
  validateBoundedString(
    errors,
    'rationaleSummary',
    decision.rationaleSummary,
    PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
  );

  if (decision.steps.length === 0) {
    errors.push('semantic_plan.steps must not be empty');
  }
  if (new Set(decision.steps.map((step) => step.stepId)).size !== decision.steps.length) {
    errors.push('semantic_plan.steps must have unique stepId values');
  }

  for (const step of decision.steps) {
    validateRequiredString(errors, 'step.stepId', step.stepId);
    validateBoundedString(
      errors,
      `step ${step.stepId} summary`,
      step.summary,
      PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
    );

    if (step.action === 'call_tool') {
      validateToolName(errors, step.toolName, availableToolNames, `step ${step.stepId}`);
    }
  }
}

function validateToolRequestDecision(
  errors: string[],
  decision: ProviderAgentToolRequestDecision,
  availableToolNames: Set<string>,
): void {
  validateToolName(errors, decision.toolName, availableToolNames, 'tool_request');
  validateBoundedString(
    errors,
    'rationaleSummary',
    decision.rationaleSummary,
    PROVIDER_AGENT_MAX_SUMMARY_TEXT_LENGTH,
  );
}

function validateRecoveryDecision(
  errors: string[],
  observation: ProviderAgentBoundedObservation,
  decision: ProviderAgentRecoveryDecision,
): void {
  validateRequiredString(errors, 'rejectedActionId', decision.rejectedActionId);

  if (!observation.policy.allowedFallbacks.includes(decision.selectedFallback)) {
    errors.push(
      `recovery selectedFallback ${decision.selectedFallback} is outside allowedFallbacks`,
    );
  }
}

function validateToolDescriptor(
  errors: string[],
  descriptor: ProviderAgentToolDescriptor,
  index: number,
): void {
  validateBoundedString(
    errors,
    `availableTools[${index}].reason`,
    descriptor.reason,
    PROVIDER_AGENT_MAX_TOOL_REASON_LENGTH,
  );

  if (!descriptor.inputHints) {
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

function validateObservationSummary(
  errors: string[],
  summary: ProviderAgentObservationSummary,
): void {
  validateRequiredString(errors, 'summary.key', summary.key);

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

function validateRequiredString(errors: string[], field: string, value: string): void {
  if (value.trim().length === 0) {
    errors.push(`${field} is required`);
  }
}

function validateBoundedString(
  errors: string[],
  field: string,
  value: string,
  maxLength: number,
): void {
  validateRequiredString(errors, field, value);
  if (value.length > maxLength) {
    errors.push(`${field} must be ${maxLength} characters or less`);
  }
}
