import type {
  ProductProviderDescriptor,
  ProductProviderInstanceDescriptor,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../../shared/providerCatalog.js';
import { normalizeProductProviderEventCapabilities } from '../../../../shared/providerCatalog.js';

import { readErrorMessage } from './http.js';

export async function fetchProviders(): Promise<ProductProviderDescriptor[]> {
  const response = await fetch('/api/providers');
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to load providers.'));
  }

  const payload = (await response.json()) as { providers?: ProductProviderDescriptor[] };
  if (!Array.isArray(payload.providers)) {
    return [];
  }

  return payload.providers.map((provider) => ({
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
  }));
}

export async function fetchProviderModels(
  provider: string,
  instance?: string | null,
): Promise<ProviderModelCatalog> {
  const url = new URL(`/api/providers/${encodeURIComponent(provider)}/models`, window.location.origin);
  if (instance?.trim()) {
    url.searchParams.set('instance', instance.trim());
  }

  const response = await fetch(`${url.pathname}${url.search}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to load provider models.'));
  }

  const payload = (await response.json()) as { catalog?: ProviderModelCatalog };
  if (!payload.catalog) {
    throw new Error('Provider catalog response was incomplete.');
  }

  return payload.catalog;
}

export async function fetchAdvancedProviderModels(
  provider: string,
  instance?: string | null,
): Promise<ProviderAdvancedModelCatalog> {
  const url = new URL(
    `/api/providers/${encodeURIComponent(provider)}/models/advanced`,
    window.location.origin,
  );
  if (instance?.trim()) {
    url.searchParams.set('instance', instance.trim());
  }

  const response = await fetch(`${url.pathname}${url.search}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to load advanced provider models.'));
  }

  const payload = (await response.json()) as { catalog?: ProviderAdvancedModelCatalog };
  if (!payload.catalog) {
    throw new Error('Advanced provider catalog response was incomplete.');
  }

  return payload.catalog;
}
