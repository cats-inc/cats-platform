import {
  isFirstCatalogBasis,
  normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog,
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import { clearLiveProviderModelLabels, recordLiveProviderModelLabels, replaceInformationalProviderLabels, setProviderModelLabelContext } from '../../shared/providerModelLabelRegistry.js';
import { CATALOG_BASIS_UNKNOWN_CODE, resolveSelectedProviderInstance } from '../../shared/providerSelection.js';
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

/** Runtime has no catalog basis with this id (Runtime SPEC-045); a read loop stops on it. */
export class ProviderCatalogBasisUnknownError extends Error {
  constructor(message: string, readonly basisId: string | null) {
    super(message);
    this.name = 'ProviderCatalogBasisUnknownError';
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
  basisId?: string | null,
): string {
  const basis = basisId?.trim() ? `\u0000${basisId.trim()}` : '';
  return `${getProviderClientGeneration()}\u0000${provider.trim()}\u0000${normalizeCatalogInstance(instance) ?? ''}${basis}`;
}

function buildProviderCatalogRequestPath(input: {
  provider: string;
  instance?: string | null;
  advanced?: boolean;
  basisId?: string | null;
}): string {
  const query = new URLSearchParams();
  const normalizedInstance = normalizeCatalogInstance(input.instance);
  if (normalizedInstance) {
    query.set('instance', normalizedInstance);
  }
  if (input.advanced && input.basisId?.trim()) {
    query.set('basis', input.basisId.trim());
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
  basisId: string | null = null,
): Promise<Error> {
  try {
    const payload = await response.json() as { error?: { message?: unknown; code?: unknown } };
    if (payload.error?.code === 'catalog_unavailable') {
      return new ProviderCatalogConfigurationError(
        typeof payload.error.message === 'string' ? payload.error.message : fallback,
      );
    }
    if (payload.error?.code === CATALOG_BASIS_UNKNOWN_CODE) {
      return new ProviderCatalogBasisUnknownError(
        typeof payload.error.message === 'string' ? payload.error.message : fallback,
        basisId,
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
  basisId?: string | null,
): TCatalog | null {
  const normalizedProvider = provider.trim();
  if (!normalizedProvider) return null;
  const cacheKey = buildProviderCatalogCacheKey(
    normalizedProvider,
    normalizeCatalogInstance(instance),
    basisId,
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
  basisId?: string | null;
}): ProviderAdvancedModelCatalog | null {
  return peekProviderCatalogClientCache(
    providerAdvancedCatalogClientCache,
    options.provider,
    options.instance,
    options.basisId,
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
  /** A named catalog basis (Runtime SPEC-045); absent reads the first basis. */
  basisId?: string | null;
  force?: boolean;
  fetchImpl?: ProviderCatalogFetch;
}): Promise<ProviderAdvancedModelCatalog> {
  const provider = options.provider.trim();
  const instance = normalizeCatalogInstance(options.instance);
  const basisId = options.basisId?.trim() || null;
  const cacheKey = buildProviderCatalogCacheKey(provider, instance, basisId);

  return fetchProviderCatalogFromClientCache({
    cache: providerAdvancedCatalogClientCache,
    cacheKey,
    force: options.force,
    // `/models` records the first basis's labels; a named basis records its own beside them.
    accepted: (catalog) => {
      if (!catalog.basisId || isFirstCatalogBasis(catalog)) return;
      recordLiveProviderModelLabels(provider, catalog.entries, {
        target: catalog.instance?.includes('/') ? catalog.instance : catalog.backend && catalog.instance ? `${catalog.backend}/${catalog.instance}` : instance ?? '',
        catalogRevision: catalog.catalogRevision,
        basisId: catalog.basisId,
      });
    },
    load: async () => {
      const response = await (options.fetchImpl ?? fetch)(
        buildProviderCatalogRequestPath({ provider, instance, advanced: true, basisId }),
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ProviderClientAuthError('Provider session is unavailable.');
        }
        throw await readProviderCatalogError(
          response,
          PROVIDER_ADVANCED_CATALOG_LOAD_FAILED_WARNING,
          basisId,
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
