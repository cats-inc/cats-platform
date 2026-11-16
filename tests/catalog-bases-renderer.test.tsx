import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearProviderCatalogClientCache,
  fetchProviderAdvancedCatalogFromClientCache,
  peekProviderAdvancedCatalogFromClientCache,
  ProviderCatalogBasisUnknownError,
} from '../src/app/renderer/providerCatalogClient.ts';
import { readUnmappableSavedSelection, type SavedSelectionCatalogReader } from '../src/app/renderer/savedSelectionAttention.ts';
import { buildExecutionTargetSummary } from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import { listProductProviders } from '../src/shared/providerCatalog.ts';
import {
  clearLiveProviderModelLabels,
  readObservedProviderModels,
  recordLiveProviderModelLabels,
  replaceInformationalProviderLabels,
  resolveLiveProviderModelLabel,
} from '../src/shared/providerModelLabelRegistry.ts';

// Runtime SPEC-045: catalog bases in the renderer reads, label registry and saved-choice attention.

const REVISION = { catalogRevision: 'R', catalogActivationId: 'A' };
const BASES = [{ label: 'global', region: { id: 'global', label: 'global' }, detected: false },
  { id: 'mainland-cn', label: 'mainland-cn', region: { id: 'mainland-cn', label: 'mainland-cn' }, detected: true }];

function advancedBody(basisId: string | null) {
  const entries = basisId ? [{ id: 'cn-only', label: 'CN only' }] : [{ id: 'k3', label: 'K3' }];
  return { provider: 'kimi', backend: 'cli', instance: 'cli/native', ...REVISION, source: 'config', cache: null,
    defaultModel: null, entries, presets: [], controls: [], support: { tier: 'entry_only', notes: [] },
    defaultSelection: { entryId: entries[0]!.id, entryMode: 'explicit', ...(basisId ? { basisId } : {}) },
    ...(basisId ? { basisId } : {}), bases: BASES, warnings: [] };
}

test('the renderer client asks for a basis, caches each apart and names an unknown one', async (t) => {
  clearProviderCatalogClientCache(); t.after(clearProviderCatalogClientCache);
  clearLiveProviderModelLabels(); t.after(clearLiveProviderModelLabels);
  const paths: string[] = [];
  const fetchImpl = (async (input: string) => {
    paths.push(input);
    const basis = new URL(input, 'http://desktop.test').searchParams.get('basis');
    if (basis === 'retired') {
      return Response.json({ error: { code: 'catalog_basis_unknown', message: "Catalog basis 'retired' does not exist" } }, { status: 400 });
    }
    return Response.json({ catalog: advancedBody(basis) });
  }) as unknown as typeof fetch;
  const first = await fetchProviderAdvancedCatalogFromClientCache({ provider: 'kimi', instance: 'cli/native', fetchImpl });
  const named = await fetchProviderAdvancedCatalogFromClientCache({ provider: 'kimi', instance: 'cli/native', basisId: 'mainland-cn', fetchImpl });
  assert.equal(first.basisId, undefined);
  assert.equal(named.basisId, 'mainland-cn');
  assert.deepEqual(paths, ['/api/providers/kimi/models/advanced?instance=cli%2Fnative',
    '/api/providers/kimi/models/advanced?instance=cli%2Fnative&basis=mainland-cn']);
  assert.equal(peekProviderAdvancedCatalogFromClientCache({ provider: 'kimi', instance: 'cli/native' })?.entries[0]?.id, 'k3');
  assert.equal(peekProviderAdvancedCatalogFromClientCache({ provider: 'kimi', instance: 'cli/native', basisId: 'mainland-cn' })?.entries[0]?.id, 'cn-only');
  // A named basis records its own labels beside the first basis's.
  assert.equal(resolveLiveProviderModelLabel('kimi', 'cn-only', 'cli/native', 'mainland-cn'), 'CN only');
  await assert.rejects(fetchProviderAdvancedCatalogFromClientCache({ provider: 'kimi', instance: 'cli/native', basisId: 'retired', fetchImpl }),
    (error) => error instanceof ProviderCatalogBasisUnknownError && error.basisId === 'retired');
});

test('labels of two bases are kept apart, and drafts initialize from the first basis only', (t) => {
  clearLiveProviderModelLabels(); t.after(clearLiveProviderModelLabels);
  recordLiveProviderModelLabels('kimi', [{ id: 'shared', label: 'Shared (global)' }], { target: 'cli/native' });
  recordLiveProviderModelLabels('kimi', [{ id: 'shared', label: 'Shared (cn)' }, { id: 'cn-only', label: 'CN only' }],
    { target: 'cli/native', basisId: 'mainland-cn' });
  assert.equal(resolveLiveProviderModelLabel('kimi', 'shared', 'cli/native'), 'Shared (global)');
  assert.equal(resolveLiveProviderModelLabel('kimi', 'shared', 'cli/native', 'mainland-cn'), 'Shared (cn)');
  assert.deepEqual(readObservedProviderModels('kimi', 'cli/native').map((row) => row.id), ['shared']);
  assert.equal(buildExecutionTargetSummary({ provider: 'kimi', instance: 'cli/native', model: 'cn-only',
    modelSelection: { basisId: 'mainland-cn', entryId: 'cn-only', entryMode: 'explicit' } }).modelLabel, 'CN only');
  // Informational scopes of two bases no longer overwrite each other; differing labels resolve to none.
  clearLiveProviderModelLabels();
  replaceInformationalProviderLabels([
    { provider: 'kimi', backend: 'cli', models: [{ id: 'k3', label: 'K3' }, { id: 'shared', label: 'Shared (global)' }] },
    { provider: 'kimi', backend: 'cli', basisId: 'mainland-cn', models: [{ id: 'shared', label: 'Shared (cn)' }] },
  ]);
  assert.equal(resolveLiveProviderModelLabel('kimi', 'k3', 'cli/native'), 'K3');
  assert.equal(resolveLiveProviderModelLabel('kimi', 'shared', 'cli/native'), null);
});

test('saved-choice attention judges a selection against its own basis and names a retired one', async () => {
  const reads: Array<string | null> = [];
  const models = { provider: 'kimi', backend: 'cli', instance: 'cli/native', ...REVISION, defaultModel: null,
    source: 'config' as const, cache: null, models: [{ id: 'k3', label: 'K3' }], warnings: [] };
  const { normalizeProviderAdvancedModelCatalog } = await import('../src/shared/providerCatalog.ts');
  const reader: SavedSelectionCatalogReader = {
    readRegistry: async () => ({ state: 'ready', providers: listProductProviders().filter((p) => p.id === 'kimi') }),
    readModels: async () => structuredClone(models),
    readAdvanced: async (_provider, _instance, basisId) => {
      reads.push(basisId ?? null);
      if (basisId === 'retired') throw new ProviderCatalogBasisUnknownError('gone', basisId);
      return normalizeProviderAdvancedModelCatalog(advancedBody(basisId ?? null), 'kimi');
    },
  };
  const target = (modelSelection: Record<string, unknown>) => ({ provider: 'kimi', instance: 'cli/native', modelSelection } as never);
  // cn-only exists only in the mainland list, which `/models` does not show.
  assert.equal(await readUnmappableSavedSelection(target({ basisId: 'mainland-cn', entryId: 'cn-only', entryMode: 'explicit', catalogRevision: 'R' }), reader), null);
  const retired = await readUnmappableSavedSelection(target({ basisId: 'retired', entryId: 'k3', entryMode: 'explicit', catalogRevision: 'R' }), reader);
  assert.deepEqual(retired?.mismatch, { kind: 'basis', basisId: 'retired' });
  assert.deepEqual(reads, ['mainland-cn', 'retired', null]);
});
