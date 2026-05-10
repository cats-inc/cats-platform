import assert from 'node:assert/strict';
import test from 'node:test';

import mobileClientModule from '../mobile/src/api/client.ts';
import mobileAuthModule from '../mobile/src/api/auth.ts';
import mobileAuthSessionModule from '../mobile/src/api/authSession.ts';
import mobileAuthTokenStoreModule from '../mobile/src/api/authTokenStore.ts';

const { createMobileApiClient, createMobileApiClientWithStoredAuth } =
  mobileClientModule as typeof import('../mobile/src/api/client.ts');
const {
  fetchMobileAuthStatus,
  loginMobileGoogle,
  loginMobileLocal,
  logoutMobile,
} = mobileAuthModule as typeof import('../mobile/src/api/auth.ts');
const {
  loadMobileAuthenticatedSession,
  loginMobileGoogleSession,
  loginMobileLocalSession,
} = mobileAuthSessionModule as typeof import('../mobile/src/api/authSession.ts');
const { saveMobileAuthToken } = mobileAuthTokenStoreModule as typeof import(
  '../mobile/src/api/authTokenStore.ts'
);

test('mobile api client attaches bearer token only from runtime options', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({ authenticated: true, principal: null });
  }) as typeof fetch;

  const client = createMobileApiClient(
    { baseUrl: 'http://127.0.0.1:3000/' },
    { bearerToken: 'mobile-token' },
  );
  await fetchMobileAuthStatus(client);

  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/status');
  assert.equal(readHeader(calls[0]?.init, 'Authorization'), 'Bearer mobile-token');
});

test('mobile auth api wrappers use canonical mobile auth endpoints', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({ authenticated: false, principal: null, token: 'issued-token' });
  }) as typeof fetch;

  const client = createMobileApiClient({ baseUrl: 'http://127.0.0.1:3000' });
  await loginMobileLocal(client, {
    identifier: 'owner@example.test',
    password: 'correct-password',
    devicePlatform: 'ios',
  });
  await loginMobileGoogle(client, {
    idToken: 'mobile-google-id-token',
    nonce: 'mobile-google-nonce',
    devicePlatform: 'ios',
  });
  await logoutMobile(client);

  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/login');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(readHeader(calls[0]?.init, 'Authorization'), null);
  assert.equal(calls[1]?.url, 'http://127.0.0.1:3000/api/mobile/auth/google/login');
  assert.equal(calls[1]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    idToken: 'mobile-google-id-token',
    nonce: 'mobile-google-nonce',
    devicePlatform: 'ios',
  });
  assert.equal(calls[2]?.url, 'http://127.0.0.1:3000/api/mobile/auth/logout');
  assert.equal(calls[2]?.init?.method, 'POST');
});

test('mobile authenticated api client loads bearer token from secure storage boundary', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({ authenticated: true, principal: null });
  }) as typeof fetch;

  const storage = createMemorySecureStorage();
  await saveMobileAuthToken(storage, '  stored-mobile-token  ');

  const client = await createMobileApiClientWithStoredAuth(
    { baseUrl: 'http://127.0.0.1:3000/' },
    storage,
  );
  await fetchMobileAuthStatus(client);

  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/status');
  assert.equal(
    readHeader(calls[0]?.init, 'Authorization'),
    'Bearer stored-mobile-token',
  );
});

test('mobile authenticated api client omits authorization when secure store has no token', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({ authenticated: false, principal: null });
  }) as typeof fetch;

  const client = await createMobileApiClientWithStoredAuth(
    { baseUrl: 'http://127.0.0.1:3000/' },
    createMemorySecureStorage(),
  );
  await fetchMobileAuthStatus(client);

  assert.equal(readHeader(calls[0]?.init, 'Authorization'), null);
});

test('mobile authenticated session checks status before product data fetches', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith('/api/mobile/auth/status')) {
      return jsonResponse({
        authenticated: true,
        principal: {
          accountId: 'account-owner',
          displayName: 'Owner',
          email: 'owner@example.test',
          roles: ['owner', 'admin'],
          coreActorId: 'actor-owner',
          sessionId: 'session-mobile',
        },
      });
    }
    return jsonResponse({ products: { chat: true } });
  }) as typeof fetch;

  const storage = createMemorySecureStorage();
  await saveMobileAuthToken(storage, 'stored-mobile-token');

  const session = await loadMobileAuthenticatedSession(
    { baseUrl: 'http://127.0.0.1:3000' },
    storage,
  );
  assert.equal(session.kind, 'authenticated');
  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/status');
  assert.equal(readHeader(calls[0]?.init, 'Authorization'), 'Bearer stored-mobile-token');

  if (session.kind === 'authenticated') {
    await session.client.get('/api/app-shell');
  }
  assert.equal(calls[1]?.url, 'http://127.0.0.1:3000/api/app-shell');
  assert.equal(readHeader(calls[1]?.init, 'Authorization'), 'Bearer stored-mobile-token');
});

test('mobile authenticated session clears stale tokens before product data', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({ authenticated: false, principal: null });
  }) as typeof fetch;

  const storage = createMemorySecureStorage();
  await saveMobileAuthToken(storage, 'stale-mobile-token');

  const session = await loadMobileAuthenticatedSession(
    { baseUrl: 'http://127.0.0.1:3000' },
    storage,
  );
  assert.equal(session.kind, 'unauthenticated');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/status');
  assert.equal(await storage.getItemAsync('cats-mobile.authToken.v1'), null);
});

test('mobile local login stores the returned bearer token through secure storage', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({
      authenticated: true,
      principal: {
        accountId: 'account-owner',
        displayName: 'Owner',
        email: 'owner@example.test',
        roles: ['owner', 'admin'],
        coreActorId: 'actor-owner',
        sessionId: 'session-mobile',
      },
      token: 'issued-mobile-token',
    });
  }) as typeof fetch;

  const storage = createMemorySecureStorage();
  const status = await loginMobileLocalSession(
    { baseUrl: 'http://127.0.0.1:3000' },
    { identifier: 'owner@example.test', password: 'correct-password' },
    storage,
  );

  assert.equal(status.authenticated, true);
  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/login');
  assert.equal(await storage.getItemAsync('cats-mobile.authToken.v1'), 'issued-mobile-token');
});

test('mobile google login stores the returned bearer token through secure storage', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({
      authenticated: true,
      principal: {
        accountId: 'account-owner',
        displayName: 'Owner',
        email: 'owner@example.test',
        roles: ['owner', 'admin'],
        coreActorId: 'actor-owner',
        sessionId: 'session-mobile',
      },
      token: 'issued-mobile-google-token',
    });
  }) as typeof fetch;

  const storage = createMemorySecureStorage();
  const status = await loginMobileGoogleSession(
    { baseUrl: 'http://127.0.0.1:3000' },
    { idToken: 'mobile-google-id-token', nonce: 'mobile-google-nonce' },
    storage,
  );

  assert.equal(status.authenticated, true);
  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/google/login');
  assert.equal(await storage.getItemAsync('cats-mobile.authToken.v1'), 'issued-mobile-google-token');
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function readHeader(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    return headers instanceof Headers ? headers.get(name) : null;
  }
  return headers[name] ?? null;
}

function createMemorySecureStorage() {
  const values = new Map<string, string>();
  return {
    values,
    async getItemAsync(key: string): Promise<string | null> {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      values.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      values.delete(key);
    },
  };
}
