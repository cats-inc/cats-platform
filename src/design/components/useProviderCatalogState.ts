import { useEffect, useState } from 'react';

import {
  peekProviderAdvancedCatalogFromClientCache,
  peekProviderModelCatalogFromClientCache,
} from '../../app/renderer/providerCatalogClient.js';
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

function peekCachedCatalogPair(
  provider: string,
  instance: string,
  hasSelectedProvider: boolean,
): { models: ProviderModelCatalog; advanced: ProviderAdvancedModelCatalog } | null {
  if (!hasSelectedProvider || !provider) {
    return null;
  }
  const normalizedInstance = instance || null;
  const models = peekProviderModelCatalogFromClientCache({
    provider,
    instance: normalizedInstance,
  });
  const advanced = peekProviderAdvancedCatalogFromClientCache({
    provider,
    instance: normalizedInstance,
  });
  if (models && advanced) {
    return { models, advanced };
  }
  return null;
}

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
  const initialPeek = peekCachedCatalogPair(
    input.provider,
    input.resolvedInstance,
    input.hasSelectedProvider,
  );
  const [catalogLoading, setCatalogLoading] = useState(
    Boolean(input.provider) && !initialPeek,
  );
  const [catalog, setCatalog] = useState<ProviderModelCatalog>(() =>
    initialPeek?.models
      ?? createEmptyProviderModelCatalog(input.provider, input.resolvedInstance || null),
  );
  const [advancedCatalog, setAdvancedCatalog] = useState<ProviderAdvancedModelCatalog>(() =>
    initialPeek?.advanced
      ?? createEmptyProviderAdvancedModelCatalog(input.provider, input.resolvedInstance || null),
  );

  useEffect(() => {
    let cancelled = false;

    if (!input.hasSelectedProvider || !input.provider) {
      setCatalog(createEmptyProviderModelCatalog(input.provider, input.resolvedInstance || null));
      setAdvancedCatalog(
        createEmptyProviderAdvancedModelCatalog(input.provider, input.resolvedInstance || null),
      );
      setCatalogLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const peek = peekCachedCatalogPair(
      input.provider,
      input.resolvedInstance,
      input.hasSelectedProvider,
    );
    if (peek) {
      setCatalog(peek.models);
      setAdvancedCatalog(peek.advanced);
      setCatalogLoading(false);
    } else {
      setCatalog(createEmptyProviderModelCatalog(input.provider, input.resolvedInstance || null));
      setAdvancedCatalog(
        createEmptyProviderAdvancedModelCatalog(input.provider, input.resolvedInstance || null),
      );
      setCatalogLoading(true);
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
