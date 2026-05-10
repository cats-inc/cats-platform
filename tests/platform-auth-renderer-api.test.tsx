import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlatformAuthApiError,
  fetchPlatformAuthStatus,
  linkPlatformGoogle,
  loginPlatformGoogle,
  loginPlatformLocal,
  logoutPlatformSession,
  readPlatformAuthApiErrorMessage,
  runPlatformAuthCsrfMutation,
  setupPlatformGoogle,
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
    await setupPlatformGoogle({ credential: 'setup-id-token', csrfToken: 'setup-csrf' }, options);
    await linkPlatformGoogle(
      { credential: 'link-id-token', csrfToken: 'link-gis-csrf' },
      'link-cats-csrf',
      options,
    );
    await logoutPlatformSession('cats-csrf', options);

    assert.equal(calls[0]?.input, '/api/auth/google/login');
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      credential: 'id-token',
      csrfToken: 'gis-csrf',
    });
    assert.equal(calls[1]?.input, '/api/auth/google/setup');
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
      credential: 'setup-id-token',
      csrfToken: 'setup-csrf',
    });
    assert.equal(calls[2]?.input, '/api/auth/google/link');
    assert.equal(
      (calls[2]?.init?.headers as Record<string, string>)['x-cats-csrf-token'],
      'link-cats-csrf',
    );
    assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
      credential: 'link-id-token',
      csrfToken: 'link-gis-csrf',
    });
    assert.equal(calls[3]?.input, '/api/auth/logout');
    assert.equal(
      (calls[3]?.init?.headers as Record<string, string>)['x-cats-csrf-token'],
      'cats-csrf',
    );
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

test('renderer auth csrf mutation refreshes status and retries once on csrf mismatch', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    if (input === '/api/auth/status') {
      const csrfToken = calls.filter((call) => call.input === '/api/auth/status').length === 1
        ? 'stale-csrf'
        : 'fresh-csrf';
      return jsonResponse({
        authenticated: true,
        principal: null,
        csrfToken,
        providers: { google: { enabled: false, clientId: null } },
      });
    }
    const csrfHeader = readHeader(init, 'x-cats-csrf-token');
    if (csrfHeader === 'stale-csrf') {
      return jsonResponse({
        error: {
          code: PLATFORM_AUTH_ERROR_CODES.csrfMismatch,
          message: 'server wording may change',
        },
      }, { status: 403 });
    }
    return jsonResponse({
      authenticated: false,
      principal: null,
      csrfToken: null,
      providers: { google: { enabled: false, clientId: null } },
    });
  };
  try {
    const result = await runPlatformAuthCsrfMutation(
      (csrfToken) => logoutPlatformSession(csrfToken, fallbackOptions()),
      fallbackOptions(),
    );

    assert.equal(result.authenticated, false);
    assert.deepEqual(calls.map((call) => call.input), [
      '/api/auth/status',
      '/api/auth/logout',
      '/api/auth/status',
      '/api/auth/logout',
    ]);
    assert.equal(readHeader(calls[1]?.init, 'x-cats-csrf-token'), 'stale-csrf');
    assert.equal(readHeader(calls[3]?.init, 'x-cats-csrf-token'), 'fresh-csrf');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('renderer auth csrf mutation does not retry non-csrf authorization failures', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    if (input === '/api/auth/status') {
      return jsonResponse({
        authenticated: true,
        principal: null,
        csrfToken: 'csrf-token',
        providers: { google: { enabled: false, clientId: null } },
      });
    }
    return jsonResponse({
      error: {
        code: PLATFORM_AUTH_ERROR_CODES.forbidden,
        message: 'forbidden wording may change',
      },
    }, { status: 403 });
  };
  try {
    await assert.rejects(
      () => runPlatformAuthCsrfMutation(
        (csrfToken) => logoutPlatformSession(csrfToken, fallbackOptions()),
        fallbackOptions(),
      ),
      (error) =>
        error instanceof PlatformAuthApiError
        && error.code === PLATFORM_AUTH_ERROR_CODES.forbidden,
    );

    assert.deepEqual(calls.map((call) => call.input), [
      '/api/auth/status',
      '/api/auth/logout',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('renderer auth csrf mutation surfaces a second csrf mismatch as hard error', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    if (input === '/api/auth/status') {
      return jsonResponse({
        authenticated: true,
        principal: null,
        csrfToken: `csrf-${calls.filter((call) => call.input === '/api/auth/status').length}`,
        providers: { google: { enabled: false, clientId: null } },
      });
    }
    return jsonResponse({
      error: {
        code: PLATFORM_AUTH_ERROR_CODES.csrfMismatch,
        message: 'still stale',
      },
    }, { status: 403 });
  };
  try {
    await assert.rejects(
      () => runPlatformAuthCsrfMutation(
        (csrfToken) => logoutPlatformSession(csrfToken, fallbackOptions()),
        fallbackOptions(),
      ),
      (error) =>
        error instanceof PlatformAuthApiError
        && error.code === PLATFORM_AUTH_ERROR_CODES.csrfMismatch,
    );

    assert.deepEqual(calls.map((call) => call.input), [
      '/api/auth/status',
      '/api/auth/logout',
      '/api/auth/status',
      '/api/auth/logout',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

function readHeader(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers)) {
    return null;
  }
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  return headers[name] ?? null;
}
