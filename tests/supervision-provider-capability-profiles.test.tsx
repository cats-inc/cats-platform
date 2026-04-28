import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  buildBootstrapProviderCapabilityProfiles,
  decideSupervisionPolicy,
  resolveProviderCapabilityProfile,
  type ProviderCapabilityBootstrapConfig,
  type SupervisedToolManifest,
} from '../src/platform/supervision/index.ts';
import {
  parseProviderCapabilityBootstrapConfigYaml,
} from '../src/platform/supervision/providerCapabilityBootstrapYaml.ts';

function fixtureBootstrapConfig(): ProviderCapabilityBootstrapConfig {
  const result = parseProviderCapabilityBootstrapConfigYaml(
    readFileSync(new URL('./fixtures/provider-capability-bootstrap.yaml', import.meta.url), 'utf8'),
    {
      observedAt: '2026-04-28T00:00:00.000Z',
      configPath: 'tests/fixtures/provider-capability-bootstrap.yaml',
    },
  );

  if (!result.config) {
    throw new Error(`Fixture bootstrap config failed: ${
      result.diagnostics.map((diagnostic) => diagnostic.message).join('; ')
    }`);
  }

  return result.config;
}

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

test('bootstrap provider capability profiles are default-neutral without config', () => {
  const profiles = buildBootstrapProviderCapabilityProfiles({
    assessedAt: '2026-04-28T00:00:00.000Z',
  });
  const byProvider = new Map(profiles.map((profile) => [profile.provider, profile]));

  for (const provider of ['claude', 'codex', 'ollama', 'unknown']) {
    assert.equal(byProvider.get(provider)?.kind, 'unknown');
    assert.equal(byProvider.get(provider)?.bootstrapTreatment, 'default');
    assert.equal(byProvider.get(provider)?.assessment.confidenceLevel, 'unknown');
    assert.deepEqual(byProvider.get(provider)?.assessment.confidenceSources, []);
  }
});

test('configured strong provider bootstrap uses bootstrap_config evidence and future fixtures', () => {
  const profile = resolveProviderCapabilityProfile(
    { provider: 'claude', instance: 'native', model: 'sonnet' },
    {
      assessedAt: '2026-04-28T00:00:00.000Z',
      bootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  assert.equal(profile.profileId, 'provider-capability:claude:native:sonnet:default');
  assert.equal(profile.kind, 'strong_agent');
  assert.equal(profile.bootstrapTreatment, 'strong_agent');
  assert.equal(profile.assessment.confidenceSources.length, 1);
  assert.equal(profile.assessment.confidenceSources[0]?.source, 'bootstrap_config');
  assert.equal(
    profile.assessment.confidenceSources[0]?.metadata?.bootstrapConfigRuleId,
    'claude-native-sonnet-strong-candidate',
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

test('configured ollama profile starts as weak worker without autonomous confidence', () => {
  const profile = resolveProviderCapabilityProfile(
    { provider: 'ollama', model: 'qwen2.5-coder:7b' },
    {
      assessedAt: '2026-04-28T00:00:00.000Z',
      bootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  assert.equal(profile.kind, 'weak_worker');
  assert.equal(profile.bootstrapTreatment, 'weak_worker');
  assert.equal(profile.assessment.confidenceLevel, 'unknown');
  assert.equal(profile.assessment.confidenceSources[0]?.source, 'bootstrap_config');
  assert.equal(profile.assessment.confidenceSources[0]?.claims.tool_use_accuracy?.level, 'unknown');
  assert.equal(
    profile.notes.some((note) => note.includes('SOP/worker-capable only')),
    true,
  );
});

test('unknown provider profile has no bootstrap evidence but preserves fixture shape', () => {
  const profile = resolveProviderCapabilityProfile(
    { provider: 'unknown-vendor', model: 'mystery' },
    { assessedAt: '2026-04-28T00:00:00.000Z' },
  );

  assert.equal(profile.kind, 'unknown');
  assert.equal(profile.bootstrapTreatment, 'default');
  assert.equal(profile.assessment.confidenceLevel, 'unknown');
  assert.deepEqual(profile.assessment.confidenceSources, []);
  assert.deepEqual(profile.sourceFixtures.map((fixture) => fixture.requiredMetadata), [
    ['evalSuiteId', 'evalRunId'],
    ['historyWindow'],
  ]);
});

test('policy dials shift from configured strong profile to configured weak profile on same task', () => {
  const manifest = fixtureManifest();
  const bootstrapConfig = fixtureBootstrapConfig();
  const strong = resolveProviderCapabilityProfile(
    { provider: 'codex', instance: 'cloud', model: 'gpt-5.4' },
    {
      assessedAt: '2026-04-28T00:00:00.000Z',
      bootstrapConfig,
    },
  );
  const weak = resolveProviderCapabilityProfile(
    { provider: 'ollama', model: 'qwen2.5-coder:7b' },
    {
      assessedAt: '2026-04-28T00:00:00.000Z',
      bootstrapConfig,
    },
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
  assert.equal(strongDecision.result.policy.validation, 'schema_required');
  assert.equal(weakDecision.result.policy.validation, 'schema_required');
  assert.equal(weakDecision.result.policy.checkpointCadence, 'every_step');
  assert.equal(weakDecision.result.policy.fallbackPolicy, 'ask_human');
  assert.equal(weakDecision.result.snapshot.contextSummary.providerRef, weak.profileId);
});
