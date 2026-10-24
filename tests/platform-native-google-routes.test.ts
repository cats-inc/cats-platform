import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { request as httpRequest } from 'node:http';
import { createPlatformIngressListener } from '../src/platform/apps/ingressBoundary.ts';

import { loadConfig } from '../src/config.ts';
import { createServer } from '../src/app/server/index.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import {
  createFirstAdminAuthState, createEmptyPlatformAuthState, FileBackedPlatformAuthStore,
  MemoryPlatformAuthActionGrantStore, type PlatformGoogleIdTokenClaims,
  type PlatformAuthSecurityEvent, type PlatformVerifiedGoogleIdentity,
} from '../src/platform/auth/index.ts';
import { FileChatStore } from '../src/products/chat/state/store.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createChannel, appendMessage } from '../src/products/chat/state/model/index.ts';
import { waitForGuideCatAssistRefreshIdle } from '../src/products/chat/api/guideCatAssist.ts';
import type { NativeGoogleAuthStartResult } from '../src/shared/nativeGoogleAuth.ts';

const NOW = new Date('2026-10-25T00:00:00Z');
const KEY = 'a'.repeat(64), SECRET = 'native-google-fixture-session-secret';
const GOOGLE: PlatformVerifiedGoogleIdentity = { providerSubject: 'google-owner', email: 'owner@example.test',
  hostedDomain: null, displayName: 'Owner', avatarUrl: null, audience: 'desktop-client',
  issuer: 'https://accounts.google.com', expiresAt: '2026-10-25T01:00:00Z' };

async function fixture(t: TestContext, prior: 'local_password' | 'google' | 'none' = 'local_password',
  reporter?: (event: PlatformAuthSecurityEvent) => void) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-native-google-'));
  const config = loadConfig({ HOME: root, CATS_PLATFORM_DIR: path.join(root, 'platform'),
    CATS_AUTH_SESSION_SECRET: SECRET, CATS_AUTH_GOOGLE_DESKTOP_CLIENT_ID: 'desktop-client' });
  const authStore = new FileBackedPlatformAuthStore(config.auth.authStatePath, () => NOW);
  const initial = prior === 'none' ? null : await createFirstAdminAuthState({
    state: createEmptyPlatformAuthState(NOW), displayName: 'Owner',
    credential: prior === 'google' ? { provider: 'google', identity: GOOGLE }
      : { provider: 'local_password', identifier: GOOGLE.email, password: 'existing-password' },
    sessionSecret: SECRET, sessionTtlMs: 3600_000, now: NOW,
  });
  if (initial) await authStore.writeState(initial.state);
  const chatStore = new FileChatStore(config.chatStatePath);
  const core = createDefaultCoreState();
  if (initial) core.setupCompleteAt = NOW.toISOString();
  let chat = prior === 'none' ? createDefaultChatState() : createChannel(createDefaultChatState(), {
    title: 'Conversation to retain', topic: 'Valuable notes', originSurface: 'chat',
  }, NOW);
  if (initial) chat = appendMessage(chat, chat.channels[0]!.id, {
    body: 'A valuable conversation must survive this upgrade.', senderKind: 'user', senderName: 'Owner',
  }, NOW).state;
  await chatStore.writeSnapshot(chat, core);
  const runtimePath = path.join(root, 'runtime-state.json');
  await writeFile(runtimePath, '{"session":"keep-this-runtime-state"}\n');
  const actionGrants = new MemoryPlatformAuthActionGrantStore();
  const tokens = new Map<string, PlatformGoogleIdTokenClaims | (() => Promise<PlatformGoogleIdTokenClaims>)>();
  const events: PlatformAuthSecurityEvent[] = [];
  const server = createServer({ shared: { config, authStore, desktopAuthKey: KEY, actionGrantStore: actionGrants,
    now: () => NOW, googleVerifier: { async verifyIdToken({ token }) {
      const value = tokens.get(token); if (!value) throw new Error('invalid fixture token');
      return typeof value === 'function' ? await value() : value;
    } }, reportAuthSecurityEvent(event) { events.push(event); reporter?.(event); },
    // No real Runtime/provider calls are permitted in this isolated fixture.
    runtimeClient: { async getHealth() { return { reachable: false, status: 'unavailable' }; } } as never,
  }, chat: { chatStore } });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture not listening');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  config.auth.allowedBrowserOrigins.push(baseUrl);
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    await rm(root, { recursive: true, force: true });
  });
  const cookie = initial ? `cats_session=${initial.session.token}` : undefined;
  async function request(pathname: string, body: unknown, options: {
    key?: string | null; cookie?: string; origin?: string;
  } = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, { method: 'POST',
      headers: { 'content-type': 'application/json',
        ...(options.key === null ? {} : { 'x-cats-desktop-auth-key': options.key ?? KEY }),
        ...(options.cookie ?? cookie ? { cookie: options.cookie ?? cookie! } : {}),
        ...(options.origin ? { origin: options.origin } : {}),
      }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, unknown>,
      setCookie: response.headers.get('set-cookie') };
  }
  async function start(purpose: 'bootstrap' | 'login' | 'link_google' | 'set_password', contextId = 'window') {
    const actionToken = initial ? actionGrants.issue({ accountId: initial.account.id,
      sessionId: initial.session.session.id, purpose: 'link_google', sessionSecret: SECRET, now: NOW }).token : '';
    const reply = await request('/api/desktop/auth/google/start', {
      purpose, contextId, callbackUrl: 'http://127.0.0.1:34567/oauth/google/callback',
      attemptId: 'setup', csrfToken: initial?.session.csrfToken, actionToken,
    });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const started = reply.body as unknown as NativeGoogleAuthStartResult;
    tokens.set(started.transactionId, { sub: GOOGLE.providerSubject, email: GOOGLE.email, email_verified: true,
      iss: GOOGLE.issuer, aud: GOOGLE.audience, exp: Date.parse(GOOGLE.expiresAt) / 1000, nonce: started.nonce });
    return started;
  }
  const complete = (started: NativeGoogleAuthStartResult, contextId = 'window') =>
    request('/api/desktop/auth/google/complete', { ...started, contextId,
      idToken: started.transactionId, csrfToken: initial?.session.csrfToken });
  return { root, config, authStore, chatStore, runtimePath, initial, actionGrants,
    request, start, complete, tokens, events, baseUrl, cookie };
}

test('native issuer rejects browser Origin, absent/wrong host keys and public route impersonation', async (t) => {
  const f = await fixture(t, 'none');
  const body = { purpose: 'bootstrap', contextId: 'window', attemptId: 'setup',
    callbackUrl: 'http://127.0.0.1:34567/oauth/google/callback' };
  for (const options of [{ key: null }, { key: 'wrong' }, { origin: 'http://localhost:5173' }]) {
    assert.equal((await f.request('/api/desktop/auth/google/start', body, options)).status, 403);
  }
  assert.equal((await f.authStore.readStateStatus()).status, 'missing');
});

test('public listener denies native Google issuer paths before dispatch even with the real host key', async (t) => {
  let dispatched = false;
  const ingress = await createPlatformIngressListener({ port: 0, origin: () => 'https://cats.example',
    ready: async () => true, dispatch: async (_request, response) => { dispatched = true; response.end(); } });
  t.after(() => ingress.close());
  for (const suffix of ['', '/start', '/complete', '/cancel']) {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(ingress.target + '/api/desktop/auth/google' + suffix,
        { method: 'POST', headers: { host: 'cats.example', 'x-cats-desktop-auth-key': KEY } },
        (response) => { response.resume(); response.on('end', () => resolve(response.statusCode!)); });
      request.on('error', reject); request.end('{}');
    });
    assert.equal(status, 403);
  }
  assert.equal(dispatched, false);
});

test('Google bootstrap verification remains provisional until the existing setup commit', async (t) => {
  const f = await fixture(t, 'none');
  const start = await f.start('bootstrap');
  const proof = await f.complete(start);
  assert.equal(proof.status, 200);
  assert.equal((await f.authStore.readStateStatus()).status, 'missing');
  const response = await fetch(`${f.baseUrl}/api/platform/setup/complete`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173',
      'x-cats-google-proof': String(proof.body.proofToken), 'x-cats-desktop-auth-context': 'window' },
    body: JSON.stringify({ adminMethod: 'google', attemptId: 'setup', ownerDisplayName: 'Owner' }),
  });
  assert.equal(response.status, 200);
  const state = await f.authStore.readState();
  assert.equal(state.accounts.length, 1);
  assert.equal(state.identities[0]?.provider, 'google');
  assert.equal(state.memberships[0]?.coreActorId, 'actor-owner');
});

test('native Google login issues Cats session only for an existing linked subject', async (t) => {
  const f = await fixture(t, 'google');
  const start = await f.start('login');
  const reply = await f.complete(start);
  assert.equal(reply.status, 200);
  assert.equal(reply.body.authenticated, true);
  assert.match(reply.setCookie ?? '', /cats_session=/u);
  assert.doesNotMatch(JSON.stringify(reply.body), /proofToken|nonce|idToken/u);
  assert.equal((await f.complete(start)).status, 403);
});

test('native login cannot claim a password account by matching its email', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.complete(await f.start('login'))).status, 403);
  assert.equal((await f.authStore.readState()).identities.length, 1);
});

test('native first-password proof adds password to the same Google account and both methods can log in', async (t) => {
  const f = await fixture(t, 'google');
  const started = await f.start('set_password');
  const proof = await f.complete(started);
  assert.equal(proof.status, 200);
  assert.equal((await f.authStore.readState()).identities.length, 1, 'verification is provisional');
  const response = await fetch(f.baseUrl + '/api/auth/password/first', { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie: f.cookie!,
      'x-cats-csrf-token': f.initial!.session.csrfToken,
      'x-cats-google-proof': String(proof.body.proofToken), 'x-cats-desktop-auth-context': 'window' },
    body: JSON.stringify({ password: 'new-offline-password' }) });
  assert.equal(response.status, 200, await response.clone().text());
  const state = await f.authStore.readState();
  assert.equal(state.version, 1);
  assert.equal(state.accounts.length, 1);
  assert.equal(state.accounts[0]?.id, f.initial!.account.id);
  assert.equal(state.identities.length, 2);
  assert.deepEqual(state.memberships, f.initial!.state.memberships);
  const passwordLogin = await f.request('/api/auth/login', {
    identifier: GOOGLE.email, password: 'new-offline-password',
  }, { origin: 'http://localhost:5173' });
  assert.equal(passwordLogin.status, 200);
  assert.equal((passwordLogin.body.principal as { accountId: string }).accountId, f.initial!.account.id);
  const googleLogin = await f.complete(await f.start('login'));
  assert.equal(googleLogin.status, 200);
  assert.equal((googleLogin.body.principal as { accountId: string }).accountId, f.initial!.account.id);
});

test('existing password profile upgrades and links Google without changing conversations or Runtime data', async (t) => {
  const f = await fixture(t);
  const beforeAuth = await f.authStore.readState();
  const beforeChat = await readFile(f.config.chatStatePath, 'utf8');
  const beforeRuntime = await readFile(f.runtimePath, 'utf8');
  const login = await f.request('/api/auth/login', {
    identifier: GOOGLE.email, password: 'existing-password',
  }, { origin: 'http://localhost:5173' });
  assert.equal(login.status, 200);
  const start = await f.start('link_google');
  const reply = await f.complete(start);
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  const after = await new FileBackedPlatformAuthStore(f.config.auth.authStatePath).readState();
  assert.equal(after.version, 1);
  assert.equal(after.accounts[0]?.id, beforeAuth.accounts[0]?.id);
  assert.equal(after.identities[0]?.passwordHash, beforeAuth.identities[0]?.passwordHash);
  assert.deepEqual(after.memberships, beforeAuth.memberships);
  assert.equal(after.identities.length, 2);
  assert.equal(await readFile(f.config.chatStatePath, 'utf8'), beforeChat);
  assert.equal(await readFile(f.runtimePath, 'utf8'), beforeRuntime);
  const reopened = await new FileChatStore(f.config.chatStatePath).read();
  assert.ok(reopened.channels[0]?.messages.some((message) =>
    message.body === 'A valuable conversation must survive this upgrade.'));
});

test('linking still consumes password step-up at mutation, not only at browser start', async (t) => {
  const f = await fixture(t);
  const start = await f.start('link_google');
  f.actionGrants.clearForReset();
  assert.equal((await f.complete(start)).status, 403);
  assert.equal((await f.authStore.readState()).identities.length, 1);
  assert.equal(f.events.at(-1)?.kind, 'google_link_failed');
});

test('an old failing verification/cancel cannot remove a newer transaction in the same window', async (t) => {
  const f = await fixture(t, 'google');
  const first = await f.start('login');
  let entered!: () => void, release!: () => void;
  const pending = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  f.tokens.set(first.transactionId, async () => { entered(); await hold; throw new Error('old failure'); });
  const oldCompletion = f.complete(first);
  await pending;
  const second = await f.start('login');
  release();
  assert.equal((await oldCompletion).status, 403);
  await f.request('/api/desktop/auth/google/cancel', { contextId: 'window', transactionId: first.transactionId });
  assert.equal((await f.complete(second)).status, 200);
});

test('native audit failures cannot change a committed login/link outcome', async (t) => {
  const f = await fixture(t, 'google', () => { throw new Error('audit sink unavailable'); });
  assert.equal((await f.complete(await f.start('login'))).status, 200);
  assert.equal((await f.authStore.readState()).sessions.length, 2);
});

test('bad Google nonce is rejected without account/session mutation or token-bearing events', async (t) => {
  const f = await fixture(t, 'google');
  const start = await f.start('login');
  const claims = f.tokens.get(start.transactionId)!;
  assert.equal(typeof claims, 'object');
  f.tokens.set(start.transactionId, { ...claims, nonce: 'wrong' });
  assert.equal((await f.complete(start)).status, 403);
  assert.equal((await f.authStore.readState()).sessions.length, 1);
  assert.equal(f.events.at(-1)?.kind, 'step_up_failed');
  assert.doesNotMatch(JSON.stringify(f.events), new RegExp(`${start.nonce}|${start.transactionId}|owner@`, 'u'));
});
