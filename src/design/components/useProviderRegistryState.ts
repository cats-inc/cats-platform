import { useEffect, useRef, useState } from 'react';

import { peekProviderRegistryClientCache } from '../../app/renderer/providerRegistryClient.js';
import type { ProductProviderRegistryReadModel } from '../../shared/providerCatalog.js';
import {
  createStaticProviderRegistryReadModel,
  PRODUCT_PROVIDER_CATALOG_CHECKING_WARNING,
  sanitizeProviderRegistryReadModel,
} from './providerModelFieldsSupport.js';

export function useProviderRegistryState(input: {
  fetchProviderRegistry: (options?: { force?: boolean }) => Promise<ProductProviderRegistryReadModel>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}) {
  const initialCached = peekProviderRegistryClientCache();
  const initialRegistry = initialCached
    ? sanitizeProviderRegistryReadModel(initialCached)
    : createStaticProviderRegistryReadModel([PRODUCT_PROVIDER_CATALOG_CHECKING_WARNING]);
  const [providers, setProviders] = useState<ProductProviderRegistryReadModel['providers']>(
    initialRegistry.providers,
  );
  const [providerRegistry, setProviderRegistry] = useState<ProductProviderRegistryReadModel>(
    () => initialRegistry,
  );
  const [providersLoaded, setProvidersLoaded] = useState(true);
  const [providerRegistryReloadToken, setProviderRegistryReloadToken] = useState(0);
  const [lastAutoProviderRegistryRecheckAt, setLastAutoProviderRegistryRecheckAt] = useState(0);
  const onProviderRegistryChangeRef = useRef(input.onProviderRegistryChange);
  const providerRegistryRequestIdRef = useRef(0);
  const providersRef = useRef<ProductProviderRegistryReadModel['providers']>(
    initialRegistry.providers,
  );

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
    const sanitizedRegistry = sanitizeProviderRegistryReadModel(nextRegistryResult);
    const nextRegistry = sanitizedRegistry.state === 'runtime_unreachable'
      && sanitizedRegistry.providers.length === 0
      && providersRef.current.length > 0
      ? {
          ...sanitizedRegistry,
          providers: providersRef.current,
        }
      : sanitizedRegistry;
    providersRef.current = nextRegistry.providers;
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to load providers.';
    setProviderRegistry((current) => {
      const baseWarnings = (current.warnings ?? []).filter((warning) => warning !== errorMessage);
      const keepProviders = current.providers.length > 0;
      const nextRegistry: ProductProviderRegistryReadModel = {
        state: 'runtime_unreachable',
        // Preserve the last known providers list on transient failures so the
        // dropdowns keep working; we still surface the outage through the
        // registry state and warnings. First-load failures have nothing to
        // preserve and fall through to an empty list as before.
        providers: keepProviders ? current.providers : [],
        recovery: {
          retryable: true,
        },
        warnings: [...baseWarnings, errorMessage],
      };
      providersRef.current = nextRegistry.providers;
      onProviderRegistryChangeRef.current?.(nextRegistry);
      return nextRegistry;
    });
    setProvidersLoaded(true);
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
