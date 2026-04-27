import type {
  ProductProviderRegistryReadModel,
  ProductProviderInstanceDescriptor,
} from '../../shared/providerCatalog.js';
import { normalizeProductProviderEventCapabilities } from '../../shared/providerCatalog.js';

export const PROVIDER_REGISTRY_CLIENT_CACHE_TTL_MS = 15_000;
export const PROVIDER_REGISTRY_CLIENT_STALE_IF_ERROR_MS = 10 * 60_000;

type ProviderRegistryFetch = typeof fetch;

interface ProviderRegistryClientCacheState {
  value: ProductProviderRegistryReadModel | null;
  freshUntilMs: number;
  staleIfErrorUntilMs: number;
  inflight: Promise<ProductProviderRegistryReadModel> | null;
}

const providerRegistryClientCache: ProviderRegistryClientCacheState = {
  value: null,
  freshUntilMs: 0,
  staleIfErrorUntilMs: 0,
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

function appendProviderRegistryWarning(
  value: ProductProviderRegistryReadModel,
  warning: string,
): ProductProviderRegistryReadModel {
  const warnings = Array.isArray(value.warnings) ? value.warnings : [];
  return {
    ...value,
    warnings: warnings.includes(warning)
      ? warnings
      : [...warnings, warning],
  };
}

function resolveProviderRegistryFailureMessage(
  value: ProductProviderRegistryReadModel,
): string {
  return value.warnings?.[0] ?? 'Failed to refresh providers.';
}

function writeProviderRegistryClientCache(
  value: ProductProviderRegistryReadModel,
): void {
  const now = Date.now();
  providerRegistryClientCache.value = value;
  providerRegistryClientCache.freshUntilMs = now + PROVIDER_REGISTRY_CLIENT_CACHE_TTL_MS;
  providerRegistryClientCache.staleIfErrorUntilMs =
    now + PROVIDER_REGISTRY_CLIENT_STALE_IF_ERROR_MS;
}

function clearExpiredProviderRegistryClientCache(): void {
  providerRegistryClientCache.value = null;
  providerRegistryClientCache.freshUntilMs = 0;
  providerRegistryClientCache.staleIfErrorUntilMs = 0;
}

async function loadProviderRegistry(
  fetchImpl: ProviderRegistryFetch,
  options: { force?: boolean } = {},
): Promise<ProductProviderRegistryReadModel> {
  try {
    const url = options.force ? '/api/providers?force=1' : '/api/providers';
    const response = await fetchImpl(url);
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
  providerRegistryClientCache.staleIfErrorUntilMs = 0;
  providerRegistryClientCache.inflight = null;
}

export function peekProviderRegistryClientCache(): ProductProviderRegistryReadModel | null {
  const now = Date.now();
  if (
    providerRegistryClientCache.value
    && providerRegistryClientCache.freshUntilMs > now
  ) {
    return providerRegistryClientCache.value;
  }
  return null;
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
    return providerRegistryClientCache.value;
  }

  if (!options.force && providerRegistryClientCache.inflight) {
    return providerRegistryClientCache.inflight;
  }

  const request = loadProviderRegistry(options.fetchImpl ?? fetch, { force: options.force })
    .then((value) => {
      if (shouldCacheProviderRegistryValue(value)) {
        writeProviderRegistryClientCache(value);
        return value;
      }

      const cachedValue = providerRegistryClientCache.value;
      if (cachedValue && providerRegistryClientCache.staleIfErrorUntilMs > Date.now()) {
        return appendProviderRegistryWarning(
          cachedValue,
          `Using cached providers because refresh failed: ${
            resolveProviderRegistryFailureMessage(value)
          }`,
        );
      }

      clearExpiredProviderRegistryClientCache();
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
