import type {
  ProductProviderDescriptor,
  ProductProviderInstanceDescriptor,
  ProviderModelCatalog,
} from '../../../shared/providerCatalog.js';
import type {
  SuiteHostEnvelope,
  SuiteSetupCompleteInput,
} from '../../../shared/suite-contract.js';

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.error?.message === 'string') {
      return payload.error.message;
    }
  } catch { /* ignore */ }
  return fallback;
}

export async function completeSuiteSetup(
  input: SuiteSetupCompleteInput,
  signal?: AbortSignal,
): Promise<SuiteHostEnvelope> {
  const response = await fetch('/api/suite/setup/complete', {
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

  return (await response.json()) as SuiteHostEnvelope;
}

export async function fetchSuiteEnvelope(
  signal?: AbortSignal,
): Promise<SuiteHostEnvelope> {
  const response = await fetch('/api/app-shell', {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to load app state (${response.status})`);
  }

  return (await response.json()) as SuiteHostEnvelope;
}

export async function fetchProviders(): Promise<ProductProviderDescriptor[]> {
  const response = await fetch('/api/providers');
  if (!response.ok) {
    return [];
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
        }))
      : [],
    modelsPath: provider.modelsPath,
  }));
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
