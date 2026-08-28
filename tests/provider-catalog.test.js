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
  assert.equal(PRODUCT_PROVIDER_ORDER.length, 17);
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

  // Aider remains install-only and still does not expose a selectable runtime
  // target.
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('aider'), false);
  assert.equal(Object.hasOwn(PRODUCT_PROVIDER_MODELS, 'aider'), false);
  assert.equal(Object.hasOwn(PRODUCT_PROVIDER_INSTANCES, 'aider'), false);
});

test('Devin ACP joins the product execution catalog with provider-default model semantics', () => {
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('devin'), true);
  assert.equal(
    PRODUCT_PROVIDER_ORDER.indexOf('devin'),
    PRODUCT_PROVIDER_ORDER.indexOf('cline') + 1,
  );
  assert.equal(getDefaultModel('devin'), 'devin-default');
  assert.deepEqual(getProviderModels('devin'), [
    { value: 'devin-default', label: 'Devin default', default: true },
  ]);
  assert.deepEqual(PRODUCT_PROVIDER_INSTANCES.devin, [
    { id: 'acp', label: 'agent/acp', target: 'agent/acp', backend: 'agent', default: true },
  ]);
});

test('verified Cline adapter joins the product execution catalog', () => {
  // cats-runtime db63f74 enabled Cline execution behind the exact-version
  // cline-cli-json-3.0.51 compatibility profile.
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('cline'), true);
  assert.equal(
    PRODUCT_PROVIDER_ORDER.indexOf('cline'),
    PRODUCT_PROVIDER_ORDER.indexOf('grok') + 1,
  );
  // Cline exposes no model-enumeration command, so only the default sentinel
  // is offered rather than a fabricated list.
  assert.equal(getDefaultModel('cline'), 'cline-default');
  assert.deepEqual(getProviderModels('cline'), [
    { value: 'cline-default', label: 'Cline default', default: true },
  ]);
  assert.deepEqual(PRODUCT_PROVIDER_INSTANCES.cline, [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ]);
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
