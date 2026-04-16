import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultModel,
  getProviderModels,
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
} from '../build/server/shared/providerCatalog.js';

test('Junie static fallback matches the runtime alias catalog', () => {
  assert.equal(getDefaultModel('junie'), 'gemini-flash');
  assert.deepEqual(
    getProviderModels('junie').map((model) => model.value),
    ['gemini-flash', 'opus', 'sonnet', 'gemini-pro', 'gpt', 'gpt-codex', 'grok'],
  );
});

test('provider catalog normalizers accept runtime catalog envelopes', () => {
  const basicCatalog = normalizeProviderModelCatalog({
    catalog: {
      provider: 'junie',
      defaultModel: 'gemini-flash',
      models: [
        { id: 'gemini-flash', label: 'gemini-flash', default: true },
        { id: 'opus', label: 'opus' },
      ],
      warnings: ['honesty warning'],
    },
  }, 'junie');

  assert.equal(basicCatalog.provider, 'junie');
  assert.equal(basicCatalog.defaultModel, 'gemini-flash');
  assert.deepEqual(
    basicCatalog.models.map((model) => model.id),
    ['gemini-flash', 'opus'],
  );
  assert.deepEqual(basicCatalog.warnings, ['honesty warning']);

  const advancedCatalog = normalizeProviderAdvancedModelCatalog({
    catalog: {
      provider: 'junie',
      defaultModel: 'gemini-flash',
      entries: [
        { id: 'gemini-flash', label: 'gemini-flash', default: true },
        { id: 'opus', label: 'opus', capabilityTags: ['reasoning'] },
      ],
      support: { tier: 'entry_only', notes: [] },
      warnings: ['honesty warning'],
    },
  }, 'junie');

  assert.equal(advancedCatalog.provider, 'junie');
  assert.equal(advancedCatalog.defaultModel, 'gemini-flash');
  assert.deepEqual(
    advancedCatalog.entries.map((entry) => entry.id),
    ['gemini-flash', 'opus'],
  );
  assert.deepEqual(advancedCatalog.entries[1]?.capabilityTags, ['reasoning']);
  assert.equal(advancedCatalog.support.tier, 'entry_only');
  assert.deepEqual(advancedCatalog.warnings, ['honesty warning']);
});
