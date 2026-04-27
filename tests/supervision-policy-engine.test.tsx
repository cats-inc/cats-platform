import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  SUPERVISION_POLICY_BUNDLE_VERSION,
  buildCapabilityAssessment,
  createProviderCatalogEvidence,
  decideSupervisionPolicy,
  type CapabilityAssessment,
  type CapabilitySourceEvidence,
  type SupervisedToolManifest,
  type SupervisionPolicyDecisionResult,
  type SupervisionPolicyRejectionDetails,
} from '../src/platform/supervision/index.ts';

function fixtureManifest(sideEffect: SupervisedToolManifest['sideEffect']): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: `work.fixture.${sideEffect}`,
    manifestVersion: '1.0',
    description: 'Policy fixture tool',
    sideEffect,
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: 'policy',
    evidence: 'summary',
    failureCodes: ['E_TOOL_SCOPE_DENIED'],
    inputSchema: {
      id: `work.fixture.${sideEffect}.input`,
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: `work.fixture.${sideEffect}.output`,
      version: '1.0',
      format: 'json_schema',
    },
  };
}

function catalogOnlyAssessment(): CapabilityAssessment {
  return buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [
      createProviderCatalogEvidence({
        providerId: 'openai',
        modelId: 'gpt',
        catalogVersion: '2026-04',
        observedAt: '2026-04-25T00:00:00.000Z',
      }),
    ],
  });
}

function evaluatedAssessment(): CapabilityAssessment {
  const evalEvidence: CapabilitySourceEvidence = {
    evidenceId: 'eval_suite:tool-use:run-1',
    source: 'eval_suite',
    observedAt: '2026-04-25T00:00:00.000Z',
    claims: {
      tool_use_accuracy: {
        level: 'evaluated',
        summary: 'Passed tool-use eval.',
      },
    },
    metadata: {
      evalSuiteId: 'tool-use',
      evalRunId: 'run-1',
    },
  };

  return buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [evalEvidence],
  });
}

function unknownAssessment(): CapabilityAssessment {
  return buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [],
  });
}

function baseContext(input: {
  capabilityAssessment: CapabilityAssessment;
  toolManifest: SupervisedToolManifest;
}) {
  return {
    actionId: 'action-1',
    runId: 'run-1',
    actorRef: 'agent:boss',
    targetRef: 'tool:fixture',
    actionType: 'tool_call',
    evaluatedAt: '2026-04-25T02:00:00.000Z',
    capabilityAssessment: input.capabilityAssessment,
    toolManifest: input.toolManifest,
  };
}

function rejectionDetails(
  result: SupervisionPolicyDecisionResult,
): SupervisionPolicyRejectionDetails {
  assert.equal(result.status, 'rejected');
  return result.error.details as SupervisionPolicyRejectionDetails;
}

test('unknown and catalog-only profiles stay conservative by default', () => {
  const result = decideSupervisionPolicy(baseContext({
    capabilityAssessment: catalogOnlyAssessment(),
    toolManifest: fixtureManifest('external_visible'),
  }));

  assert.equal(result.status, 'applied');
  assert.equal(result.result.policy.autonomy, 'single_step');
  assert.equal(result.result.policy.toolScope, 'read_only');
  assert.equal(result.result.policy.approvalThreshold, 'high');
});

test('unknown profiles clamp task granularity and validation more tightly than catalog-only', () => {
  const result = decideSupervisionPolicy(baseContext({
    capabilityAssessment: unknownAssessment(),
    toolManifest: fixtureManifest('external_visible'),
  }));

  assert.equal(result.status, 'applied');
  assert.equal(result.result.policy.autonomy, 'single_step');
  assert.equal(result.result.policy.taskGranularity, 'tiny');
  assert.equal(result.result.policy.validation, 'schema_required');
  assert.equal(result.result.policy.checkpointCadence, 'every_step');
});

test('operator override metadata appears in snapshot reasons', () => {
  const result = decideSupervisionPolicy({
    ...baseContext({
      capabilityAssessment: catalogOnlyAssessment(),
      toolManifest: fixtureManifest('external_visible'),
    }),
    operatorOverride: {
      overrideId: 'allow-narrow',
      operatorRef: 'operator:owner',
      reason: 'Allow one narrow write during rollout.',
      policy: {
        toolScope: 'narrow_write',
      },
    },
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.result.policy.toolScope, 'narrow_write');
  assert.equal(
    result.result.snapshot.reasons.some((reason) =>
      reason.includes('operator override allow-narrow by operator:owner'),
    ),
    true,
  );
});

test('operator override cannot lift the FR-19 broad_write floor', () => {
  const result = decideSupervisionPolicy({
    ...baseContext({
      capabilityAssessment: catalogOnlyAssessment(),
      toolManifest: fixtureManifest('external_visible'),
    }),
    operatorOverride: {
      overrideId: 'force-broad',
      operatorRef: 'operator:owner',
      reason: 'Try broad write before eval.',
      policy: {
        toolScope: 'broad_write',
      },
    },
  });
  const details = rejectionDetails(result);

  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal(details.snapshot.policy.toolScope, 'broad_write');
  assert.equal(
    details.snapshot.reasons.some((reason) =>
      reason.includes('FR-19 rejected broad_write under catalog_only'),
    ),
    true,
  );
  assert.equal(
    details.snapshot.reasons.some((reason) => reason.includes('force-broad')),
    true,
  );
});

test('operator override cannot lift the FR-19 outcome_delegation floor', () => {
  const result = decideSupervisionPolicy({
    ...baseContext({
      capabilityAssessment: catalogOnlyAssessment(),
      toolManifest: fixtureManifest('none'),
    }),
    operatorOverride: {
      overrideId: 'force-outcome',
      operatorRef: 'operator:owner',
      reason: 'Try outcome delegation before eval.',
      policy: {
        autonomy: 'outcome_delegation',
      },
    },
  });
  const details = rejectionDetails(result);

  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal(details.snapshot.policy.autonomy, 'outcome_delegation');
  assert.equal(
    details.snapshot.reasons.some((reason) =>
      reason.includes('FR-19 rejected outcome_delegation under catalog_only'),
    ),
    true,
  );
});

test('evaluated capability can grant broad_write with high approval on side-effect tools', () => {
  const result = decideSupervisionPolicy({
    ...baseContext({
      capabilityAssessment: evaluatedAssessment(),
      toolManifest: fixtureManifest('external_visible'),
    }),
    requestedPolicy: {
      toolScope: 'broad_write',
      approvalThreshold: 'high',
    },
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.result.policy.toolScope, 'broad_write');
  assert.equal(result.result.policy.approvalThreshold, 'high');
});

test('broad_write on side-effect tools is rejected without high approval', () => {
  const result = decideSupervisionPolicy({
    ...baseContext({
      capabilityAssessment: evaluatedAssessment(),
      toolManifest: fixtureManifest('external_visible'),
    }),
    requestedPolicy: {
      toolScope: 'broad_write',
      approvalThreshold: 'medium',
    },
  });
  const details = rejectionDetails(result);

  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal(
    details.snapshot.reasons.some((reason) => reason.includes('without high approval threshold')),
    true,
  );
});

test('policy snapshots include bundle and dial versions for replay', () => {
  const result = decideSupervisionPolicy({
    ...baseContext({
      capabilityAssessment: evaluatedAssessment(),
      toolManifest: fixtureManifest('none'),
    }),
    experimentId: 'supervision-ab-1',
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.result.snapshot.policyBundleVersion, SUPERVISION_POLICY_BUNDLE_VERSION);
  assert.equal(result.result.snapshot.dialVersions?.toolScope, 'tool-scope@1');
  assert.equal(result.result.snapshot.dialVersions?.approvalThreshold, 'approval-threshold@1');
  assert.equal(result.result.snapshot.experimentId, 'supervision-ab-1');
});
