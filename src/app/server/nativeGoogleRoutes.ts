import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  AUTH_SESSION_COOKIE_NAME, createGoogleBrowserSessionForLinkedIdentity,
  createPlatformAuthSecurityEvent, generateSessionTokenMaterial, hasExistingPlatformAdmin,
  isSessionChainActive, linkGoogleIdentityToAccount, resolveBrowserPrincipalFromToken,
  serializeAuthSessionCookie, summarizePlatformLoginMethods, validateCatsCsrfToken,
  type PlatformPrincipal,
} from '../../platform/auth/index.js';
import {
  PLATFORM_DESKTOP_AUTH_KEY_HEADER, PLATFORM_NATIVE_GOOGLE_AUTH_PATHS,
  type NativeGoogleAuthBinding,
} from '../../shared/nativeGoogleAuth.js';
import { sendJson } from '../../shared/http.js';
import type { ResolvedServerDependencies } from './contracts.js';
import { buildAuthStatusPayload } from './authRoutes.js';

class NativeAuthRejected extends Error {
  constructor(readonly reason: string) { super('Desktop Google sign-in could not be completed.'); }
}

/** Only the authenticated, local Desktop host can issue native Google proofs. */
export async function routeNativeGoogleAuth(
  request: IncomingMessage, response: ServerResponse, url: URL,
  dependencies: ResolvedServerDependencies,
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/desktop/auth/google/')) return false;
  const shared = dependencies.shared;
  const supplied = request.headers[PLATFORM_DESKTOP_AUTH_KEY_HEADER];
  const expected = shared.desktopAuthKey;
  const address = request.socket.remoteAddress?.replace(/^::ffff:/u, '');
  if (request.headers.origin !== undefined || !['127.0.0.1', '::1'].includes(address ?? '')
    || typeof supplied !== 'string' || !expected || expected.length < 32
    || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    sendJson(response, 403, { error: { code: 'desktop_authority_required' } });
    return true;
  }
  if (request.method !== 'POST' || url.search
    || !(Object.values(PLATFORM_NATIVE_GOOGLE_AUTH_PATHS) as string[]).includes(url.pathname)) {
    sendJson(response, 400, { error: { code: 'invalid_native_request' } });
    return true;
  }
  const store = shared.nativeGoogleStore;
  if (!store || !shared.config.auth.sessionSecret) {
    sendJson(response, 503, { error: { code: 'not_configured' } });
    return true;
  }
  let contextId: string | null = null;
  let transactionId: string | null = null;
  let auditBinding: NativeGoogleAuthBinding | null = null;
  try {
    const body = await readBoundedObject(request);
    contextId = required(body.contextId, 128);
    if (url.pathname === PLATFORM_NATIVE_GOOGLE_AUTH_PATHS.cancel) {
      store.cancelTransaction(required(body.transactionId, 128), contextId);
      sendJson(response, 200, { cancelled: true }, { 'Cache-Control': 'no-store' });
      return true;
    }
    const now = shared.now?.() ?? new Date();
    const sessionSecret = shared.config.auth.sessionSecret;
    if (url.pathname === PLATFORM_NATIVE_GOOGLE_AUTH_PATHS.start) {
      const status = await shared.authStore.readStateStatus();
      if (status.status === 'corrupt') throw new NativeAuthRejected('repair_required');
      const core = await shared.coreStore.readCore();
      const purpose = body.purpose;
      let binding: NativeGoogleAuthBinding;
      if (purpose === 'bootstrap') {
        if (core.setupCompleteAt || (status.status === 'ready' && hasExistingPlatformAdmin(status.state))) {
          throw new NativeAuthRejected('already_initialized');
        }
        binding = { purpose, contextId, attemptId: required(body.attemptId, 128) };
      } else if (purpose === 'login') {
        if (!core.setupCompleteAt || status.status !== 'ready') {
          throw new NativeAuthRejected('repair_required');
        }
        binding = { purpose, contextId };
      } else if (purpose === 'link_google' || purpose === 'set_password') {
        if (!core.setupCompleteAt || status.status !== 'ready') {
          throw new NativeAuthRejected('repair_required');
        }
        const principal = resolveBrowserPrincipalFromToken(status.state, {
          token: readSessionCookie(request), sessionSecret, now,
        });
        if (!principal || !validateCatsCsrfToken({
          session: principal.session, token: required(body.csrfToken, 256), sessionSecret,
        }).ok) throw new NativeAuthRejected('session_required');
        if (purpose === 'link_google') required(body.actionToken, 256);
        if (purpose === 'set_password' && status.state.identities.some((entry) =>
          entry.accountId === principal.account.id && entry.provider === 'local_password',
        )) throw new NativeAuthRejected('password_already_exists');
        binding = { purpose, contextId, accountId: principal.account.id, sessionId: principal.session.id };
      } else throw new NativeAuthRejected('invalid_purpose');
      const started = store.begin({
        binding, callbackUrl: required(body.callbackUrl, 256),
        actionToken: purpose === 'link_google' ? required(body.actionToken, 256) : undefined,
      });
      sendJson(response, 200, started, { 'Cache-Control': 'no-store' });
      return true;
    }

    transactionId = required(body.transactionId, 128);
    const transaction = store.readTransaction(transactionId);
    const binding = transaction.binding;
    auditBinding = binding;
    if (binding.contextId !== contextId) throw new NativeAuthRejected('binding_mismatch');
    const proof = await store.complete({
      transactionId, state: required(body.state, 256),
      callbackUrl: required(body.callbackUrl, 256), idToken: required(body.idToken, 8192),
    });
    if (binding.purpose === 'bootstrap' || binding.purpose === 'set_password') {
      sendJson(response, 200, proof, { 'Cache-Control': 'no-store' });
      return true;
    }

    const result: { principal: PlatformPrincipal | null; csrf: string | null; cookie?: string } = {
      principal: null, csrf: null,
    };
    const state = await shared.authStore.updateState((current) => {
      if (binding.purpose === 'login') {
        const identity = store.consume({ token: proof.proofToken, binding });
        const issued = createGoogleBrowserSessionForLinkedIdentity({
          state: current, identity, sessionSecret, sessionTtlMs: shared.config.auth.sessionTtlMs,
          now: shared.now?.() ?? new Date(),
        });
        if (!issued) throw new NativeAuthRejected('google_not_linked');
        result.principal = { account: issued.account, membership: issued.membership,
          session: issued.session.session };
        result.csrf = issued.session.csrfToken;
        result.cookie = serializeAuthSessionCookie(issued.session.token, shared.config.auth.sessionTtlMs);
        return issued.state;
      }
      // Check current session, CSRF and password action grant at the mutation,
      // after asynchronous Google verification, not merely when opening a browser.
      const principal = resolveBrowserPrincipalFromToken(current, {
        token: readSessionCookie(request), sessionSecret, now: shared.now?.() ?? new Date(),
      });
      if (!principal || principal.account.id !== binding.accountId
        || principal.session.id !== binding.sessionId
        || !isSessionChainActive(current.sessions, principal.session, shared.now?.() ?? new Date())) {
        throw new NativeAuthRejected('session_required');
      }
      if (!validateCatsCsrfToken({ session: principal.session,
        token: required(body.csrfToken, 256), sessionSecret }).ok) {
        throw new NativeAuthRejected('session_required');
      }
      const grant = shared.actionGrantStore.consume({
        token: transaction.actionToken ?? '', purpose: 'link_google',
        accountId: binding.accountId, sessionId: binding.sessionId,
        sessionSecret, now: shared.now?.() ?? new Date(),
      });
      if (!grant.ok) throw new NativeAuthRejected('reauth_required');
      const identity = store.consume({ token: proof.proofToken, binding });
      const linked = linkGoogleIdentityToAccount({
        state: current, accountId: binding.accountId, identity, now: shared.now?.() ?? new Date(),
      });
      if (!linked.ok) throw new NativeAuthRejected(linked.reason);
      const csrf = generateSessionTokenMaterial(sessionSecret);
      const session = { ...principal.session, csrfTokenHash: csrf.tokenHash };
      result.principal = { account: linked.result.account, membership: linked.result.membership, session };
      result.csrf = csrf.token;
      return { ...linked.result.state, sessions: linked.result.state.sessions.map((entry) =>
        entry.id === session.id ? session : entry) };
    });
    if (!result.principal) throw new NativeAuthRejected('session_required');
    try { await shared.reportAuthSecurityEvent?.(createPlatformAuthSecurityEvent({
      kind: binding.purpose === 'link_google' ? 'google_link_succeeded' : 'step_up_succeeded',
      outcome: 'success', now, accountId: result.principal.account.id,
      sessionId: result.principal.session.id, reason: binding.purpose,
    })); } catch { /* Audit sink failure must not change committed authentication. */ }
    sendJson(response, 200, buildAuthStatusPayload(shared.config.auth,
      result.principal, result.csrf, summarizePlatformLoginMethods(state, result.principal.account.id)), {
      'Cache-Control': 'no-store', ...(result.cookie ? { 'Set-Cookie': result.cookie } : {}),
    });
  } catch (error) {
    if (contextId && transactionId) store.cancelTransaction(transactionId, contextId);
    const code = error instanceof NativeAuthRejected ? error.reason : 'google_confirmation_failed';
    try { await shared.reportAuthSecurityEvent?.(createPlatformAuthSecurityEvent({
      kind: auditBinding?.purpose === 'link_google' ? 'google_link_failed' : 'step_up_failed',
      outcome: 'failure', now: shared.now?.() ?? new Date(), reason: code,
      ...((auditBinding && 'accountId' in auditBinding)
        ? { accountId: auditBinding.accountId, sessionId: auditBinding.sessionId } : {}),
    })); } catch { /* Keep errors secret-free and independent of the audit sink. */ }
    sendJson(response, 403, { error: { code, message: 'Desktop Google sign-in could not be completed.' } },
      { 'Cache-Control': 'no-store' });
  }
  return true;
}

function required(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new NativeAuthRejected('invalid_request');
  }
  return value;
}

function readSessionCookie(request: IncomingMessage): string {
  const value = request.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_SESSION_COOKIE_NAME}=`))?.split('=').slice(1).join('=');
  try { return value ? decodeURIComponent(value) : ''; } catch { return ''; }
}

async function readBoundedObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += Buffer.byteLength(chunk);
    if (length > 16 * 1024) throw new NativeAuthRejected('invalid_request');
    chunks.push(Buffer.from(chunk));
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NativeAuthRejected('invalid_request');
  }
  return value as Record<string, unknown>;
}
