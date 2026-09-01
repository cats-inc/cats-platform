import {
  AUTH_SESSION_COOKIE_NAME,
  MemoryPlatformAuthStore,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
} from '../build/server/platform/auth/index.js';

export const TEST_AUTH_SESSION_SECRET = 'cats-platform-test-session-secret';

const TEST_AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createTestAuthConfig(overrides = {}) {
  const { google: googleOverrides, ...rest } = overrides;
  return {
    mode: 'enabled',
    enabled: true,
    sessionSecret: TEST_AUTH_SESSION_SECRET,
    sessionTtlMs: TEST_AUTH_SESSION_TTL_MS,
    mobileSessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    loginFailureLimit: 5,
    loginLockoutMs: 30_000,
    accountDailyFailureCap: 100,
    accountCooldownMs: 15 * 60 * 1000,
    subnetDailyFailureCap: 500,
    allowedBrowserOrigins: ['http://127.0.0.1:8181'],
    authStatePath: 'unused-auth-state.json',
    recoveryTokenPath: 'unused-auth-recovery.json',
    ...rest,
    google: {
      clientId: null,
      hostedDomains: [],
      mobileAudiences: [],
      ...googleOverrides,
    },
  };
}

export async function createAuthenticatedTestSession(options = {}) {
  const now = options.now ?? new Date('2026-03-11T00:00:00.000Z');
  const sessionSecret = options.sessionSecret ?? TEST_AUTH_SESSION_SECRET;
  const sessionTtlMs = options.sessionTtlMs ?? TEST_AUTH_SESSION_TTL_MS;
  const created = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(now),
    displayName: 'Test Admin',
    identifier: 'owner@example.test',
    password: 'correct horse battery staple',
    sessionSecret,
    sessionTtlMs,
    now,
  });
  const authStore = new MemoryPlatformAuthStore(created.state, () => now);
  return {
    authStore,
    sessionToken: created.session.token,
    csrfToken: created.session.csrfToken,
    cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(created.session.token)}`,
  };
}

export function installAuthenticatedFetch(baseUrl, auth, options = {}) {
  const originalFetch = globalThis.fetch;
  // First-run setup mints its own admin and session, so a fixture that starts
  // without a seeded admin has to pick that session up. Track the cookie the
  // server hands back and refresh the CSRF token whenever it changes.
  let cookie = auth.cookie ?? '';
  let csrfToken = auth.csrfToken ?? '';
  let csrfStale = !csrfToken;

  async function refreshCsrfToken() {
    const response = await originalFetch(`${baseUrl}/api/auth/status`, {
      headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    if (typeof payload?.csrfToken === 'string' && payload.csrfToken) {
      csrfToken = payload.csrfToken;
      csrfStale = false;
    }
  }

  function adoptSessionCookie(response) {
    const values = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const value of values) {
      if (!value.startsWith(`${AUTH_SESSION_COOKIE_NAME}=`)) {
        continue;
      }
      const next = value.split(';')[0];
      if (next !== cookie) {
        cookie = next;
        csrfStale = true;
      }
    }
  }

  globalThis.fetch = async (input, init = {}) => {
    const request = typeof input === 'string' || input instanceof URL ? null : input;
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : request.url;
    if (!requestUrl.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }

    const method = String(init.method ?? request?.method ?? 'GET').toUpperCase();
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (mutating && csrfStale && cookie) {
      await refreshCsrfToken();
    }

    const headers = new Headers(init.headers ?? request?.headers ?? undefined);
    if (mutating && options.origin && !headers.has('origin')) {
      headers.set('origin', options.origin);
    }
    if (cookie) {
      headers.set('cookie', cookie);
    }
    if (mutating && csrfToken) {
      headers.set('x-cats-csrf-token', csrfToken);
    }

    const response = await originalFetch(input, { ...init, headers });
    adoptSessionCookie(response);
    return response;
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * An auth store with no admin yet, for fixtures that exercise first-run setup.
 * Pair it with `installAuthenticatedFetch`, which adopts the session that
 * `/api/platform/setup/complete` returns.
 */
export function createUnprovisionedTestSession(options = {}) {
  const now = options.now ?? new Date('2026-03-11T00:00:00.000Z');
  return {
    authStore: new MemoryPlatformAuthStore(createEmptyPlatformAuthState(now), () => now),
    sessionToken: '',
    csrfToken: '',
    cookie: '',
  };
}

export const TEST_ADMIN_CREDENTIALS = {
  adminIdentifier: 'owner@example.test',
  adminPassword: 'correct horse battery staple',
};

export async function waitForCondition(
  predicate,
  options = {},
) {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const intervalMs = options.intervalMs ?? 20;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for test condition.`);
}
