import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DesktopGoogleAuthController, type DesktopGoogleAuthOptions } from '../desktop/host/googleAuth.ts';
import { DESKTOP_GOOGLE_AUTH_CHANNELS as HOST_CHANNELS } from '../desktop/host/googleAuthContracts.ts';
import { createDesktopGoogleTransport, desktopGoogleSessionCookie,
  readDesktopGoogleClientId } from '../desktop/host/googleAuthTransport.ts';
import { DESKTOP_GOOGLE_AUTH_CHANNELS, type DesktopGoogleAuthBridge,
  type DesktopGoogleAuthStatus } from '../src/shared/nativeGoogleAuth.ts';

function fixture() {
  let now = Date.now();
  let authorize: URL | undefined;
  const requests: Array<{ path: string; body: Record<string, unknown>; headers?: Record<string, string> }> = [];
  const cookies: string[] = [];
  const options: DesktopGoogleAuthOptions = {
    clientId: 'desktop-client', now: () => now,
    openBrowser: async (url) => { authorize = new URL(url); },
    acceptSessionCookie: async (cookie) => { cookies.push(cookie); },
    platformRequest: async (pathname, value, headers) => {
      const body = value as Record<string, unknown>;
      requests.push({ path: pathname, body, headers });
      if (pathname.endsWith('/start')) return { status: 200, body: {
        transactionId: randomUUID(), state: 'server-state', nonce: 'server-nonce',
        callbackUrl: body.callbackUrl, expiresAt: new Date(now + 300_000).toISOString(),
      } };
      if (pathname.endsWith('/complete') && pathname.includes('/auth/google/')) {
        const start = [...requests].reverse().find((request) => request.path.endsWith('/start'))!;
        return start.body.purpose === 'login'
          ? { status: 200, body: { authenticated: true },
            setCookie: 'cats_session=cats-cookie; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600' }
          : { status: 200, body: { proofToken: 'private-proof', expiresAt: new Date(now + 300_000).toISOString() } };
      }
      return { status: 200, body: { ok: true } };
    },
    exchangeCode: async ({ code, verifier, callbackUrl, signal }) => {
      assert.equal(code, 'provider-code');
      assert.equal(authorize?.searchParams.get('redirect_uri'), callbackUrl);
      assert.equal(authorize?.searchParams.get('code_challenge'),
        createHash('sha256').update(verifier).digest('base64url'));
      assert.equal(signal.aborted, false);
      return 'private-id-token';
    },
  };
  const controller = new DesktopGoogleAuthController(options);
  const bridge: DesktopGoogleAuthBridge = controller;
  return { controller, bridge, options, requests, cookies, authorize: () => authorize!,
    setNow: (value: number) => { now = value; } };
}

async function callback(url: URL, suffix = 'code=provider-code&state=server-state') {
  return fetch(`${url.searchParams.get('redirect_uri')}?${suffix}`);
}

async function untilPhase(controller: DesktopGoogleAuthController, id: string,
  phase: DesktopGoogleAuthStatus['phase']) {
  for (let i = 0; i < 100; i++) {
    const status = await controller.status(id);
    if (status.phase === phase) return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Did not reach ${phase}`);
}

test('native Google wires PKCE/state/nonce and exposes only status through the renderer contract', async (t) => {
  assert.deepEqual(HOST_CHANNELS, DESKTOP_GOOGLE_AUTH_CHANNELS);
  const f = fixture(); t.after(() => f.controller.clear());
  const start = await f.bridge.start({ purpose: 'bootstrap', attemptId: 'setup-1' });
  const auth = f.authorize();
  assert.equal(auth.origin, 'https://accounts.google.com');
  assert.equal(auth.searchParams.get('scope'), 'openid email profile');
  assert.equal(auth.searchParams.get('access_type'), 'online');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('state'), 'server-state');
  assert.equal(auth.searchParams.get('nonce'), 'server-nonce');
  assert.equal((await callback(auth, 'code=provider-code&state=wrong')).status, 400);
  assert.equal((await f.bridge.status(start.transactionId)).phase, 'waiting');
  assert.equal((await callback(auth)).status, 200);
  const verified = await untilPhase(f.controller, start.transactionId, 'verified');
  assert.doesNotMatch(JSON.stringify(verified), /private-proof|private-id-token|server-state|server-nonce/u);
  assert.equal(f.cookies.length, 0, 'provisional bootstrap does not issue a session');
  const result = await f.bridge.submit({ transactionId: start.transactionId,
    setup: { attemptId: 'setup-1', ownerDisplayName: 'Owner', createGuideCat: false } });
  assert.equal(result.status, 200);
  const request = f.requests.find((request) => request.path === '/api/platform/setup/complete')!;
  assert.equal(request.body.adminMethod, 'google');
  assert.equal(request.headers?.['x-cats-google-proof'], 'private-proof');
  assert.equal(request.body.adminPassword, undefined);
  await assert.rejects(f.bridge.submit({ transactionId: start.transactionId }), /confirmation/u);
});

test('native Google login transfers its Cats cookie in the host, not in renderer status', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  const start = await f.bridge.start({ purpose: 'login' });
  await callback(f.authorize());
  const status = await untilPhase(f.controller, start.transactionId, 'verified');
  assert.equal(f.cookies.length, 1);
  assert.doesNotMatch(JSON.stringify(status), /cats-cookie|private-id-token/u);
});

test('provider denial closes the callback and preserves a bounded, secret-free failure', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  const start = await f.bridge.start({ purpose: 'login' });
  const auth = f.authorize();
  assert.equal((await callback(auth, 'error=access_denied&state=server-state')).status, 200);
  const status = await untilPhase(f.controller, start.transactionId, 'failed');
  assert.equal(status.error, 'access_denied');
  assert.equal(f.cookies.length, 0);
  await assert.rejects(callback(auth));
});

test('cancelled code exchange cannot complete or set a session after its late result', async () => {
  let authorize: URL | undefined;
  let finish!: (token: string) => void;
  let exchanged!: () => void;
  const exchanging = new Promise<void>((resolve) => { exchanged = resolve; });
  let completed = false, accepted = false;
  const controller = new DesktopGoogleAuthController({
    clientId: 'desktop-client', openBrowser: async (url) => { authorize = new URL(url); },
    acceptSessionCookie: async () => { accepted = true; },
    platformRequest: async (pathname, value) => {
      const body = value as Record<string, unknown>;
      if (pathname.endsWith('/start')) return { status: 200, body: {
        transactionId: 'transaction', state: 'server-state', nonce: 'nonce', callbackUrl: body.callbackUrl,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      } };
      if (pathname.endsWith('/complete')) completed = true;
      return { status: 200, body: {} };
    },
    exchangeCode: () => new Promise((resolve) => { finish = resolve; exchanged(); }),
  });
  try {
    const start = await controller.start({ purpose: 'login' });
    await callback(authorize!);
    await exchanging;
    await controller.cancel(start.transactionId);
    finish('late-token');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completed, false);
    assert.equal(accepted, false);
    assert.equal((await controller.status(start.transactionId)).phase, 'cancelled');
    await assert.rejects(callback(authorize!));
  } finally { await controller.clear(); }
});

test('expiry and sequential replacement close only the owned callback listener', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  const first = await f.bridge.start({ purpose: 'login' });
  const old = f.authorize();
  const second = await f.bridge.start({ purpose: 'login' });
  assert.notEqual(first.transactionId, second.transactionId);
  await assert.rejects(callback(old));
  await assert.rejects(f.bridge.status(first.transactionId));
  f.setNow(Date.parse(second.expiresAt));
  assert.equal((await f.bridge.status(second.transactionId)).error, 'expired');
  await assert.rejects(callback(f.authorize()));
});

test('first-password submit has a fixed target and cannot choose an account/email', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  const start = await f.bridge.start({ purpose: 'set_password', csrfToken: 'current-csrf' });
  await callback(f.authorize());
  await untilPhase(f.controller, start.transactionId, 'verified');
  await f.bridge.submit({ transactionId: start.transactionId, password: 'new-password', csrfToken: 'new-csrf' });
  const request = f.requests.find((request) => request.path === '/api/auth/password/first')!;
  assert.deepEqual(request.body, { password: 'new-password' });
  assert.equal(request.headers?.['x-cats-csrf-token'], 'new-csrf');
});

test('distribution configuration is separate from Web/Mobile clients and supports packaged injection', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-google-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await readDesktopGoogleClientId(root, { CATS_AUTH_GOOGLE_CLIENT_ID: 'web-client' }), null);
  await writeFile(path.join(root, 'google-desktop-oauth.json'), '{"clientId":"packaged-client"}');
  assert.equal(await readDesktopGoogleClientId(root, {}), 'packaged-client');
  assert.equal(await readDesktopGoogleClientId(root,
    { CATS_AUTH_GOOGLE_DESKTOP_CLIENT_ID: 'env-client' }), 'env-client');
});

test('private transport keeps keys/cookies out of renderer networking and denies arbitrary targets', async () => {
  const calls: RequestInit[] = [];
  const transport = createDesktopGoogleTransport({ baseUrl: 'http://127.0.0.1:8181', key: 'private-key',
    sessionCookie: async () => 'private-cookie', fetch: async (_url, init) => {
      calls.push(init!); return Response.json({ ok: true });
    } });
  await transport('/api/desktop/auth/google/start', { purpose: 'login' });
  assert.equal((calls[0].headers as Record<string, string>).origin, undefined);
  assert.equal((calls[0].headers as Record<string, string>)['x-cats-desktop-auth-key'], 'private-key');
  await transport('/api/auth/password/first', { password: 'password' });
  assert.equal((calls[1].headers as Record<string, string>).origin, 'http://127.0.0.1:8181');
  assert.equal((calls[1].headers as Record<string, string>)['x-cats-desktop-auth-key'], undefined);
  await assert.rejects(transport('https://evil.test', {}));
  assert.equal(desktopGoogleSessionCookie(
    'cats_session=token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600', 'http://127.0.0.1:8181').httpOnly, true);
  assert.throws(() => desktopGoogleSessionCookie('other_cookie=token', 'http://127.0.0.1:8181'));
});

test('cancel during private start prevents a later browser launch and closes the pending listener', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  const original = f.options.platformRequest;
  let entered!: () => void, release!: () => void;
  const pending = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  f.options.platformRequest = async (...args) => {
    const reply = await original(...args);
    if (args[0].endsWith('/start')) { entered(); await hold; }
    return reply;
  };
  const starting = f.bridge.start({ purpose: 'login' });
  const rejected = assert.rejects(starting, /could not start/u);
  await pending;
  await assert.rejects(f.bridge.start({ purpose: 'login' }), /in progress/u);
  await f.bridge.cancel();
  release(); await rejected;
  assert.equal(f.authorize(), undefined);
  const callbackUrl = String(f.requests.find((request) => request.path.endsWith('/start'))!.body.callbackUrl);
  await assert.rejects(fetch(callbackUrl));
});

test('cancel while a replacement waits for cleanup cannot be overtaken by that replacement', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  await f.bridge.start({ purpose: 'login' });
  const firstUrl = f.authorize().href;
  const original = f.options.platformRequest;
  let entered!: () => void, release!: () => void;
  const pending = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  f.options.platformRequest = async (...args) => {
    if (args[0].endsWith('/cancel')) { entered(); await hold; }
    return original(...args);
  };
  const starting = f.bridge.start({ purpose: 'login' });
  const rejected = assert.rejects(starting, /cancelled/u);
  await pending;
  await f.bridge.cancel(); release(); await rejected;
  assert.equal(f.authorize().href, firstUrl);
});

test('a cancelled deferred submit cannot publish a late cookie or cancel another attempt', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  const start = await f.bridge.start({ purpose: 'bootstrap', attemptId: 'setup' });
  await callback(f.authorize()); await untilPhase(f.controller, start.transactionId, 'verified');
  const original = f.options.platformRequest;
  let entered!: () => void, release!: () => void;
  const pending = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  f.options.platformRequest = async (...args) => {
    if (args[0] === '/api/platform/setup/complete') {
      entered(); await hold;
      return { status: 200, body: {}, setCookie: 'late-cookie' };
    }
    return original(...args);
  };
  const submitting = f.bridge.submit({ transactionId: start.transactionId,
    setup: { attemptId: 'setup', ownerDisplayName: 'Owner' } });
  const rejected = assert.rejects(submitting, /cancelled/u);
  await pending;
  await f.bridge.cancel(start.transactionId);
  await assert.rejects(f.bridge.start({ purpose: 'login' }), /in progress/u);
  release(); await rejected;
  const next = await f.bridge.start({ purpose: 'login' });
  assert.equal((await f.bridge.status(next.transactionId)).phase, 'waiting');
  assert.equal(f.cookies.length, 0);
});

test('cookie publication is a non-cancellable commit and survives transaction expiry', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  let entered!: () => void, release!: () => void;
  const pending = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  f.options.acceptSessionCookie = async (cookie) => { entered(); await hold; f.cookies.push(cookie); };
  const start = await f.bridge.start({ purpose: 'login' });
  await callback(f.authorize()); await pending;
  f.setNow(Date.parse(start.expiresAt) + 1);
  assert.equal((await f.bridge.status(start.transactionId)).committing, true);
  assert.equal((await f.bridge.cancel(start.transactionId))?.committing, true);
  await assert.rejects(f.bridge.start({ purpose: 'login' }), /in progress/u);
  release();
  assert.equal((await untilPhase(f.controller, start.transactionId, 'verified')).phase, 'verified');
  assert.equal(f.cookies.length, 1);
});

test('full exit closes local callback resources even when private cancellation never returns', async () => {
  const f = fixture();
  await f.bridge.start({ purpose: 'login' });
  const url = f.authorize();
  f.options.platformRequest = async () => new Promise(() => {});
  const before = Date.now();
  await f.controller.clear();
  assert.ok(Date.now() - before < 2000, 'shutdown must bound remote cleanup to one second');
  await assert.rejects(callback(url));
});

test('offline code exchange fails without publishing a Cats cookie and closes the listener', async (t) => {
  const f = fixture(); t.after(() => f.controller.clear());
  f.options.exchangeCode = async () => { throw new Error('offline provider detail must stay private'); };
  const start = await f.bridge.start({ purpose: 'login' });
  await callback(f.authorize());
  const failed = await untilPhase(f.controller, start.transactionId, 'failed');
  assert.equal(failed.error, 'confirmation_failed');
  assert.equal(f.cookies.length, 0);
  assert.doesNotMatch(JSON.stringify(failed), /offline provider detail/u);
  await assert.rejects(callback(f.authorize()));
});
