import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  generateSessionTokenMaterial,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  issueBrowserSession,
  normalizeAccountIdentifier,
  authorizePlatformAuthRepairBootstrap,
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
  createGoogleBrowserSessionForLinkedIdentity,
  validateGoogleGisCsrfToken,
  verifyPlatformGoogleIdentityToken,
  verifyPlatformLocalPasswordCredential,
  type PlatformAuthStore,
  type PlatformAuthRecoveryTokenState,
  type PlatformGoogleIdTokenVerifier,
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

export interface AuthRouteDependencies {
  authStore: PlatformAuthStore;
  auth: PlatformAuthConfig;
  googleVerifier?: PlatformGoogleIdTokenVerifier;
  authRecoveryTokenState?: PlatformAuthRecoveryTokenState | null;
  getAuthRecoveryTokenState?: () => PlatformAuthRecoveryTokenState | null;
  setAuthRecoveryTokenState?: (
    state: PlatformAuthRecoveryTokenState | null
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
  const googleClientId = context.dependencies.auth.google.clientId;
  const verifier = context.dependencies.googleVerifier;
  if (!sessionSecret || !googleClientId || !verifier) {
    sendAuthError(context.response, 503, 'E_FORBIDDEN', 'Google login is not configured.');
    return;
  }

  let body: { credential: string | null; csrfToken: string | null };
  try {
    body = await readGoogleCredentialRequestPayload(context.request);
  } catch {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Invalid Google auth request body.');
    return;
  }

  const googleCsrf = validateGoogleGisCsrfToken({
    cookieHeader: context.request.headers.cookie,
    bodyToken: body.csrfToken,
  });
  if (!googleCsrf.ok) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Google CSRF token is missing or invalid.');
    return;
  }
  if (!body.credential) {
    sendAuthError(context.response, 400, 'E_FORBIDDEN', 'Google credential is required.');
    return;
  }

  let identity;
  try {
    identity = await verifyPlatformGoogleIdentityToken({
      token: body.credential,
      audiences: [googleClientId],
      hostedDomains: context.dependencies.auth.google.hostedDomains,
      verifier,
      now: context.dependencies.now?.() ?? new Date(),
    });
  } catch {
    await recordFailedProviderLogin(context, 'google:invalid');
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Invalid Google credential.');
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
    await recordFailedProviderLogin(context, identity.providerSubject);
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

async function recordFailedProviderLogin(
  context: RouteContext<AuthRouteDependencies>,
  accountKey: string,
): Promise<void> {
  const now = context.dependencies.now?.() ?? new Date();
  const throttleSubject = createLoginThrottleSubject({
    provider: 'google',
    accountKey,
    remoteAddress: readRemoteAddress(context.request),
  });
  await context.dependencies.authStore.updateState((current) =>
    recordFailedLogin(current, {
      subject: throttleSubject,
      policy: context.dependencies.auth,
      now,
    }),
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
    case 'non_loopback_without_recovery_token':
      return 'Auth repair requires a loopback request or recovery token.';
    case 'invalid_recovery_token':
      return 'Recovery token is missing or invalid.';
    default:
      return 'Auth repair is not authorized.';
  }
}

function sendAuthError(
  response: ServerResponse,
  statusCode: 401 | 403 | 400 | 409 | 503,
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
