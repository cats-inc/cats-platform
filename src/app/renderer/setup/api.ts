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
import { PLATFORM_AUTH_ERROR_CODES } from '../../../platform/auth/errorCodes.js';

interface SetupApiRequestOptions {
  signal?: AbortSignal;
  fallbackMessageForStatus: (status: number) => string;
  errorMessagesByCode?: Readonly<Record<string, string>>;
}

interface SetupApiErrorDetails {
  message: string;
  code: string | null;
}

export class PlatformSetupApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'PlatformSetupApiError';
  }
}

export function isUnauthenticatedPlatformEnvelopeError(error: unknown): boolean {
  return error instanceof PlatformSetupApiError
    && error.status === 401
    && (
      error.code === null
      || error.code === PLATFORM_AUTH_ERROR_CODES.unauthenticated
    );
}

export async function readSetupApiErrorMessage(
  response: Response,
  options: SetupApiRequestOptions,
): Promise<string> {
  return (await readSetupApiErrorDetails(response, options)).message;
}

async function readSetupApiErrorDetails(
  response: Response,
  options: SetupApiRequestOptions,
): Promise<SetupApiErrorDetails> {
  try {
    const payload = await response.json() as unknown;
    const error = readSetupApiErrorPayload(payload);
    if (typeof error?.code === 'string') {
      const mappedMessage = options.errorMessagesByCode?.[error.code];
      if (mappedMessage) {
        return { message: mappedMessage, code: error.code };
      }
      return {
        message: options.fallbackMessageForStatus(response.status),
        code: error.code,
      };
    }
    if (typeof error?.message === 'string') {
      return { message: error.message, code: null };
    }
  } catch { /* ignore */ }
  return { message: options.fallbackMessageForStatus(response.status), code: null };
}

function readSetupApiErrorPayload(payload: unknown): { code?: unknown; message?: unknown } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === 'object' && error !== null
    ? error as { code?: unknown; message?: unknown }
    : null;
}

function readAuthBootstrapRouteTarget(payload: unknown): 'setup' | 'login' | 'repair' | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  if (!('routeTarget' in payload) || !('auth' in payload) || !('setup' in payload)) {
    return null;
  }
  const routeTarget = (payload as { routeTarget?: unknown }).routeTarget;
  return routeTarget === 'setup' || routeTarget === 'login' || routeTarget === 'repair'
    ? routeTarget
    : null;
}

export async function completePlatformSetup(
  input: PlatformSetupCompleteInput,
  options: SetupApiRequestOptions,
): Promise<PlatformHostEnvelope> {
  const response = await fetch('/api/platform/setup/complete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSetupApiErrorMessage(response, options));
  }

  return (await response.json()) as PlatformHostEnvelope;
}

export async function fetchPlatformEnvelope(
  options: SetupApiRequestOptions,
): Promise<PlatformHostEnvelope> {
  const response = await fetch('/api/app-shell', {
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });

  if (!response.ok) {
    const details = await readSetupApiErrorDetails(response, options);
    throw new PlatformSetupApiError(details.message, response.status, details.code);
  }

  const payload = await response.json() as unknown;
  const routeTarget = readAuthBootstrapRouteTarget(payload);
  if (routeTarget === 'login') {
    throw new PlatformSetupApiError(
      'Authentication is required.',
      401,
      PLATFORM_AUTH_ERROR_CODES.unauthenticated,
    );
  }
  if (routeTarget === 'repair') {
    throw new PlatformSetupApiError(
      'Auth repair is required.',
      403,
      PLATFORM_AUTH_ERROR_CODES.forbidden,
    );
  }

  return payload as PlatformHostEnvelope;
}

export async function markPlatformSetupOpened(
  attemptId: string | null,
  options: SetupApiRequestOptions,
): Promise<ProductBootstrapDiagnosticsReadModel> {
  const response = await fetch('/api/platform/bootstrap-diagnostics/opened', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ attemptId: attemptId ?? null }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSetupApiErrorMessage(response, options));
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
