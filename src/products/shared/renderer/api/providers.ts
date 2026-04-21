import type {
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../../shared/providerCatalog.js';
import {
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
