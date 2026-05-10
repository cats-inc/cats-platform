import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  AUTH_SESSION_COOKIE_NAME,
  PLATFORM_AUTH_ERROR_CODES,
  resolveBrowserPrincipalFromToken,
  resolveMobilePrincipalFromBearerToken,
  validateCatsCsrfToken,
  type PlatformAuthStore,
  type PlatformPrincipal,
} from '../../platform/auth/index.js';
import type { PlatformAuthConfig } from '../../platform/auth/config.js';
import {
  classifyPlatformAuthRoute,
  type PlatformAuthGatePhase,
  type PlatformAuthRoutePolicy,
} from './authGatePolicy.js';
import { sendPlatformAuthError } from './authErrorResponses.js';

export type PlatformAuthGateCredentialKind = 'browser_cookie' | 'mobile_bearer';

export type PlatformAuthGateDecision =
  | {
      allowed: true;
      policy: PlatformAuthRoutePolicy;
      principal: PlatformPrincipal | null;
      credentialKind: PlatformAuthGateCredentialKind | null;
    }
  | {
      allowed: false;
      policy: PlatformAuthRoutePolicy;
      statusCode: 401 | 403;
      code: 'E_UNAUTHENTICATED' | 'E_CSRF_MISMATCH';
      message: string;
    };

export type PlatformAuthGateRejection = Extract<
  PlatformAuthGateDecision,
  { allowed: false }
>;

export interface PlatformAuthGateInput {
  request: IncomingMessage;
  pathname: string;
  method: string;
  phase: PlatformAuthGatePhase;
  authStore: PlatformAuthStore;
  auth: PlatformAuthConfig;
  now?: () => Date;
}

interface ResolvedRequestPrincipal {
  principal: PlatformPrincipal;
  credentialKind: PlatformAuthGateCredentialKind;
}

export async function evaluatePlatformAuthGate(
  input: PlatformAuthGateInput,
): Promise<PlatformAuthGateDecision> {
  const method = input.method.toUpperCase();
  const policy = classifyPlatformAuthRoute({
    phase: input.phase,
    method,
    pathname: input.pathname,
  });
  if (policy.access === 'public') {
    if (policy.minimalEnvelope) {
      const resolved = await resolveRequestPrincipal(input);
      if (resolved) {
        return {
          allowed: true,
          policy,
          principal: resolved.principal,
          credentialKind: resolved.credentialKind,
        };
      }
    }
    return {
      allowed: true,
      policy,
      principal: null,
      credentialKind: null,
    };
  }

  const resolved = await resolveRequestPrincipal(input);
  if (!resolved) {
    return {
      allowed: false,
      policy,
      statusCode: 401,
      code: PLATFORM_AUTH_ERROR_CODES.unauthenticated,
      message: 'Authentication is required.',
    };
  }

  if (resolved.credentialKind === 'browser_cookie' && isMutatingMethod(method)) {
    const csrfToken = readHeaderValue(input.request.headers['x-cats-csrf-token']);
    const csrf = validateCatsCsrfToken({
      session: resolved.principal.session,
      token: csrfToken ?? undefined,
      sessionSecret: input.auth.sessionSecret,
    });
    if (!csrf.ok) {
      return {
        allowed: false,
        policy,
        statusCode: 403,
        code: PLATFORM_AUTH_ERROR_CODES.csrfMismatch,
        message: 'CSRF token is missing or invalid.',
      };
    }
  }

  return {
    allowed: true,
    policy,
    principal: resolved.principal,
    credentialKind: resolved.credentialKind,
  };
}

export function sendPlatformAuthGateRejection(
  response: ServerResponse,
  decision: PlatformAuthGateRejection,
): void {
  sendPlatformAuthError(response, decision.statusCode, decision.code, decision.message);
}

async function resolveRequestPrincipal(
  input: PlatformAuthGateInput,
): Promise<ResolvedRequestPrincipal | null> {
  const sessionSecret = input.auth.sessionSecret;
  if (!sessionSecret) {
    return null;
  }
  const bearerToken = readBearerToken(input.request);
  const browserToken = readCookie(input.request, AUTH_SESSION_COOKIE_NAME);
  if (!bearerToken && !browserToken) {
    return null;
  }

  let state;
  try {
    state = await input.authStore.readState();
  } catch {
    return null;
  }

  const now = input.now?.() ?? new Date();
  if (bearerToken) {
    const principal = resolveMobilePrincipalFromBearerToken(state, {
      token: bearerToken,
      sessionSecret,
      now,
    });
    if (principal) {
      return { principal, credentialKind: 'mobile_bearer' };
    }
  }

  if (!browserToken) {
    return null;
  }
  const principal = resolveBrowserPrincipalFromToken(state, {
    token: browserToken,
    sessionSecret,
    now,
  });
  return principal ? { principal, credentialKind: 'browser_cookie' } : null;
}

function isMutatingMethod(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function readBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/iu);
  return match?.[1]?.trim() || null;
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

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}
