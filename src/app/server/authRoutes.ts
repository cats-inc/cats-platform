import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  generateSessionTokenMaterial,
  clearAllLoginThrottleState,
  collectLoginThrottleAlerts,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  issueBrowserSession,
  isSessionChainActive,
  PlatformBrowserHandoffCapacityError,
  PLATFORM_BROWSER_HANDOFF_EXCHANGE_PATH,
  PLATFORM_BROWSER_HANDOFF_TTL_MS,
  normalizePlatformBrowserHandoffReturnTo,
  normalizeAccountIdentifier,
  authorizePlatformAuthRepairBootstrap,
  createFirstAdminGoogleAuthState,
  createLoginThrottleSubject,
  evaluateLoginThrottle,
  recordFailedLogin,
  recordSuccessfulLogin,
  resolveBrowserPrincipalFromToken,
  revokeSession,
  revokeSessionFamily,
  AUTH_SESSION_COOKIE_NAME,
  clearAuthSessionCookie,
  serializeAuthSessionCookie,
  summarizePlatformPrincipal,
  evaluatePreAuthOriginGate,
  validateCatsCsrfToken as validateCatsSessionCsrfToken,
  touchSession,
  createGoogleBrowserSessionForLinkedIdentity,
  linkGoogleIdentityToAccount,
  validateGoogleGisCsrfToken,
  verifyPlatformGoogleIdentityToken,
  verifyPlatformLocalPasswordCredential,
  type PlatformAuthErrorCode,
  type PlatformAuthStore,
  type PlatformLoginThrottleAlert,
  type PlatformAuthRecoveryTokenState,
  type PlatformBrowserHandoffStore,
  type PlatformGoogleIdTokenVerifier,
  type PlatformVerifiedGoogleIdentity,
  type PlatformPrincipal,
  type PlatformPrincipalSummary,
  type PreAuthOriginGateRejectionReason,
  type PlatformSessionRecord,
} from '../../platform/auth/index.js';
import type { PlatformAuthConfig } from '../../platform/auth/config.js';
import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../shared/http.js';
import { readGoogleCredentialRequestPayload } from './googleAuthRequest.js';
import { sendPlatformAuthError } from './authErrorResponses.js';

export interface AuthRouteDependencies {
  authStore: PlatformAuthStore;
  browserHandoffStore?: PlatformBrowserHandoffStore;
  auth: PlatformAuthConfig;
  googleVerifier?: PlatformGoogleIdTokenVerifier;
  authRecoveryTokenState?: PlatformAuthRecoveryTokenState | null;
  getAuthRecoveryTokenState?: () => PlatformAuthRecoveryTokenState | null;
  setAuthRecoveryTokenState?: (
    state: PlatformAuthRecoveryTokenState | null
  ) => void | Promise<void>;
  reportLoginThrottleAlert?: (
    alert: PlatformLoginThrottleAlert
  ) => void | Promise<void>;
  readSetupCompleteAt?: () => Promise<string | null>;
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

  if (context.url.pathname === '/api/auth/browser-handoff') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleCreateBrowserHandoff(context);
    return true;
  }

  if (context.url.pathname === PLATFORM_BROWSER_HANDOFF_EXCHANGE_PATH) {
    if (context.method === 'GET') {
      sendBrowserHandoffLanding(context.response);
      return true;
    }
    if (context.method === 'POST') {
      await handleExchangeBrowserHandoff(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
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

  if (context.url.pathname === '/api/auth/google/login') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    if (!enforcePreAuthOriginGate(context)) {
      return true;
    }
    await handleGoogleLogin(context);
    return true;
  }

  if (context.url.pathname === '/api/auth/google/setup') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    if (!enforcePreAuthOriginGate(context)) {
      return true;
    }
    await handleGoogleSetup(context);
    return true;
  }

  if (context.url.pathname === '/api/auth/google/link') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleGoogleLink(context);
    return true;
  }

  if (context.url.pathname === '/api/auth/repair/first-admin') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    if (!enforcePreAuthOriginGate(context)) {
      return true;
    }
    await handleRepairFirstAdmin(context);
    return true;
  }

  if (context.url.pathname === '/api/auth/throttle/clear') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    if (!enforcePreAuthOriginGate(context)) {
      return true;
    }
    await handleClearLoginThrottle(context);
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

async function handleCreateBrowserHandoff(
  context: RouteContext<AuthRouteDependencies>,
): Promise<void> {
  let body: { returnTo?: unknown };
  try {
    body = await readJsonBody(context.request);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Invalid browser handoff request body.');
    return;
  }
  if (typeof body.returnTo !== 'string') {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Browser handoff return path is required.');
    return;
  }

  let returnTo: string;
  try {
    returnTo = normalizePlatformBrowserHandoffReturnTo(body.returnTo);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Browser handoff return path is invalid.');
    return;
  }

  const setupCompleteAt = context.auth?.principal
    ? undefined
    : await context.dependencies.readSetupCompleteAt?.();
  if (
    context.dependencies.auth.mode === 'unsafe_disabled'
    || setupCompleteAt === null
  ) {
    sendJson(context.response, 200, {
      launchMode: 'direct',
      launchPath: returnTo,
      expiresAt: null,
    }, {
      'Cache-Control': 'no-store',
    });
    return;
  }

  if (
    context.auth?.credentialKind !== 'browser_cookie'
    || !context.auth.principal
  ) {
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Authentication is required.');
    return;
  }

  const sessionSecret = context.dependencies.auth.sessionSecret;
  const browserHandoffStore = context.dependencies.browserHandoffStore;
  if (!sessionSecret || !browserHandoffStore) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Browser handoff is not configured.');
    return;
  }

  try {
    const issued = browserHandoffStore.issue({
      accountId: context.auth.principal.account.id,
      sourceSessionId: context.auth.principal.session.id,
      returnTo,
      sessionSecret,
      ttlMs: PLATFORM_BROWSER_HANDOFF_TTL_MS,
      now: context.dependencies.now?.() ?? new Date(),
    });
    const params = new URLSearchParams({ token: issued.token });
    sendJson(context.response, 200, {
      launchMode: 'handoff',
      launchPath: `${PLATFORM_BROWSER_HANDOFF_EXCHANGE_PATH}#${params.toString()}`,
      expiresAt: issued.expiresAt,
    }, {
      'Cache-Control': 'no-store',
    });
  } catch (error) {
    if (error instanceof PlatformBrowserHandoffCapacityError) {
      sendAuthError(
        context.response,
        503,
        'E_FORBIDDEN',
        'Browser handoff is temporarily unavailable. Please try again.',
      );
      return;
    }
    throw error;
  }
}

function sendBrowserHandoffLanding(response: ServerResponse): void {
  const nonce = randomBytes(18).toString('base64');
  const body = buildBrowserHandoffLandingHtml(nonce);
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body).toString(),
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  });
  response.end(body);
}

function buildBrowserHandoffLandingHtml(nonce: string): string {
  const exchangePath = JSON.stringify(PLATFORM_BROWSER_HANDOFF_EXCHANGE_PATH);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Opening Cats Runtime</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: Canvas; color: CanvasText; }
    main { max-width: 32rem; padding: 2rem; text-align: center; }
  </style>
</head>
<body>
  <main>
    <h1>Opening Cats Runtime…</h1>
    <p id="status">Authenticating this browser.</p>
  </main>
  <script nonce="${nonce}">
    (async function () {
      const status = document.getElementById('status');
      const params = new URLSearchParams(location.hash.slice(1));
      const tokens = params.getAll('token');
      history.replaceState(null, '', ${exchangePath});
      if (tokens.length !== 1 || !/^[a-z0-9_-]{40,}$/i.test(tokens[0])) {
        status.textContent = 'This browser handoff is invalid. Return to Cats and try again.';
        return;
      }
      try {
        const response = await fetch(${exchangePath}, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokens[0] }),
        });
        const payload = await response.json().catch(function () { return null; });
        if (!response.ok || !payload || typeof payload.returnTo !== 'string') {
          throw new Error('exchange failed');
        }
        location.replace(payload.returnTo);
      } catch {
        status.textContent = 'This browser handoff expired or failed. Return to Cats and try again.';
      }
    }());
  </script>
</body>
</html>`;
}

async function handleExchangeBrowserHandoff(
  context: RouteContext<AuthRouteDependencies>,
): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  const browserHandoffStore = context.dependencies.browserHandoffStore;
  let body: { token?: unknown };
  try {
    body = await readJsonBody(context.request);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Invalid browser handoff request body.');
    return;
  }
  if (
    !sessionSecret
    || !browserHandoffStore
    || typeof body.token !== 'string'
    || !body.token.trim()
  ) {
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Browser handoff is invalid.');
    return;
  }
  const handoff = browserHandoffStore.consume({
    token: body.token,
    sessionSecret,
    now: context.dependencies.now?.() ?? new Date(),
  });
  if (!handoff) {
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Browser handoff is invalid.');
    return;
  }

  const now = context.dependencies.now?.() ?? new Date();
  const existingToken = readCookie(context.request, AUTH_SESSION_COOKIE_NAME);
  let exchangeAuthorized = false;
  let reusedExistingSession = false;
  let issuedToken: string | null = null;
  await context.dependencies.authStore.updateState((state) => {
    const account = state.accounts.find((candidate) => (
      candidate.id === handoff.accountId && candidate.status === 'active'
    ));
    const membership = state.memberships.find((candidate) => (
      candidate.accountId === handoff.accountId
    ));
    const sourceSession = state.sessions.find((candidate) => (
      candidate.id === handoff.sourceSessionId
      && candidate.accountId === handoff.accountId
      && candidate.kind === 'browser'
      && isSessionChainActive(state.sessions, candidate, now)
    ));
    if (!account || !membership || !sourceSession) {
      return state;
    }

    exchangeAuthorized = true;
    const existingBrowserPrincipal = existingToken
      ? resolveBrowserPrincipalFromToken(state, {
          token: existingToken,
          sessionSecret,
          now,
        })
      : null;
    if (existingBrowserPrincipal?.account.id === handoff.accountId) {
      reusedExistingSession = true;
      return state;
    }

    const issued = issueBrowserSession({
      accountId: handoff.accountId,
      sourceSessionId: handoff.sourceSessionId,
      sessionSecret,
      ttlMs: context.dependencies.auth.sessionTtlMs,
      now,
    });
    issuedToken = issued.token;
    const sessions = existingBrowserPrincipal
      ? state.sessions.map((session) => (
          session.id === existingBrowserPrincipal.session.id
            ? revokeSession(session, now)
            : session
        ))
      : state.sessions;
    return {
      ...state,
      sessions: [...sessions, issued.session],
    };
  });

  if (!exchangeAuthorized) {
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Browser handoff is invalid.');
    return;
  }
  if (reusedExistingSession) {
    sendBrowserHandoffExchangeResult(context, handoff.returnTo);
    return;
  }
  if (!issuedToken) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Browser handoff failed.');
    return;
  }
  sendBrowserHandoffExchangeResult(context, handoff.returnTo, issuedToken);
}

function sendBrowserHandoffExchangeResult(
  context: RouteContext<AuthRouteDependencies>,
  returnTo: string,
  sessionToken?: string,
): void {
  sendJson(context.response, 200, { returnTo }, {
    ...(sessionToken ? {
      'Set-Cookie': serializeAuthSessionCookie(
        sessionToken,
        context.dependencies.auth.sessionTtlMs,
      ),
    } : {}),
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
}

async function handleRepairFirstAdmin(
  context: RouteContext<AuthRouteDependencies>,
): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendAuthError(
      context.response,
      503,
      'E_FORBIDDEN',
      'Auth repair is not configured because CATS_AUTH_SESSION_SECRET is missing.',
    );
    return;
  }
  const setupCompleteAt = await context.dependencies.readSetupCompleteAt?.() ?? null;
  if (!setupCompleteAt) {
    sendAuthError(context.response, 409, 'E_FORBIDDEN', 'Setup is not complete.');
    return;
  }
  const status = await context.dependencies.authStore.readStateStatus();
  if (status.status === 'ready') {
    sendAuthError(context.response, 409, 'E_FORBIDDEN', 'Auth repair is not required.');
    return;
  }

  let body: {
    displayName?: unknown;
    identifier?: unknown;
    password?: unknown;
    recoveryToken?: unknown;
  };
  try {
    body = await readJsonBody(context.request);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Invalid auth repair request body.');
    return;
  }
  if (typeof body.identifier !== 'string' || typeof body.password !== 'string') {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Identifier and password are required.');
    return;
  }

  const now = context.dependencies.now?.() ?? new Date();
  const authorization = authorizePlatformAuthRepairBootstrap({
    remoteAddress: readRemoteAddress(context.request),
    recoveryToken: typeof body.recoveryToken === 'string' ? body.recoveryToken : null,
    recoveryTokenState: context.dependencies.getAuthRecoveryTokenState?.()
      ?? context.dependencies.authRecoveryTokenState
      ?? null,
    sessionSecret,
    now,
  });
  if (!authorization.allowed) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', repairAuthorizationMessage(
      authorization.reason,
    ));
    return;
  }

  const created = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(now),
    displayName: typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName
      : 'Owner',
    identifier: body.identifier,
    password: body.password,
    sessionSecret,
    sessionTtlMs: context.dependencies.auth.sessionTtlMs,
    now,
  });
  await context.dependencies.authStore.writeState(created.state);
  if (authorization.mode === 'recovery_token') {
    await context.dependencies.setAuthRecoveryTokenState?.(authorization.consumedTokenState);
  }

  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, {
      account: created.account,
      membership: created.membership,
      session: created.session.session,
    }, created.session.csrfToken),
    {
      'Set-Cookie': serializeAuthSessionCookie(
        created.session.token,
        context.dependencies.auth.sessionTtlMs,
      ),
    },
  );
}

async function handleClearLoginThrottle(
  context: RouteContext<AuthRouteDependencies>,
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = await readOptionalJsonObjectBody(context.request);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Invalid auth throttle request body.');
    return;
  }

  const resolved = await resolveBrowserPrincipal(context);
  if (resolved) {
    if (!resolved.membership.roles.some((role) => role === 'owner' || role === 'admin')) {
      sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Admin role is required.');
      return;
    }
    if (!enforceCatsCsrfToken(context, resolved.session)) {
      return;
    }
    await clearAllLoginThrottle(context);
    sendJson(context.response, 200, { cleared: true, mode: 'admin' });
    return;
  }

  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Auth throttle recovery is not configured.');
    return;
  }
  const authorization = authorizePlatformAuthRepairBootstrap({
    remoteAddress: readRemoteAddress(context.request),
    recoveryToken: typeof body.recoveryToken === 'string' ? body.recoveryToken : null,
    recoveryTokenState: context.dependencies.getAuthRecoveryTokenState?.()
      ?? context.dependencies.authRecoveryTokenState
      ?? null,
    sessionSecret,
    now: context.dependencies.now?.() ?? new Date(),
  });
  if (!authorization.allowed) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', repairAuthorizationMessage(
      authorization.reason,
    ));
    return;
  }

  await clearAllLoginThrottle(context);
  if (authorization.mode === 'recovery_token') {
    await context.dependencies.setAuthRecoveryTokenState?.(authorization.consumedTokenState);
  }
  sendJson(context.response, 200, { cleared: true, mode: authorization.mode });
}

async function clearAllLoginThrottle(
  context: RouteContext<AuthRouteDependencies>,
): Promise<void> {
  const now = context.dependencies.now?.() ?? new Date();
  await context.dependencies.authStore.updateState((state) =>
    clearAllLoginThrottleState(state, { now }),
  );
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

  const credential = await verifyPlatformLocalPasswordCredential(state, {
    identifier,
    password: body.password,
  });
  if (!credential) {
    await recordFailedLoginWithAlerts(context, throttleSubject, now);
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Invalid credentials.');
    return;
  }

  const issued = issueBrowserSession({
    accountId: credential.account.id,
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
      account: credential.account,
      membership: credential.membership,
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

async function handleGoogleLogin(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Google login is not configured.');
    return;
  }

  const identity = await readVerifiedBrowserGoogleIdentity(context);
  if (!identity) {
    return;
  }

  const state = await context.dependencies.authStore.readState();
  const now = context.dependencies.now?.() ?? new Date();
  const throttleSubject = createLoginThrottleSubject({
    provider: 'google',
    accountKey: identity.providerSubject,
    remoteAddress: readRemoteAddress(context.request),
  });
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

  const issued = createGoogleBrowserSessionForLinkedIdentity({
    state,
    identity,
    sessionSecret,
    sessionTtlMs: context.dependencies.auth.sessionTtlMs,
    now,
  });
  if (!issued) {
    await recordFailedProviderLogin(context, identity.providerSubject, now);
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Google account is not linked.');
    return;
  }

  await context.dependencies.authStore.writeState(recordSuccessfulLogin(issued.state, {
    subject: throttleSubject,
    now,
  }));
  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, {
      account: issued.account,
      membership: issued.membership,
      session: issued.session.session,
    }, issued.session.csrfToken),
    {
      'Set-Cookie': serializeAuthSessionCookie(
        issued.session.token,
        context.dependencies.auth.sessionTtlMs,
      ),
    },
  );
}

async function handleGoogleSetup(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Google setup is not configured.');
    return;
  }

  const identity = await readVerifiedBrowserGoogleIdentity(context);
  if (!identity) {
    return;
  }

  const state = await context.dependencies.authStore.readState();
  const now = context.dependencies.now?.() ?? new Date();
  const throttleSubject = createLoginThrottleSubject({
    provider: 'google',
    accountKey: identity.providerSubject,
    remoteAddress: readRemoteAddress(context.request),
  });
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

  let created: ReturnType<typeof createFirstAdminGoogleAuthState>;
  try {
    created = createFirstAdminGoogleAuthState({
      state,
      identity,
      sessionSecret,
      sessionTtlMs: context.dependencies.auth.sessionTtlMs,
      now,
    });
  } catch {
    sendAuthError(context.response, 409, 'E_FORBIDDEN', 'First admin already exists.');
    return;
  }

  await context.dependencies.authStore.writeState(recordSuccessfulLogin(created.state, {
    subject: throttleSubject,
    now,
  }));
  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, {
      account: created.account,
      membership: created.membership,
      session: created.session.session,
    }, created.session.csrfToken),
    {
      'Set-Cookie': serializeAuthSessionCookie(
        created.session.token,
        context.dependencies.auth.sessionTtlMs,
      ),
    },
  );
}

async function handleGoogleLink(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Google link is not configured.');
    return;
  }
  const resolved = await resolveBrowserPrincipal(context);
  if (!resolved) {
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Authentication is required.');
    return;
  }
  if (!enforceCatsCsrfToken(context, resolved.session)) {
    return;
  }

  const identity = await readVerifiedBrowserGoogleIdentity(context);
  if (!identity) {
    return;
  }

  const now = context.dependencies.now?.() ?? new Date();
  let linked: ReturnType<typeof linkGoogleIdentityToAccount>;
  try {
    linked = linkGoogleIdentityToAccount({
      state: await context.dependencies.authStore.readState(),
      accountId: resolved.account.id,
      identity,
      now,
    });
  } catch {
    sendAuthError(context.response, 409, 'E_FORBIDDEN', 'Google account is already linked.');
    return;
  }
  if (!linked) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Google account cannot be linked.');
    return;
  }

  const csrf = generateSessionTokenMaterial(sessionSecret);
  const touched = touchSession(resolved.session, {
    now,
    remoteAddress: readRemoteAddress(context.request),
  });
  await context.dependencies.authStore.writeState({
    ...linked.state,
    sessions: linked.state.sessions.map((session) =>
      session.id === resolved.session.id
        ? {
            ...touched,
            csrfTokenHash: csrf.tokenHash,
          }
        : session,
    ),
  });
  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, {
      account: linked.account,
      membership: linked.membership,
      session: {
        ...touched,
        csrfTokenHash: csrf.tokenHash,
      },
    }, csrf.token),
  );
}

async function readVerifiedBrowserGoogleIdentity(
  context: RouteContext<AuthRouteDependencies>,
): Promise<PlatformVerifiedGoogleIdentity | null> {
  const googleClientId = context.dependencies.auth.google.clientId;
  const verifier = context.dependencies.googleVerifier;
  if (!googleClientId || !verifier) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Google login is not configured.');
    return null;
  }

  let body: { credential: string | null; csrfToken: string | null };
  try {
    body = await readGoogleCredentialRequestPayload(context.request);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Invalid Google auth request body.');
    return null;
  }

  const googleCsrf = validateGoogleGisCsrfToken({
    cookieHeader: context.request.headers.cookie,
    bodyToken: body.csrfToken,
  });
  if (!googleCsrf.ok) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Google CSRF token is missing or invalid.');
    return null;
  }
  if (!body.credential) {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Google credential is required.');
    return null;
  }

  try {
    return await verifyPlatformGoogleIdentityToken({
      token: body.credential,
      audiences: [googleClientId],
      hostedDomains: context.dependencies.auth.google.hostedDomains,
      verifier,
      now: context.dependencies.now?.() ?? new Date(),
    });
  } catch {
    await recordFailedProviderLogin(context, 'google:invalid');
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Invalid Google credential.');
    return null;
  }
}

async function recordFailedProviderLogin(
  context: RouteContext<AuthRouteDependencies>,
  accountKey: string,
  now: Date = context.dependencies.now?.() ?? new Date(),
): Promise<void> {
  const throttleSubject = createLoginThrottleSubject({
    provider: 'google',
    accountKey,
    remoteAddress: readRemoteAddress(context.request),
  });
  await recordFailedLoginWithAlerts(context, throttleSubject, now);
}

async function recordFailedLoginWithAlerts(
  context: RouteContext<AuthRouteDependencies>,
  subject: ReturnType<typeof createLoginThrottleSubject>,
  now: Date,
): Promise<void> {
  let alerts: PlatformLoginThrottleAlert[] = [];
  await context.dependencies.authStore.updateState((current) => {
    const next = recordFailedLogin(current, {
      subject,
      policy: context.dependencies.auth,
      now,
    });
    alerts = collectLoginThrottleAlerts(current, next);
    return next;
  });
  for (const alert of alerts) {
    await reportLoginThrottleAlert(context, alert);
  }
}

async function reportLoginThrottleAlert(
  context: RouteContext<AuthRouteDependencies>,
  alert: PlatformLoginThrottleAlert,
): Promise<void> {
  if (context.dependencies.reportLoginThrottleAlert) {
    await context.dependencies.reportLoginThrottleAlert(alert);
    return;
  }
  console.warn('[cats-platform] auth aggregate throttle alert', alert);
}

async function handleLogout(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const resolved = await resolveBrowserPrincipal(context);
  if (resolved) {
    if (!enforceCatsCsrfToken(context, resolved.session)) {
      return;
    }
    await context.dependencies.authStore.updateState((state) => ({
      ...state,
      sessions: revokeSessionFamily(
        state.sessions,
        resolved.session.id,
        context.dependencies.now?.() ?? new Date(),
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

function repairAuthorizationMessage(reason: string): string {
  switch (reason) {
    case 'missing_session_secret':
      return 'Auth repair is not configured.';
    case 'missing_recovery_token':
      return 'Auth repair requires the one-time recovery token.';
    case 'invalid_recovery_token':
      return 'Recovery token is missing or invalid.';
    default:
      return 'Auth repair is not authorized.';
  }
}

function sendAuthError(
  response: ServerResponse,
  statusCode: 401 | 403 | 400 | 409 | 503,
  code: PlatformAuthErrorCode,
  message: string,
): void {
  sendPlatformAuthError(response, statusCode, code, message);
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

async function readOptionalJsonObjectBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (
    request.headers['content-length'] === '0'
    || (!request.headers['content-length'] && !request.headers['transfer-encoding'])
  ) {
    return {};
  }
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected JSON object body.');
  }
  return body as Record<string, unknown>;
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
