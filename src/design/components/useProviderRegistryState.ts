import { useEffect, useRef, useState } from 'react';

import type { ProductProviderRegistryReadModel } from '../../shared/providerCatalog.js';
import {
  createDefaultProviderRegistryReadModel,
  sanitizeProviderRegistryReadModel,
} from './providerModelFieldsSupport.js';

export function useProviderRegistryState(input: {
  fetchProviderRegistry: (options?: { force?: boolean }) => Promise<ProductProviderRegistryReadModel>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}) {
  const [providers, setProviders] = useState<ProductProviderRegistryReadModel['providers']>([]);
  const [providerRegistry, setProviderRegistry] = useState<ProductProviderRegistryReadModel>(() =>
    createDefaultProviderRegistryReadModel(),
  );
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [providerRegistryReloadToken, setProviderRegistryReloadToken] = useState(0);
  const [lastAutoProviderRegistryRecheckAt, setLastAutoProviderRegistryRecheckAt] = useState(0);
  const onProviderRegistryChangeRef = useRef(input.onProviderRegistryChange);
  const providerRegistryRequestIdRef = useRef(0);

  useEffect(() => {
    onProviderRegistryChangeRef.current = input.onProviderRegistryChange;
  }, [input.onProviderRegistryChange]);

  function commitProviderRegistry(
    requestId: number,
    nextRegistryResult: ProductProviderRegistryReadModel,
  ): void {
    if (requestId !== providerRegistryRequestIdRef.current) {
      return;
    }
    const nextRegistry = sanitizeProviderRegistryReadModel(nextRegistryResult);
    setProviders(nextRegistry.providers);
    setProviderRegistry(nextRegistry);
    setProvidersLoaded(true);
    onProviderRegistryChangeRef.current?.(nextRegistry);
  }

  function commitProviderRegistryError(
    requestId: number,
    error: unknown,
  ): void {
    if (requestId !== providerRegistryRequestIdRef.current) {
      return;
    }
    const nextRegistry: ProductProviderRegistryReadModel = {
      state: 'runtime_unreachable',
      providers: [],
      recovery: {
        retryable: true,
      },
      warnings: [error instanceof Error ? error.message : 'Failed to load providers.'],
    };
    setProviders([]);
    setProviderRegistry(nextRegistry);
    setProvidersLoaded(true);
    onProviderRegistryChangeRef.current?.(nextRegistry);
  }

  useEffect(() => {
    let cancelled = false;
    const requestId = ++providerRegistryRequestIdRef.current;

    void input.fetchProviderRegistry()
      .then((nextRegistryResult) => {
        if (!cancelled) {
          commitProviderRegistry(requestId, nextRegistryResult);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          commitProviderRegistryError(requestId, error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [input.fetchProviderRegistry, providerRegistryReloadToken]);

  function reloadProviderRegistry(options?: { markAutoRecheckAt?: number }): void {
    if (options?.markAutoRecheckAt !== undefined) {
      setLastAutoProviderRegistryRecheckAt(options.markAutoRecheckAt);
    }
    setProvidersLoaded(false);
    setProviderRegistryReloadToken((current) => current + 1);
  }

  function forceReloadProviderRegistry(options?: { markAutoRecheckAt?: number }): void {
    if (options?.markAutoRecheckAt !== undefined) {
      setLastAutoProviderRegistryRecheckAt(options.markAutoRecheckAt);
    }
    setProvidersLoaded(false);
    const requestId = ++providerRegistryRequestIdRef.current;
    void input.fetchProviderRegistry({ force: true })
      .then((nextRegistryResult) => {
        commitProviderRegistry(requestId, nextRegistryResult);
      })
      .catch((error) => {
        commitProviderRegistryError(requestId, error);
      });
  }

  return {
    providers,
    providerRegistry,
    providersLoaded,
    lastAutoProviderRegistryRecheckAt,
    reloadProviderRegistry,
    forceReloadProviderRegistry,
  };
}
