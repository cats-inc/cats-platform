import type {
  ProductProviderRegistryReadModel,
  ProductProviderInstanceDescriptor,
} from '../../shared/providerCatalog.js';
import { normalizeProductProviderEventCapabilities } from '../../shared/providerCatalog.js';
import {
  PROVIDER_LOAD_FAILED_WARNING,
} from '../../shared/providerRegistryWarnings.js';
import { clearProviderCatalogClientCache } from './providerCatalogClient.js';
import { invalidateProviderClientSession, onProviderClientInvalidation, ProviderClientAuthError } from './providerClientInvalidation.js';

type ProviderRegistryFetch = typeof fetch;

interface ProviderRegistryClientCacheState {
  value: ProductProviderRegistryReadModel | null;
  inflight: Promise<ProductProviderRegistryReadModel> | null;
}

const providerRegistryClientCache: ProviderRegistryClientCacheState = {
  value: null,
  inflight: null,
};

const listeners = new Set<(value: ProductProviderRegistryReadModel) => void>();

export function subscribeProviderRegistry(listener: (value: ProductProviderRegistryReadModel) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function readProviderRegistryErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: unknown } };
    if (typeof payload.error?.message === 'string') {
      return payload.error.message;
    }
  } catch {
    // Ignore invalid error payloads and fall back to the default message.
  }
  return fallback;
}

function normalizeProviderRegistryPayload(
  payload: ProductProviderRegistryReadModel,
): ProductProviderRegistryReadModel {
  const providers = Array.isArray(payload.providers) ? payload.providers : [];

  return {
    state: payload.state ?? (providers.length > 0 ? 'ready' : 'no_usable_targets'),
    revision: payload.revision,
    providers: providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      defaultModel: provider.defaultModel ?? null,
      defaultInstance: provider.defaultInstance ?? null,
      defaultBackend: provider.defaultBackend ?? null,
      instances: Array.isArray(provider.instances)
        ? provider.instances.map((instance: ProductProviderInstanceDescriptor) => ({
            id: instance.id,
            label: instance.label,
            target: instance.target ?? null,
            backend: instance.backend ?? null,
            default: Boolean(instance.default),
            eventCapabilities: normalizeProductProviderEventCapabilities(instance.eventCapabilities),
          }))
        : [],
      modelsPath: provider.modelsPath,
    })),
    recovery: payload.recovery,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
}

function createRuntimeUnreachableRegistry(message: string): ProductProviderRegistryReadModel {
  return {
    state: 'runtime_unreachable',
    providers: [],
    recovery: {
      retryable: true,
    },
    warnings: [message],
  };
}

function writeProviderRegistryClientCache(
  value: ProductProviderRegistryReadModel,
): ProductProviderRegistryReadModel {
  const previous = providerRegistryClientCache.value;
  if ((value.revision !== undefined || value.state !== 'runtime_unreachable')
    && previous?.revision !== value.revision) {
    clearProviderCatalogClientCache();
  }
  value = retainProviderRegistryOnFailure(previous, value);
  providerRegistryClientCache.value = value;
  for (const listener of listeners) listener(value);
  return value;
}

/** A missing revision during an outage is not an authoritative deselection. */
export function retainProviderRegistryOnFailure(
  previous: ProductProviderRegistryReadModel | null,
  value: ProductProviderRegistryReadModel,
): ProductProviderRegistryReadModel {
  if (value.state === 'runtime_unreachable' && previous
    && (value.revision === undefined || value.revision === previous.revision)) {
    return { ...value, revision: previous.revision, providers: previous.providers };
  }
  return value;
}

async function loadProviderRegistry(
  fetchImpl: ProviderRegistryFetch,
  options: { force?: boolean } = {},
): Promise<ProductProviderRegistryReadModel> {
  try {
    const url = options.force ? '/api/providers?force=1' : '/api/providers';
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ProviderClientAuthError('Provider session is unavailable.');
      }
      return createRuntimeUnreachableRegistry(
        await readProviderRegistryErrorMessage(response, PROVIDER_LOAD_FAILED_WARNING),
      );
    }

    const payload = (await response.json()) as ProductProviderRegistryReadModel;
    return normalizeProviderRegistryPayload(payload);
  } catch (error) {
    if (error instanceof ProviderClientAuthError) throw error;
    return createRuntimeUnreachableRegistry(
      error instanceof Error ? error.message : PROVIDER_LOAD_FAILED_WARNING,
    );
  }
}

export function clearProviderRegistryClientCache(): void {
  invalidateProviderClientSession();
}

onProviderClientInvalidation(() => {
  providerRegistryClientCache.value = null;
  providerRegistryClientCache.inflight = null;
  for (const listener of listeners) listener(createRuntimeUnreachableRegistry(PROVIDER_LOAD_FAILED_WARNING));
});

export function peekProviderRegistryClientCache(): ProductProviderRegistryReadModel | null {
  // Reopen immediately from observed data; the mounted picker revalidates it.
  return providerRegistryClientCache.value;
}

export async function fetchProviderRegistryFromClientCache(options: {
  force?: boolean;
  fetchImpl?: ProviderRegistryFetch;
} = {}): Promise<ProductProviderRegistryReadModel> {
  // Every opened picker verifies current intent. The server can reuse its
  // diagnostics cache after this cheap selection check.
  if (!options.force && providerRegistryClientCache.inflight) {
    return providerRegistryClientCache.inflight;
  }

  const request = loadProviderRegistry(options.fetchImpl ?? fetch, { force: options.force })
    .then((value) => {
      if (providerRegistryClientCache.inflight !== request) {
        throw new Error('Provider selection request was superseded.');
      }
      return writeProviderRegistryClientCache(value);
    })
    .catch((error) => {
      if (error instanceof ProviderClientAuthError && providerRegistryClientCache.inflight === request) {
        invalidateProviderClientSession();
      }
      throw error;
    })
    .finally(() => {
      if (providerRegistryClientCache.inflight === request) providerRegistryClientCache.inflight = null;
    });

  providerRegistryClientCache.inflight = request;
  return request;
}

export function prefetchProviderRegistryFromClientCache(options: {
  force?: boolean;
  fetchImpl?: ProviderRegistryFetch;
} = {}): Promise<void> {
  return fetchProviderRegistryFromClientCache(options).then(() => undefined);
}
