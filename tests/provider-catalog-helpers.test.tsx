import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProviderAdvancedCatalogFromModelCatalog,
  createStaticProviderAdvancedModelCatalog,
  listProductProviders,
  normalizeProductProviderModelId,
} from '../src/shared/providerCatalog.ts';

test('normalizeProductProviderModelId canonicalizes Claude legacy aliases but leaves other providers untouched', () => {
  assert.equal(normalizeProductProviderModelId('claude', ' claude-opus-4.6 '), 'opus');
  assert.equal(normalizeProductProviderModelId('claude', 'claude-sonnet-4-6'), 'sonnet');
  assert.equal(normalizeProductProviderModelId('claude', 'haiku'), 'haiku');
  assert.equal(normalizeProductProviderModelId('codex', ' gpt-5.4 '), 'gpt-5.4');
  assert.equal(normalizeProductProviderModelId('claude', '   '), null);
});

test('listProductProviders exposes stable labels, defaults, and per-provider model endpoints', () => {
  const providers = listProductProviders();
  const claude = providers.find((provider) => provider.id === 'claude');
  const openclaw = providers.find((provider) => provider.id === 'openclaw');

  assert.ok(providers.length > 0);
  assert.equal(claude?.modelsPath, '/api/providers/claude/models');
  assert.equal(claude?.defaultInstance, 'native');
  assert.equal(openclaw?.label, 'OpenClaw');
  assert.equal(openclaw?.modelsPath, '/api/providers/openclaw/models');
});

test('static advanced provider catalogs inherit the base catalog defaults and warnings', () => {
  const staticCatalog = createStaticProviderAdvancedModelCatalog('codex', {
    instance: 'main',
    warnings: ['static fallback'],
  });

  assert.equal(staticCatalog.provider, 'codex');
  assert.equal(staticCatalog.instance, 'main');
  assert.equal(staticCatalog.defaultSelection?.entryId, staticCatalog.defaultModel);
  assert.equal(staticCatalog.defaultSelection?.entryMode, 'explicit');
  assert.deepEqual(staticCatalog.warnings, ['static fallback']);
  assert.equal(staticCatalog.support.tier, 'entry_only');

  const fromModelCatalog = createProviderAdvancedCatalogFromModelCatalog({
    provider: 'custom',
    backend: 'cli',
    instance: 'native',
    defaultModel: null,
    source: 'dynamic',
    cache: null,
    models: [
      { id: 'model-b', label: 'Model B' },
      { id: 'model-a', label: 'Model A', default: true },
    ],
    warnings: ['runtime-owned'],
  });

  assert.equal(fromModelCatalog.defaultModel, 'model-a');
  assert.deepEqual(fromModelCatalog.entries.map((entry) => entry.id), ['model-b', 'model-a']);
  assert.deepEqual(fromModelCatalog.warnings, ['runtime-owned']);
});
