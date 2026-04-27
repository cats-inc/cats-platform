import type {
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../shared/providerCatalog.js';
import type {
  ProductBootstrapDiagnosticsReadModel,
} from '../../../shared/bootstrapDiagnostics.js';
import type {
  PlatformHostEnvelope,
  PlatformSetupCompleteInput,
} from '../../../shared/platform-contract.js';
import {
  fetchProviderAdvancedCatalogFromClientCache,
  fetchProviderModelCatalogFromClientCache,
} from '../providerCatalogClient.js';
import { fetchProviderRegistryFromClientCache } from '../providerRegistryClient.js';

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.error?.message === 'string') {
      return payload.error.message;
    }
  } catch { /* ignore */ }
  return fallback;
}

export async function completePlatformSetup(
  input: PlatformSetupCompleteInput,
  signal?: AbortSignal,
): Promise<PlatformHostEnvelope> {
  const response = await fetch('/api/platform/setup/complete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Setup failed (${response.status})`));
  }

  return (await response.json()) as PlatformHostEnvelope;
}

export async function fetchPlatformEnvelope(
  signal?: AbortSignal,
): Promise<PlatformHostEnvelope> {
  const response = await fetch('/api/app-shell', {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to load app state (${response.status})`);
  }

  return (await response.json()) as PlatformHostEnvelope;
}

export async function markPlatformSetupOpened(
  attemptId?: string | null,
  signal?: AbortSignal,
): Promise<ProductBootstrapDiagnosticsReadModel> {
  const response = await fetch('/api/platform/bootstrap-diagnostics/opened', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ attemptId: attemptId ?? null }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to record setup open (${response.status})`));
  }

  return (await response.json()) as ProductBootstrapDiagnosticsReadModel;
}

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
