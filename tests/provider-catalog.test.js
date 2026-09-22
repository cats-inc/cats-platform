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
  PRODUCT_PROVIDER_MODELS,
  PRODUCT_PROVIDER_ORDER,
} from '../build/server/shared/providerCatalogData.js';
import { PRODUCT_PROVIDER_INSTANCES } from '../build/server/shared/providerCatalogInstances.js';

test('verified Grok adapter is available in the product execution catalog', () => {
  assert.equal(PRODUCT_PROVIDER_ORDER.length, 18);
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('grok'), true);
  assert.equal(
    PRODUCT_PROVIDER_ORDER.indexOf('grok'),
    PRODUCT_PROVIDER_ORDER.indexOf('antigravity') + 1,
  );
  assert.equal(getDefaultModel('grok'), 'grok-4.6');
  assert.deepEqual(getProviderModels('grok'), [
    { value: 'grok-4.6', label: 'Grok 4.6' },
    { value: 'grok-4.5', label: 'Grok 4.5' },
  ]);
  assert.deepEqual(PRODUCT_PROVIDER_INSTANCES.grok, [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ]);

  // Aider was retired with the provider itself (cats-runtime ADR-037) and must
  // not reappear in any product catalog.
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('aider'), false);
  assert.equal(Object.hasOwn(PRODUCT_PROVIDER_MODELS, 'aider'), false);
  assert.equal(Object.hasOwn(PRODUCT_PROVIDER_INSTANCES, 'aider'), false);
});

test('Meta Muse joins the product execution catalog as a CLI target', () => {
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('muse'), true);
  assert.equal(
    PRODUCT_PROVIDER_ORDER.indexOf('muse'),
    PRODUCT_PROVIDER_ORDER.indexOf('devin') + 1,
  );
  // The account default, not one of the -contributor rows: those let Meta use
  // the session for product improvement, which a default must not opt into.
  assert.equal(getDefaultModel('muse'), 'muse-default');
  assert.deepEqual(getProviderModels('muse'), [
    { value: 'muse-default', label: 'Muse account default', default: true },
    { value: 'muse-spark-1.3', label: 'muse-spark-1.3' },
    { value: 'muse-spark-1.2', label: 'muse-spark-1.2' },
  ]);
  assert.deepEqual(PRODUCT_PROVIDER_INSTANCES.muse, [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ]);
  // `muse-default` is a placeholder for "let the account decide", not a model
  // id, so it must never be sent through `--model`.
  assert.equal(isProductProviderDefaultModelPlaceholder('muse', 'muse-default'), true);
  assert.equal(isProductProviderDefaultModelPlaceholder('muse', 'muse-spark-1.3'), false);
});

test('Devin ACP offers the fixed shortlist without claiming a provider default', () => {
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('devin'), true);
  assert.equal(
    PRODUCT_PROVIDER_ORDER.indexOf('devin'),
    PRODUCT_PROVIDER_ORDER.indexOf('cline') + 1,
  );
  assert.equal(getDefaultModel('devin'), 'adaptive');
  assert.deepEqual(getProviderModels('devin'), [
    { value: 'adaptive', label: 'Adaptive' },
    { value: 'claude-fable-5-1-medium', label: 'Claude Fable 5.1 — Medium' },
    { value: 'gemini-3-8-flash-medium', label: 'Gemini 3.8 Flash — Medium' },
    { value: 'gpt-6-astra-medium', label: 'GPT-6 Astra — Medium' },
    { value: 'grok-4-6-medium', label: 'Grok 4.6 — Medium' },
    { value: 'nemotron-3-ultra-high', label: 'Nemotron 3 Ultra — High' },
  ]);
  assert.equal(isProductProviderDefaultModelPlaceholder('devin', 'adaptive'), false);
  assert.deepEqual(PRODUCT_PROVIDER_INSTANCES.devin, [
    { id: 'acp', label: 'agent/acp', target: 'agent/acp', backend: 'agent', default: true },
  ]);
});

test('ClinePass offers six fixed Medium combinations without a provider default', () => {
  assert.equal(PRODUCT_PROVIDER_ORDER.includes('cline'), true);
  assert.equal(
    PRODUCT_PROVIDER_ORDER.indexOf('cline'),
    PRODUCT_PROVIDER_ORDER.indexOf('grok') + 1,
  );
  assert.equal(getDefaultModel('cline'), 'cline-pass/glm-5.3');
  assert.deepEqual(getProviderModels('cline'), [
    { value: 'cline-pass/glm-5.3', label: 'GLM-5.3 — Medium' },
    { value: 'cline-pass/kimi-k3', label: 'Kimi K3 — Medium' },
    { value: 'cline-pass/qwen3.8-max', label: 'Qwen3.8 Max — Medium' },
    { value: 'cline-pass/deepseek-v4-pro', label: 'DeepSeek V4 Pro — Medium' },
    { value: 'cline-pass/minimax-m3', label: 'MiniMax-M3 — Medium' },
    { value: 'cline-pass/mimo-v2.5-pro', label: 'MiMo-V2.5-Pro — Medium' },
  ]);
  assert.deepEqual(PRODUCT_PROVIDER_INSTANCES.cline, [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ]);
});

test('Junie static fallback preserves five fixed efforts and the explicit model default', () => {
  assert.equal(getDefaultModel('junie'), 'Gemini 3.7 Flash');
  assert.deepEqual(getProviderModels('junie'), [
    { value: 'Gemini 3.7 Flash', label: 'Gemini 3.7 Flash — Medium (default)', default: true },
    { value: 'Claude Fable 5.1', label: 'Claude Fable 5.1 — Low' },
    { value: 'Gemini 3.8 Flash', label: 'Gemini 3.8 Flash — Medium' },
    { value: 'GPT-5.6-SOL', label: 'GPT-5.6-SOL — Low' },
    { value: 'Grok 4.6', label: 'Grok 4.6 — Low' },
  ]);
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
