import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPABILITY_AGGREGATE_METHOD,
  buildCapabilityAssessment,
  createProviderCatalogEvidence,
  getStrongestNonOverrideConfidence,
  upsertCapabilityEvidence,
  type CapabilitySourceEvidence,
} from '../src/platform/supervision/index.ts';

test('provider catalog evidence bootstraps to catalog_only', () => {
  const assessment = buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [
      createProviderCatalogEvidence({
        providerId: 'anthropic',
        modelId: 'claude-sonnet',
        catalogVersion: '2026-04',
        observedAt: '2026-04-25T00:00:00.000Z',
      }),
    ],
  });

  assert.equal(assessment.confidenceLevel, 'catalog_only');
  assert.equal(assessment.aggregateMethod, CAPABILITY_AGGREGATE_METHOD);
  assert.equal(assessment.confidenceSources[0]?.source, 'provider_catalog');
});

test('provider delivery capabilities do not raise model capability confidence', () => {
  const assessment = buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [],
    deliveryCapabilities: {
      streaming: true,
      tokenUsage: true,
      toolCallDeltas: true,
      toolResultEvents: true,
      stopReason: true,
    },
  });

  assert.equal(assessment.confidenceLevel, 'unknown');
  assert.deepEqual(assessment.confidenceSources, []);
});

test('provider catalog claims cannot upgrade above catalog_only', () => {
  const catalog = createProviderCatalogEvidence({
    providerId: 'openai',
    modelId: 'gpt',
    catalogVersion: '2026-04',
    observedAt: '2026-04-25T00:00:00.000Z',
    claims: {
      tool_use_accuracy: {
        level: 'observed',
        summary: 'Catalog claims strong tool support.',
      },
    },
  });
  const assessment = buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [catalog],
  });

  assert.equal(assessment.confidenceLevel, 'catalog_only');
  assert.equal(assessment.confidenceSources[0]?.claims.tool_use_accuracy?.level, 'catalog_only');
});

test('eval and session history can downgrade catalog claims and record conflicts', () => {
  const catalog = createProviderCatalogEvidence({
    providerId: 'local',
    modelId: 'small',
    catalogVersion: '1',
    observedAt: '2026-04-25T00:00:00.000Z',
    claims: {
      tool_use_accuracy: {
        summary: 'Catalog advertises tool use.',
      },
    },
  });
  const history: CapabilitySourceEvidence = {
    evidenceId: 'session_history:run-window-1',
    source: 'session_history',
    observedAt: '2026-04-25T00:30:00.000Z',
    claims: {
      tool_use_accuracy: {
        level: 'unknown',
        summary: 'Recent runs produced invalid tool calls.',
      },
    },
    metadata: {
      historyWindow: {
        startedAt: '2026-04-25T00:00:00.000Z',
        endedAt: '2026-04-25T00:30:00.000Z',
        runIds: ['run-1', 'run-2'],
      },
    },
  };

  const assessment = buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [history, catalog],
  });

  assert.equal(assessment.confidenceLevel, 'unknown');
  assert.deepEqual(assessment.conflicts, [
    {
      dimension: 'tool_use_accuracy',
      evidenceIds: [
        'provider_catalog:local:small:1',
        'session_history:run-window-1',
      ],
      selectedLevel: 'unknown',
      reason:
        'Conflicting tool_use_accuracy confidence levels preserved; ' +
        'selected unknown by conservative_per_dimension.',
    },
  ]);
});

test('operator override is evidence but cannot raise confidence above non-override evidence', () => {
  const catalog = createProviderCatalogEvidence({
    providerId: 'openai',
    modelId: 'gpt',
    catalogVersion: '2026-04',
    observedAt: '2026-04-25T00:00:00.000Z',
  });
  const override: CapabilitySourceEvidence = {
    evidenceId: 'operator_override:trust-me',
    source: 'operator_override',
    observedAt: '2026-04-25T00:10:00.000Z',
    claims: {
      recovery_reliability: {
        level: 'observed',
        summary: 'Operator wants to trust recovery.',
      },
    },
    metadata: {
      overrideId: 'trust-me',
      overrideReason: 'Temporary rollout.',
    },
  };

  const assessment = buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [override, catalog],
  });

  assert.equal(getStrongestNonOverrideConfidence(assessment.confidenceSources), 'catalog_only');
  assert.equal(assessment.confidenceLevel, 'catalog_only');
  assert.equal(
    assessment.confidenceSources.find((source) => source.source === 'operator_override')
      ?.metadata?.overrideReason,
    'Temporary rollout.',
  );
});

test('operator override can lower effective confidence assessment', () => {
  const evalSuite: CapabilitySourceEvidence = {
    evidenceId: 'eval_suite:baseline:run-1',
    source: 'eval_suite',
    observedAt: '2026-04-25T00:00:00.000Z',
    claims: {
      json_fidelity: {
        level: 'evaluated',
        summary: 'Passed JSON fidelity suite.',
      },
    },
    metadata: {
      evalSuiteId: 'baseline',
      evalRunId: 'run-1',
    },
  };
  const override: CapabilitySourceEvidence = {
    evidenceId: 'operator_override:freeze-json',
    source: 'operator_override',
    observedAt: '2026-04-25T00:10:00.000Z',
    claims: {
      json_fidelity: {
        level: 'unknown',
        summary: 'Operator saw fresh malformed JSON in manual test.',
      },
    },
    metadata: {
      overrideId: 'freeze-json',
      overrideReason: 'Manual smoke test failure.',
    },
  };

  const assessment = buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [evalSuite, override],
  });

  assert.equal(assessment.confidenceLevel, 'unknown');
  assert.equal(assessment.conflicts[0]?.selectedLevel, 'unknown');
});

test('upserting evidence updates assessedAt while preserving old observedAt values', () => {
  const previous = buildCapabilityAssessment({
    assessedAt: '2026-04-25T01:00:00.000Z',
    confidenceSources: [
      createProviderCatalogEvidence({
        providerId: 'openai',
        modelId: 'gpt',
        catalogVersion: '2026-04',
        observedAt: '2026-04-24T00:00:00.000Z',
      }),
    ],
  });
  const next = upsertCapabilityEvidence({
    previous,
    assessedAt: '2026-04-25T02:00:00.000Z',
    evidence: [
      {
        evidenceId: 'eval_suite:json:run-1',
        source: 'eval_suite',
        observedAt: '2026-04-25T01:30:00.000Z',
        claims: {
          json_fidelity: {
            level: 'evaluated',
            summary: 'Passed JSON suite.',
          },
        },
      },
    ],
  });

  assert.equal(next.assessedAt, '2026-04-25T02:00:00.000Z');
  assert.equal(
    next.confidenceSources.find((source) => source.source === 'provider_catalog')?.observedAt,
    '2026-04-24T00:00:00.000Z',
  );
  assert.equal(
    next.confidenceSources.find((source) => source.source === 'eval_suite')?.observedAt,
    '2026-04-25T01:30:00.000Z',
  );
});

test('evidence ids are unique replay keys', () => {
  const source: CapabilitySourceEvidence = {
    evidenceId: 'eval_suite:duplicate',
    source: 'eval_suite',
    observedAt: '2026-04-25T00:00:00.000Z',
    claims: {
      reasoning_depth: {
        level: 'evaluated',
        summary: 'Passed one eval.',
      },
    },
  };

  assert.throws(
    () =>
      buildCapabilityAssessment({
        assessedAt: '2026-04-25T01:00:00.000Z',
        confidenceSources: [source, source],
      }),
    /Duplicate capability evidenceId: eval_suite:duplicate/,
  );
});
