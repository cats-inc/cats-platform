import type {
  SupervisedToolManifest,
  SupervisionAutonomy,
  SupervisionPolicy,
  SupervisionToolScope,
  ToolResult,
} from '../supervision/contracts.js';
import { evaluateToolSurface } from '../supervision/toolRegistry.js';
import type {
  ProviderAgentBoundedObservation,
  ProviderAgentDecision,
  ProviderAgentSemanticPlanDecision,
  ProviderAgentSemanticPlanStep,
  ProviderAgentToolRequestDecision,
} from './providerAgentDecision.js';
import { validateProviderAgentDecision } from './providerAgentDecision.js';

const AUTONOMY_ORDER: Record<SupervisionAutonomy, number> = {
  none: 0,
  single_step: 1,
  milestone_plan: 2,
  outcome_delegation: 3,
};

export interface ProviderAgentPolicyGateInput {
  observation: ProviderAgentBoundedObservation;
  decision: ProviderAgentDecision;
}

export function applyProviderAgentPolicyGate(
  input: ProviderAgentPolicyGateInput,
): ToolResult<ProviderAgentDecision> {
  const errors = validateProviderAgentPolicyGate(input);
  if (errors.length > 0) {
    return {
      status: 'rejected',
      error: {
        code: 'E_TOOL_SCOPE_DENIED',
        message: 'Provider-agent decision exceeded deterministic policy gates.',
        details: { errors },
      },
    };
  }

  return {
    status: 'applied',
    result: input.decision,
  };
}

export function validateProviderAgentPolicyGate(input: ProviderAgentPolicyGateInput): string[] {
  const errors = validateProviderAgentDecision(input);
  if (errors.length > 0) {
    return errors;
  }

  switch (input.decision.kind) {
    case 'semantic_plan':
      validateSemanticPlanPolicy(errors, input.observation, input.decision);
      break;
    case 'tool_request':
      validateToolRequestPolicy(errors, input.observation, input.decision);
      break;
    case 'delegation_request':
      validateAutonomy(
        errors,
        input.observation.policy.dials,
        'outcome_delegation',
        'delegation_request',
      );
      break;
    case 'recovery_decision':
      break;
    default: {
      const exhaustive: never = input.decision;
      return exhaustive;
    }
  }

  return errors;
}

function validateSemanticPlanPolicy(
  errors: string[],
  observation: ProviderAgentBoundedObservation,
  decision: ProviderAgentSemanticPlanDecision,
): void {
  const policy = observation.policy.dials;
  if (policy.autonomy === 'none') {
    errors.push('semantic_plan is disallowed when policy autonomy is none');
  }
  if (policy.autonomy === 'single_step' && countExecutableSteps(decision.steps) > 1) {
    errors.push('single_step autonomy allows at most one executable semantic-plan step');
  }
  if (policy.taskGranularity === 'tiny' && decision.steps.length > 1) {
    errors.push('tiny task granularity allows at most one semantic-plan step');
  }

  for (const step of decision.steps) {
    if (step.action === 'call_tool') {
      validateToolPolicy(errors, observation, step.toolName, `step ${step.stepId}`);
      validateSchemaRequired(errors, policy, step, `step ${step.stepId}`);
    }
  }
}

function validateToolRequestPolicy(
  errors: string[],
  observation: ProviderAgentBoundedObservation,
  decision: ProviderAgentToolRequestDecision,
): void {
  const policy = observation.policy.dials;
  if (policy.autonomy === 'none') {
    errors.push('tool_request is disallowed when policy autonomy is none');
  }
  validateToolPolicy(errors, observation, decision.toolName, 'tool_request');
  validateSchemaRequired(errors, policy, decision, 'tool_request');
}

function validateToolPolicy(
  errors: string[],
  observation: ProviderAgentBoundedObservation,
  toolName: string | undefined,
  field: string,
): void {
  const manifest = findManifest(observation, toolName);
  if (!manifest) {
    return;
  }

  const decision = evaluateToolSurface(manifest, {
    parentToolScope: observation.policy.parentToolScope ?? observation.policy.dials.toolScope,
    policyToolScope: observation.policy.dials.toolScope,
  });
  if (!decision.allowed) {
    errors.push(`${field}.toolName ${toolName} is denied by policy toolScope: ${decision.reason}`);
  }
}

function validateSchemaRequired(
  errors: string[],
  policy: SupervisionPolicy,
  request: Pick<ProviderAgentSemanticPlanStep, 'expectedOutputSchemaRef'>,
  field: string,
): void {
  if (policy.validation === 'schema_required' && !request.expectedOutputSchemaRef) {
    errors.push(`${field}.expectedOutputSchemaRef is required by schema_required validation`);
  }
}

function validateAutonomy(
  errors: string[],
  policy: SupervisionPolicy,
  required: SupervisionAutonomy,
  field: string,
): void {
  if (AUTONOMY_ORDER[policy.autonomy] < AUTONOMY_ORDER[required]) {
    errors.push(`${field} requires ${required} autonomy, but policy autonomy is ${policy.autonomy}`);
  }
}

function countExecutableSteps(steps: ProviderAgentSemanticPlanStep[]): number {
  return steps.filter((step) => step.action === 'call_tool' || step.action === 'delegate_run').length;
}

function findManifest(
  observation: ProviderAgentBoundedObservation,
  toolName: string | undefined,
): SupervisedToolManifest | undefined {
  return observation.availableTools.find((tool) => tool.manifest.name === toolName)?.manifest;
}

export type ProviderAgentPolicyGateResult = ReturnType<typeof applyProviderAgentPolicyGate>;
export type ProviderAgentPolicyToolScope = SupervisionToolScope;
