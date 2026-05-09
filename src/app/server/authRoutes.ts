import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  generateSessionTokenMaterial,
  hashSessionToken,
  isSessionActive,
  issueBrowserSession,
  normalizeAccountIdentifier,
  revokeSession,
  touchSession,
  verifyLocalPassword,
  type PlatformAuthStore,
  type PlatformAuthState,
  type PlatformMembershipRecord,
  type PlatformSessionRecord,
} from '../../platform/auth/index.js';
import type { PlatformAuthConfig } from '../../platform/auth/config.js';
import type {
  PlatformAccountRecord,
  PlatformIdentityRecord,
} from '../../platform/auth/types.js';
import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../shared/http.js';

export const AUTH_SESSION_COOKIE_NAME = 'cats_session';

export interface AuthRouteDependencies {
  authStore: PlatformAuthStore;
  auth: PlatformAuthConfig;
  now?: () => Date;
}

export interface AuthPrincipalSummary {
  accountId: string;
  displayName: string;
  email: string | null;
  roles: PlatformMembershipRecord['roles'];
  coreActorId: string | null;
  sessionId: string;
}

export interface AuthStatusPayload {
  authenticated: boolean;
  principal: AuthPrincipalSummary | null;
  csrfToken: string | null;
  providers: {
    google: {
      enabled: boolean;
      clientId: string | null;
    };
  };
}

interface BrowserPrincipalResolution {
  account: PlatformAccountRecord;
  membership: PlatformMembershipRecord;
  session: PlatformSessionRecord;
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
  const state = await context.dependencies.authStore.readState();
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
    sendAuthError(context.response, 401, 'E_UNAUTHENTICATED', 'Invalid credentials.');
    return;
  }

  const issued = issueBrowserSession({
    accountId: account.id,
    sessionSecret,
    ttlMs: context.dependencies.auth.sessionTtlMs,
    now: context.dependencies.now?.() ?? new Date(),
  });
  await context.dependencies.authStore.updateState((current) => ({
    ...current,
    sessions: [...current.sessions, issued.session],
  }));

  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, {
      account,
      membership,
      session: issued.session,
    }, issued.csrfToken),
    {
      'Set-Cookie': serializeSessionCookie(
        issued.token,
        context.dependencies.auth.sessionTtlMs,
      ),
    },
  );
}

async function handleLogout(context: RouteContext<AuthRouteDependencies>): Promise<void> {
  const token = readCookie(context.request, AUTH_SESSION_COOKIE_NAME);
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (token && sessionSecret) {
    const tokenHash = hashSessionToken(token, sessionSecret);
    await context.dependencies.authStore.updateState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.tokenHash === tokenHash
          ? revokeSession(session, context.dependencies.now?.() ?? new Date())
          : session,
      ),
    }));
  }
  sendJson(
    context.response,
    200,
    buildAuthStatusPayload(context.dependencies.auth, null, null),
    { 'Set-Cookie': clearSessionCookie() },
  );
}

async function resolveBrowserPrincipal(
  context: RouteContext<AuthRouteDependencies>,
): Promise<BrowserPrincipalResolution | null> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  const token = readCookie(context.request, AUTH_SESSION_COOKIE_NAME);
  if (!sessionSecret || !token) {
    return null;
  }
  const tokenHash = hashSessionToken(token, sessionSecret);
  const state = await context.dependencies.authStore.readState();
  const session = state.sessions.find((candidate) =>
    candidate.kind === 'browser'
    && candidate.tokenHash === tokenHash
    && isSessionActive(candidate, context.dependencies.now?.() ?? new Date()),
  ) ?? null;
  if (!session) {
    return null;
  }
  const account = state.accounts.find((candidate) =>
    candidate.id === session.accountId && candidate.status === 'active',
  ) ?? null;
  const membership = account
    ? state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  return account && membership
    ? {
        account: structuredClone(account),
        membership: structuredClone(membership),
        session: structuredClone(session),
      }
    : null;
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
  resolved: BrowserPrincipalResolution | null,
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

function summarizePrincipal(resolved: BrowserPrincipalResolution): AuthPrincipalSummary {
  return {
    accountId: resolved.account.id,
    displayName: resolved.account.displayName,
    email: resolved.account.email,
    roles: [...resolved.membership.roles],
    coreActorId: resolved.membership.coreActorId,
    sessionId: resolved.session.id,
  };
}

function enforcePreAuthOriginGate(context: RouteContext<AuthRouteDependencies>): boolean {
  const origin = context.request.headers.origin;
  const fetchSite = context.request.headers['sec-fetch-site'];
  if (typeof origin !== 'string' || origin.trim().length === 0) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Origin is required.');
    return false;
  }
  if (!context.dependencies.auth.allowedBrowserOrigins.includes(normalizeOrigin(origin))) {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Origin is not allowed.');
    return false;
  }
  if (fetchSite === 'cross-site' || fetchSite === 'none') {
    sendAuthError(context.response, 403, 'E_FORBIDDEN', 'Fetch site is not allowed.');
    return false;
  }
  return true;
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
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

function serializeSessionCookie(token: string, ttlMs: number): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(1, Math.floor(ttlMs / 1000))}`,
  ].join('; ');
}

function clearSessionCookie(): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

function readRemoteAddress(request: IncomingMessage): string | undefined {
  return request.socket.remoteAddress ?? undefined;
}
