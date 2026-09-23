import { useEffect, useState, useSyncExternalStore } from 'react';
import { getProviderClientGeneration, onProviderClientInvalidation } from '../../app/renderer/providerClientInvalidation.js';

import {
  peekProviderAdvancedCatalogFromClientCache,
  peekProviderModelCatalogFromClientCache,
  getProviderCatalogRefreshVersion,
  subscribeProviderCatalogRefreshes,
} from '../../app/renderer/providerCatalogClient.js';
import { startProviderReadLoop } from '../../app/renderer/providerReadLoop.js';
import { isProviderReadRevalidating } from '../../shared/providerRegistryWarnings.js';
import type {
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  catalogMatchesTarget,
  createEmptyProviderAdvancedModelCatalog,
  createEmptyProviderModelCatalog,
} from './providerModelFieldsSupport.js';

export function useProviderCatalogState(input: {
  selectionRevision?: string;
  provider: string;
  resolvedInstance: string;
  hasSelectedProvider: boolean;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
}) {
  const { provider, resolvedInstance, hasSelectedProvider, selectionRevision } = input;
  const generation = useSyncExternalStore(onProviderClientInvalidation, getProviderClientGeneration, getProviderClientGeneration);
  const refreshVersion = useSyncExternalStore(subscribeProviderCatalogRefreshes, getProviderCatalogRefreshVersion, getProviderCatalogRefreshVersion);
  const instance = resolvedInstance || null;
  const key = JSON.stringify([generation, provider, instance, selectionRevision, hasSelectedProvider]);
  function coherent(models: ProviderModelCatalog, advanced: ProviderAdvancedModelCatalog): boolean {
    return models.catalogRevision === advanced.catalogRevision && models.catalogActivationId === advanced.catalogActivationId
      && models.backend === advanced.backend && models.instance === advanced.instance;
  }
  function initialState() {
    const models = hasSelectedProvider
      ? peekProviderModelCatalogFromClientCache({ provider, instance }) : null;
    const advanced = hasSelectedProvider && peekProviderAdvancedCatalogFromClientCache({ provider, instance });
    return {
      key,
      models: models ?? createEmptyProviderModelCatalog(provider, instance),
      resolved: models !== null,
      advanced: models && advanced && coherent(models, advanced) ? advanced : createEmptyProviderAdvancedModelCatalog(provider, instance),
      loading: hasSelectedProvider && Boolean(provider),
    };
  }
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let cancelled = false;
    const current = state.key === key ? { ...state, loading: hasSelectedProvider && Boolean(provider) } : initialState();
    let modelsReady = false;
    let advancedReady = false;
    let candidateModels: ProviderModelCatalog | null = null;
    let candidateAdvanced: ProviderAdvancedModelCatalog | null = null;
    setState(current);
    if (!hasSelectedProvider || !provider) return;

    function publish(): void {
      if (!cancelled && generation === getProviderClientGeneration()) setState({ ...current });
    }
    function matches(catalog: ProviderModelCatalog | ProviderAdvancedModelCatalog): boolean {
      return catalogMatchesTarget({ catalogProvider: catalog.provider, catalogInstance: catalog.instance,
        provider, instance: resolvedInstance });
    }
    const stop = startProviderReadLoop(async () => {
      // Retry just the failed half. Successful base models remain usable while
      // advanced controls load, and a failed refresh never erases either half.
      if (modelsReady && advancedReady) { modelsReady = false; advancedReady = false; }
      current.loading = true;
      publish();
      await Promise.allSettled([
        modelsReady ? Promise.resolve() : input.fetchProviderModels(provider, instance).then((value) => {
          if (cancelled || !matches(value)) return;
          modelsReady = !isProviderReadRevalidating(value);
          candidateModels = value;
        }),
        advancedReady ? Promise.resolve() : input.fetchAdvancedProviderModels(provider, instance).then((value) => {
          if (cancelled || !matches(value)) return;
          advancedReady = !isProviderReadRevalidating(value);
          candidateAdvanced = value;
        }),
      ]);
      if (candidateModels && candidateAdvanced && coherent(candidateModels, candidateAdvanced)) {
        current.models = candidateModels;
        current.advanced = candidateAdvanced;
        current.resolved = true;
      } else {
        // Keep a coherent observed snapshot across mixed reload responses. On a
        // cold read, basic models may load independently with advanced controls withheld.
        if (!current.resolved && candidateModels) {
          current.models = candidateModels;
          current.advanced = createEmptyProviderAdvancedModelCatalog(provider, instance);
          current.resolved = true;
        }
        if (candidateModels && candidateAdvanced) {
          modelsReady = false;
          advancedReady = false;
        }
      }
      current.loading = !(modelsReady && advancedReady);
      publish();
      return !current.loading;
    }, 60_000);
    return () => { cancelled = true; stop(); };
  }, [generation, refreshVersion, provider, resolvedInstance, hasSelectedProvider, selectionRevision,
    input.fetchProviderModels, input.fetchAdvancedProviderModels]);

  // Never display a previous provider/revision during the render before the
  // effect runs. Cache invalidation precedes registry publication.
  const effective = state.key === key ? state : initialState();
  return {
    catalogLoading: effective.loading,
    catalogResolved: effective.resolved,
    effectiveCatalog: effective.models,
    effectiveAdvancedCatalog: effective.advanced,
  };
}
