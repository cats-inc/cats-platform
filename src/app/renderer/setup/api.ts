import type {
  ProductProviderDescriptor,
  ProductProviderRegistryReadModel,
  ProductProviderInstanceDescriptor,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../shared/providerCatalog.js';
import { normalizeProductProviderEventCapabilities } from '../../../shared/providerCatalog.js';
import type {
  ProductBootstrapDiagnosticsReadModel,
} from '../../../shared/bootstrapDiagnostics.js';
import type {
  PlatformHostEnvelope,
  PlatformSetupCompleteInput,
} from '../../../shared/platform-contract.js';

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

export async function fetchProviders(): Promise<ProductProviderRegistryReadModel> {
  const response = await fetch('/api/providers');
  if (!response.ok) {
    return {
      state: 'runtime_unreachable',
      providers: [],
      recovery: {
        retryable: true,
      },
      warnings: [await readErrorMessage(response, 'Failed to load providers.')],
    };
  }

  const payload = (await response.json()) as ProductProviderRegistryReadModel;
  const providers = Array.isArray(payload.providers) ? payload.providers : [];

  return {
    state: payload.state ?? (providers.length > 0 ? 'ready' : 'no_usable_targets'),
    providers: providers.map((provider) => ({
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
    })),
    recovery: payload.recovery,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
}

export async function fetchProviderModels(
  provider: string,
  instance?: string | null,
): Promise<ProviderModelCatalog> {
  const url = new URL(
    `/api/providers/${encodeURIComponent(provider)}/models`,
    window.location.origin,
  );
  if (instance?.trim()) {
    url.searchParams.set('instance', instance.trim());
  }

  const response = await fetch(`${url.pathname}${url.search}`);
  if (!response.ok) {
    throw new Error('Failed to load provider models.');
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
    throw new Error('Failed to load advanced provider models.');
  }

  const payload = (await response.json()) as { catalog?: ProviderAdvancedModelCatalog };
  if (!payload.catalog) {
    throw new Error('Advanced provider catalog response was incomplete.');
  }

  return payload.catalog;
}
