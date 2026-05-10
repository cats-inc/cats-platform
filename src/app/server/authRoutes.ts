import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  generateSessionTokenMaterial,
  issueBrowserSession,
  normalizeAccountIdentifier,
  createLoginThrottleSubject,
  evaluateLoginThrottle,
  recordFailedLogin,
  recordSuccessfulLogin,
  resolveBrowserPrincipalFromToken,
  revokeSession,
  AUTH_SESSION_COOKIE_NAME,
  clearAuthSessionCookie,
  serializeAuthSessionCookie,
  summarizePlatformPrincipal,
  evaluatePreAuthOriginGate,
  validateCatsCsrfToken as validateCatsSessionCsrfToken,
  touchSession,
  verifyLocalPassword,
  type PlatformAuthStore,
  type PlatformAuthState,
  type PlatformPrincipal,
  type PlatformPrincipalSummary,
  type PreAuthOriginGateRejectionReason,
  type PlatformSessionRecord,
} from '../../platform/auth/index.js';
import type { PlatformAuthConfig } from '../../platform/auth/config.js';
import type { PlatformIdentityRecord } from '../../platform/auth/types.js';
import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../shared/http.js';

export interface AuthRouteDependencies {
  authStore: PlatformAuthStore;
  auth: PlatformAuthConfig;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface AuthStatusPayload {
  authenticated: boolean;
  principal: PlatformPrincipalSummary | null;
  csrfToken: string | null;
  providers: {
    google: {
      enabled: boolean;
      clientId: string | null;
    };
  };
}

export async function routePlatformAuthApi(
  context: RouteContext<AuthRouteDependencies>,
): Promise<boolean> {
  if (!context.url.pathname.startsWith('/api/auth')) {
    return false;
  }

  if (context.url.pathname === '/api/auth/status') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleAuthStatus(context);
    return true;
  }

  if (context.url.pathname === '/api/auth/login') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    if (!enforcePreAuthOriginGate(context)) {
      return true;
    }
    await handleLocalLogin(context);
    return true;
  }

  if (context.url.pathname === '/api/auth/logout') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLogout(context);
    return true;
  }

  return false;
}

async function handleAuthStatus(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const resolved = await resolveBrowserPrincipal(context);
  if (!resolved) {
    sendJson(context.response, 200, buildAuthStatusPayload(context.dependencies.auth, null, null));
    return;
  }
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendJson(context.response, 200, buildAuthStatusPayload(context.dependencies.auth, null, null));
    return;
  }
  const csrf = generateSessionTokenMaterial(sessionSecret);
  const touched = touchSession(resolved.session, {
    now: context.dependencies.now?.() ?? new Date(),
    remoteAddress: readRemoteAddress(context.request),
  });
  await context.dependencies.authStore.updateState((state) => ({
    ...state,
    sessions: state.sessions.map((session) =>
      session.id === resolved.session.id
        ? {
            ...touched,
            csrfTokenHash: csrf.tokenHash,
          }
        : session,
    ),
  }));
  sendJson(context.response, 200, buildAuthStatusPayload(context.dependencies.auth, {
    ...resolved,
    session: {
      ...touched,
      csrfTokenHash: csrf.tokenHash,
    },
  }, csrf.token));
}

async function handleLocalLogin(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendAuthError(
      context.response,
      503,
      'E_FORBIDDEN',
      'Local login is not configured because CATS_AUTH_SESSION_SECRET is missing.',
    );
    return;
  }

  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await readJsonBody(context.request);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Invalid auth request body.');
    return;
  }
  if (typeof body.identifier !== 'string' || typeof body.password !== 'string') {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Identifier and password are required.');
    return;
  }

  const identifier = normalizeAccountIdentifier(body.identifier);
  const now = context.dependencies.now?.() ?? new Date();
  const throttleSubject = createLoginThrottleSubject({
    provider: 'local_password',
    accountKey: identifier,
    remoteAddress: readRemoteAddress(context.request),
  });
  const state = await context.dependencies.authStore.readState();
  const throttle = evaluateLoginThrottle(state, {
    subject: throttleSubject,
    policy: context.dependencies.auth,
    now,
  });
  if (throttle.blocked) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Too many login attempts.');
    return;
  }
  if (throttle.delayMs > 0) {
    await sleep(throttle.delayMs, context.dependencies.sleep);
  }

  const identity = findLocalPasswordIdentity(state, identifier);
  const account = identity
    ? state.accounts.find((candidate) => candidate.id === identity.accountId) ?? null
    : null;
  const membership = account
    ? state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  const valid = identity?.passwordHash && identity.passwordHashAlgorithm
    ? await verifyLocalPassword(body.password, {
        passwordHash: identity.passwordHash,
        passwordHashAlgorithm: identity.passwordHashAlgorithm,
      })
    : false;

  if (!identity || !account || !membership || account.status !== 'active' || !valid) {
    await context.dependencies.authStore.updateState((current) =>
      recordFailedLogin(current, {
        subject: throttleSubject,
        policy: context.dependencies.auth,
        now,
      }),
    );
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Invalid credentials.');
    return;
  }

  const issued = issueBrowserSession({
    accountId: account.id,
    sessionSecret,
    ttlMs: context.dependencies.auth.sessionTtlMs,
    now,
  });
  await context.dependencies.authStore.updateState((current) => {
    const cleared = recordSuccessfulLogin(current, {
      subject: throttleSubject,
      now,
    });
    return {
      ...cleared,
      sessions: [...cleared.sessions, issued.session],
    };
  });

  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, {
      account,
      membership,
      session: issued.session,
    }, issued.csrfToken),
    {
      'Set-Cookie': serializeAuthSessionCookie(
        issued.token,
        context.dependencies.auth.sessionTtlMs,
      ),
    },
  );
}

async function handleLogout(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const resolved = await resolveBrowserPrincipal(context);
  if (resolved) {
    if (!enforceCatsCsrfToken(context, resolved.session)) {
      return;
    }
    await context.dependencies.authStore.updateState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === resolved.session.id
          ? revokeSession(session, context.dependencies.now?.() ?? new Date())
          : session,
      ),
    }));
  }
  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, null, null),
    { 'Set-Cookie': clearAuthSessionCookie() },
  );
}

async function resolveBrowserPrincipal(
  context: RouteContext<AuthRouteDependencies>,
): Promise<PlatformPrincipal | null> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  const token = readCookie(context.request, AUTH_SESSION_COOKIE_NAME);
  if (!sessionSecret || !token) {
    return null;
  }
  const state = await context.dependencies.authStore.readState();
  return resolveBrowserPrincipalFromToken(state, {
    token,
    sessionSecret,
    now: context.dependencies.now?.() ?? new Date(),
  });
}

function findLocalPasswordIdentity(
  state: PlatformAuthState,
  identifier: string,
): PlatformIdentityRecord | null {
  return structuredClone(state.identities.find((identity) =>
    identity.provider === 'local_password'
    && (
      identity.providerSubject === identifier
      || identity.email?.toLowerCase() === identifier
    ),
  ) ?? null);
}

function buildAuthStatusPayload(
  auth: PlatformAuthConfig,
  resolved: PlatformPrincipal | null,
  csrfToken: string | null,
): AuthStatusPayload {
  return {
    authenticated: resolved !== null,
    principal: resolved ? summarizePrincipal(resolved) : null,
    csrfToken,
    providers: {
      google: {
        enabled: Boolean(auth.google.clientId),
        clientId: auth.google.clientId,
      },
    },
  };
}

function summarizePrincipal(resolved: PlatformPrincipal): PlatformPrincipalSummary {
  return summarizePlatformPrincipal(resolved);
}

function enforcePreAuthOriginGate(context: RouteContext<AuthRouteDependencies>): boolean {
  const decision = evaluatePreAuthOriginGate({
    origin: context.request.headers.origin,
    fetchSite: context.request.headers['sec-fetch-site'],
    method: context.method,
    allowedBrowserOrigins: context.dependencies.auth.allowedBrowserOrigins,
  });
  if (!decision.allowed) {
    sendAuthError(
      context.response,
      403,
      'E_FORBIDDEN',
      preAuthOriginGateMessage(decision.reason),
    );
    return false;
  }
  return true;
}

function preAuthOriginGateMessage(reason: PreAuthOriginGateRejectionReason): string {
  switch (reason) {
    case 'origin_not_allowed':
      return 'Origin is not allowed.';
    case 'fetch_site_not_allowed':
      return 'Fetch site is not allowed.';
    case 'origin_required':
      return 'Origin is required.';
  }
}

function sendAuthError(
  response: ServerResponse,
  statusCode: 401 | 403 | 400 | 503,
  code: 'E_UNAUTHENTICATED' | 'E_FORBIDDEN' | 'E_CSRF_MISMATCH',
  message: string,
): void {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
    },
  });
}

function enforceCatsCsrfToken(
  context: RouteContext<AuthRouteDependencies>,
  session: PlatformSessionRecord,
): boolean {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  const csrfToken = context.request.headers['x-cats-csrf-token'];
  const decision = validateCatsSessionCsrfToken({
    session,
    token: typeof csrfToken === 'string' ? csrfToken : undefined,
    sessionSecret,
  });
  if (!decision.ok) {
    sendAuthError(context.response, 403, 'E_CSRF_MISMATCH', 'CSRF token is missing or invalid.');
    return false;
  }
  return true;
}

function readCookie(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
}

function readRemoteAddress(request: IncomingMessage): string | undefined {
  return request.socket.remoteAddress ?? undefined;
}

async function sleep(
  ms: number,
  injectedSleep: ((ms: number) => Promise<void>) | undefined,
): Promise<void> {
  if (ms <= 0) {
    return;
  }
  if (injectedSleep) {
    await injectedSleep(ms);
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
