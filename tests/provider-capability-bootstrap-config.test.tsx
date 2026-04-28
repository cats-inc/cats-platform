import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProviderCapabilityControlKey,
  parseProviderCapabilityBootstrapConfigDocument,
  resolveProviderCapabilityBootstrapRule,
} from '../src/platform/supervision/index.ts';
import {
  parseProviderCapabilityBootstrapConfigYaml,
} from '../src/platform/supervision/providerCapabilityBootstrapYaml.ts';

const OBSERVED_AT = '2026-04-28T00:00:00.000Z';

test('provider capability bootstrap YAML parses valid strong and weak grants', () => {
  const result = parseProviderCapabilityBootstrapConfigYaml(
    [
      'version: 1',
      'profiles:',
      '  - id: codex-strong',
      '    selector:',
      '      provider: codex',
      '      instance: cloud',
      '      model: gpt-5.4',
      '      control: default',
      '    initialTreatment: strong_agent',
      '    confidenceLevel: catalog_only',
      '    reason: Operator-approved strong candidate.',
      '  - id: ollama-worker',
      '    selector:',
      '      provider: ollama',
      '    initialTreatment: weak_worker',
      '    confidenceLevel: catalog_only',
      '    reason: Local worker only.',
    ].join('\n'),
    {
      observedAt: OBSERVED_AT,
      configPath: 'config/provider-capability-bootstrap.yaml',
    },
  );

  assert.equal(result.config?.profiles.length, 2);
  assert.equal(result.config?.profiles[0]?.selector.control, 'default');
  assert.deepEqual(result.diagnostics, []);
});

test('provider capability bootstrap rejects default and unknown YAML grants', () => {
  const result = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'default-grant',
          selector: { provider: 'codex' },
          initialTreatment: 'default',
          confidenceLevel: 'unknown',
          reason: 'Should fail.',
        },
      ],
    },
    { observedAt: OBSERVED_AT },
  );

  assert.equal(result.config, null);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    ['invalid_confidence', 'invalid_treatment'],
  );
});

test('provider capability bootstrap duplicate rule ids fail the whole config closed', () => {
  const result = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'same-id',
          selector: { provider: 'codex' },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'First.',
        },
        {
          id: 'same-id',
          selector: { provider: 'ollama' },
          initialTreatment: 'weak_worker',
          confidenceLevel: 'catalog_only',
          reason: 'Second.',
        },
      ],
    },
    { observedAt: OBSERVED_AT },
  );

  assert.equal(result.config, null);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'duplicate_rule_id'), true);
});

test('provider capability bootstrap selector precedence chooses most specific then later tie', () => {
  const parsed = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'codex-broad',
          selector: { provider: 'codex' },
          initialTreatment: 'weak_worker',
          confidenceLevel: 'catalog_only',
          reason: 'Broad fallback.',
        },
        {
          id: 'codex-model',
          selector: { provider: 'codex', model: 'gpt-5.4' },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'Model-specific strong candidate.',
        },
        {
          id: 'codex-control',
          selector: { provider: 'codex', control: 'reasoning_effort=high' },
          initialTreatment: 'weak_worker',
          confidenceLevel: 'catalog_only',
          reason: 'Control-specific tie later in file.',
        },
      ],
    },
    { observedAt: OBSERVED_AT },
  );

  assert.ok(parsed.config);
  const resolution = resolveProviderCapabilityBootstrapRule(
    parsed.config,
    {
      provider: 'codex',
      model: 'gpt-5.4',
      control: 'reasoning_effort=high',
    },
    { observedAt: OBSERVED_AT },
  );

  assert.equal(resolution.rule?.id, 'codex-control');
  assert.equal(resolution.treatment, 'weak_worker');
  assert.equal(
    resolution.diagnostics.some((diagnostic) =>
      diagnostic.code === 'losing_tie_rule' && diagnostic.ruleIds?.includes('codex-model')),
    true,
  );
});

test('provider capability control key canonicalizes persistent controls', () => {
  assert.equal(
    createProviderCapabilityControlKey({
      modelSelection: {
        entryMode: 'explicit',
        controls: {
          tool_mode: 'plan',
          reasoning_effort: 'high',
          enabled: true,
          samples: 2,
        },
      },
    }),
    'enabled=true;reasoning_effort=high;samples=2;tool_mode=plan',
  );
  assert.equal(createProviderCapabilityControlKey({ modelSelection: null }), 'default');
  assert.equal(createProviderCapabilityControlKey({ control: ' default ' }), 'default');
});
