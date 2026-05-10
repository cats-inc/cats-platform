import type { PlatformAuthErrorCode } from '../../../platform/auth/errorCodes.js';

export interface PlatformAuthPrincipalSummary {
  accountId: string;
  displayName: string;
  email: string | null;
  roles: string[];
  coreActorId: string | null;
  sessionId: string;
}

export interface PlatformAuthProviderStatus {
  google: {
    enabled: boolean;
    clientId: string | null;
  };
}

export interface PlatformAuthStatusPayload {
  authenticated: boolean;
  principal: PlatformAuthPrincipalSummary | null;
  csrfToken: string | null;
  providers: PlatformAuthProviderStatus;
}

export interface PlatformAuthLocalLoginInput {
  identifier: string;
  password: string;
}

export interface PlatformAuthGoogleLoginInput {
  credential: string;
  csrfToken: string;
}

export interface PlatformAuthApiRequestOptions {
  signal?: AbortSignal;
  fallbackMessageForStatus: (status: number) => string;
  errorMessagesByCode?: Partial<Record<PlatformAuthErrorCode, string>>;
}

export async function readPlatformAuthApiErrorMessage(
  response: Response,
  options: PlatformAuthApiRequestOptions,
): Promise<string> {
  try {
    const payload = await response.json() as unknown;
    const error = readErrorPayload(payload);
    if (typeof error?.code === 'string') {
      const code = error.code as PlatformAuthErrorCode;
      const mappedMessage = options.errorMessagesByCode?.[code];
      if (mappedMessage) {
        return mappedMessage;
      }
      return options.fallbackMessageForStatus(response.status);
    }
    if (typeof error?.message === 'string') {
      return error.message;
    }
  } catch {
    // Fall through to the status-based message.
  }
  return options.fallbackMessageForStatus(response.status);
}

export async function fetchPlatformAuthStatus(
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  const response = await fetch('/api/auth/status', {
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  return readPlatformAuthJsonResponse(response, options);
}

export async function loginPlatformLocal(
  input: PlatformAuthLocalLoginInput,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  return readPlatformAuthJsonResponse(response, options);
}

export async function loginPlatformGoogle(
  input: PlatformAuthGoogleLoginInput,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  const response = await fetch('/api/auth/google/login', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  return readPlatformAuthJsonResponse(response, options);
}

export async function logoutPlatformSession(
  csrfToken: string,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      'x-cats-csrf-token': csrfToken,
    },
    body: JSON.stringify({}),
    signal: options.signal,
  });
  return readPlatformAuthJsonResponse(response, options);
}

async function readPlatformAuthJsonResponse(
  response: Response,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  if (!response.ok) {
    throw new Error(await readPlatformAuthApiErrorMessage(response, options));
  }
  return (await response.json()) as PlatformAuthStatusPayload;
}

function readErrorPayload(value: unknown): { code?: unknown; message?: unknown } | null {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return null;
  }
  const error = (value as { error?: unknown }).error;
  return typeof error === 'object' && error !== null
    ? error as { code?: unknown; message?: unknown }
    : null;
}
