import type { ServerResponse } from 'node:http';

import {
  isKnownProvider,
  listProductProviders,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
  type ProductProviderDescriptor,
  type ProductProviderInstanceDescriptor,
} from '../../shared/providerCatalog.js';
import type {
  RuntimeProviderDiagnosticsEntry,
  RuntimeProviderDiagnosticsPayload,
  RuntimeProviderConfigRegistry,
  RuntimeRequestError,
  RuntimeClient,
} from '../../platform/runtime/client.js';
import {
  createEmptyProviderSnapshot,
  loadProviderSnapshot,
  writeProviderSnapshot,
  type ProviderSnapshot,
  type ProviderSnapshotCatalogEntry,
} from './providerSnapshotStore.js';

interface ProviderRouteDependencies {
  runtimeClient: RuntimeClient;
}

const PROVIDER_SNAPSHOT_DEBOUNCE_MS = 1_000;

type ProviderRegistryState = 'ready' | 'no_usable_targets' | 'runtime_unreachable';
const PROVIDER_CACHE_STALE_IF_ERROR_MS = 10 * 60_000;
const PROVIDER_CACHE_ERROR_BACKOFF_MS = 30_000;
const TRUTHFUL_SELECTOR_CACHE_TTL_MS = 30_000;
const TRUTHFUL_SELECTOR_STALE_WINDOW_MS = 15_000;
const TRUTHFUL_SELECTOR_CONFIG_ENRICHMENT_BUDGET_MS = 500;
const PROVIDER_MODEL_CATALOG_CACHE_TTL_MS = 60_000;
const PROVIDER_MODEL_CATALOG_STALE_WINDOW_MS = 5 * 60_000;

type ProviderCacheRefreshWarningKind = 'provider-targets' | 'model-catalog';

interface ProviderCacheRefreshWarning {
  kind: ProviderCacheRefreshWarningKind;
  message: string;
}

export const PROVIDER_TARGETS_CACHE_REFRESH_WARNING_PREFIX =
  'Using cached provider targets because runtime refresh failed:';
export const MODEL_CATALOG_CACHE_REFRESH_WARNING_PREFIX =
  'Using cached model catalog because runtime refresh failed:';
export const PROVIDER_TARGETS_CACHE_REVALIDATION_WARNING =
  'Using cached provider targets while refreshing cats-runtime in the background.';
export const MODEL_CATALOG_CACHE_REVALIDATION_WARNING =
  'Using cached model catalog while refreshing cats-runtime in the background.';

interface ProviderTimedCacheEntryBase<TValue> {
  value: TValue;
  freshUntilMs: number;
  staleUntilMs: number;
  staleIfErrorUntilMs: number;
}

interface ProviderFreshCacheEntry<TValue> extends ProviderTimedCacheEntryBase<TValue> {
  lifecycle: 'fresh';
}

interface ProviderErrorBackoffCacheEntry<TValue> extends ProviderTimedCacheEntryBase<TValue> {
  lifecycle: 'error_backoff';
  cacheRefreshWarning: ProviderCacheRefreshWarning;
}

type ProviderTimedCacheEntry<TValue> =
  | ProviderFreshCacheEntry<TValue>
  | ProviderErrorBackoffCacheEntry<TValue>;

interface TruthfulProviderRegistryReadModel {
  state: ProviderRegistryState;
  providers: ProductProviderDescriptor[];
  recovery?: {
    retryable?: boolean;
    openRuntimeSetupPath?: string;
  };
  warnings?: string[];
}

type TruthfulProviderRegistryCacheEntry =
  ProviderTimedCacheEntry<TruthfulProviderRegistryReadModel>;

interface TruthfulProviderRegistryCacheState {
  entries: Map<string, TruthfulProviderRegistryCacheEntry>;
  inflight: Map<string, Promise<TruthfulProviderRegistryReadModel>>;
}

const truthfulProviderRegistryCache = new WeakMap<RuntimeClient, TruthfulProviderRegistryCacheState>();

type ProviderCatalogCacheEntry<TCatalog extends { warnings?: string[] }> =
  ProviderTimedCacheEntry<TCatalog>;

interface ProviderCatalogTypedCacheState<TCatalog extends { warnings?: string[] }> {
  entries: Map<string, ProviderCatalogCacheEntry<TCatalog>>;
  inflight: Map<string, Promise<TCatalog>>;
}

interface ProviderCatalogCacheState {
  models: ProviderCatalogTypedCacheState<ProviderModelCatalog>;
  advanced: ProviderCatalogTypedCacheState<ProviderAdvancedModelCatalog>;
}

const providerCatalogCache = new WeakMap<RuntimeClient, ProviderCatalogCacheState>();

interface ProviderSnapshotPersistenceState {
  snapshotPath: string;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  writing: Promise<void> | null;
  writeNotifier?: () => void;
}

const providerSnapshotPersistence = new WeakMap<RuntimeClient, ProviderSnapshotPersistenceState>();

function configureProviderSnapshotPersistence(
  runtimeClient: RuntimeClient,
  snapshotPath: string,
  options: { writeNotifier?: () => void } = {},
): void {
  providerSnapshotPersistence.set(runtimeClient, {
    snapshotPath,
    pendingTimer: null,
    writing: null,
    writeNotifier: options.writeNotifier,
  });
}

function buildProviderSnapshotForRuntime(
  runtimeClient: RuntimeClient,
): ProviderSnapshot {
  const snapshot = createEmptyProviderSnapshot();
  const registryCacheState = truthfulProviderRegistryCache.get(runtimeClient);
  const registryEntry = registryCacheState?.entries.get(TRUTHFUL_PROVIDER_REGISTRY_CACHE_KEY);
  // Only persist a 'ready' registry. 'no_usable_targets' would mislead the
  // next boot into seeding an empty (but seemingly truthful) selector even if
  // the user fixed their runtime config in the meantime; 'runtime_unreachable'
  // is the failure state itself.
  if (registryEntry && registryEntry.value.state === 'ready') {
    snapshot.registry = {
      state: registryEntry.value.state,
      providers: registryEntry.value.providers,
      ...(registryEntry.value.warnings ? { warnings: registryEntry.value.warnings } : {}),
    };
  }

  const catalogCacheState = providerCatalogCache.get(runtimeClient);
  if (catalogCacheState) {
    const catalogEntries = new Map<string, ProviderSnapshotCatalogEntry>();
    for (const [cacheKey, entry] of catalogCacheState.models.entries) {
      catalogEntries.set(cacheKey, {
        provider: entry.value.provider,
        instance: entry.value.instance ?? null,
        models: entry.value,
        advanced: catalogEntries.get(cacheKey)?.advanced ?? null,
      });
    }
    for (const [cacheKey, entry] of catalogCacheState.advanced.entries) {
      const existing = catalogEntries.get(cacheKey);
      catalogEntries.set(cacheKey, {
        provider: entry.value.provider,
        instance: entry.value.instance ?? null,
        models: existing?.models ?? null,
        advanced: entry.value,
      });
    }
    snapshot.catalogs = [...catalogEntries.values()];
  }

  return snapshot;
}

function notifyProviderCacheUpdated(runtimeClient: RuntimeClient): void {
  const state = providerSnapshotPersistence.get(runtimeClient);
  if (!state) {
    return;
  }
  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
  }
  state.pendingTimer = setTimeout(() => {
    state.pendingTimer = null;
    const snapshot = buildProviderSnapshotForRuntime(runtimeClient);
    state.writing = writeProviderSnapshot(state.snapshotPath, snapshot)
      .catch(() => {
        // Snapshot persistence is best-effort; failures here should not break
        // the request path. The next successful cache write will retry.
      })
      .finally(() => {
        state.writing = null;
        state.writeNotifier?.();
      });
  }, PROVIDER_SNAPSHOT_DEBOUNCE_MS);
}

function seedTruthfulProviderRegistryFromSnapshot(
  runtimeClient: RuntimeClient,
  snapshot: ProviderSnapshot,
): void {
  // Symmetric with buildProviderSnapshotForRuntime: never seed
  // 'no_usable_targets' or 'runtime_unreachable' from disk. Only known-good
  // ready registries are worth surfacing during the warm-up gap.
  if (!snapshot.registry || snapshot.registry.state !== 'ready') {
    return;
  }
  if (snapshot.registry.providers.length === 0) {
    return;
  }
  const cacheState = getTruthfulProviderRegistryCacheState(runtimeClient);
  const cacheKey = TRUTHFUL_PROVIDER_REGISTRY_CACHE_KEY;
  if (cacheState.entries.has(cacheKey)) {
    return;
  }
  const now = Date.now();
  cacheState.entries.set(cacheKey, {
    lifecycle: 'error_backoff',
    value: snapshot.registry,
    freshUntilMs: 0,
    staleUntilMs: 0,
    staleIfErrorUntilMs: now + PROVIDER_CACHE_STALE_IF_ERROR_MS,
    cacheRefreshWarning: {
      kind: 'provider-targets',
      message: 'Using last saved provider targets while cats-runtime reconnects.',
    },
  });
}

function seedProviderCatalogsFromSnapshot(
  runtimeClient: RuntimeClient,
  snapshot: ProviderSnapshot,
): void {
  if (snapshot.catalogs.length === 0) {
    return;
  }
  const cacheState = getProviderCatalogCacheState(runtimeClient);
  const now = Date.now();
  for (const entry of snapshot.catalogs) {
    const cacheKey = buildProviderCatalogCacheKey({
      provider: entry.provider,
      instance: entry.instance,
    });
    if (entry.models && !cacheState.models.entries.has(cacheKey)) {
      cacheState.models.entries.set(cacheKey, {
        lifecycle: 'error_backoff',
        value: entry.models,
        freshUntilMs: 0,
        staleUntilMs: 0,
        staleIfErrorUntilMs: now + PROVIDER_CACHE_STALE_IF_ERROR_MS,
        cacheRefreshWarning: {
          kind: 'model-catalog',
          message: 'Using last saved model catalog while cats-runtime reconnects.',
        },
      });
    }
    if (entry.advanced && !cacheState.advanced.entries.has(cacheKey)) {
      cacheState.advanced.entries.set(cacheKey, {
        lifecycle: 'error_backoff',
        value: entry.advanced,
        freshUntilMs: 0,
        staleUntilMs: 0,
        staleIfErrorUntilMs: now + PROVIDER_CACHE_STALE_IF_ERROR_MS,
        cacheRefreshWarning: {
          kind: 'model-catalog',
          message: 'Using last saved model catalog while cats-runtime reconnects.',
        },
      });
    }
  }
}

export async function seedProviderSelectorFromSnapshot(
  runtimeClient: RuntimeClient,
  snapshotPath: string,
  options: {
    onSnapshotPersisted?: () => void;
  } = {},
): Promise<void> {
  const snapshot = await loadProviderSnapshot(snapshotPath);
  if (snapshot) {
    seedTruthfulProviderRegistryFromSnapshot(runtimeClient, snapshot);
    seedProviderCatalogsFromSnapshot(runtimeClient, snapshot);
  }
  configureProviderSnapshotPersistence(runtimeClient, snapshotPath, {
    writeNotifier: options.onSnapshotPersisted,
  });
}

export async function warmProviderSelectorCache(
  runtimeClient: RuntimeClient,
): Promise<void> {
  const cacheState = getTruthfulProviderRegistryCacheState(runtimeClient);
  let registry: TruthfulProviderRegistryReadModel;
  try {
    registry = await refreshTruthfulProviderRegistry({ runtimeClient }, cacheState);
  } catch {
    return;
  }
  if (registry.state !== 'ready') {
    return;
  }

  const catalogCacheState = getProviderCatalogCacheState(runtimeClient);
  await Promise.allSettled(
    registry.providers.map(async (provider) => {
      const defaultInstanceId = provider.defaultInstance
        ?? provider.instances.find((candidate) => candidate.default)?.id
        ?? provider.instances[0]?.id
        ?? null;
      if (!defaultInstanceId) {
        return;
      }
      await Promise.allSettled([
        readProviderCatalogCached({
          cacheState: catalogCacheState.models,
          provider: provider.id,
          instance: defaultInstanceId,
          load: () => runtimeClient.getProviderModels(provider.id, defaultInstanceId),
          runtimeClient,
        }),
        readProviderCatalogCached({
          cacheState: catalogCacheState.advanced,
          provider: provider.id,
          instance: defaultInstanceId,
          load: () => runtimeClient.getAdvancedProviderModels(
            provider.id,
            defaultInstanceId,
          ),
          runtimeClient,
        }),
      ]);
    }),
  );
}

export async function bootstrapProviderSelector(
  runtimeClient: RuntimeClient,
  options: {
    snapshotPath?: string | null;
    onSnapshotPersisted?: () => void;
  } = {},
): Promise<void> {
  const snapshotPath = options.snapshotPath?.trim() || null;
  if (snapshotPath) {
    await seedProviderSelectorFromSnapshot(runtimeClient, snapshotPath, {
      onSnapshotPersisted: options.onSnapshotPersisted,
    });
  }
  await warmProviderSelectorCache(runtimeClient);
}

function isSelectableAvailabilityStatus(status: string | null | undefined): boolean {
  return status === 'ok' || status === 'degraded';
}

function findDiagnosticsForProvider(
  payload: RuntimeProviderDiagnosticsPayload,
  providerId: string,
): RuntimeProviderDiagnosticsEntry[] {
  return payload.providers.filter((entry) => entry.provider === providerId);
}

function listSelectableDiagnosticsForProvider(
  payload: RuntimeProviderDiagnosticsPayload,
  providerId: string,
): RuntimeProviderDiagnosticsEntry[] {
  return findDiagnosticsForProvider(payload, providerId)
    .filter((entry) => isSelectableAvailabilityStatus(entry.availability.status));
}

function findInstanceDiagnostic(
  entries: RuntimeProviderDiagnosticsEntry[],
  instanceId: string,
  backend: string | null,
): RuntimeProviderDiagnosticsEntry | null {
  return entries.find((entry) => entry.instance === instanceId)
    ?? entries.find((entry) =>
      entry.instance === null
      && backend !== null
      && entry.backend === backend)
    ?? null;
}

function mergeTruthfulProviderRegistryFromRuntimeConfig(
  provider: ProductProviderDescriptor,
  runtimeConfig: RuntimeProviderConfigRegistry,
  diagnosticsEntries: RuntimeProviderDiagnosticsEntry[],
): ProductProviderDescriptor | null {
  const runtimeProvider = runtimeConfig[provider.id];
  if (!runtimeProvider) {
    return null;
  }

  const instances: ProductProviderInstanceDescriptor[] = runtimeProvider.instances
    .filter((instance) => {
      const diagnostic = findInstanceDiagnostic(
        diagnosticsEntries,
        instance.id,
        instance.backend,
      );
      return isSelectableAvailabilityStatus(diagnostic?.availability.status);
    })
    .map((instance) => ({
      id: instance.id,
      label: instance.target ?? instance.id,
      target: instance.target,
      backend: instance.backend,
      default: runtimeProvider.defaultInstance === instance.id,
      eventCapabilities: instance.eventCapabilities,
    }));

  if (instances.length === 0) {
    return null;
  }

  const defaultInstance = instances.find((instance) => instance.default)?.id
    ?? instances[0]?.id
    ?? null;
  const defaultBackend = instances.find((instance) => instance.id === defaultInstance)?.backend
    ?? runtimeProvider.defaultBackend
    ?? instances[0]?.backend
    ?? provider.defaultBackend;

  return {
    ...provider,
    defaultInstance,
    defaultBackend,
    instances,
  };
}

function resolveDiagnosticsInstanceId(
  entry: RuntimeProviderDiagnosticsEntry,
): string {
  return entry.instance?.trim()
    || entry.backend?.trim()
    || 'default';
}

function resolveDiagnosticsInstanceTarget(
  entry: RuntimeProviderDiagnosticsEntry,
): string | null {
  const instanceId = entry.instance?.trim() || '';
  const backend = entry.backend?.trim() || '';
  if (instanceId) {
    if (instanceId.includes('/')) {
      return instanceId;
    }
    return backend ? `${backend}/${instanceId}` : instanceId;
  }
  return backend ? `${backend}/default` : null;
}

function resolveDiagnosticsInstanceLabel(
  entry: RuntimeProviderDiagnosticsEntry,
): string {
  return resolveDiagnosticsInstanceTarget(entry)
    ?? entry.backend?.trim()
    ?? 'default';
}

function buildDiagnosticsOnlyProviderDescriptor(
  provider: ProductProviderDescriptor,
  diagnosticsEntries: RuntimeProviderDiagnosticsEntry[],
): ProductProviderDescriptor | null {
  const instancesById = new Map<string, ProductProviderInstanceDescriptor>();

  for (const entry of diagnosticsEntries) {
    const instanceId = resolveDiagnosticsInstanceId(entry);
    const staticInstance = provider.instances.find((candidate) =>
      candidate.id === instanceId
      || (
        candidate.target !== null
        && candidate.target === resolveDiagnosticsInstanceTarget(entry)
      ));
    const target = staticInstance?.target ?? resolveDiagnosticsInstanceTarget(entry);
    instancesById.set(instanceId, {
      id: instanceId,
      label: staticInstance?.label ?? resolveDiagnosticsInstanceLabel(entry),
      target,
      backend: staticInstance?.backend ?? entry.backend,
      default: entry.defaultTarget,
      eventCapabilities: staticInstance?.eventCapabilities ?? null,
    });
  }

  const instances = [...instancesById.values()];
  if (instances.length === 0) {
    return null;
  }

  const defaultInstance = instances.find((instance) => instance.default)?.id
    ?? instances.find((instance) => instance.id === provider.defaultInstance)?.id
    ?? instances[0]?.id
    ?? null;
  const defaultBackend = instances.find((instance) => instance.id === defaultInstance)?.backend
    ?? instances[0]?.backend
    ?? provider.defaultBackend;

  return {
    ...provider,
    defaultInstance,
    defaultBackend,
    instances: instances.map((instance) => ({
      ...instance,
      default: instance.id === defaultInstance,
    })),
  };
}

function mergeTruthfulProviderRegistry(
  productProviders: ProductProviderDescriptor[],
  runtimeConfig: RuntimeProviderConfigRegistry | null,
  diagnostics: RuntimeProviderDiagnosticsPayload,
): ProductProviderDescriptor[] {
  return productProviders.flatMap((provider) => {
    const diagnosticsEntries = listSelectableDiagnosticsForProvider(diagnostics, provider.id);
    if (diagnosticsEntries.length === 0) {
      return [];
    }

    const merged = runtimeConfig
      ? mergeTruthfulProviderRegistryFromRuntimeConfig(provider, runtimeConfig, diagnosticsEntries)
      : null;
    if (merged) {
      return [merged];
    }

    const diagnosticsOnly = buildDiagnosticsOnlyProviderDescriptor(provider, diagnosticsEntries);
    return diagnosticsOnly ? [diagnosticsOnly] : [];
  });
}

function getTruthfulProviderRegistryCacheState(
  runtimeClient: RuntimeClient,
): TruthfulProviderRegistryCacheState {
  let state = truthfulProviderRegistryCache.get(runtimeClient);
  if (!state) {
    state = {
      entries: new Map(),
      inflight: new Map(),
    };
    truthfulProviderRegistryCache.set(runtimeClient, state);
  }
  return state;
}

const TRUTHFUL_PROVIDER_REGISTRY_CACHE_KEY = '*';

function shouldCacheTruthfulProviderRegistry(
  value: TruthfulProviderRegistryReadModel,
): boolean {
  return value.state !== 'runtime_unreachable';
}

function appendProviderCacheWarning(
  warnings: string[] | undefined,
  warning: string,
): string[] {
  const existing = Array.isArray(warnings) ? warnings : [];
  return existing.includes(warning) ? existing : [...existing, warning];
}

function appendTruthfulProviderRegistryWarning(
  value: TruthfulProviderRegistryReadModel,
  warning: string,
): TruthfulProviderRegistryReadModel {
  return {
    ...value,
    warnings: appendProviderCacheWarning(value.warnings, warning),
  };
}

function appendProviderCatalogWarning<TCatalog extends { warnings?: string[] }>(
  value: TCatalog,
  warning: string,
): TCatalog {
  return {
    ...value,
    warnings: appendProviderCacheWarning(value.warnings, warning),
  };
}

function readProviderCacheValue<TValue>(
  cached: ProviderTimedCacheEntry<TValue>,
  appendWarning: (value: TValue, warning: string) => TValue,
): TValue {
  return cached.lifecycle === 'error_backoff'
    ? appendWarning(cached.value, cached.cacheRefreshWarning.message)
    : cached.value;
}

function writeProviderCacheErrorBackoff<TValue>(
  cached: ProviderTimedCacheEntry<TValue>,
  cacheRefreshWarning: ProviderCacheRefreshWarning,
  appendWarning: (value: TValue, warning: string) => TValue,
  writeEntry: (entry: ProviderTimedCacheEntry<TValue>) => void,
): TValue {
  const now = Date.now();
  writeEntry({
    ...cached,
    lifecycle: 'error_backoff',
    freshUntilMs: now + PROVIDER_CACHE_ERROR_BACKOFF_MS,
    staleUntilMs: Math.max(cached.staleUntilMs, now + PROVIDER_CACHE_ERROR_BACKOFF_MS),
    staleIfErrorUntilMs: cached.staleIfErrorUntilMs,
    cacheRefreshWarning,
  });
  return appendWarning(cached.value, cacheRefreshWarning.message);
}

function readRuntimeFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function readRuntimeRequestStatus(error: unknown): number | null {
  if (
    error
    && typeof error === 'object'
    && 'status' in error
    && typeof error.status === 'number'
  ) {
    return error.status;
  }
  return null;
}

function shouldServeStaleProviderCatalogForError(error: unknown): boolean {
  const status = readRuntimeRequestStatus(error);
  return status === null || status >= 500 || status === 429;
}

function readTruthfulProviderRegistryFailureMessage(
  value: TruthfulProviderRegistryReadModel,
): string {
  return value.warnings?.[0] ?? 'cats-runtime is unavailable.';
}

function deriveTruthfulProviderRegistryForProvider(
  source: TruthfulProviderRegistryReadModel,
  providerId: string,
): TruthfulProviderRegistryReadModel {
  if (source.state !== 'ready') {
    return source;
  }

  const provider = source.providers.find((entry) => entry.id === providerId);
  if (!provider) {
    return {
      state: 'no_usable_targets',
      providers: [],
      recovery: {
        openRuntimeSetupPath: '/runtime/setup',
      },
      ...(source.warnings ? { warnings: [...source.warnings] } : {}),
    };
  }

  return {
    state: 'ready',
    providers: [provider],
    ...(source.warnings ? { warnings: [...source.warnings] } : {}),
  };
}

async function readProviderConfig(
  dependencies: ProviderRouteDependencies,
): Promise<RuntimeProviderConfigRegistry> {
  return dependencies.runtimeClient.getProviderConfig({ selector: true });
}

async function readProviderDiagnostics(
  dependencies: ProviderRouteDependencies,
  options: {
    provider?: string | null;
  } = {},
): Promise<RuntimeProviderDiagnosticsPayload> {
  return dependencies.runtimeClient.getProviderDiagnostics({
    ...(options.provider?.trim() ? { provider: options.provider.trim() } : {}),
    scope: 'availability',
  });
}

async function readProviderConfigBestEffort(
  dependencies: ProviderRouteDependencies,
): Promise<RuntimeProviderConfigRegistry | null> {
  const task = readProviderConfig(dependencies)
    .then((value) => ({
      status: 'fulfilled' as const,
      value,
    }))
    .catch(() => ({
      status: 'rejected' as const,
    }));
  const timeoutToken = Symbol('selector-config-timeout');
  const winner = await Promise.race([
    task,
    new Promise<typeof timeoutToken>((resolve) => {
      setTimeout(() => resolve(timeoutToken), TRUTHFUL_SELECTOR_CONFIG_ENRICHMENT_BUDGET_MS);
    }),
  ]);

  if (winner === timeoutToken) {
    return null;
  }

  return winner.status === 'fulfilled' ? winner.value : null;
}

async function loadTruthfulProviderRegistryFromRuntime(
  dependencies: ProviderRouteDependencies,
  options: {
    provider?: string | null;
  } = {},
): Promise<TruthfulProviderRegistryReadModel> {
  const requestedProvider = options.provider?.trim() || null;
  const configTask = readProviderConfigBestEffort(dependencies);

  let diagnostics: RuntimeProviderDiagnosticsPayload;
  try {
    diagnostics = await readProviderDiagnostics(dependencies, {
      provider: requestedProvider,
    });
  } catch (error) {
    return {
      state: 'runtime_unreachable',
      providers: [],
      recovery: {
        retryable: true,
      },
      warnings: [error instanceof Error
        ? error.message
        : 'cats-runtime is unavailable.'],
    };
  }

  const configuredProductProviders = listProductProviders().filter((provider) =>
    (!requestedProvider || provider.id === requestedProvider)
    && listSelectableDiagnosticsForProvider(diagnostics, provider.id).length > 0
  );

  if (configuredProductProviders.length === 0) {
    return {
      state: 'no_usable_targets',
      providers: [],
      recovery: {
        openRuntimeSetupPath: '/runtime/setup',
      },
    };
  }

  const runtimeConfig = await configTask;
  const providers = mergeTruthfulProviderRegistry(
    configuredProductProviders,
    runtimeConfig ?? null,
    diagnostics,
  );

  if (providers.length === 0) {
    return {
      state: 'no_usable_targets',
      providers: [],
      recovery: {
        openRuntimeSetupPath: '/runtime/setup',
      },
    };
  }

  return {
    state: 'ready',
    providers,
  };
}

async function refreshTruthfulProviderRegistry(
  dependencies: ProviderRouteDependencies,
  cacheState: TruthfulProviderRegistryCacheState,
): Promise<TruthfulProviderRegistryReadModel> {
  const cacheKey = TRUTHFUL_PROVIDER_REGISTRY_CACHE_KEY;
  const inflight = cacheState.inflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const refreshPromise = loadTruthfulProviderRegistryFromRuntime(dependencies)
    .then((value) => {
      const now = Date.now();
      if (shouldCacheTruthfulProviderRegistry(value)) {
        cacheState.entries.set(cacheKey, {
          lifecycle: 'fresh',
          value,
          freshUntilMs: now + TRUTHFUL_SELECTOR_CACHE_TTL_MS,
          staleUntilMs: now + TRUTHFUL_SELECTOR_CACHE_TTL_MS + TRUTHFUL_SELECTOR_STALE_WINDOW_MS,
          staleIfErrorUntilMs: now + PROVIDER_CACHE_STALE_IF_ERROR_MS,
        });
        notifyProviderCacheUpdated(dependencies.runtimeClient);
        return value;
      }

      const cached = cacheState.entries.get(cacheKey);
      if (cached && cached.staleIfErrorUntilMs > now) {
        return writeTruthfulProviderRegistryErrorBackoff(cacheState, cacheKey, cached, value);
      }

      // No prior baseline and the probe failed. Cache the failure briefly so
      // back-to-back probes within PROVIDER_CACHE_ERROR_BACKOFF_MS reuse the
      // same response instead of all paying the diagnostics timeout. The TTL
      // is short enough that a recovering runtime is re-probed promptly.
      cacheState.entries.set(cacheKey, {
        lifecycle: 'fresh',
        value,
        freshUntilMs: now + PROVIDER_CACHE_ERROR_BACKOFF_MS,
        staleUntilMs: now + PROVIDER_CACHE_ERROR_BACKOFF_MS,
        staleIfErrorUntilMs: now + PROVIDER_CACHE_ERROR_BACKOFF_MS,
      });
      return value;
    })
    .finally(() => {
      cacheState.inflight.delete(cacheKey);
    });

  cacheState.inflight.set(cacheKey, refreshPromise);
  return refreshPromise;
}

async function readTruthfulProviderRegistry(
  dependencies: ProviderRouteDependencies,
  options: {
    provider?: string | null;
  } = {},
): Promise<TruthfulProviderRegistryReadModel> {
  const cacheState = getTruthfulProviderRegistryCacheState(dependencies.runtimeClient);
  const cacheKey = TRUTHFUL_PROVIDER_REGISTRY_CACHE_KEY;
  const now = Date.now();
  const cached = cacheState.entries.get(cacheKey);
  const requestedProvider = options.provider?.trim() || null;

  const project = (value: TruthfulProviderRegistryReadModel): TruthfulProviderRegistryReadModel =>
    requestedProvider
      ? deriveTruthfulProviderRegistryForProvider(value, requestedProvider)
      : value;

  if (cached && cached.freshUntilMs > now) {
    return project(readProviderCacheValue(cached, appendTruthfulProviderRegistryWarning));
  }

  if (cached && cached.staleUntilMs > now) {
    void refreshTruthfulProviderRegistry(dependencies, cacheState).catch(() => {});
    return project(readProviderCacheValue(cached, appendTruthfulProviderRegistryWarning));
  }

  if (cached && cached.staleIfErrorUntilMs > now) {
    void refreshTruthfulProviderRegistry(dependencies, cacheState).catch(() => {});
    return project(appendTruthfulProviderRegistryWarning(
      readProviderCacheValue(cached, appendTruthfulProviderRegistryWarning),
      PROVIDER_TARGETS_CACHE_REVALIDATION_WARNING,
    ));
  }

  if (requestedProvider) {
    // Cold scoped: ask runtime with the provider filter so it can serve a
    // narrow probe instead of waiting on unrelated targets. Defer the
    // background root warm until the scoped foreground completes — starting
    // a full-catalog probe first would let it claim runtime health probe
    // slots ahead of the scoped request and recreate the 8s timeout risk.
    const scopedRegistry = await loadTruthfulProviderRegistryFromRuntime(
      dependencies,
      { provider: requestedProvider },
    );
    void refreshTruthfulProviderRegistry(dependencies, cacheState).catch(() => {});
    return scopedRegistry;
  }

  return project(await refreshTruthfulProviderRegistry(dependencies, cacheState));
}

function writeTruthfulProviderRegistryErrorBackoff(
  cacheState: TruthfulProviderRegistryCacheState,
  cacheKey: string,
  cached: TruthfulProviderRegistryCacheEntry,
  failedRefresh: TruthfulProviderRegistryReadModel,
): TruthfulProviderRegistryReadModel {
  return writeProviderCacheErrorBackoff(
    cached,
    {
      kind: 'provider-targets',
      message: `${PROVIDER_TARGETS_CACHE_REFRESH_WARNING_PREFIX} ${
        readTruthfulProviderRegistryFailureMessage(failedRefresh)
      }`,
    },
    appendTruthfulProviderRegistryWarning,
    (entry) => cacheState.entries.set(cacheKey, entry),
  );
}

function getProviderCatalogCacheState(
  runtimeClient: RuntimeClient,
): ProviderCatalogCacheState {
  let state = providerCatalogCache.get(runtimeClient);
  if (!state) {
    state = {
      models: {
        entries: new Map(),
        inflight: new Map(),
      },
      advanced: {
        entries: new Map(),
        inflight: new Map(),
      },
    };
    providerCatalogCache.set(runtimeClient, state);
  }
  return state;
}

function buildProviderCatalogCacheKey(input: {
  provider: string;
  instance?: string | null;
}): string {
  return [
    input.provider.trim(),
    input.instance?.trim() || '',
  ].join('\u0000');
}

function readProviderCatalogCacheEntry<TCatalog extends { warnings?: string[] }>(
  cacheState: ProviderCatalogTypedCacheState<TCatalog>,
  cacheKey: string,
): ProviderCatalogCacheEntry<TCatalog> | undefined {
  return cacheState.entries.get(cacheKey);
}

function writeProviderCatalogCacheEntry<TCatalog extends { warnings?: string[] }>(
  cacheState: ProviderCatalogTypedCacheState<TCatalog>,
  cacheKey: string,
  value: TCatalog,
): void {
  const now = Date.now();
  cacheState.entries.set(cacheKey, {
    lifecycle: 'fresh',
    value,
    freshUntilMs: now + PROVIDER_MODEL_CATALOG_CACHE_TTL_MS,
    staleUntilMs: now
      + PROVIDER_MODEL_CATALOG_CACHE_TTL_MS
      + PROVIDER_MODEL_CATALOG_STALE_WINDOW_MS,
    staleIfErrorUntilMs: now + PROVIDER_CACHE_STALE_IF_ERROR_MS,
  });
}

function writeProviderCatalogErrorBackoff<TCatalog extends { warnings?: string[] }>(
  cacheState: ProviderCatalogTypedCacheState<TCatalog>,
  cacheKey: string,
  cached: ProviderCatalogCacheEntry<TCatalog>,
  error: unknown,
): TCatalog {
  return writeProviderCacheErrorBackoff(
    cached,
    {
      kind: 'model-catalog',
      message: `${MODEL_CATALOG_CACHE_REFRESH_WARNING_PREFIX} ${
        readRuntimeFailureMessage(error, 'Runtime catalog unavailable.')
      }`,
    },
    appendProviderCatalogWarning,
    (entry) => cacheState.entries.set(cacheKey, entry),
  );
}

function pruneExpiredProviderCatalogCacheEntries<TCatalog extends { warnings?: string[] }>(
  cacheState: ProviderCatalogTypedCacheState<TCatalog>,
  now: number,
): void {
  for (const [cacheKey, cached] of cacheState.entries) {
    if (cached.staleIfErrorUntilMs <= now && !cacheState.inflight.has(cacheKey)) {
      cacheState.entries.delete(cacheKey);
    }
  }
}

function refreshProviderCatalogCacheEntry<TCatalog extends { warnings?: string[] }>(
  cacheState: ProviderCatalogTypedCacheState<TCatalog>,
  cacheKey: string,
  load: () => Promise<TCatalog>,
  runtimeClient?: RuntimeClient,
): Promise<TCatalog> {
  const inflight = cacheState.inflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const refreshPromise = load()
    .then((value) => {
      writeProviderCatalogCacheEntry(cacheState, cacheKey, value);
      if (runtimeClient) {
        notifyProviderCacheUpdated(runtimeClient);
      }
      return value;
    })
    .catch((error) => {
      const cached = readProviderCatalogCacheEntry(cacheState, cacheKey);
      if (
        shouldServeStaleProviderCatalogForError(error)
        && cached
        && cached.staleIfErrorUntilMs > Date.now()
      ) {
        return writeProviderCatalogErrorBackoff<TCatalog>(cacheState, cacheKey, cached, error);
      }
      throw error;
    })
    .finally(() => {
      cacheState.inflight.delete(cacheKey);
    });

  cacheState.inflight.set(cacheKey, refreshPromise);
  return refreshPromise;
}

async function readProviderCatalogCached<TCatalog extends { warnings?: string[] }>(input: {
  cacheState: ProviderCatalogTypedCacheState<TCatalog>;
  provider: string;
  instance?: string | null;
  load: () => Promise<TCatalog>;
  runtimeClient?: RuntimeClient;
}): Promise<TCatalog> {
  const cacheKey = buildProviderCatalogCacheKey(input);
  const now = Date.now();
  pruneExpiredProviderCatalogCacheEntries(input.cacheState, now);
  const cached = readProviderCatalogCacheEntry(input.cacheState, cacheKey);

  if (cached && cached.freshUntilMs > now) {
    return readProviderCacheValue(cached, appendProviderCatalogWarning);
  }

  if (cached && cached.staleUntilMs > now) {
    void refreshProviderCatalogCacheEntry(
      input.cacheState,
      cacheKey,
      input.load,
      input.runtimeClient,
    ).catch(() => {});
    return readProviderCacheValue(cached, appendProviderCatalogWarning);
  }

  if (cached && cached.staleIfErrorUntilMs > now) {
    void refreshProviderCatalogCacheEntry(
      input.cacheState,
      cacheKey,
      input.load,
      input.runtimeClient,
    ).catch(() => {});
    return appendProviderCatalogWarning(
      readProviderCacheValue(cached, appendProviderCatalogWarning),
      MODEL_CATALOG_CACHE_REVALIDATION_WARNING,
    );
  }

  return refreshProviderCatalogCacheEntry(
    input.cacheState,
    cacheKey,
    input.load,
    input.runtimeClient,
  );
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
  });
  response.end(body);
}

function sendRestError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  const payload: { error: { code: string; message: string; details?: Record<string, unknown> } } = {
    error: { code, message },
  };
  if (details) {
    payload.error.details = details;
  }
  sendJson(response, statusCode, payload);
}

export async function handleProviderRegistry(
  dependencies: ProviderRouteDependencies,
  response: ServerResponse,
  options: { force?: boolean } = {},
): Promise<void> {
  if (options.force) {
    const cacheState = getTruthfulProviderRegistryCacheState(dependencies.runtimeClient);
    sendJson(response, 200, await refreshTruthfulProviderRegistry(dependencies, cacheState));
    return;
  }
  sendJson(response, 200, await readTruthfulProviderRegistry(dependencies));
}

export async function handleProviderModels(
  response: ServerResponse,
  dependencies: ProviderRouteDependencies,
  provider: string,
  instance?: string | null,
): Promise<void> {
  if (!isKnownProvider(provider)) {
    sendRestError(response, 404, 'provider_not_found', `Provider not found: ${provider}`);
    return;
  }

  const registry = await readTruthfulProviderRegistry(dependencies, { provider });
  if (registry.state === 'runtime_unreachable') {
    sendRestError(
      response,
      503,
      'runtime_unreachable',
      registry.warnings?.[0] ?? 'cats-runtime is unavailable.',
      { provider, instance: instance ?? null },
    );
    return;
  }

  const providerDescriptor = registry.providers.find((entry) => entry.id === provider);
  if (!providerDescriptor) {
    sendRestError(
      response,
      409,
      'provider_target_unavailable',
      `No usable ${provider} target is currently available in cats-runtime.`,
      { provider, instance: instance ?? null },
    );
    return;
  }

  const normalizedInstance = instance?.trim() || null;
  if (normalizedInstance && !providerDescriptor.instances.some((entry) => entry.id === normalizedInstance)) {
    sendRestError(
      response,
      409,
      'provider_target_unavailable',
      `${provider} instance "${normalizedInstance}" is not currently usable in cats-runtime.`,
      { provider, instance: normalizedInstance },
    );
    return;
  }

  try {
    const providerCatalogCacheState = getProviderCatalogCacheState(dependencies.runtimeClient);
    const catalog = await readProviderCatalogCached({
      cacheState: providerCatalogCacheState.models,
      provider,
      instance: normalizedInstance,
      load: () => dependencies.runtimeClient.getProviderModels(provider, normalizedInstance),
      runtimeClient: dependencies.runtimeClient,
    });
    sendJson(response, 200, { catalog });
  } catch (error) {
    const runtimeError = error as RuntimeRequestError | Error;
    if ('status' in runtimeError && typeof runtimeError.status === 'number' && runtimeError.status < 500) {
      sendRestError(
        response,
        runtimeError.status === 404 || runtimeError.status === 429 ? runtimeError.status : 400,
        'provider_catalog_lookup_failed',
        runtimeError.message,
        { provider, instance: instance ?? null },
      );
      return;
    }

    sendRestError(
      response,
      503,
      'provider_catalog_unavailable',
      error instanceof Error ? error.message : 'Runtime catalog unavailable.',
      { provider, instance: normalizedInstance },
    );
  }
}

export async function handleAdvancedProviderModels(
  response: ServerResponse,
  dependencies: ProviderRouteDependencies,
  provider: string,
  instance?: string | null,
): Promise<void> {
  if (!isKnownProvider(provider)) {
    sendRestError(response, 404, 'provider_not_found', `Provider not found: ${provider}`);
    return;
  }

  const registry = await readTruthfulProviderRegistry(dependencies, { provider });
  if (registry.state === 'runtime_unreachable') {
    sendRestError(
      response,
      503,
      'runtime_unreachable',
      registry.warnings?.[0] ?? 'cats-runtime is unavailable.',
      { provider, instance: instance ?? null },
    );
    return;
  }

  const providerDescriptor = registry.providers.find((entry) => entry.id === provider);
  if (!providerDescriptor) {
    sendRestError(
      response,
      409,
      'provider_target_unavailable',
      `No usable ${provider} target is currently available in cats-runtime.`,
      { provider, instance: instance ?? null },
    );
    return;
  }

  const normalizedInstance = instance?.trim() || null;
  if (normalizedInstance && !providerDescriptor.instances.some((entry) => entry.id === normalizedInstance)) {
    sendRestError(
      response,
      409,
      'provider_target_unavailable',
      `${provider} instance "${normalizedInstance}" is not currently usable in cats-runtime.`,
      { provider, instance: normalizedInstance },
    );
    return;
  }

  try {
    const providerCatalogCacheState = getProviderCatalogCacheState(dependencies.runtimeClient);
    const catalog = await readProviderCatalogCached({
      cacheState: providerCatalogCacheState.advanced,
      provider,
      instance: normalizedInstance,
      load: () => dependencies.runtimeClient.getAdvancedProviderModels(provider, normalizedInstance),
      runtimeClient: dependencies.runtimeClient,
    });
    sendJson(response, 200, { catalog });
  } catch (error) {
    const runtimeError = error as RuntimeRequestError | Error;
    if ('status' in runtimeError && typeof runtimeError.status === 'number' && runtimeError.status < 500) {
      sendRestError(
        response,
        runtimeError.status === 404 || runtimeError.status === 429 ? runtimeError.status : 400,
        'provider_advanced_catalog_lookup_failed',
        runtimeError.message,
        { provider, instance: instance ?? null },
      );
      return;
    }

    sendRestError(
      response,
      503,
      'provider_advanced_catalog_unavailable',
      error instanceof Error ? error.message : 'Runtime advanced catalog unavailable.',
      { provider, instance: normalizedInstance },
    );
  }
}

interface RefreshProviderCatalogsResult {
  refreshed: number;
  failures: Array<{ provider: string; instance: string | null; message: string }>;
}

async function refreshProviderCatalogsInternal(
  dependencies: ProviderRouteDependencies,
): Promise<RefreshProviderCatalogsResult> {
  const registry = await readTruthfulProviderRegistry(dependencies);
  if (registry.state !== 'ready') {
    throw new Error(
      registry.warnings?.[0] ?? 'cats-runtime did not report any usable providers to refresh.',
    );
  }

  const cacheState = getProviderCatalogCacheState(dependencies.runtimeClient);
  const failures: RefreshProviderCatalogsResult['failures'] = [];
  let refreshed = 0;

  const tasks: Array<Promise<void>> = [];
  for (const provider of registry.providers) {
    for (const instance of provider.instances) {
      const task = (async () => {
        try {
          const [models, advanced] = await Promise.all([
            dependencies.runtimeClient.getProviderModels(provider.id, instance.id, { forceRefresh: true }),
            dependencies.runtimeClient.getAdvancedProviderModels(provider.id, instance.id, { forceRefresh: true }),
          ]);
          const cacheKey = buildProviderCatalogCacheKey({ provider: provider.id, instance: instance.id });
          writeProviderCatalogCacheEntry(cacheState.models, cacheKey, models);
          writeProviderCatalogCacheEntry(cacheState.advanced, cacheKey, advanced);
          notifyProviderCacheUpdated(dependencies.runtimeClient);
          refreshed += 1;
        } catch (error) {
          failures.push({
            provider: provider.id,
            instance: instance.id,
            message: error instanceof Error ? error.message : 'Runtime catalog refresh failed.',
          });
        }
      })();
      tasks.push(task);
    }
  }

  await Promise.all(tasks);
  return { refreshed, failures };
}

export async function handleRefreshProviderCatalogs(
  dependencies: ProviderRouteDependencies,
  response: ServerResponse,
): Promise<void> {
  try {
    const result = await refreshProviderCatalogsInternal(dependencies);
    sendJson(response, 200, result);
  } catch (error) {
    sendRestError(
      response,
      503,
      'provider_catalog_refresh_failed',
      error instanceof Error ? error.message : 'Failed to refresh provider model catalogs.',
    );
  }
}
