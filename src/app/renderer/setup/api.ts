import type {
  ProductProviderDescriptor,
  ProductProviderInstanceDescriptor,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../shared/providerCatalog.js';
import { normalizeProductProviderEventCapabilities } from '../../../shared/providerCatalog.js';
import type {
  ProductBootstrapDiagnosticsReadModel,
} from '../../../shared/bootstrapDiagnostics.js';
import type {
  SuiteHostEnvelope,
  SuiteSetupCompleteInput,
} from '../../../shared/suite-contract.js';
import type {
  RuntimeSetupSummary,
  SuiteRuntimeSetupApplyInput,
  SuiteRuntimeSetupScanInput,
} from '../../../shared/runtimeSetup.js';

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

export async function fetchRuntimeSetup(
  signal?: AbortSignal,
): Promise<RuntimeSetupSummary> {
  const response = await fetch('/api/suite/runtime-setup', {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to load runtime setup (${response.status})`));
  }

  return (await response.json()) as RuntimeSetupSummary;
}

export async function scanRuntimeSetup(
  input: SuiteRuntimeSetupScanInput = {},
  signal?: AbortSignal,
): Promise<RuntimeSetupSummary> {
  const response = await fetch('/api/suite/runtime-setup/scan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Runtime scan failed (${response.status})`));
  }

  return (await response.json()) as RuntimeSetupSummary;
}

export async function applyRuntimeSetup(
  input: SuiteRuntimeSetupApplyInput = {},
  signal?: AbortSignal,
): Promise<RuntimeSetupSummary> {
  const response = await fetch('/api/suite/runtime-setup/apply', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Runtime apply failed (${response.status})`));
  }

  return (await response.json()) as RuntimeSetupSummary;
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

export async function markSuiteSetupOpened(
  attemptId?: string | null,
  signal?: AbortSignal,
): Promise<ProductBootstrapDiagnosticsReadModel> {
  const response = await fetch('/api/suite/bootstrap-diagnostics/opened', {
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
