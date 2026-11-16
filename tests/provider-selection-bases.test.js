import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCatalogSelection,
  cloneProviderModelResolution,
  cloneProviderModelSelection,
  createExplicitProviderModelSelection,
  parseProviderModelResolution,
  parseProviderModelSelection,
  providerModelSelectionsEquivalent,
  resolveCatalogTargetSelection,
  sameProviderModelSelection,
} from '../build/server/shared/providerSelection.js';
import {
  canonicalCatalogBasisId,
  catalogForBasis,
  normalizeProviderAdvancedModelCatalog,
  selectionTargetsCatalogBasis,
} from '../build/server/shared/providerCatalog.js';

// Runtime SPEC-045: one target can carry several captured model lists ("bases").
function kimiBases({ firstId } = {}) {
  const revision = { catalogRevision: 'R', catalogActivationId: 'A' };
  const bases = [
    { ...(firstId ? { id: firstId } : {}), label: 'global (kimi.ai)', region: { id: 'global', label: 'global (kimi.ai)' }, detected: false },
    { id: 'mainland-cn', label: 'mainland-cn (kimi.com)', region: { id: 'mainland-cn', label: 'mainland-cn (kimi.com)' },
      cliVersion: '2.5.3', lastUpdated: '2026-11-16', detected: true },
  ];
  const entry = (id) => ({ id, label: id });
  const catalog = { provider: 'kimi', backend: 'cli', instance: 'native', defaultModel: null, source: 'config', cache: null,
    ...revision, models: [entry('k3'), entry('shared')], warnings: [] };
  const first = normalizeProviderAdvancedModelCatalog({ provider: 'kimi', backend: 'cli', instance: 'native', ...revision,
    entries: [entry('k3'), entry('shared')], controls: [], presets: [],
    defaultSelection: { entryId: 'k3', entryMode: 'explicit', ...(firstId ? { basisId: firstId } : {}) },
    support: { tier: 'entry_only', notes: [] }, basis: { ...(firstId ? { id: firstId } : {}), region: bases[0].region },
    ...(firstId ? { basisId: firstId } : {}), bases, capture: { cliVersion: '2.5.3', lastUpdated: '2026-11-16' }, warnings: [] }, 'kimi');
  const mainland = normalizeProviderAdvancedModelCatalog({ provider: 'kimi', backend: 'cli', instance: 'native', ...revision,
    entries: [entry('cn-only'), entry('shared')], controls: [], presets: [],
    defaultSelection: { entryId: 'cn-only', entryMode: 'explicit', basisId: 'mainland-cn' },
    support: { tier: 'entry_only', notes: [] }, basis: { id: 'mainland-cn', region: bases[1].region },
    basisId: 'mainland-cn', bases, capture: { cliVersion: '9.9.9' }, warnings: [] }, 'kimi');
  return { catalog, first, mainland, bases };
}

test('the advanced normalizer keeps a region-only basis, the bases list and the capture', () => {
  const { first, mainland, bases } = kimiBases();
  assert.deepEqual(first.basis, { region: bases[0].region });
  assert.deepEqual(first.bases, bases);
  assert.deepEqual(first.capture, { cliVersion: '2.5.3', lastUpdated: '2026-11-16' });
  assert.equal(first.basisId, undefined);
  assert.equal(mainland.basisId, 'mainland-cn');
  assert.equal(mainland.defaultSelection.basisId, 'mainland-cn');
  // A single basis has no list, and a list whose later bases have no id is not one.
  const single = normalizeProviderAdvancedModelCatalog({ entries: [], bases: [bases[0]], basis: { plan: { label: 'Pro', id: 'pro' } } }, 'copilot');
  assert.equal(single.bases, undefined);
  assert.deepEqual(single.basis, { plan: { label: 'Pro', id: 'pro' } });
  assert.equal(normalizeProviderAdvancedModelCatalog({ entries: [], bases: [bases[0], { label: 'x', detected: false }] }, 'kimi').bases, undefined);
});

test('a selection keeps its basisId through parse, clone and compare', () => {
  const selection = { basisId: 'mainland-cn', entryId: 'shared', entryMode: 'explicit', catalogRevision: 'R' };
  assert.deepEqual(parseProviderModelSelection(selection), selection);
  assert.deepEqual(cloneProviderModelSelection(selection), selection);
  assert.equal(parseProviderModelResolution({ ...selection, model: 'shared', warnings: [] }).basisId, 'mainland-cn');
  assert.equal(cloneProviderModelResolution({ ...selection, model: 'shared', warnings: [] }).basisId, 'mainland-cn');
  const firstBasis = { entryId: 'shared', entryMode: 'explicit', catalogRevision: 'R' };
  assert.equal(providerModelSelectionsEquivalent(selection, firstBasis), false);
  assert.equal(sameProviderModelSelection(selection, firstBasis), false);
  assert.equal(createExplicitProviderModelSelection('shared', { basisId: 'mainland-cn' }).basisId, 'mainland-cn');
});

test('a selection is classified only against its own basis, with that basis entries', () => {
  const { catalog, first, mainland } = kimiBases();
  const onMainland = { basisId: 'mainland-cn', entryId: 'cn-only', entryMode: 'explicit', catalogRevision: 'R' };
  // `/models` lists the first basis only; cn-only comes from the mainland advanced catalog.
  assert.deepEqual(classifyCatalogSelection({ selection: onMainland, catalog, advancedCatalog: mainland }), { status: 'current' });
  assert.deepEqual(classifyCatalogSelection({ selection: { ...onMainland, entryId: 'k3' }, catalog, advancedCatalog: mainland }), {
    status: 'unmappable', mismatch: { kind: 'entry', entryId: 'k3' } });
  // Another basis is never a substitute: a retired basis read back as the first is unmappable.
  assert.deepEqual(classifyCatalogSelection({ selection: { ...onMainland, basisId: 'retired' }, catalog, advancedCatalog: first }), {
    status: 'unmappable', mismatch: { kind: 'basis', basisId: 'retired' } });
  const onFirst = { entryId: 'k3', entryMode: 'explicit', catalogRevision: 'R' };
  assert.deepEqual(classifyCatalogSelection({ selection: onFirst, catalog, advancedCatalog: mainland }), {
    status: 'unmappable', mismatch: { kind: 'basis', basisId: null } });
  assert.deepEqual(classifyCatalogSelection({ selection: onFirst, catalog, advancedCatalog: first }), { status: 'current' });
  assert.deepEqual(catalogForBasis(catalog, mainland).models.map((model) => model.id), ['cn-only', 'shared']);
  assert.equal(catalogForBasis(catalog, mainland).defaultModel, 'cn-only');
  assert.equal(catalogForBasis(catalog, first), catalog);
});

test('the first basis is named by omission, also when it has an id', () => {
  const { first, mainland } = kimiBases({ firstId: 'global' });
  assert.equal(canonicalCatalogBasisId('global', first), undefined);
  assert.equal(canonicalCatalogBasisId('mainland-cn', first), 'mainland-cn');
  assert.equal(selectionTargetsCatalogBasis(undefined, first), true);
  assert.equal(selectionTargetsCatalogBasis('global', first), true);
  assert.equal(selectionTargetsCatalogBasis(undefined, mainland), false);
  assert.equal(selectionTargetsCatalogBasis('mainland-cn', mainland), true);
  // A single-basis catalog matches no basisId other than its own.
  const single = normalizeProviderAdvancedModelCatalog({ entries: [], basis: { id: 'pro', plan: { label: 'Pro' } } }, 'copilot');
  assert.equal(selectionTargetsCatalogBasis(undefined, single), true);
  assert.equal(selectionTargetsCatalogBasis('pro', single), true);
  assert.equal(selectionTargetsCatalogBasis('pro-plus', single), false);
});

test('resolving keeps a saved selection basis and names the first basis by omission', () => {
  for (const firstId of [undefined, 'global']) {
    const { catalog, first, mainland } = kimiBases({ firstId });
    const target = (modelSelection) => ({ provider: 'kimi', instance: 'native', model: modelSelection?.entryId ?? '', modelSelection });
    // A saved first-basis selection is not rewritten, even when that basis has an id.
    const saved = resolveCatalogTargetSelection({ target: target({ entryId: 'k3', entryMode: 'explicit', catalogRevision: 'R' }),
      catalog, advancedCatalog: first, preserveCurrentModel: true });
    assert.equal(saved.modelSelection.basisId, undefined, `first id ${firstId}`);
    assert.equal(saved.modelResolution.basisId, undefined);
    // A new selection on the first basis omits basisId; on another basis it names it.
    const fresh = resolveCatalogTargetSelection({ target: target(null), catalog, advancedCatalog: first, preserveCurrentModel: false });
    assert.deepEqual([fresh.model, fresh.modelSelection.basisId], ['k3', undefined]);
    const freshCn = resolveCatalogTargetSelection({ target: target(null), catalog, advancedCatalog: mainland, preserveCurrentModel: false });
    assert.deepEqual([freshCn.model, freshCn.modelSelection.basisId, freshCn.modelResolution.basisId], ['cn-only', 'mainland-cn', 'mainland-cn']);
    // A saved mainland entry resolves against mainland's own list, never degraded to a plain string.
    const keptCn = resolveCatalogTargetSelection({ target: target({ basisId: 'mainland-cn', entryId: 'cn-only', entryMode: 'explicit', catalogRevision: 'R' }),
      catalog, advancedCatalog: mainland, preserveCurrentModel: true });
    assert.deepEqual([keptCn.model, keptCn.modelSelection.basisId], ['cn-only', 'mainland-cn']);
    // A selection of another basis than the catalog passed in is returned as it was.
    const other = { basisId: 'mainland-cn', entryId: 'cn-only', entryMode: 'explicit', catalogRevision: 'R' };
    const untouched = resolveCatalogTargetSelection({ target: target(other), catalog, advancedCatalog: first, preserveCurrentModel: true });
    assert.deepEqual(untouched.modelSelection, other);
    assert.equal(untouched.model, 'cn-only');
  }
});
