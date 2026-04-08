import type {
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../../shared/providerCatalog.js';
import { fetchProviderRegistryFromClientCache } from '../../../../app/renderer/providerRegistryClient.js';

import { readErrorMessage } from './http.js';

export async function fetchProviderRegistry(options?: {
  force?: boolean;
}): Promise<ProductProviderRegistryReadModel> {
  return fetchProviderRegistryFromClientCache(options);
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
