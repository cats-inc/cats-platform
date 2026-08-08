import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultModel,
  getProviderModels,
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
} from '../build/server/shared/providerCatalog.js';
import {
  PRODUCT_PROVIDER_MODELS,
  PRODUCT_PROVIDER_ORDER,
} from '../build/server/shared/providerCatalogData.js';
import { PRODUCT_PROVIDER_INSTANCES } from '../build/server/shared/providerCatalogInstances.js';

test('verified Grok adapter is available in the product execution catalog', () => {
  assert.equal(PRODUCT_PROVIDER_ORDER.length, 15);
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('grok'), true);
  assert.equal(
    PRODUCT_PROVIDER_ORDER.indexOf('grok'),
    PRODUCT_PROVIDER_ORDER.indexOf('antigravity') + 1,
  );
  assert.equal(getDefaultModel('grok'), 'grok-4.5');
  assert.deepEqual(getProviderModels('grok'), [
    { value: 'grok-4.5', label: 'grok-4.5 (default)', default: true },
  ]);
  assert.deepEqual(PRODUCT_PROVIDER_INSTANCES.grok, [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ]);

  for (const refusalOnlyProvider of ['devin', 'cline', 'aider']) {
    assert.equal(PRODUCT_PROVIDER_ORDER.includes(refusalOnlyProvider), false);
    assert.equal(Object.hasOwn(PRODUCT_PROVIDER_MODELS, refusalOnlyProvider), false);
    assert.equal(Object.hasOwn(PRODUCT_PROVIDER_INSTANCES, refusalOnlyProvider), false);
  }
});

test('Junie static fallback matches the curated picker snapshot', () => {
  assert.equal(getDefaultModel('junie'), 'Gemini 3 Flash');
  assert.deepEqual(
    getProviderModels('junie').map((model) => model.value),
    [
      'Gemini 3 Flash',
      'Claude Opus 4.6',
      'Claude Opus 4.7',
      'Claude Sonnet 4.6',
      'Gemini 3.1 Flash Lite',
      'Gemini 3.1 Pro Preview',
      'GPT-5',
      'GPT-5.2',
      'GPT-5.3-codex',
      'GPT-5.4',
      'Grok 4.1 Fast Reasoning',
    ],
  );
});

test('provider catalog normalizers accept runtime catalog envelopes', () => {
  const basicCatalog = normalizeProviderModelCatalog({
    catalog: {
      provider: 'junie',
      defaultModel: 'Gemini 3 Flash',
      models: [
        { id: 'Gemini 3 Flash', label: 'Gemini 3 Flash', default: true },
        { id: 'Claude Opus 4.7', label: 'Claude Opus 4.7' },
      ],
      warnings: ['honesty warning'],
    },
  }, 'junie');

  assert.equal(basicCatalog.provider, 'junie');
  assert.equal(basicCatalog.defaultModel, 'Gemini 3 Flash');
  assert.deepEqual(
    basicCatalog.models.map((model) => model.id),
    ['Gemini 3 Flash', 'Claude Opus 4.7'],
  );
  assert.deepEqual(basicCatalog.warnings, ['honesty warning']);

  const advancedCatalog = normalizeProviderAdvancedModelCatalog({
    catalog: {
      provider: 'junie',
      defaultModel: 'Gemini 3 Flash',
      entries: [
        { id: 'Gemini 3 Flash', label: 'Gemini 3 Flash', default: true },
        { id: 'Claude Opus 4.7', label: 'Claude Opus 4.7', capabilityTags: ['reasoning'] },
      ],
      support: { tier: 'entry_only', notes: [] },
      warnings: ['honesty warning'],
    },
  }, 'junie');

  assert.equal(advancedCatalog.provider, 'junie');
  assert.equal(advancedCatalog.defaultModel, 'Gemini 3 Flash');
  assert.deepEqual(
    advancedCatalog.entries.map((entry) => entry.id),
    ['Gemini 3 Flash', 'Claude Opus 4.7'],
  );
  assert.deepEqual(advancedCatalog.entries[1]?.capabilityTags, ['reasoning']);
  assert.equal(advancedCatalog.support.tier, 'entry_only');
  assert.deepEqual(advancedCatalog.warnings, ['honesty warning']);
});
