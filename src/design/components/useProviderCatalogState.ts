import { useEffect, useState, useSyncExternalStore } from 'react';
import { getProviderClientGeneration, onProviderClientInvalidation } from '../../app/renderer/providerClientInvalidation.js';

import {
  peekProviderAdvancedCatalogFromClientCache,
  peekProviderModelCatalogFromClientCache,
  getProviderCatalogRefreshVersion,
  subscribeProviderCatalogRefreshes,
  ProviderCatalogBasisUnknownError,
  ProviderCatalogConfigurationError,
} from '../../app/renderer/providerCatalogClient.js';
import { startProviderReadLoop } from '../../app/renderer/providerReadLoop.js';
import { isProviderReadRevalidating } from '../../shared/providerRegistryWarnings.js';
import {
  catalogForBasis,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
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
  /** The catalog basis to read (Runtime SPEC-045); null or absent reads the first basis. */
  basisId?: string | null;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
    basisId?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
}) {
  const { provider, resolvedInstance, hasSelectedProvider, selectionRevision } = input;
  const basisId = input.basisId?.trim() || null;
  const generation = useSyncExternalStore(onProviderClientInvalidation, getProviderClientGeneration, getProviderClientGeneration);
  const refreshVersion = useSyncExternalStore(subscribeProviderCatalogRefreshes, getProviderCatalogRefreshVersion, getProviderCatalogRefreshVersion);
  const instance = resolvedInstance || null;
  const key = JSON.stringify([generation, provider, instance, selectionRevision, hasSelectedProvider, basisId]);
  function coherent(models: ProviderModelCatalog, advanced: ProviderAdvancedModelCatalog): boolean {
    return models.catalogRevision === advanced.catalogRevision && models.catalogActivationId === advanced.catalogActivationId
      && models.backend === advanced.backend && models.instance === advanced.instance;
  }
  function initialState() {
    const models = hasSelectedProvider
      ? peekProviderModelCatalogFromClientCache({ provider, instance }) : null;
    const advanced = hasSelectedProvider && peekProviderAdvancedCatalogFromClientCache({ provider, instance, basisId });
    const complete = Boolean(models && advanced && coherent(models, advanced));
    return {
      key,
      // `/models` lists the first basis; a named basis takes its entries from its own catalog,
      // so a cold read of a named basis never shows the first basis's models.
      models: complete && models && advanced ? catalogForBasis(models, advanced)
        : !basisId && models ? models : createEmptyProviderModelCatalog(provider, instance),
      resolved: complete || (!basisId && models !== null),
      basisUnknown: false,
      // A coherent observed snapshot is shown as is; only its absence or a
      // recovering read shows the spinner.
      complete,
      advanced: complete && advanced ? advanced : createEmptyProviderAdvancedModelCatalog(provider, instance),
      loading: hasSelectedProvider && Boolean(provider) && !complete,
      configurationRequired: false,
    };
  }
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let cancelled = false;
    const current = state.key === key
      ? { ...state, loading: !state.configurationRequired && hasSelectedProvider && Boolean(provider) && !state.complete }
      : initialState();
    let modelsReady = false;
    let advancedReady = false;
    let candidateModels: ProviderModelCatalog | null = null;
    let candidateAdvanced: ProviderAdvancedModelCatalog | null = null;
    // Runtime has no such basis: stop asking for it and read the first basis, whose bases list
    // lets the picker keep the saved basis visible as unavailable.
    let readBasis = current.basisUnknown ? null : basisId;
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
      // Revalidating a complete snapshot happens quietly in the background.
      current.loading = !current.configurationRequired && !current.complete;
      publish();
      const reads = await Promise.allSettled([
        modelsReady ? Promise.resolve() : input.fetchProviderModels(provider, instance).then((value) => {
          if (cancelled || !matches(value)) return;
          modelsReady = !isProviderReadRevalidating(value);
          candidateModels = value;
        }),
        advancedReady ? Promise.resolve() : input.fetchAdvancedProviderModels(provider, instance, readBasis)
          .catch((error: unknown) => {
            if (!(error instanceof ProviderCatalogBasisUnknownError) || readBasis === null) throw error;
            current.basisUnknown = true;
            readBasis = null;
            return input.fetchAdvancedProviderModels(provider, instance, null);
          })
          .then((value) => {
            if (cancelled || !matches(value)) return;
            advancedReady = !isProviderReadRevalidating(value);
            candidateAdvanced = value;
          }),
      ]);
      if (reads.some(result => result.status === 'rejected' && result.reason instanceof ProviderCatalogConfigurationError)) {
        current.configurationRequired = true;
      }
      if (candidateModels && candidateAdvanced && coherent(candidateModels, candidateAdvanced)) {
        current.models = catalogForBasis(candidateModels, candidateAdvanced);
        current.advanced = candidateAdvanced;
        current.resolved = true;
        current.complete = true;
        if (modelsReady && advancedReady) current.configurationRequired = false;
      } else {
        // Keep a coherent observed snapshot across mixed reload responses. On a
        // cold read, basic models may load independently with advanced controls withheld.
        if (!current.resolved && candidateModels && !basisId) {
          current.models = candidateModels;
          current.advanced = createEmptyProviderAdvancedModelCatalog(provider, instance);
          current.resolved = true;
        }
        if (candidateModels && candidateAdvanced) {
          modelsReady = false;
          advancedReady = false;
        }
      }
      current.loading = !(modelsReady && advancedReady) && !current.configurationRequired;
      publish();
      return !current.loading;
    }, 60_000);
    return () => { cancelled = true; stop(); };
  }, [generation, refreshVersion, provider, resolvedInstance, hasSelectedProvider, selectionRevision, basisId,
    input.fetchProviderModels, input.fetchAdvancedProviderModels]);

  // Never display a previous provider/revision during the render before the
  // effect runs. Cache invalidation precedes registry publication.
  const effective = state.key === key ? state : initialState();
  return {
    catalogLoading: effective.loading,
    catalogResolved: effective.resolved,
    catalogConfigurationRequired: effective.configurationRequired,
    effectiveCatalog: effective.models,
    effectiveAdvancedCatalog: effective.advanced,
    /** The requested basis is not served; the catalogs shown are the target's first basis. */
    catalogBasisUnknown: effective.basisUnknown,
  };
}
