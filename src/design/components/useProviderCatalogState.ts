import { useEffect, useState } from 'react';

import {
  peekProviderAdvancedCatalogFromClientCache,
  peekProviderModelCatalogFromClientCache,
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
  const instance = resolvedInstance || null;
  const key = JSON.stringify([provider, instance, selectionRevision, hasSelectedProvider]);
  function initialState() {
    const models = hasSelectedProvider
      ? peekProviderModelCatalogFromClientCache({ provider, instance }) : null;
    return {
      key,
      models: models ?? createEmptyProviderModelCatalog(provider, instance),
      resolved: models !== null,
      advanced: (hasSelectedProvider && peekProviderAdvancedCatalogFromClientCache({ provider, instance }))
        || createEmptyProviderAdvancedModelCatalog(provider, instance),
      loading: hasSelectedProvider && Boolean(provider),
    };
  }
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let cancelled = false;
    const current = initialState();
    let modelsReady = false;
    let advancedReady = false;
    setState(current);
    if (!hasSelectedProvider || !provider) return;

    function publish(): void {
      if (!cancelled) setState({ ...current });
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
          current.models = value;
          current.resolved = true;
          publish();
        }),
        advancedReady ? Promise.resolve() : input.fetchAdvancedProviderModels(provider, instance).then((value) => {
          if (cancelled || !matches(value)) return;
          advancedReady = !isProviderReadRevalidating(value);
          current.advanced = value;
          publish();
        }),
      ]);
      current.loading = !(modelsReady && advancedReady);
      publish();
      return !current.loading;
    }, 60_000);
    return () => { cancelled = true; stop(); };
  }, [provider, resolvedInstance, hasSelectedProvider, selectionRevision,
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
