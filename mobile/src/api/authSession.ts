import {
  createMobileApiClient,
  type MobileApiClient,
  type MobileApiClientOptions,
} from './client';
import {
  fetchMobileAuthStatus,
  loginMobileLocal,
  logoutMobile,
  type MobileAuthPrincipalSummary,
  type MobileLocalLoginInput,
} from './auth';
import {
  clearMobileAuthToken,
  getDefaultMobileAuthTokenStorage,
  loadMobileAuthToken,
  saveMobileAuthToken,
  type MobileSecureTokenStorage,
} from './authTokenStore';
import type { ConnectionConfig } from './persistence';

export type MobileAuthenticatedSession =
  | { kind: 'unconfigured' }
  | {
      kind: 'unauthenticated';
      client: MobileApiClient;
    }
  | {
      kind: 'authenticated';
      client: MobileApiClient;
      bearerToken: string;
      principal: MobileAuthPrincipalSummary;
    };

export async function loadMobileAuthenticatedSession(
  config: ConnectionConfig,
  storage: MobileSecureTokenStorage = getDefaultMobileAuthTokenStorage(),
): Promise<MobileAuthenticatedSession> {
  if (!config.baseUrl) {
    return { kind: 'unconfigured' };
  }
  const bearerToken = await loadMobileAuthToken(storage);
  const client = createClient(config, { bearerToken });
  const status = await fetchMobileAuthStatus(client);
  if (!status.authenticated || !status.principal || !bearerToken) {
    await clearMobileAuthToken(storage);
    return {
      kind: 'unauthenticated',
      client: createClient(config),
    };
  }
  return {
    kind: 'authenticated',
    client,
    bearerToken,
    principal: status.principal,
  };
}

export async function loginMobileLocalSession(
  config: ConnectionConfig,
  input: MobileLocalLoginInput,
  storage: MobileSecureTokenStorage = getDefaultMobileAuthTokenStorage(),
) {
  if (!config.baseUrl) {
    return { authenticated: false, principal: null };
  }
  const client = createClient(config);
  const status = await loginMobileLocal(client, input);
  if (status.authenticated && status.token) {
    await saveMobileAuthToken(storage, status.token);
  } else {
    await clearMobileAuthToken(storage);
  }
  return status;
}

export async function logoutMobileSession(
  config: ConnectionConfig,
  storage: MobileSecureTokenStorage = getDefaultMobileAuthTokenStorage(),
): Promise<void> {
  if (!config.baseUrl) {
    await clearMobileAuthToken(storage);
    return;
  }
  const bearerToken = await loadMobileAuthToken(storage);
  try {
    if (bearerToken) {
      const client = createClient(config, { bearerToken });
      await logoutMobile(client);
    }
  } finally {
    await clearMobileAuthToken(storage);
  }
}

function createClient(
  config: ConnectionConfig,
  options: MobileApiClientOptions = {},
): MobileApiClient {
  return createMobileApiClient(config, options);
}
