import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';

import {
  fetchPlatformEnvelope,
  PlatformSetupApiError,
} from '../src/app/renderer/setup/api.ts';
import { PLATFORM_AUTH_ERROR_CODES } from '../src/platform/auth/errorCodes.ts';

test('fetchPlatformEnvelope routes minimal login bootstrap to unauthenticated state', async (t) => {
  mockFetch(t, {
    routeTarget: 'login',
    setup: { completeAt: '2026-05-10T00:00:00.000Z', required: false },
    auth: { authenticated: false, csrfToken: null },
  });

  await assert.rejects(
    () => fetchPlatformEnvelope(fallbackOptions()),
    (error) =>
      error instanceof PlatformSetupApiError
      && error.status === 401
      && error.code === PLATFORM_AUTH_ERROR_CODES.unauthenticated,
  );
});

test('fetchPlatformEnvelope routes minimal repair bootstrap to hard error state', async (t) => {
  mockFetch(t, {
    routeTarget: 'repair',
    setup: {
      completeAt: '2026-05-10T00:00:00.000Z',
      required: false,
      repairRequired: true,
    },
    auth: { authenticated: false, csrfToken: null },
  });

  await assert.rejects(
    () => fetchPlatformEnvelope(fallbackOptions()),
    (error) =>
      error instanceof PlatformSetupApiError
      && error.status === 403
      && error.code === PLATFORM_AUTH_ERROR_CODES.forbidden,
  );
});

function fallbackOptions() {
  return {
    fallbackMessageForStatus: (status: number) => `status ${status}`,
  };
}

function mockFetch(t: TestContext, body: unknown): void {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
}
