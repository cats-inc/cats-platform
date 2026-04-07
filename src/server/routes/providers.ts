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

interface TruthfulProviderRegistryReadModel {
  state: ProviderRegistryState;
  providers: ProductProviderDescriptor[];
  recovery?: {
    retryable?: boolean;
    openRuntimeSetupPath?: string;
  };
  warnings?: string[];
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

function mergeTruthfulProviderRegistry(
  productProviders: ProductProviderDescriptor[],
  runtimeConfig: RuntimeProviderConfigRegistry,
  diagnostics: RuntimeProviderDiagnosticsPayload,
): ProductProviderDescriptor[] {
  return productProviders.flatMap((provider) => {
    const runtimeProvider = runtimeConfig[provider.id];
    if (!runtimeProvider) {
      return [];
    }

    const diagnosticsEntries = findDiagnosticsForProvider(diagnostics, provider.id);
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
      return [];
    }

    const defaultInstance = instances.find((instance) => instance.default)?.id
      ?? instances[0]?.id
      ?? null;
    const defaultBackend = instances.find((instance) => instance.id === defaultInstance)?.backend
      ?? runtimeProvider.defaultBackend
      ?? instances[0]?.backend
      ?? provider.defaultBackend;

    return [{
      ...provider,
      defaultInstance,
      defaultBackend,
      instances,
    }];
  });
}

async function readTruthfulProviderRegistry(
  dependencies: ProviderRouteDependencies,
): Promise<TruthfulProviderRegistryReadModel> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [runtimeConfig, diagnostics] = await Promise.all([
        dependencies.runtimeClient.getProviderConfig(),
        dependencies.runtimeClient.getProviderDiagnostics(),
      ]);

      const providers = mergeTruthfulProviderRegistry(
        listProductProviders(),
        runtimeConfig,
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
    } catch (error) {
      lastError = error;
    }
  }

  return {
    state: 'runtime_unreachable',
    providers: [],
    recovery: {
      retryable: true,
    },
    warnings: lastError instanceof Error ? [lastError.message] : ['cats-runtime is unavailable.'],
  };
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
