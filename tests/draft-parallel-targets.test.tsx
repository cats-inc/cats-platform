import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultParallelTargetForProvider,
  createInitialParallelTargets,
  createNextParallelTarget,
  syncLeadParallelTarget,
  type DraftParallelTarget,
} from '../src/products/shared/renderer/draftChatUtils.tsx';
import {
  PRODUCT_PROVIDER_ORDER,
  getDefaultModel,
  getDefaultProviderInstance,
} from '../src/shared/providerCatalog.ts';

function createTarget(
  provider: string,
  overrides: Partial<DraftParallelTarget> = {},
): DraftParallelTarget {
  return {
    provider,
    model: getDefaultModel(provider) || null,
    instance: getDefaultProviderInstance(provider),
    modelSelection: null,
    ...overrides,
  };
}

test('createDefaultParallelTargetForProvider uses the provider defaults', () => {
  const provider = PRODUCT_PROVIDER_ORDER[0] ?? 'claude';

  assert.deepEqual(createDefaultParallelTargetForProvider(provider), {
    provider,
    model: getDefaultModel(provider) || null,
    instance: getDefaultProviderInstance(provider),
    modelSelection: null,
  });
});

test('createInitialParallelTargets keeps the lead target first and seeds a compare target from the next provider', () => {
  const baseProvider = PRODUCT_PROVIDER_ORDER[0] ?? 'claude';
  const compareProvider = PRODUCT_PROVIDER_ORDER.find((provider) => provider !== baseProvider) ?? 'codex';
  const baseTarget = createTarget(baseProvider, {
    model: 'lead-model',
    instance: 'lead-instance',
    modelSelection: { entryId: 'lead-model', entryMode: 'explicit' },
  });

  assert.deepEqual(createInitialParallelTargets(baseTarget), [
    baseTarget,
    {
      provider: compareProvider,
      model: getDefaultModel(compareProvider) || null,
      instance: getDefaultProviderInstance(compareProvider),
      modelSelection: null,
    },
  ]);
});

test('createInitialParallelTargets can suppress the compare seed when requested', () => {
  const provider = PRODUCT_PROVIDER_ORDER[0] ?? 'claude';
  const baseTarget = createTarget(provider);

  assert.deepEqual(
    createInitialParallelTargets(baseTarget, { includeCompareTarget: false }),
    [baseTarget],
  );
});

test('syncLeadParallelTarget preserves identity when the lead target is unchanged', () => {
  const provider = PRODUCT_PROVIDER_ORDER[0] ?? 'claude';
  const currentTargets = [
    createTarget(provider),
    createTarget(PRODUCT_PROVIDER_ORDER.find((candidate) => candidate !== provider) ?? 'codex'),
  ];

  const nextTargets = syncLeadParallelTarget(currentTargets, currentTargets[0]!);

  assert.strictEqual(nextTargets, currentTargets);
});

test('syncLeadParallelTarget replaces only the lead target when the draft defaults change', () => {
  const leadProvider = PRODUCT_PROVIDER_ORDER[0] ?? 'claude';
  const compareProvider = PRODUCT_PROVIDER_ORDER.find((provider) => provider !== leadProvider) ?? 'codex';
  const currentTargets = [
    createTarget(leadProvider, { model: 'old-model', instance: 'old-instance' }),
    createTarget(compareProvider, { model: 'compare-model' }),
  ];
  const nextLeadTarget = createTarget(compareProvider, {
    model: 'new-model',
    instance: 'new-instance',
    modelSelection: { entryId: 'new-model', entryMode: 'explicit' },
  });

  const nextTargets = syncLeadParallelTarget(currentTargets, nextLeadTarget);

  assert.notStrictEqual(nextTargets, currentTargets);
  assert.deepEqual(nextTargets, [
    nextLeadTarget,
    currentTargets[1],
  ]);
  assert.strictEqual(nextTargets[1], currentTargets[1]);
});

test('createNextParallelTarget picks the first provider not already present in the draft', () => {
  const fallbackProvider = PRODUCT_PROVIDER_ORDER[0] ?? 'claude';
  const fallbackTarget = createTarget(fallbackProvider, { model: 'fallback-model' });
  const occupiedProviders = PRODUCT_PROVIDER_ORDER.slice(0, 2);
  const currentTargets = occupiedProviders.map((provider) => createTarget(provider));
  const expectedProvider = PRODUCT_PROVIDER_ORDER.find((provider) =>
    !occupiedProviders.includes(provider),
  ) ?? fallbackProvider;

  const nextTarget = createNextParallelTarget(currentTargets, fallbackTarget);

  assert.deepEqual(nextTarget, {
    provider: expectedProvider,
    model: getDefaultModel(expectedProvider) || null,
    instance: getDefaultProviderInstance(expectedProvider),
    modelSelection: null,
  });
});

test('createNextParallelTarget falls back to the supplied target shape when the fallback provider is first in line', () => {
  const fallbackProvider = PRODUCT_PROVIDER_ORDER[0] ?? 'claude';
  const fallbackTarget = createTarget(fallbackProvider, {
    model: 'fallback-model',
    instance: 'fallback-instance',
    modelSelection: { entryId: 'fallback-model', entryMode: 'explicit' },
  });

  const nextTarget = createNextParallelTarget([], fallbackTarget);

  assert.deepEqual(nextTarget, fallbackTarget);
  assert.notStrictEqual(nextTarget, fallbackTarget);
});
