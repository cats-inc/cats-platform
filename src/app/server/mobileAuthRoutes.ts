import type { IncomingMessage } from 'node:http';

import {
  createLoginThrottleSubject,
  evaluateLoginThrottle,
  findActiveSessionByToken,
  issueMobileDeviceSession,
  normalizeAccountIdentifier,
  recordFailedLogin,
  recordSuccessfulLogin,
  resolveMobilePrincipalFromBearerToken,
  revokeSession,
  summarizePlatformPrincipal,
  verifyLocalPassword,
  type PlatformAuthStore,
  type PlatformAuthState,
  type PlatformDevicePlatform,
} from '../../platform/auth/index.js';
import type { PlatformAuthConfig } from '../../platform/auth/config.js';
import type { PlatformIdentityRecord } from '../../platform/auth/types.js';
import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../shared/http.js';

export interface MobileAuthRouteDependencies {
  authStore: PlatformAuthStore;
  auth: PlatformAuthConfig;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface MobileAuthStatusPayload {
  authenticated: boolean;
  principal: ReturnType<typeof summarizePlatformPrincipal> | null;
  token?: string;
}

export async function routeMobileAuthApi(
  context: RouteContext<MobileAuthRouteDependencies>,
): Promise<boolean> {
  if (!context.url.pathname.startsWith('/api/mobile/auth')) {
    return false;
  }

  if (context.url.pathname === '/api/mobile/auth/status') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleMobileAuthStatus(context);
    return true;
  }

  if (context.url.pathname === '/api/mobile/auth/login') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleMobileLocalLogin(context);
    return true;
  }

  if (context.url.pathname === '/api/mobile/auth/logout') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleMobileLogout(context);
    return true;
  }

  return false;
}

async function handleMobileAuthStatus(
  context: RouteContext<MobileAuthRouteDependencies>,
): Promise<void> {
  const principal = await resolveMobilePrincipal(context);
  sendJson(context.response, 200, buildMobileAuthStatusPayload(principal, null));
}

async function handleMobileLocalLogin(
  context: RouteContext<MobileAuthRouteDependencies>,
): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    sendMobileAuthError(context, 503, 'E_FORBIDDEN', 'Mobile login is not configured.');
    return;
  }

  let body: {
    identifier?: unknown;
    password?: unknown;
    deviceLabel?: unknown;
    devicePlatform?: unknown;
    appVersion?: unknown;
  };
  try {
    body = await readJsonBody(context.request);
  } catch {
    sendMobileAuthError(context, 400, 'E_FORBIDDEN', 'Invalid auth request body.');
    return;
  }
  if (typeof body.identifier !== 'string' || typeof body.password !== 'string') {
    sendMobileAuthError(context, 400, 'E_FORBIDDEN', 'Identifier and password are required.');
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
    sendMobileAuthError(context, 403, 'E_FORBIDDEN', 'Too many login attempts.');
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
    sendMobileAuthError(context, 401, 'E_UNAUTHENTICATED', 'Invalid credentials.');
    return;
  }

  const issued = issueMobileDeviceSession({
    accountId: account.id,
    sessionSecret,
    ttlMs: context.dependencies.auth.mobileSessionTtlMs,
    now,
    deviceLabel: readOptionalString(body.deviceLabel),
    devicePlatform: readDevicePlatform(body.devicePlatform),
    appVersion: readOptionalString(body.appVersion),
    remoteAddress: readRemoteAddress(context.request),
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

  sendJson(context.response, 200, buildMobileAuthStatusPayload({
    account,
    membership,
    session: issued.session,
  }, issued.token));
}

async function handleMobileLogout(
  context: RouteContext<MobileAuthRouteDependencies>,
): Promise<void> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  const token = readBearerToken(context.request);
  if (sessionSecret && token) {
    const now = context.dependencies.now?.() ?? new Date();
    const state = await context.dependencies.authStore.readState();
    const session = findActiveSessionByToken(state.sessions, {
      token,
      sessionSecret,
      kind: 'mobile_device',
      now,
    });
    if (session) {
      await context.dependencies.authStore.updateState((current) => ({
        ...current,
        sessions: current.sessions.map((candidate) =>
          candidate.id === session.id ? revokeSession(candidate, now) : candidate,
        ),
      }));
    }
  }
  sendJson(context.response, 200, buildMobileAuthStatusPayload(null, null));
}

async function resolveMobilePrincipal(
  context: RouteContext<MobileAuthRouteDependencies>,
) {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  const token = readBearerToken(context.request);
  if (!sessionSecret || !token) {
    return null;
  }
  const state = await context.dependencies.authStore.readState();
  return resolveMobilePrincipalFromBearerToken(state, {
    token,
    sessionSecret,
    now: context.dependencies.now?.() ?? new Date(),
  });
}

function buildMobileAuthStatusPayload(
  principal: Parameters<typeof summarizePlatformPrincipal>[0] | null,
  token: string | null,
): MobileAuthStatusPayload {
  return {
    authenticated: principal !== null,
    principal: principal ? summarizePlatformPrincipal(principal) : null,
    ...(token ? { token } : {}),
  };
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

function readBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/iu);
  return match?.[1]?.trim() || null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readDevicePlatform(value: unknown): PlatformDevicePlatform | undefined {
  if (
    value === 'ios'
    || value === 'android'
    || value === 'web'
    || value === 'unknown'
  ) {
    return value;
  }
  return undefined;
}

function sendMobileAuthError(
  context: RouteContext<MobileAuthRouteDependencies>,
  statusCode: 401 | 403 | 400 | 503,
  code: 'E_UNAUTHENTICATED' | 'E_FORBIDDEN',
  message: string,
): void {
  sendJson(context.response, statusCode, {
    error: { code, message },
  });
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
