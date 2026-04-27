import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  PROVIDER_CAPABILITY_CATALOG_VERSION,
  buildBootstrapProviderCapabilityProfiles,
  decideSupervisionPolicy,
  resolveProviderCapabilityProfile,
  type SupervisedToolManifest,
} from '../src/platform/supervision/index.ts';

function fixtureManifest(): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: 'work.fixture.external',
    manifestVersion: '1.0',
    description: 'External fixture tool',
    sideEffect: 'external_visible',
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: 'policy',
    evidence: 'summary',
    failureCodes: ['E_TOOL_SCOPE_DENIED'],
    inputSchema: {
      id: 'work.fixture.external.input',
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: 'work.fixture.external.output',
      version: '1.0',
      format: 'json_schema',
    },
  };
}

test('bootstrap provider capability profiles cover strong, weak, and unknown targets', () => {
  const profiles = buildBootstrapProviderCapabilityProfiles({
    assessedAt: '2026-04-28T00:00:00.000Z',
  });
  const byProvider = new Map(profiles.map((profile) => [profile.provider, profile]));

  assert.equal(byProvider.get('claude')?.kind, 'strong_agent');
  assert.equal(byProvider.get('codex')?.kind, 'strong_agent');
  assert.equal(byProvider.get('ollama')?.kind, 'weak_worker');
  assert.equal(byProvider.get('unknown')?.kind, 'unknown');
  assert.equal(byProvider.get('claude')?.assessment.confidenceLevel, 'catalog_only');
  assert.equal(byProvider.get('codex')?.assessment.confidenceLevel, 'catalog_only');
  assert.equal(byProvider.get('ollama')?.assessment.confidenceLevel, 'unknown');
  assert.equal(byProvider.get('unknown')?.assessment.confidenceLevel, 'unknown');
});

test('strong provider bootstrap uses catalog evidence and schema-only future fixtures', () => {
  const profile = resolveProviderCapabilityProfile(
    { provider: 'claude', instance: 'native', model: 'opus' },
    { assessedAt: '2026-04-28T00:00:00.000Z' },
  );

  assert.equal(profile.profileId, 'provider-capability:claude:native:opus:default');
  assert.equal(profile.assessment.confidenceSources.length, 1);
  assert.equal(
    profile.assessment.confidenceSources[0]?.metadata?.catalogVersion,
    PROVIDER_CAPABILITY_CATALOG_VERSION,
  );
  assert.equal(
    profile.assessment.confidenceSources[0]?.claims.reasoning_depth?.level,
    'catalog_only',
  );
  assert.deepEqual(profile.sourceFixtures.map((fixture) => fixture.source), [
    'eval_suite',
    'session_history',
  ]);
  assert.equal(
    profile.sourceFixtures.every((fixture) => fixture.evidenceId.includes('pending')),
    true,
  );
});

test('ollama bootstrap profile starts as weak worker input without autonomous confidence', () => {
  const profile = resolveProviderCapabilityProfile(
    { provider: 'ollama', model: 'qwen2.5-coder:7b' },
    { assessedAt: '2026-04-28T00:00:00.000Z' },
  );

  assert.equal(profile.kind, 'weak_worker');
  assert.equal(profile.assessment.confidenceLevel, 'unknown');
  assert.equal(profile.assessment.confidenceSources[0]?.claims.tool_use_accuracy?.level, 'unknown');
  assert.equal(
    profile.notes.some((note) => note.includes('SOP/worker-capable only')),
    true,
  );
});

test('unknown provider profile has no catalog evidence but preserves fixture shape', () => {
  const profile = resolveProviderCapabilityProfile(
    { provider: 'unknown-vendor', model: 'mystery' },
    { assessedAt: '2026-04-28T00:00:00.000Z' },
  );

  assert.equal(profile.kind, 'unknown');
  assert.equal(profile.assessment.confidenceLevel, 'unknown');
  assert.deepEqual(profile.assessment.confidenceSources, []);
  assert.deepEqual(profile.sourceFixtures.map((fixture) => fixture.requiredMetadata), [
    ['evalSuiteId', 'evalRunId'],
    ['historyWindow'],
  ]);
});

test('policy dials shift from strong catalog profile to weak local profile on same task', () => {
  const manifest = fixtureManifest();
  const strong = resolveProviderCapabilityProfile(
    { provider: 'codex', model: 'gpt-5.4' },
    { assessedAt: '2026-04-28T00:00:00.000Z' },
  );
  const weak = resolveProviderCapabilityProfile(
    { provider: 'ollama', model: 'qwen2.5-coder:7b' },
    { assessedAt: '2026-04-28T00:00:00.000Z' },
  );

  const strongDecision = decideSupervisionPolicy({
    actionId: 'action-strong',
    runId: 'run-1',
    actorRef: 'agent:driver',
    targetRef: 'tool:fixture',
    providerRef: strong.profileId,
    actionType: 'tool_call',
    evaluatedAt: '2026-04-28T00:01:00.000Z',
    capabilityAssessment: strong.assessment,
    toolManifest: manifest,
  });
  const weakDecision = decideSupervisionPolicy({
    actionId: 'action-weak',
    runId: 'run-1',
    actorRef: 'agent:driver',
    targetRef: 'tool:fixture',
    providerRef: weak.profileId,
    actionType: 'tool_call',
    evaluatedAt: '2026-04-28T00:01:00.000Z',
    capabilityAssessment: weak.assessment,
    toolManifest: manifest,
  });

  assert.equal(strongDecision.status, 'applied');
  assert.equal(weakDecision.status, 'applied');
  assert.equal(strongDecision.result.policy.taskGranularity, 'step');
  assert.equal(weakDecision.result.policy.autonomy, 'single_step');
  assert.equal(weakDecision.result.policy.taskGranularity, 'tiny');
  assert.equal(weakDecision.result.policy.toolScope, 'read_only');
  assert.equal(weakDecision.result.policy.scaffolding, 'sop_template');
  assert.equal(strongDecision.result.policy.validation, 'semantic_check');
  assert.equal(weakDecision.result.policy.validation, 'schema_required');
  assert.equal(weakDecision.result.policy.checkpointCadence, 'every_step');
  assert.equal(weakDecision.result.policy.fallbackPolicy, 'ask_human');
  assert.equal(weakDecision.result.snapshot.contextSummary.providerRef, weak.profileId);
});
