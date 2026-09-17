import { useEffect, useRef, useState } from 'react';

import {
  peekProviderRegistryClientCache,
  retainProviderRegistryOnFailure,
  subscribeProviderRegistry,
} from '../../app/renderer/providerRegistryClient.js';
import { startProviderReadLoop } from '../../app/renderer/providerReadLoop.js';
import type { ProductProviderRegistryReadModel } from '../../shared/providerCatalog.js';
import { sanitizeProviderRegistryReadModel } from './providerModelFieldsSupport.js';
import { isProviderReadRevalidating } from '../../shared/providerRegistryWarnings.js';

export function useProviderRegistryState(input: {
  fetchProviderRegistry: (options?: { force?: boolean }) => Promise<ProductProviderRegistryReadModel>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}) {
  const [providerRegistry, setProviderRegistry] = useState<ProductProviderRegistryReadModel>(() =>
    peekProviderRegistryClientCache() ?? { state: 'runtime_unreachable', providers: [] });
  const [providersLoaded, setProvidersLoaded] = useState(Boolean(peekProviderRegistryClientCache()));
  const registryRef = useRef(providerRegistry);
  const requestIdRef = useRef(0);
  const onChangeRef = useRef(input.onProviderRegistryChange);
  onChangeRef.current = input.onProviderRegistryChange;

  useEffect(() => {
    let cancelled = false;
    function commit(value: ProductProviderRegistryReadModel): void {
      if (cancelled) return;
      const next = sanitizeProviderRegistryReadModel(value);
      registryRef.current = next;
      setProviderRegistry(next);
      setProvidersLoaded(true);
      onChangeRef.current?.(next);
    }
    const unsubscribe = subscribeProviderRegistry((value) => {
      // Includes explicit cache reset. A late read must not undo it.
      requestIdRef.current++;
      commit(value);
    });
    const stop = startProviderReadLoop(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const value = await input.fetchProviderRegistry();
        if (!cancelled && requestId === requestIdRef.current) {
          commit(retainProviderRegistryOnFailure(registryRef.current, value));
        }
      } catch {
        if (!cancelled && requestId === requestIdRef.current) {
          commit(retainProviderRegistryOnFailure(registryRef.current,
            { state: 'runtime_unreachable', providers: [] }));
        }
      }
      return registryRef.current.state !== 'runtime_unreachable'
        && !isProviderReadRevalidating(registryRef.current);
    });
    return () => { cancelled = true; stop(); unsubscribe(); };
  }, [input.fetchProviderRegistry]);

  return { providers: providerRegistry.providers, providerRegistry, providersLoaded,
    providersLoading: !providersLoaded || providerRegistry.state === 'runtime_unreachable'
      || isProviderReadRevalidating(providerRegistry) };
}
