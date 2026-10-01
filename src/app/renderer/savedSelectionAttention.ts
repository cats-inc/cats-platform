import { useEffect, useState, useSyncExternalStore } from 'react';

import { messageKeys, type MessageInterpolationValues, type MessageKey } from '../../shared/i18n/index.js';
import type {
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  canClassifyCatalogSelection,
  classifyCatalogSelection,
  resolveSelectedProviderInstance,
  type CatalogSelectionMismatch,
  type ProviderModelSelection,
} from '../../shared/providerSelection.js';
import { useI18n } from './i18n/useI18n.js';
import {
  fetchProviderAdvancedCatalogFromClientCache,
  fetchProviderModelCatalogFromClientCache,
  getProviderCatalogRefreshVersion,
  subscribeProviderCatalogRefreshes,
} from './providerCatalogClient.js';
import { getProviderClientGeneration, onProviderClientInvalidation } from './providerClientInvalidation.js';
import {
  fetchProviderRegistryFromClientCache,
  peekProviderRegistryClientCache,
} from './providerRegistryClient.js';

export interface SavedSelectionTarget {
  provider: string;
  instance?: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export interface UnmappableSavedSelection {
  mismatch: CatalogSelectionMismatch;
  catalog: ProviderModelCatalog;
  advancedCatalog: ProviderAdvancedModelCatalog;
}

export interface SavedSelectionCatalogReader {
  readRegistry: () => Promise<ProductProviderRegistryReadModel>;
  readModels: (provider: string, instance: string | null) => Promise<ProviderModelCatalog>;
  readAdvanced: (provider: string, instance: string | null) => Promise<ProviderAdvancedModelCatalog>;
}

const clientCacheReader: SavedSelectionCatalogReader = {
  // Every opened picker re-reads the registry; badges reuse its last result.
  readRegistry: async () => peekProviderRegistryClientCache() ?? fetchProviderRegistryFromClientCache(),
  readModels: (provider, instance) => fetchProviderModelCatalogFromClientCache({ provider, instance }),
  readAdvanced: (provider, instance) => fetchProviderAdvancedCatalogFromClientCache({ provider, instance }),
};

/**
 * Judge a saved selection against the target's current catalog. Returns null
 * while the selection still maps, has no catalog choice, or cannot be judged.
 */
export async function readUnmappableSavedSelection(
  target: SavedSelectionTarget,
  reader: SavedSelectionCatalogReader = clientCacheReader,
): Promise<UnmappableSavedSelection | null> {
  const provider = target.provider.trim();
  const selection = target.modelSelection;
  if (!provider || !selection) {
    return null;
  }

  const registry = await reader.readRegistry();
  const descriptor = registry.providers.find((option) => option.id === provider);
  if (!descriptor) {
    return null;
  }
  const instance = resolveSelectedProviderInstance(descriptor, target.instance ?? '') || null;
  const [catalog, advancedCatalog] = await Promise.all([
    reader.readModels(provider, instance),
    reader.readAdvanced(provider, instance),
  ]);
  if (!canClassifyCatalogSelection(catalog, advancedCatalog)) {
    return null;
  }
  const fit = classifyCatalogSelection({ selection, catalog, advancedCatalog });
  return fit.status === 'unmappable' ? { mismatch: fit.mismatch, catalog, advancedCatalog } : null;
}

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

export function describeUnmappableSavedSelection(
  value: UnmappableSavedSelection,
  t: Translate,
): string {
  const { mismatch, catalog, advancedCatalog } = value;
  const entryLabel = (entryId: string) =>
    catalog.models.find((option) => option.id === entryId)?.label ?? entryId;
  switch (mismatch.kind) {
    case 'entry':
      return t(messageKeys.sharedProviderModelAttentionEntryRemoved, { model: mismatch.entryId });
    case 'control': {
      const control = advancedCatalog.entries.find((entry) => entry.id === mismatch.entryId)?.controls
        ?.find((candidate) => candidate.key === mismatch.key)
        ?? advancedCatalog.controls.find((candidate) => candidate.key === mismatch.key);
      return t(messageKeys.sharedProviderModelAttentionControlRemoved, {
        model: entryLabel(mismatch.entryId),
        control: control?.label ?? mismatch.key,
        value: String(mismatch.value),
      });
    }
    case 'preset':
      return t(messageKeys.sharedProviderModelAttentionPresetRemoved, { preset: mismatch.presetId });
  }
}

/**
 * Attention text for a saved selection the current catalog no longer offers.
 * It is derived on read, never stored, so a later catalog update clears it.
 */
export function useSavedSelectionAttention(
  target: SavedSelectionTarget | null | undefined,
  reader?: SavedSelectionCatalogReader,
): string | null {
  const { t } = useI18n();
  const generation = useSyncExternalStore(
    onProviderClientInvalidation, getProviderClientGeneration, getProviderClientGeneration);
  const refreshVersion = useSyncExternalStore(
    subscribeProviderCatalogRefreshes, getProviderCatalogRefreshVersion, getProviderCatalogRefreshVersion);
  const key = target?.provider && target.modelSelection
    ? JSON.stringify([generation, refreshVersion, target.provider, target.instance ?? null, target.modelSelection])
    : null;
  const [state, setState] = useState<{ key: string; value: UnmappableSavedSelection | null } | null>(null);

  useEffect(() => {
    if (!key || !target) {
      return;
    }
    let cancelled = false;
    readUnmappableSavedSelection(target, reader).then((value) => {
      if (!cancelled) setState({ key, value });
    }, () => {
      // A failed read cannot judge the selection; show nothing rather than a guess.
      if (!cancelled) setState({ key, value: null });
    });
    return () => {
      cancelled = true;
    };
    // The key serializes every input the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reader]);

  return state?.key === key && state.value ? describeUnmappableSavedSelection(state.value, t) : null;
}
