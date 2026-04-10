import { useEffect, useState } from 'react';

import type {
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  catalogMatchesTarget,
  createEmptyProviderAdvancedModelCatalog,
  createEmptyProviderModelCatalog,
  resolveAdvancedCatalogFallback,
} from './providerModelFieldsSupport.js';

export function useProviderCatalogState(input: {
  provider: string;
  resolvedInstance: string;
  hasSelectedProvider: boolean;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
}) {
  const [catalogLoading, setCatalogLoading] = useState(Boolean(input.provider));
  const [catalog, setCatalog] = useState<ProviderModelCatalog>(() =>
    createEmptyProviderModelCatalog(input.provider),
  );
  const [advancedCatalog, setAdvancedCatalog] = useState<ProviderAdvancedModelCatalog>(() =>
    createEmptyProviderAdvancedModelCatalog(input.provider),
  );

  useEffect(() => {
    let cancelled = false;
    const nextFallbackCatalog = createEmptyProviderModelCatalog(
      input.provider,
      input.resolvedInstance || null,
    );
    const nextFallbackAdvancedCatalog = createEmptyProviderAdvancedModelCatalog(
      input.provider,
      input.resolvedInstance || null,
    );

    setCatalog(nextFallbackCatalog);
    setAdvancedCatalog(nextFallbackAdvancedCatalog);
    setCatalogLoading(Boolean(input.hasSelectedProvider && input.provider));

    if (!input.hasSelectedProvider || !input.provider) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.allSettled([
      input.fetchProviderModels(input.provider, input.resolvedInstance || null),
      input.fetchAdvancedProviderModels(input.provider, input.resolvedInstance || null),
    ]).then(([modelsResult, advancedResult]) => {
      if (cancelled) {
        return;
      }

      const nextCatalog = modelsResult.status === 'fulfilled'
        ? modelsResult.value
        : createEmptyProviderModelCatalog(
            input.provider,
            input.resolvedInstance || null,
            modelsResult.reason instanceof Error
              ? modelsResult.reason.message
              : 'Runtime model catalog unavailable.',
          );
      setCatalog(nextCatalog);

      setAdvancedCatalog(resolveAdvancedCatalogFallback({
        provider: input.provider,
        instance: input.resolvedInstance || null,
        catalog: nextCatalog,
        advancedCatalogResult: advancedResult,
        modelsResult,
      }));

      setCatalogLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    input.fetchAdvancedProviderModels,
    input.fetchProviderModels,
    input.hasSelectedProvider,
    input.provider,
    input.resolvedInstance,
  ]);

  const fallbackCatalog = createEmptyProviderModelCatalog(input.provider, input.resolvedInstance || null);
  const fallbackAdvancedCatalog = createEmptyProviderAdvancedModelCatalog(
    input.provider,
    input.resolvedInstance || null,
  );
  const effectiveCatalog = catalogMatchesTarget({
    catalogProvider: catalog.provider,
    catalogInstance: catalog.instance,
    provider: input.provider,
    instance: input.resolvedInstance,
  })
    ? catalog
    : fallbackCatalog;
  const effectiveAdvancedCatalog = catalogMatchesTarget({
    catalogProvider: advancedCatalog.provider,
    catalogInstance: advancedCatalog.instance,
    provider: input.provider,
    instance: input.resolvedInstance,
  })
    ? advancedCatalog
    : fallbackAdvancedCatalog;

  return {
    catalogLoading,
    effectiveCatalog,
    effectiveAdvancedCatalog,
  };
}
