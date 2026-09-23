import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultModel,
  getProviderModels,
  isProductProviderDefaultModelPlaceholder,
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
} from '../build/server/shared/providerCatalog.js';
import {
  PRODUCT_PROVIDER_ORDER,
} from '../build/server/shared/providerCatalogData.js';
import { PRODUCT_PROVIDER_INSTANCES } from '../build/server/shared/providerCatalogInstances.js';

test('model defaults stay empty until an exact Runtime target has been observed', () => {
    assert.equal(PRODUCT_PROVIDER_ORDER.length,18);
    for (const provider of PRODUCT_PROVIDER_ORDER) {
      assert.equal(getDefaultModel(provider),''); assert.deepEqual(getProviderModels(provider),[]);
    }
    assert.equal(isProductProviderDefaultModelPlaceholder('devin','devin-default'),false);
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
