import type {
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../../shared/providerCatalog.js';
import {
  clearProviderCatalogClientCache,
  fetchProviderAdvancedCatalogFromClientCache,
  fetchProviderModelCatalogFromClientCache,
} from '../../../../app/renderer/providerCatalogClient.js';
import { fetchProviderRegistryFromClientCache } from '../../../../app/renderer/providerRegistryClient.js';

export async function fetchProviderRegistry(options?: {
  force?: boolean;
}): Promise<ProductProviderRegistryReadModel> {
  return fetchProviderRegistryFromClientCache(options);
}

export async function fetchProviderModels(
  provider: string,
  instance?: string | null,
): Promise<ProviderModelCatalog> {
  return fetchProviderModelCatalogFromClientCache({ provider, instance });
}

export async function fetchAdvancedProviderModels(
  provider: string,
  instance?: string | null,
): Promise<ProviderAdvancedModelCatalog> {
  return fetchProviderAdvancedCatalogFromClientCache({ provider, instance });
}

export interface RefreshProviderCatalogsResult {
  refreshed: number;
  failures: Array<{ provider: string; instance: string | null; message: string }>;
}

export async function refreshProviderModelCatalogs(): Promise<RefreshProviderCatalogsResult> {
  const response = await fetch('/api/providers/models/refresh', {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    let message = `Refresh failed (${response.status})`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (typeof body.error?.message === 'string') {
        message = body.error.message;
      }
    } catch {
      // fall through with default message
    }
    throw new Error(message);
  }
  const result = await response.json() as RefreshProviderCatalogsResult;
  // Server cache is already populated by the refresh; drop any stale entries
  // the renderer was holding onto so the next fetch surfaces the fresh data.
  clearProviderCatalogClientCache();
  return result;
}
