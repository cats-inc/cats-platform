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
  SupervisionPolicy,
  SupervisionPolicySnapshot,
  SupervisionToolScope,
  ToolResult,
} from './contracts.js';

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

  const rejectionReason = validatePolicy(context, policy, reasons);
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
  const isEvaluatedOrBetter = compareCapabilityConfidence(confidence, 'evaluated') >= 0;
  const isWeak = treatment === 'weak_worker';
  const isStrongOrBetter = treatment === 'strong_agent' || isEvaluatedOrBetter;
  const approvalThreshold = decideDefaultApprovalThreshold(context.toolManifest.sideEffect);

  return {
    autonomy: isWeak ? 'single_step' : isStrongOrBetter ? 'milestone_plan' : 'single_step',
    taskGranularity: isWeak ? 'tiny' : isEvaluatedOrBetter ? 'milestone' : 'step',
    toolScope: decideDefaultToolScope({
      bootstrapTreatment: treatment,
      sideEffect: context.toolManifest.sideEffect,
    }),
    scaffolding: isStrongOrBetter ? 'few_shot' : 'sop_template',
    validation: isWeak ? 'schema_required' : 'semantic_check',
    checkpointCadence: isStrongOrBetter ? 'milestone' : 'every_step',
    approvalThreshold,
    fallbackPolicy: isStrongOrBetter ? 'retry' : 'ask_human',
  };
}

function validatePolicy(
  context: SupervisionPolicyContext,
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
  if (isWeak && policy.autonomy !== 'single_step') {
    const message =
      `weak_worker treatment rejected ${policy.autonomy} autonomy with E_TOOL_SCOPE_DENIED.`;
    reasons.push(message);
    return message;
  }
  if (isWeak && policy.toolScope !== 'read_only') {
    const message =
      `weak_worker treatment rejected ${policy.toolScope} toolScope with E_TOOL_SCOPE_DENIED.`;
    reasons.push(message);
    return message;
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
