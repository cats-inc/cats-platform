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
  confidenceLevel: CapabilityAssessment['confidenceLevel'];
  sideEffect: SupervisedToolSideEffect;
}): SupervisionToolScope {
  if (input.sideEffect === 'none') {
    return 'read_only';
  }
  if (compareCapabilityConfidence(input.confidenceLevel, 'evaluated') < 0) {
    return 'read_only';
  }
  if (input.sideEffect === 'local_state') {
    return 'narrow_write';
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
  const capabilityConfidence = context.capabilityAssessment.confidenceLevel;
  const isUnknown = capabilityConfidence === 'unknown';
  const isEvaluatedOrBetter = compareCapabilityConfidence(capabilityConfidence, 'evaluated') >= 0;
  const approvalThreshold = decideDefaultApprovalThreshold(context.toolManifest.sideEffect);

  return {
    autonomy: isEvaluatedOrBetter ? 'milestone_plan' : 'single_step',
    taskGranularity: isEvaluatedOrBetter ? 'milestone' : isUnknown ? 'tiny' : 'step',
    toolScope: decideDefaultToolScope({
      confidenceLevel: capabilityConfidence,
      sideEffect: context.toolManifest.sideEffect,
    }),
    scaffolding: isEvaluatedOrBetter ? 'few_shot' : 'sop_template',
    validation: isUnknown || approvalThreshold === 'low' ? 'schema_required' : 'semantic_check',
    checkpointCadence: isUnknown || approvalThreshold !== 'low' ? 'every_step' : 'milestone',
    approvalThreshold,
    fallbackPolicy: isEvaluatedOrBetter ? 'retry' : 'ask_human',
  };
}

function validatePolicy(
  context: SupervisionPolicyContext,
  policy: SupervisionPolicy,
  reasons: string[],
): string | undefined {
  const confidence = context.capabilityAssessment.confidenceLevel;
  const constrainedByFloor = confidence === 'unknown' || confidence === 'catalog_only';

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
