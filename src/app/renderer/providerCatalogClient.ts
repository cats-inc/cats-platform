import {
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import { clearLiveProviderModelLabels, recordLiveProviderModelLabels, replaceInformationalProviderLabels, setProviderModelLabelContext } from '../../shared/providerModelLabelRegistry.js';
import { resolveSelectedProviderInstance } from '../../shared/providerSelection.js';
import { getProviderClientGeneration, invalidateProviderClientSession, onProviderClientInvalidation, ProviderClientAuthError } from './providerClientInvalidation.js';

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

export class ProviderCatalogConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderCatalogConfigurationError';
  }
}

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

let catalogRefreshVersion = 0;
const catalogRefreshListeners = new Set<() => void>();
export function getProviderCatalogRefreshVersion(): number { return catalogRefreshVersion; }
export function subscribeProviderCatalogRefreshes(listener: () => void): () => void {
  catalogRefreshListeners.add(listener); return () => { catalogRefreshListeners.delete(listener); };
}

/** Refresh same-context catalogs immediately while mounted views retain a coherent baseline. */
export function refreshProviderCatalogClientCache(): void {
  clearCatalogEntries();
  catalogRefreshVersion += 1;
  for (const listener of catalogRefreshListeners) listener();
}

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
  return `${getProviderClientGeneration()}\u0000${provider.trim()}\u0000${normalizeCatalogInstance(instance) ?? ''}`;
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

async function readProviderCatalogError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const payload = await response.json() as { error?: { message?: unknown; code?: unknown } };
    if (payload.error?.code === 'catalog_unavailable') {
      return new ProviderCatalogConfigurationError(
        typeof payload.error.message === 'string' ? payload.error.message : fallback,
      );
    }
    if (typeof payload.error?.message === 'string') {
      return new Error(payload.error.message);
    }
  } catch {
    // Ignore invalid error payloads and fall back to the default message.
  }
  return new Error(fallback);
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
  accepted?: (value: TCatalog) => void;
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
      if (input.cache.inflight.get(input.cacheKey) !== request) {
        throw new Error('Provider selection changed during catalog loading.');
      }
      input.accepted?.(value);
      input.cache.entries.set(input.cacheKey, {
        value,
        freshUntilMs: Date.now() + PROVIDER_CATALOG_CLIENT_CACHE_TTL_MS,
      });
      return value;
    })
    .catch((error) => {
      if (error instanceof ProviderClientAuthError && input.cache.inflight.get(input.cacheKey) === request) {
        invalidateProviderClientSession();
      }
      throw error;
    })
    .finally(() => {
      if (input.cache.inflight.get(input.cacheKey) === request) input.cache.inflight.delete(input.cacheKey);
    });

  input.cache.inflight.set(input.cacheKey, request);
  return request;
}

export function clearProviderCatalogClientCache(): void {
  clearLiveProviderModelLabels();
  setProviderModelLabelContext(String(getProviderClientGeneration()));
  clearCatalogEntries();
}

function clearCatalogEntries(): void {
  providerModelCatalogClientCache.entries.clear();
  providerModelCatalogClientCache.inflight.clear();
  providerAdvancedCatalogClientCache.entries.clear();
  providerAdvancedCatalogClientCache.inflight.clear();
}

onProviderClientInvalidation(clearProviderCatalogClientCache);

export async function loadInformationalProviderLabels(): Promise<void> {
  const generation = getProviderClientGeneration();
  try {
    const response = await fetch('/api/provider-catalog/information', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok || generation !== getProviderClientGeneration()) return;
    const value = await response.json();
    if (generation !== getProviderClientGeneration()) return;
    if (Array.isArray(value.scopes)) replaceInformationalProviderLabels(value.scopes);
  } catch { /* Informational labels do not affect Runtime-backed picker availability. */ }
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
  // TTL schedules refresh. Only selection/connection invalidation removes
  // the last successful catalog from the display cache.
  return cached?.value ?? null;
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
    accepted: (catalog) => recordLiveProviderModelLabels(provider, catalog.models, {
      target: catalog.instance?.includes('/') ? catalog.instance : catalog.backend && catalog.instance ? `${catalog.backend}/${catalog.instance}` : instance ?? '',
      catalogRevision: catalog.catalogRevision,
    }),
    load: async () => {
      const response = await (options.fetchImpl ?? fetch)(
        buildProviderCatalogRequestPath({ provider, instance }),
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ProviderClientAuthError('Provider session is unavailable.');
        }
        throw await readProviderCatalogError(
          response,
          PROVIDER_MODEL_CATALOG_LOAD_FAILED_WARNING,
        );
      }

      const catalog = normalizeProviderModelCatalog(
        await readProviderCatalogJson(response, PROVIDER_MODEL_CATALOG_INCOMPLETE_WARNING),
        provider,
      );
      // The runtime owns which version an alias points at, so record its labels
      // for the formatters in src/shared/ that would otherwise fall back to the
      // static table and name a stale version.
      return catalog;
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
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ProviderClientAuthError('Provider session is unavailable.');
        }
        throw await readProviderCatalogError(
          response,
          PROVIDER_ADVANCED_CATALOG_LOAD_FAILED_WARNING,
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
      const instance = resolveSelectedProviderInstance(provider, '') || null;
      return prefetchProviderCatalogPairFromClientCache({
        provider: provider.id,
        instance,
        fetchImpl: options.fetchImpl,
      });
    }),
  ).then(() => undefined);
}
