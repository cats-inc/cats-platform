import type {
  ProductProviderDescriptor,
  ProviderModelCatalog,
} from './providerCatalog.js';
import { resolveProviderCatalogDefaultModel } from './providerCatalog.js';

export interface ProviderTargetSelection {
  provider: string;
  instance: string;
  model: string;
}

export function resolveSelectedProviderInstance(
  provider: ProductProviderDescriptor,
  requestedInstance: string,
): string {
  const normalizedRequested = requestedInstance.trim();
  if (normalizedRequested && provider.instances.some((instance) => instance.id === normalizedRequested)) {
    return normalizedRequested;
  }

  if (normalizedRequested && provider.instances.length > 0) {
    console.warn(`Unknown provider instance "${normalizedRequested}" for ${provider.id}, falling back to default`);
  }

  return provider.defaultInstance ?? provider.instances[0]?.id ?? '';
}

export function resolveCatalogTargetSelection(input: {
  target: ProviderTargetSelection;
  catalog: ProviderModelCatalog;
  preserveCurrentModel: boolean;
}): ProviderTargetSelection {
  const resolvedInstance = (input.catalog.instance ?? input.target.instance) || '';
  const hasCurrentModel = input.catalog.models.some((option) => option.id === input.target.model);
  const resolvedModel = input.preserveCurrentModel && hasCurrentModel
    ? input.target.model
    : resolveProviderCatalogDefaultModel(input.catalog);

  return {
    provider: input.target.provider,
    instance: resolvedInstance,
    model: resolvedModel,
  };
}
