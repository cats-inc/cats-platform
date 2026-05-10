import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchPlatformAuthStatus,
  loginPlatformGoogle,
  loginPlatformLocal,
  logoutPlatformSession,
  readPlatformAuthApiErrorMessage,
} from '../src/app/renderer/auth/api.ts';
import { PLATFORM_AUTH_ERROR_CODES } from '../src/platform/auth/errorCodes.ts';

test('renderer auth api fetches status and posts local login JSON', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return jsonResponse({
      authenticated: input === '/api/auth/login',
      principal: null,
      csrfToken: 'csrf-token',
      providers: { google: { enabled: false, clientId: null } },
    });
  };
  try {
    const options = fallbackOptions();
    const status = await fetchPlatformAuthStatus(options);
    const login = await loginPlatformLocal({
      identifier: 'owner@example.test',
      password: 'correct-password',
    }, options);

    assert.equal(status.csrfToken, 'csrf-token');
    assert.equal(login.authenticated, true);
    assert.equal(calls[0]?.input, '/api/auth/status');
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.Accept, 'application/json');
    assert.equal(calls[1]?.input, '/api/auth/login');
    assert.equal(calls[1]?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
      identifier: 'owner@example.test',
      password: 'correct-password',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('renderer auth api posts google credential and logout csrf header', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return jsonResponse({
      authenticated: true,
      principal: null,
      csrfToken: 'next-csrf-token',
      providers: { google: { enabled: true, clientId: 'client-id' } },
    });
  };
  try {
    const options = fallbackOptions();
    await loginPlatformGoogle({ credential: 'id-token', csrfToken: 'gis-csrf' }, options);
    await logoutPlatformSession('cats-csrf', options);

    assert.equal(calls[0]?.input, '/api/auth/google/login');
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      credential: 'id-token',
      csrfToken: 'gis-csrf',
    });
    assert.equal(calls[1]?.input, '/api/auth/logout');
    assert.equal((calls[1]?.init?.headers as Record<string, string>)['x-cats-csrf-token'], 'cats-csrf');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('renderer auth api maps pinned error codes instead of matching messages', async () => {
  const message = await readPlatformAuthApiErrorMessage(
    jsonResponse({
      error: {
        code: PLATFORM_AUTH_ERROR_CODES.csrfMismatch,
        message: 'server wording may change',
      },
    }, { status: 403 }),
    {
      fallbackMessageForStatus: (status) => `status ${status}`,
      errorMessagesByCode: {
        [PLATFORM_AUTH_ERROR_CODES.csrfMismatch]: 'Refresh auth status and retry.',
      },
    },
  );

  assert.equal(message, 'Refresh auth status and retry.');
});

function fallbackOptions() {
  return {
    fallbackMessageForStatus: (status: number) => `Request failed (${status}).`,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}
