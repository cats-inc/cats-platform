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

const PROVIDER_CATALOG_REFRESH_FAILED_STATUS_PREFIX =
  'provider_catalog.refresh_failed_status:';

function createProviderCatalogRefreshFailedStatusMessage(status: number): string {
  return `${PROVIDER_CATALOG_REFRESH_FAILED_STATUS_PREFIX}${status}`;
}

export function readProviderCatalogRefreshFailedStatus(
  message: string,
): number | null {
  if (!message.startsWith(PROVIDER_CATALOG_REFRESH_FAILED_STATUS_PREFIX)) {
    return null;
  }
  const status = Number(message.slice(PROVIDER_CATALOG_REFRESH_FAILED_STATUS_PREFIX.length));
  return Number.isInteger(status) ? status : null;
}

export async function refreshProviderModelCatalogs(): Promise<RefreshProviderCatalogsResult> {
  const response = await fetch('/api/providers/models/refresh', {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    let message = createProviderCatalogRefreshFailedStatusMessage(response.status);
    try {
      const body = await response.json() as {
        error?: { code?: string; message?: string };
      };
      if (body.error?.code === 'provider_catalog_refresh_failed') {
        message = createProviderCatalogRefreshFailedStatusMessage(response.status);
      } else if (typeof body.error?.message === 'string') {
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
