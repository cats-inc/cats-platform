import type { ServerResponse } from 'node:http';

import {
  isKnownProvider,
  listProductProviders,
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

interface ProviderRouteDependencies {
  runtimeClient: RuntimeClient;
}

type ProviderRegistryState = 'ready' | 'no_usable_targets' | 'runtime_unreachable';
const TRUTHFUL_SELECTOR_CACHE_TTL_MS = 5_000;
const TRUTHFUL_SELECTOR_STALE_WINDOW_MS = 15_000;
const TRUTHFUL_SELECTOR_CONFIG_ENRICHMENT_BUDGET_MS = 500;

interface TruthfulProviderRegistryReadModel {
  state: ProviderRegistryState;
  providers: ProductProviderDescriptor[];
  recovery?: {
    retryable?: boolean;
    openRuntimeSetupPath?: string;
  };
  warnings?: string[];
}

interface TruthfulProviderRegistryCacheEntry {
  value: TruthfulProviderRegistryReadModel;
  freshUntilMs: number;
  staleUntilMs: number;
}

interface TruthfulProviderRegistryCacheState {
  entries: Map<string, TruthfulProviderRegistryCacheEntry>;
  inflight: Map<string, Promise<TruthfulProviderRegistryReadModel>>;
}

const truthfulProviderRegistryCache = new WeakMap<RuntimeClient, TruthfulProviderRegistryCacheState>();

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

function buildTruthfulProviderRegistryCacheKey(
  options: {
    provider?: string | null;
  } = {},
): string {
  return options.provider?.trim() || '*';
}

function shouldCacheTruthfulProviderRegistry(
  value: TruthfulProviderRegistryReadModel,
): boolean {
  return value.state !== 'runtime_unreachable';
}

function writeTruthfulProviderRegistryCacheEntry(
  cacheState: TruthfulProviderRegistryCacheState,
  cacheKey: string,
  value: TruthfulProviderRegistryReadModel,
  timing: {
    freshUntilMs?: number;
    staleUntilMs?: number;
  } = {},
): void {
  if (!shouldCacheTruthfulProviderRegistry(value)) {
    return;
  }

  const now = Date.now();
  cacheState.entries.set(cacheKey, {
    value,
    freshUntilMs: timing.freshUntilMs ?? (now + TRUTHFUL_SELECTOR_CACHE_TTL_MS),
    staleUntilMs: timing.staleUntilMs ?? (
      now + TRUTHFUL_SELECTOR_CACHE_TTL_MS + TRUTHFUL_SELECTOR_STALE_WINDOW_MS
    ),
  });
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
  cacheKey: string,
  options: {
    provider?: string | null;
  } = {},
): Promise<TruthfulProviderRegistryReadModel> {
  const inflight = cacheState.inflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const refreshPromise = loadTruthfulProviderRegistryFromRuntime(dependencies, options)
    .then((value) => {
      if (shouldCacheTruthfulProviderRegistry(value)) {
        const now = Date.now();
        cacheState.entries.set(cacheKey, {
          value,
          freshUntilMs: now + TRUTHFUL_SELECTOR_CACHE_TTL_MS,
          staleUntilMs: now + TRUTHFUL_SELECTOR_CACHE_TTL_MS + TRUTHFUL_SELECTOR_STALE_WINDOW_MS,
        });
      }
      return value;
    })
    .finally(() => {
      cacheState.inflight.delete(cacheKey);
    });

  cacheState.inflight.set(cacheKey, refreshPromise);
  return refreshPromise;
}

function tryReadTruthfulProviderRegistryFromRootCache(
  dependencies: ProviderRouteDependencies,
  cacheState: TruthfulProviderRegistryCacheState,
  provider: string,
  now: number,
): TruthfulProviderRegistryReadModel | Promise<TruthfulProviderRegistryReadModel> | null {
  const rootCacheKey = buildTruthfulProviderRegistryCacheKey();
  const rootCached = cacheState.entries.get(rootCacheKey);
  if (rootCached && rootCached.staleUntilMs > now) {
    const derived = deriveTruthfulProviderRegistryForProvider(rootCached.value, provider);
    writeTruthfulProviderRegistryCacheEntry(
      cacheState,
      buildTruthfulProviderRegistryCacheKey({ provider }),
      derived,
      {
        freshUntilMs: rootCached.freshUntilMs,
        staleUntilMs: rootCached.staleUntilMs,
      },
    );

    if (rootCached.freshUntilMs <= now) {
      void refreshTruthfulProviderRegistry(
        dependencies,
        cacheState,
        rootCacheKey,
      ).catch(() => {});
    }

    return derived;
  }

  const rootInflight = cacheState.inflight.get(rootCacheKey);
  if (rootInflight) {
    return rootInflight.then((value) => {
      const derived = deriveTruthfulProviderRegistryForProvider(value, provider);
      writeTruthfulProviderRegistryCacheEntry(
        cacheState,
        buildTruthfulProviderRegistryCacheKey({ provider }),
        derived,
      );
      return derived;
    });
  }

  return null;
}

async function readTruthfulProviderRegistry(
  dependencies: ProviderRouteDependencies,
  options: {
    provider?: string | null;
  } = {},
): Promise<TruthfulProviderRegistryReadModel> {
  const cacheState = getTruthfulProviderRegistryCacheState(dependencies.runtimeClient);
  const cacheKey = buildTruthfulProviderRegistryCacheKey(options);
  const now = Date.now();
  const cached = cacheState.entries.get(cacheKey);

  if (cached && cached.freshUntilMs > now) {
    return cached.value;
  }

  if (cached && cached.staleUntilMs > now) {
    void refreshTruthfulProviderRegistry(dependencies, cacheState, cacheKey, options).catch(() => {});
    return cached.value;
  }

  const requestedProvider = options.provider?.trim() || null;
  if (requestedProvider) {
    const cachedFromRoot = tryReadTruthfulProviderRegistryFromRootCache(
      dependencies,
      cacheState,
      requestedProvider,
      now,
    );
    if (cachedFromRoot) {
      return cachedFromRoot;
    }
  }

  return refreshTruthfulProviderRegistry(dependencies, cacheState, cacheKey, options);
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
): Promise<void> {
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

  const registry = await readTruthfulProviderRegistry(dependencies);
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
    const catalog = await dependencies.runtimeClient.getProviderModels(provider, normalizedInstance);
    sendJson(response, 200, { catalog });
  } catch (error) {
    const runtimeError = error as RuntimeRequestError | Error;
    if ('status' in runtimeError && typeof runtimeError.status === 'number' && runtimeError.status < 500) {
      sendRestError(
        response,
        runtimeError.status === 404 ? 404 : 400,
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

  const registry = await readTruthfulProviderRegistry(dependencies);
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
    const catalog = await dependencies.runtimeClient.getAdvancedProviderModels(provider, normalizedInstance);
    sendJson(response, 200, { catalog });
  } catch (error) {
    const runtimeError = error as RuntimeRequestError | Error;
    if ('status' in runtimeError && typeof runtimeError.status === 'number' && runtimeError.status < 500) {
      sendRestError(
        response,
        runtimeError.status === 404 ? 404 : 400,
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
