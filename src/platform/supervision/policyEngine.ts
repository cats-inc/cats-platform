import {
  compareCapabilityConfidence,
} from './capabilityAssessment.js';
import {
  SUPERVISION_POLICY_BUNDLE_VERSION,
  SUPERVISION_POLICY_DIAL_VERSIONS,
} from './policyVersions.js';
import type {
  CapabilityAssessment,
  SupervisedToolManifest,
  SupervisedToolSideEffect,
  SupervisionApprovalThreshold,
  SupervisionAutonomy,
  SupervisionCheckpointCadence,
  SupervisionFallbackPolicy,
  SupervisionPolicy,
  SupervisionPolicySnapshot,
  SupervisionScaffolding,
  SupervisionTaskGranularity,
  SupervisionToolScope,
  SupervisionValidation,
  ToolResult,
} from './contracts.js';

const AUTONOMY_LOOSENESS: Record<SupervisionAutonomy, number> = {
  none: 0,
  single_step: 1,
  milestone_plan: 2,
  outcome_delegation: 3,
};

const TASK_GRANULARITY_LOOSENESS: Record<SupervisionTaskGranularity, number> = {
  tiny: 0,
  step: 1,
  milestone: 2,
  outcome: 3,
};

const TOOL_SCOPE_LOOSENESS: Record<SupervisionToolScope, number> = {
  none: 0,
  read_only: 1,
  narrow_write: 2,
  broad_write: 3,
};

const SCAFFOLDING_LOOSENESS: Record<SupervisionScaffolding, number> = {
  sop_template: 0,
  grammar_forced: 1,
  few_shot: 2,
  none: 3,
};

// semantic_check keeps the provider-agent schema-ref gate, but does not
// yet run an additional semantic validator. Until that lands, treat it
// as looser than schema_required for weak_worker ceiling purposes.
const VALIDATION_LOOSENESS: Record<SupervisionValidation, number> = {
  schema_required: 0,
  semantic_check: 1,
  best_effort: 2,
};

const CHECKPOINT_CADENCE_LOOSENESS: Record<SupervisionCheckpointCadence, number> = {
  every_step: 0,
  milestone: 1,
  on_risk: 2,
  final: 3,
};

const APPROVAL_THRESHOLD_LOOSENESS: Record<SupervisionApprovalThreshold, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const FALLBACK_POLICY_LOOSENESS: Record<SupervisionFallbackPolicy, number> = {
  ask_human: 0,
  retry: 1,
  escalate_model: 2,
  delegate_other: 3,
};

interface WeakCeilingViolation {
  dial: keyof SupervisionPolicy;
  value: SupervisionPolicy[keyof SupervisionPolicy];
  ceiling: SupervisionPolicy[keyof SupervisionPolicy];
}

function findWeakWorkerCeilingViolations(
  policy: SupervisionPolicy,
  ceiling: SupervisionPolicy,
): WeakCeilingViolation[] {
  const violations: WeakCeilingViolation[] = [];
  if (AUTONOMY_LOOSENESS[policy.autonomy] > AUTONOMY_LOOSENESS[ceiling.autonomy]) {
    violations.push({ dial: 'autonomy', value: policy.autonomy, ceiling: ceiling.autonomy });
  }
  if (
    TASK_GRANULARITY_LOOSENESS[policy.taskGranularity]
    > TASK_GRANULARITY_LOOSENESS[ceiling.taskGranularity]
  ) {
    violations.push({
      dial: 'taskGranularity',
      value: policy.taskGranularity,
      ceiling: ceiling.taskGranularity,
    });
  }
  if (TOOL_SCOPE_LOOSENESS[policy.toolScope] > TOOL_SCOPE_LOOSENESS[ceiling.toolScope]) {
    violations.push({ dial: 'toolScope', value: policy.toolScope, ceiling: ceiling.toolScope });
  }
  if (SCAFFOLDING_LOOSENESS[policy.scaffolding] > SCAFFOLDING_LOOSENESS[ceiling.scaffolding]) {
    violations.push({
      dial: 'scaffolding',
      value: policy.scaffolding,
      ceiling: ceiling.scaffolding,
    });
  }
  if (VALIDATION_LOOSENESS[policy.validation] > VALIDATION_LOOSENESS[ceiling.validation]) {
    violations.push({ dial: 'validation', value: policy.validation, ceiling: ceiling.validation });
  }
  if (
    CHECKPOINT_CADENCE_LOOSENESS[policy.checkpointCadence]
    > CHECKPOINT_CADENCE_LOOSENESS[ceiling.checkpointCadence]
  ) {
    violations.push({
      dial: 'checkpointCadence',
      value: policy.checkpointCadence,
      ceiling: ceiling.checkpointCadence,
    });
  }
  if (
    APPROVAL_THRESHOLD_LOOSENESS[policy.approvalThreshold]
    > APPROVAL_THRESHOLD_LOOSENESS[ceiling.approvalThreshold]
  ) {
    violations.push({
      dial: 'approvalThreshold',
      value: policy.approvalThreshold,
      ceiling: ceiling.approvalThreshold,
    });
  }
  if (
    FALLBACK_POLICY_LOOSENESS[policy.fallbackPolicy]
    > FALLBACK_POLICY_LOOSENESS[ceiling.fallbackPolicy]
  ) {
    violations.push({
      dial: 'fallbackPolicy',
      value: policy.fallbackPolicy,
      ceiling: ceiling.fallbackPolicy,
    });
  }
  return violations;
}

export interface SupervisionPolicyOverride {
  overrideId: string;
  operatorRef: string;
  reason: string;
  policy: Partial<SupervisionPolicy>;
}

export interface SupervisionPolicyContext {
  actionId: string;
  runId: string;
  actorRef: string;
  targetRef: string;
  providerRef?: string;
  actionType: string;
  evaluatedAt: string;
  capabilityAssessment: CapabilityAssessment;
  toolManifest: SupervisedToolManifest;
  deliveryObservability?: string;
  budgetState?: string;
  approvalState?: string;
  recentReliability?: string;
  requestedPolicy?: Partial<SupervisionPolicy>;
  operatorOverride?: SupervisionPolicyOverride;
  experimentId?: string;
}

export interface SupervisionPolicyDecision {
  policy: SupervisionPolicy;
  snapshot: SupervisionPolicySnapshot;
}

export interface SupervisionPolicyRejectionDetails {
  snapshot: SupervisionPolicySnapshot;
}

export type SupervisionPolicyDecisionResult = ToolResult<SupervisionPolicyDecision>;

export function decideSupervisionPolicy(
  context: SupervisionPolicyContext,
): SupervisionPolicyDecisionResult {
  const reasons: string[] = [
    `policy bundle ${SUPERVISION_POLICY_BUNDLE_VERSION} evaluated ${context.actionType}`,
    `bootstrap treatment ${context.capabilityAssessment.bootstrapTreatment}`,
    `capability confidence ${context.capabilityAssessment.confidenceLevel}`,
    `tool ${context.toolManifest.name} sideEffect ${context.toolManifest.sideEffect}`,
  ];
  const basePolicy = buildBasePolicy(context);
  const requestedPolicy = context.requestedPolicy ?? {};
  const operatorPolicy = context.operatorOverride?.policy ?? {};
  const policy: SupervisionPolicy = {
    ...basePolicy,
    ...requestedPolicy,
    ...operatorPolicy,
  };

  if (Object.keys(requestedPolicy).length > 0) {
    reasons.push(`requested policy dials: ${Object.keys(requestedPolicy).sort().join(', ')}`);
  }
  if (context.operatorOverride) {
    reasons.push(
      `operator override ${context.operatorOverride.overrideId} by ` +
        `${context.operatorOverride.operatorRef}: ${context.operatorOverride.reason}`,
    );
  }

  const rejectionReason = validatePolicy(context, basePolicy, policy, reasons);
  const snapshot = buildPolicySnapshot(context, policy, reasons);

  if (rejectionReason !== undefined) {
    return {
      status: 'rejected',
      error: {
        code: 'E_TOOL_SCOPE_DENIED',
        message: rejectionReason,
        details: { snapshot } satisfies SupervisionPolicyRejectionDetails,
      },
    };
  }

  return {
    status: 'applied',
    result: {
      policy,
      snapshot,
    },
  };
}

export function decideDefaultToolScope(input: {
  bootstrapTreatment: CapabilityAssessment['bootstrapTreatment'];
  sideEffect: SupervisedToolSideEffect;
}): SupervisionToolScope {
  if (input.sideEffect === 'none') {
    return 'read_only';
  }
  if (input.bootstrapTreatment === 'weak_worker') {
    return 'read_only';
  }
  return 'narrow_write';
}

export function decideDefaultApprovalThreshold(
  sideEffect: SupervisedToolSideEffect,
): SupervisionApprovalThreshold {
  switch (sideEffect) {
    case 'none':
      return 'low';
    case 'local_state':
      return 'medium';
    case 'external_visible':
    case 'destructive':
    case 'expensive':
      return 'high';
    default: {
      const exhaustive: never = sideEffect;
      return exhaustive;
    }
  }
}

function buildBasePolicy(context: SupervisionPolicyContext): SupervisionPolicy {
  const treatment = context.capabilityAssessment.bootstrapTreatment;
  const confidence = context.capabilityAssessment.confidenceLevel;
  const approvalThreshold = decideDefaultApprovalThreshold(context.toolManifest.sideEffect);

  // weak_worker is a blacklist label that stays clamped regardless of
  // evidence — evaluated/observed evidence must NOT loosen any dial.
  if (treatment === 'weak_worker') {
    return {
      autonomy: 'single_step',
      taskGranularity: 'tiny',
      toolScope: 'read_only',
      scaffolding: 'sop_template',
      validation: 'schema_required',
      checkpointCadence: 'every_step',
      approvalThreshold,
      fallbackPolicy: 'ask_human',
    };
  }

  const isEvaluatedOrBetter = compareCapabilityConfidence(confidence, 'evaluated') >= 0;
  const isStrongOrBetter = treatment === 'strong_agent' || isEvaluatedOrBetter;

  return {
    autonomy: isStrongOrBetter ? 'milestone_plan' : 'single_step',
    taskGranularity: isEvaluatedOrBetter ? 'milestone' : 'step',
    toolScope: decideDefaultToolScope({
      bootstrapTreatment: treatment,
      sideEffect: context.toolManifest.sideEffect,
    }),
    scaffolding: isStrongOrBetter ? 'few_shot' : 'sop_template',
    // Stay on schema_required until semantic_check ships an additional
    // semantic validator. The gate preserves the schema-ref requirement
    // for semantic_check, but it does not add semantic validation yet.
    validation: 'schema_required',
    checkpointCadence: isStrongOrBetter ? 'milestone' : 'every_step',
    approvalThreshold,
    fallbackPolicy: isStrongOrBetter ? 'retry' : 'ask_human',
  };
}

function validatePolicy(
  context: SupervisionPolicyContext,
  basePolicy: SupervisionPolicy,
  policy: SupervisionPolicy,
  reasons: string[],
): string | undefined {
  const confidence = context.capabilityAssessment.confidenceLevel;
  const treatment = context.capabilityAssessment.bootstrapTreatment;
  const constrainedByFloor = confidence === 'unknown' || confidence === 'catalog_only';
  const isWeak = treatment === 'weak_worker';

  if (constrainedByFloor && policy.toolScope === 'broad_write') {
    const message =
      `FR-19 rejected broad_write under ${confidence} confidence with E_TOOL_SCOPE_DENIED.`;
    reasons.push(message);
    return message;
  }
  if (constrainedByFloor && policy.autonomy === 'outcome_delegation') {
    const message =
      `FR-19 rejected outcome_delegation under ${confidence} confidence with ` +
      'E_TOOL_SCOPE_DENIED.';
    reasons.push(message);
    return message;
  }
  if (isWeak) {
    const violations = findWeakWorkerCeilingViolations(policy, basePolicy);
    if (violations.length > 0) {
      const detail = violations
        .map((violation) =>
          `${violation.dial}=${violation.value} (ceiling ${violation.ceiling})`)
        .join(', ');
      const message =
        `weak_worker treatment cannot loosen ${detail} with E_TOOL_SCOPE_DENIED.`;
      reasons.push(message);
      return message;
    }
  }
  if (constrainedByFloor && policy.fallbackPolicy === 'delegate_other') {
    const message =
      `FR-19 rejected delegate_other recovery under ${confidence} confidence with ` +
      'E_TOOL_SCOPE_DENIED.';
    reasons.push(message);
    return message;
  }
  if (
    policy.toolScope === 'broad_write' &&
    isSideEffectBearing(context.toolManifest.sideEffect) &&
    policy.approvalThreshold !== 'high'
  ) {
    const message =
      `Rejected broad_write for ${context.toolManifest.sideEffect} tool without high approval ` +
      'threshold.';
    reasons.push(message);
    return message;
  }

  return undefined;
}

function buildPolicySnapshot(
  context: SupervisionPolicyContext,
  policy: SupervisionPolicy,
  reasons: string[],
): SupervisionPolicySnapshot {
  return {
    schemaVersion: context.capabilityAssessment.schemaVersion,
    policyBundleVersion: SUPERVISION_POLICY_BUNDLE_VERSION,
    dialVersions: SUPERVISION_POLICY_DIAL_VERSIONS,
    experimentId: context.experimentId,
    evaluatedAt: context.evaluatedAt,
    actionId: context.actionId,
    runId: context.runId,
    actorRef: context.actorRef,
    policy,
    contextSummary: {
      actorRef: context.actorRef,
      targetRef: context.targetRef,
      providerRef: context.providerRef,
      actionType: context.actionType,
      sideEffect: context.toolManifest.sideEffect,
      bootstrapTreatment: context.capabilityAssessment.bootstrapTreatment,
      capabilityConfidence: context.capabilityAssessment.confidenceLevel,
      deliveryObservability: context.deliveryObservability,
      budgetState: context.budgetState,
      approvalState: context.approvalState,
      recentReliability: context.recentReliability,
    },
    reasons: [...reasons],
  };
}

function isSideEffectBearing(sideEffect: SupervisedToolSideEffect): boolean {
  return sideEffect === 'external_visible' || sideEffect === 'destructive' || sideEffect === 'expensive';
}
