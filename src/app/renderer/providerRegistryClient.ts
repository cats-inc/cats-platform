import type {
  ProductProviderRegistryReadModel,
  ProductProviderInstanceDescriptor,
} from '../../shared/providerCatalog.js';
import { normalizeProductProviderEventCapabilities } from '../../shared/providerCatalog.js';

export const PROVIDER_REGISTRY_CLIENT_CACHE_TTL_MS = 15_000;

type ProviderRegistryFetch = typeof fetch;

interface ProviderRegistryClientCacheState {
  value: ProductProviderRegistryReadModel | null;
  freshUntilMs: number;
  inflight: Promise<ProductProviderRegistryReadModel> | null;
}

const providerRegistryClientCache: ProviderRegistryClientCacheState = {
  value: null,
  freshUntilMs: 0,
  inflight: null,
};

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

function shouldCacheProviderRegistryValue(
  value: ProductProviderRegistryReadModel,
): boolean {
  return value.state !== 'runtime_unreachable';
}

async function loadProviderRegistry(
  fetchImpl: ProviderRegistryFetch,
): Promise<ProductProviderRegistryReadModel> {
  try {
    const response = await fetchImpl('/api/providers');
    if (!response.ok) {
      return createRuntimeUnreachableRegistry(
        await readProviderRegistryErrorMessage(response, 'Failed to load providers.'),
      );
    }

    const payload = (await response.json()) as ProductProviderRegistryReadModel;
    return normalizeProviderRegistryPayload(payload);
  } catch (error) {
    return createRuntimeUnreachableRegistry(
      error instanceof Error ? error.message : 'Failed to load providers.',
    );
  }
}

export function clearProviderRegistryClientCache(): void {
  providerRegistryClientCache.value = null;
  providerRegistryClientCache.freshUntilMs = 0;
  providerRegistryClientCache.inflight = null;
}

export async function fetchProviderRegistryFromClientCache(options: {
  force?: boolean;
  fetchImpl?: ProviderRegistryFetch;
} = {}): Promise<ProductProviderRegistryReadModel> {
  const now = Date.now();
  if (
    !options.force
    && providerRegistryClientCache.value
    && providerRegistryClientCache.freshUntilMs > now
  ) {
    console.log('[selector:client] cache hit, state=%s', providerRegistryClientCache.value.state);
    return providerRegistryClientCache.value;
  }

  if (!options.force && providerRegistryClientCache.inflight) {
    console.log('[selector:client] joining in-flight request');
    return providerRegistryClientCache.inflight;
  }

  const startMs = Date.now();
  console.log('[selector:client] fetching /api/providers');
  const request = loadProviderRegistry(options.fetchImpl ?? fetch)
    .then((value) => {
      const elapsedMs = Date.now() - startMs;
      console.log(
        '[selector:client] fetch complete: state=%s providers=%d elapsed=%dms',
        value.state,
        value.providers.length,
        elapsedMs,
      );
      if (shouldCacheProviderRegistryValue(value)) {
        providerRegistryClientCache.value = value;
        providerRegistryClientCache.freshUntilMs = Date.now() + PROVIDER_REGISTRY_CLIENT_CACHE_TTL_MS;
      } else {
        providerRegistryClientCache.value = null;
        providerRegistryClientCache.freshUntilMs = 0;
      }
      return value;
    })
    .finally(() => {
      providerRegistryClientCache.inflight = null;
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
