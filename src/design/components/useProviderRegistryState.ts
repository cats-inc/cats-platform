import { useEffect, useRef, useState } from 'react';

import { subscribeProviderRegistry } from '../../app/renderer/providerRegistryClient.js';
import type { ProductProviderRegistryReadModel } from '../../shared/providerCatalog.js';
import {
  PROVIDER_LOAD_FAILED_WARNING,
  PRODUCT_PROVIDER_CATALOG_CHECKING_WARNING,
  sanitizeProviderRegistryReadModel,
} from './providerModelFieldsSupport.js';

export function useProviderRegistryState(input: {
  fetchProviderRegistry: (options?: { force?: boolean }) => Promise<ProductProviderRegistryReadModel>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}) {
  const initialRegistry: ProductProviderRegistryReadModel = {
    state: 'no_usable_targets', providers: [], warnings: [PRODUCT_PROVIDER_CATALOG_CHECKING_WARNING],
  };
  const [providers, setProviders] = useState<ProductProviderRegistryReadModel['providers']>(
    initialRegistry.providers,
  );
  const [providerRegistry, setProviderRegistry] = useState<ProductProviderRegistryReadModel>(
    () => initialRegistry,
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
    const errorMessage = error instanceof Error ? error.message : PROVIDER_LOAD_FAILED_WARNING;
    setProviderRegistry((current) => {
      const baseWarnings = (current.warnings ?? []).filter((warning) => warning !== errorMessage);
      const nextRegistry: ProductProviderRegistryReadModel = {
        state: 'runtime_unreachable',
        providers: [],
        recovery: {
          retryable: true,
        },
        warnings: [...baseWarnings, errorMessage],
      };
      onProviderRegistryChangeRef.current?.(nextRegistry);
      return nextRegistry;
    });
    setProviders([]);
    setProvidersLoaded(true);
  }

  useEffect(() => subscribeProviderRegistry((registry) => {
    commitProviderRegistry(++providerRegistryRequestIdRef.current, registry);
  }), []);

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
    // Keep `providersLoaded` true so existing dropdown options stay visible
    // while the background refresh runs; commit/error handlers will update
    // state when the fetch resolves.
    setProviderRegistryReloadToken((current) => current + 1);
  }

  function forceReloadProviderRegistry(options?: { markAutoRecheckAt?: number }): void {
    if (options?.markAutoRecheckAt !== undefined) {
      setLastAutoProviderRegistryRecheckAt(options.markAutoRecheckAt);
    }
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
