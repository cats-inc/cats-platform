import {
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';

export const PROVIDER_CATALOG_CLIENT_CACHE_TTL_MS = 15_000;
export const PROVIDER_MODEL_CATALOG_LOAD_FAILED_WARNING =
  'provider_catalog.model.load_failed';
export const PROVIDER_MODEL_CATALOG_INCOMPLETE_WARNING =
  'provider_catalog.model.incomplete_response';
export const PROVIDER_ADVANCED_CATALOG_LOAD_FAILED_WARNING =
  'provider_catalog.advanced.load_failed';
export const PROVIDER_ADVANCED_CATALOG_INCOMPLETE_WARNING =
  'provider_catalog.advanced.incomplete_response';

type ProviderCatalogFetch = typeof fetch;

interface ProviderCatalogClientCacheState<TCatalog> {
  entries: Map<string, {
    value: TCatalog;
    freshUntilMs: number;
  }>;
  inflight: Map<string, Promise<TCatalog>>;
}

const providerModelCatalogClientCache: ProviderCatalogClientCacheState<ProviderModelCatalog> = {
  entries: new Map(),
  inflight: new Map(),
};

const providerAdvancedCatalogClientCache:
  ProviderCatalogClientCacheState<ProviderAdvancedModelCatalog> = {
    entries: new Map(),
    inflight: new Map(),
  };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeCatalogInstance(instance: string | null | undefined): string | null {
  const normalized = instance?.trim();
  return normalized ? normalized : null;
}

function buildProviderCatalogCacheKey(
  provider: string,
  instance: string | null | undefined,
): string {
  return `${provider.trim()}\u0000${normalizeCatalogInstance(instance) ?? ''}`;
}

function buildProviderCatalogRequestPath(input: {
  provider: string;
  instance?: string | null;
  advanced?: boolean;
}): string {
  const query = new URLSearchParams();
  const normalizedInstance = normalizeCatalogInstance(input.instance);
  if (normalizedInstance) {
    query.set('instance', normalizedInstance);
  }
  const path = `/api/providers/${encodeURIComponent(input.provider)}/models${
    input.advanced ? '/advanced' : ''
  }`;
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function readProviderCatalogErrorMessage(
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

async function readProviderCatalogJson(
  response: Response,
  incompleteMessage: string,
): Promise<unknown> {
  const payload = await response.json() as unknown;
  if (!asRecord(payload)?.catalog) {
    throw new Error(incompleteMessage);
  }
  return payload;
}

async function fetchProviderCatalogFromClientCache<TCatalog>(input: {
  cache: ProviderCatalogClientCacheState<TCatalog>;
  cacheKey: string;
  force?: boolean;
  load: () => Promise<TCatalog>;
}): Promise<TCatalog> {
  const now = Date.now();
  if (!input.force) {
    const cached = input.cache.entries.get(input.cacheKey);
    if (cached && cached.freshUntilMs > now) {
      return cached.value;
    }

    const inflight = input.cache.inflight.get(input.cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const request = input.load()
    .then((value) => {
      input.cache.entries.set(input.cacheKey, {
        value,
        freshUntilMs: Date.now() + PROVIDER_CATALOG_CLIENT_CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      input.cache.inflight.delete(input.cacheKey);
    });

  input.cache.inflight.set(input.cacheKey, request);
  return request;
}

export function clearProviderCatalogClientCache(): void {
  providerModelCatalogClientCache.entries.clear();
  providerModelCatalogClientCache.inflight.clear();
  providerAdvancedCatalogClientCache.entries.clear();
  providerAdvancedCatalogClientCache.inflight.clear();
}

function peekProviderCatalogClientCache<TCatalog>(
  cache: ProviderCatalogClientCacheState<TCatalog>,
  provider: string,
  instance: string | null | undefined,
): TCatalog | null {
  const normalizedProvider = provider.trim();
  if (!normalizedProvider) return null;
  const cacheKey = buildProviderCatalogCacheKey(
    normalizedProvider,
    normalizeCatalogInstance(instance),
  );
  const cached = cache.entries.get(cacheKey);
  if (cached && cached.freshUntilMs > Date.now()) {
    return cached.value;
  }
  return null;
}

export function peekProviderModelCatalogFromClientCache(options: {
  provider: string;
  instance?: string | null;
}): ProviderModelCatalog | null {
  return peekProviderCatalogClientCache(
    providerModelCatalogClientCache,
    options.provider,
    options.instance,
  );
}

export function peekProviderAdvancedCatalogFromClientCache(options: {
  provider: string;
  instance?: string | null;
}): ProviderAdvancedModelCatalog | null {
  return peekProviderCatalogClientCache(
    providerAdvancedCatalogClientCache,
    options.provider,
    options.instance,
  );
}

export async function fetchProviderModelCatalogFromClientCache(options: {
  provider: string;
  instance?: string | null;
  force?: boolean;
  fetchImpl?: ProviderCatalogFetch;
}): Promise<ProviderModelCatalog> {
  const provider = options.provider.trim();
  const instance = normalizeCatalogInstance(options.instance);
  const cacheKey = buildProviderCatalogCacheKey(provider, instance);

  return fetchProviderCatalogFromClientCache({
    cache: providerModelCatalogClientCache,
    cacheKey,
    force: options.force,
    load: async () => {
      const response = await (options.fetchImpl ?? fetch)(
        buildProviderCatalogRequestPath({ provider, instance }),
      );
      if (!response.ok) {
        throw new Error(
          await readProviderCatalogErrorMessage(
            response,
            PROVIDER_MODEL_CATALOG_LOAD_FAILED_WARNING,
          ),
        );
      }

      return normalizeProviderModelCatalog(
        await readProviderCatalogJson(response, PROVIDER_MODEL_CATALOG_INCOMPLETE_WARNING),
        provider,
      );
    },
  });
}

export async function fetchProviderAdvancedCatalogFromClientCache(options: {
  provider: string;
  instance?: string | null;
  force?: boolean;
  fetchImpl?: ProviderCatalogFetch;
}): Promise<ProviderAdvancedModelCatalog> {
  const provider = options.provider.trim();
  const instance = normalizeCatalogInstance(options.instance);
  const cacheKey = buildProviderCatalogCacheKey(provider, instance);

  return fetchProviderCatalogFromClientCache({
    cache: providerAdvancedCatalogClientCache,
    cacheKey,
    force: options.force,
    load: async () => {
      const response = await (options.fetchImpl ?? fetch)(
        buildProviderCatalogRequestPath({ provider, instance, advanced: true }),
      );
      if (!response.ok) {
        throw new Error(
          await readProviderCatalogErrorMessage(
            response,
            PROVIDER_ADVANCED_CATALOG_LOAD_FAILED_WARNING,
          ),
        );
      }

      return normalizeProviderAdvancedModelCatalog(
        await readProviderCatalogJson(
          response,
          PROVIDER_ADVANCED_CATALOG_INCOMPLETE_WARNING,
        ),
        provider,
      );
    },
  });
}

export function prefetchProviderCatalogPairFromClientCache(options: {
  provider: string;
  instance?: string | null;
  fetchImpl?: ProviderCatalogFetch;
}): Promise<void> {
  return Promise.allSettled([
    fetchProviderModelCatalogFromClientCache(options),
    fetchProviderAdvancedCatalogFromClientCache(options),
  ]).then(() => undefined);
}

export function prefetchProviderCatalogsForRegistryFromClientCache(
  registry: ProductProviderRegistryReadModel,
  options: {
    fetchImpl?: ProviderCatalogFetch;
  } = {},
): Promise<void> {
  return Promise.allSettled(
    registry.providers.map((provider) => {
      const instance = provider.defaultInstance
        ?? provider.instances.find((candidate) => candidate.default)?.id
        ?? provider.instances[0]?.id
        ?? null;
      return prefetchProviderCatalogPairFromClientCache({
        provider: provider.id,
        instance,
        fetchImpl: options.fetchImpl,
      });
    }),
  ).then(() => undefined);
}
