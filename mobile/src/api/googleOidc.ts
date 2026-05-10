import * as Linking from 'expo-linking';

export interface MobileGoogleOidcRequestInput {
  clientIds: readonly string[];
  timeoutMs?: number;
}

export type MobileGoogleOidcRequestResult =
  | { status: 'success'; idToken: string; nonce: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

const GOOGLE_OIDC_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_GOOGLE_OIDC_TIMEOUT_MS = 120_000;

export async function requestMobileGoogleOidcIdToken(
  input: MobileGoogleOidcRequestInput,
): Promise<MobileGoogleOidcRequestResult> {
  const clientId = input.clientIds.map((value) => value.trim()).find(Boolean);
  if (!clientId) {
    return { status: 'unavailable' };
  }

  const redirectUri = Linking.createURL('auth/google');
  const state = createOpaqueToken();
  const nonce = createOpaqueToken();
  const authUrl = buildMobileGoogleOidcAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    nonce,
  });

  let subscription: { remove: () => void } | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    subscription?.remove();
    subscription = null;
  };
  const completion = new Promise<MobileGoogleOidcRequestResult>((resolve) => {
    timeoutId = setTimeout(() => {
      cleanup();
      resolve({ status: 'cancelled' });
    }, input.timeoutMs ?? DEFAULT_GOOGLE_OIDC_TIMEOUT_MS);

    subscription = Linking.addEventListener('url', (event) => {
      const result = readMobileGoogleOidcRedirect(event.url, { redirectUri, state, nonce });
      if (!result) {
        return;
      }
      cleanup();
      resolve(result);
    });
  });

  try {
    await Linking.openURL(authUrl);
  } catch {
    cleanup();
    return { status: 'unavailable' };
  }

  return completion;
}

export function buildMobileGoogleOidcAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    state: input.state,
    nonce: input.nonce,
    // Force account choice for every login so mobile does not silently bind
    // a stale Google account selected by a previous browser/session.
    prompt: 'select_account',
  });
  return `${GOOGLE_OIDC_AUTHORIZATION_URL}?${params.toString()}`;
}

export function readMobileGoogleOidcRedirect(
  url: string,
  expected: { redirectUri: string; state: string; nonce: string },
): MobileGoogleOidcRequestResult | null {
  if (!isExpectedRedirectUrl(url, expected.redirectUri)) {
    return null;
  }
  const params = readUrlParams(url);
  if (params.get('state') !== expected.state) {
    return { status: 'cancelled' };
  }
  const idToken = params.get('id_token')?.trim();
  if (!idToken) {
    return { status: 'cancelled' };
  }
  return { status: 'success', idToken, nonce: expected.nonce };
}

function isExpectedRedirectUrl(url: string, redirectUri: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(redirectUri);
    return actual.protocol === expected.protocol
      && actual.host === expected.host
      && actual.pathname === expected.pathname;
  } catch {
    return false;
  }
}

function readUrlParams(url: string): URLSearchParams {
  const fragmentIndex = url.indexOf('#');
  if (fragmentIndex >= 0) {
    return new URLSearchParams(url.slice(fragmentIndex + 1));
  }
  const queryIndex = url.indexOf('?');
  if (queryIndex >= 0) {
    return new URLSearchParams(url.slice(queryIndex + 1));
  }
  return new URLSearchParams();
}

function createOpaqueToken(): string {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random source is unavailable for Google sign-in.');
  }
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
