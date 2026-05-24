import {
  AUTH_SESSION_COOKIE_NAME,
  MemoryPlatformAuthStore,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
} from '../build/server/platform/auth/index.js';

export const TEST_AUTH_SESSION_SECRET = 'cats-platform-test-session-secret';

const TEST_AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  globalThis.fetch = (input, init = {}) => {
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
    const headers = new Headers(init.headers ?? request?.headers ?? undefined);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && options.origin && !headers.has('origin')) {
      headers.set('origin', options.origin);
    }
    headers.set('cookie', auth.cookie);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers.set('x-cats-csrf-token', auth.csrfToken);
    }

    const nextInit = { ...init, headers };
    return originalFetch(input, nextInit);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

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
