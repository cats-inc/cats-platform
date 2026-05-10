import assert from 'node:assert/strict';
import test from 'node:test';

import mobileClientModule from '../mobile/src/api/client.ts';
import mobileAuthModule from '../mobile/src/api/auth.ts';

const { createMobileApiClient } = mobileClientModule as typeof import(
  '../mobile/src/api/client.ts'
);
const {
  fetchMobileAuthStatus,
  loginMobileLocal,
  logoutMobile,
} = mobileAuthModule as typeof import('../mobile/src/api/auth.ts');

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
  await logoutMobile(client);

  assert.equal(calls[0]?.url, 'http://127.0.0.1:3000/api/mobile/auth/login');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(readHeader(calls[0]?.init, 'Authorization'), null);
  assert.equal(calls[1]?.url, 'http://127.0.0.1:3000/api/mobile/auth/logout');
  assert.equal(calls[1]?.init?.method, 'POST');
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
