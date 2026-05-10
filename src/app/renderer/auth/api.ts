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

interface PlatformAuthApiErrorDetails {
  message: string;
  code: PlatformAuthErrorCode | null;
}

export class PlatformAuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: PlatformAuthErrorCode | null,
  ) {
    super(message);
    this.name = 'PlatformAuthApiError';
  }
}

export function isPlatformAuthApiErrorWithCode(
  error: unknown,
  code: PlatformAuthErrorCode,
): error is PlatformAuthApiError {
  return error instanceof PlatformAuthApiError && error.code === code;
}

export async function readPlatformAuthApiErrorMessage(
  response: Response,
  options: PlatformAuthApiRequestOptions,
): Promise<string> {
  return (await readPlatformAuthApiErrorDetails(response, options)).message;
}

async function readPlatformAuthApiErrorDetails(
  response: Response,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthApiErrorDetails> {
  try {
    const payload = await response.json() as unknown;
    const error = readErrorPayload(payload);
    if (typeof error?.code === 'string') {
      const code = error.code as PlatformAuthErrorCode;
      const mappedMessage = options.errorMessagesByCode?.[code];
      if (mappedMessage) {
        return { message: mappedMessage, code };
      }
      return { message: options.fallbackMessageForStatus(response.status), code };
    }
    if (typeof error?.message === 'string') {
      return { message: error.message, code: null };
    }
  } catch {
    // Fall through to the status-based message.
  }
  return { message: options.fallbackMessageForStatus(response.status), code: null };
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

export async function setupPlatformGoogle(
  input: PlatformAuthGoogleLoginInput,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  const response = await fetch('/api/auth/google/setup', {
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

export async function linkPlatformGoogle(
  input: PlatformAuthGoogleLoginInput,
  csrfToken: string,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  const response = await fetch('/api/auth/google/link', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      'x-cats-csrf-token': csrfToken,
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

export async function runPlatformAuthCsrfMutation<T>(
  mutation: (csrfToken: string) => Promise<T>,
  options: PlatformAuthApiRequestOptions,
): Promise<T> {
  const firstStatus = await fetchPlatformAuthStatus(options);
  const firstCsrfToken = readRequiredCsrfToken(firstStatus);
  try {
    return await mutation(firstCsrfToken);
  } catch (error) {
    if (!isPlatformAuthApiErrorWithCode(error, 'E_CSRF_MISMATCH')) {
      throw error;
    }
  }

  const refreshedStatus = await fetchPlatformAuthStatus(options);
  return mutation(readRequiredCsrfToken(refreshedStatus));
}

async function readPlatformAuthJsonResponse(
  response: Response,
  options: PlatformAuthApiRequestOptions,
): Promise<PlatformAuthStatusPayload> {
  if (!response.ok) {
    const details = await readPlatformAuthApiErrorDetails(response, options);
    throw new PlatformAuthApiError(details.message, response.status, details.code);
  }
  return (await response.json()) as PlatformAuthStatusPayload;
}

function readRequiredCsrfToken(status: PlatformAuthStatusPayload): string {
  const token = status.csrfToken?.trim();
  if (!token) {
    throw new PlatformAuthApiError(
      'Authenticated session did not return a Cats CSRF token.',
      403,
      'E_CSRF_MISMATCH',
    );
  }
  return token;
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
