import type { ServerResponse } from 'node:http';

import {
  createStaticProviderModelCatalog,
  isKnownProvider,
  listProductProviders,
  type ProductProviderDescriptor,
  type ProductProviderInstanceDescriptor,
} from '../../shared/providerCatalog.js';
import type {
  RuntimeProviderConfigRegistry,
  RuntimeRequestError,
  RuntimeClient,
} from '../../runtime/client.js';

interface ProviderRouteDependencies {
  runtimeClient: RuntimeClient;
}

function mergeProviderRegistry(
  productProviders: ProductProviderDescriptor[],
  runtimeConfig: RuntimeProviderConfigRegistry,
): ProductProviderDescriptor[] {
  return productProviders.map((provider) => {
    const runtimeProvider = runtimeConfig[provider.id];
    const instances: ProductProviderInstanceDescriptor[] = runtimeProvider?.instances.map((instance) => ({
      id: instance.id,
      label: instance.target ?? instance.id,
      target: instance.target,
      backend: instance.backend,
      default: runtimeProvider.defaultInstance === instance.id,
    })) ?? [];

    return {
      ...provider,
      defaultInstance: runtimeProvider?.defaultInstance ?? provider.defaultInstance,
      defaultBackend: runtimeProvider?.defaultBackend ?? provider.defaultBackend,
      instances,
    };
  });
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
  const productProviders = listProductProviders();

  try {
    const runtimeConfig = await dependencies.runtimeClient.getProviderConfig();
    sendJson(response, 200, { providers: mergeProviderRegistry(productProviders, runtimeConfig) });
  } catch {
    sendJson(response, 200, { providers: productProviders });
  }
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

  try {
    const catalog = await dependencies.runtimeClient.getProviderModels(provider, instance);
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

    const warning = error instanceof Error
      ? `Runtime catalog unavailable: ${error.message}`
      : 'Runtime catalog unavailable.';
    sendJson(response, 200, {
      catalog: createStaticProviderModelCatalog(provider, {
        instance: instance ?? null,
        warnings: [warning],
      }),
    });
  }
}
