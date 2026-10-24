import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PENDING_PLATFORM_GOOGLE_TRANSACTIONS,
  MemoryPlatformGoogleProofStore,
  PlatformGoogleProofError,
  type PlatformGoogleIdTokenClaims,
} from '../src/platform/auth/index.ts';
import {
  NATIVE_GOOGLE_TRANSACTION_TTL_MS,
  type NativeGoogleAuthBinding,
  type NativeGoogleAuthStartResult,
} from '../src/shared/nativeGoogleAuth.ts';

const NOW = new Date('2026-10-25T00:00:00Z');
const CALLBACK = 'http://127.0.0.1:34567/oauth/google/callback';
const BINDING = { purpose: 'bootstrap', attemptId: 'attempt-1', contextId: 'window-1' } as const;

function fixture() {
  let now = NOW;
  let claims: PlatformGoogleIdTokenClaims = {};
  let verify: () => Promise<PlatformGoogleIdTokenClaims> = async () => claims;
  const store = new MemoryPlatformGoogleProofStore({
    clientId: 'desktop-client', now: () => now,
    verifier: { verifyIdToken: () => verify() },
  });
  function begin(binding: NativeGoogleAuthBinding = BINDING) {
    const start = store.begin({ binding, callbackUrl: CALLBACK });
    claims = {
      sub: 'subject-1', email: 'owner@example.test', email_verified: true,
      iss: 'https://accounts.google.com', aud: 'desktop-client',
      exp: NOW.getTime() / 1000 + 3600, nonce: start.nonce,
    };
    return start;
  }
  return {
    store, begin,
    complete: (start: NativeGoogleAuthStartResult) => store.complete({ ...start, idToken: 'id-token' }),
    setNow: (value: Date) => { now = value; },
    setClaims: (value: Partial<PlatformGoogleIdTokenClaims>) => { claims = { ...claims, ...value }; },
    setVerify: (value: typeof verify) => { verify = value; },
    getClaims: () => structuredClone(claims),
  };
}

test('native Google proof is opaque, one use, and independent of account mutation', async () => {
  const f = fixture();
  const start = f.begin();
  assert.equal(start.state.length, 43);
  assert.notEqual(start.nonce, start.state);
  const proof = await f.complete(start);
  assert.equal(proof.proofToken.length, 43);
  assert.equal(Date.parse(proof.expiresAt) - NOW.getTime(), NATIVE_GOOGLE_TRANSACTION_TTL_MS);
  const identity = f.store.consume({ token: proof.proofToken, binding: BINDING });
  assert.equal(identity.providerSubject, 'subject-1');
  assert.throws(() => f.store.consume({ token: proof.proofToken, binding: BINDING }),
    { code: 'unknown_or_expired' });
  await assert.rejects(f.complete(start), { code: 'unknown_or_expired' });
});

test('each account/session/purpose/attempt/window binding is checked and a mismatch spends proof',
  async () => {
    const sensitive = {
      purpose: 'set_password', accountId: 'account-1', sessionId: 'session-1', contextId: 'window-1',
    } as const;
    const cases: Array<[NativeGoogleAuthBinding, NativeGoogleAuthBinding]> = [
      [BINDING, { ...BINDING, attemptId: 'other' }],
      [BINDING, { ...BINDING, contextId: 'other' }],
      [BINDING, { purpose: 'login', contextId: BINDING.contextId }],
      [sensitive, { ...sensitive, accountId: 'other' }],
      [sensitive, { ...sensitive, sessionId: 'other' }],
      [sensitive, { ...sensitive, purpose: 'link_google' }],
    ];
    for (const [binding, wrong] of cases) {
      const f = fixture();
      const proof = await f.complete(f.begin(binding));
      assert.throws(() => f.store.consume({ token: proof.proofToken, binding: wrong }),
        { code: 'binding_mismatch' });
      assert.throws(() => f.store.consume({ token: proof.proofToken, binding }),
        { code: 'unknown_or_expired' });
    }
  });

test('untrusted state/callback and invalid OIDC assertions never create a proof', async () => {
  for (const claims of [
    { nonce: 'wrong' }, { aud: 'web-client' }, { iss: 'https://evil.test' },
    { exp: NOW.getTime() / 1000 }, { sub: '' }, { email: '' }, { email_verified: false },
  ]) {
    const f = fixture();
    const start = f.begin();
    f.setClaims(claims);
    await assert.rejects(f.complete(start), { code: 'invalid_identity' });
    await assert.rejects(f.complete(start), { code: 'unknown_or_expired' });
  }
  for (const override of [{ state: 'wrong' }, { callbackUrl: `${CALLBACK}?wrong=1` }]) {
    const f = fixture();
    const start = f.begin();
    await assert.rejects(f.complete({ ...start, ...override }), { code: 'transaction_mismatch' });
    await assert.rejects(f.complete(start), { code: 'unknown_or_expired' });
  }
});

test('upstream verification failures are redacted', async () => {
  const f = fixture();
  const start = f.begin();
  f.setVerify(async () => { throw new Error('private token material'); });
  await assert.rejects(f.complete(start), (error: unknown) => {
    assert.ok(error instanceof PlatformGoogleProofError);
    assert.doesNotMatch(error.message, /private token/u);
    return true;
  });
});

test('cancellation, replacement and reset during verification cannot resurrect proofs', async () => {
  for (const cancel of ['context', 'replacement', 'reset', 'session'] as const) {
    const f = fixture();
    const start = f.begin({
      purpose: 'set_password', contextId: 'window-1', accountId: 'account-1', sessionId: 'session-1',
    });
    let finish!: (value: PlatformGoogleIdTokenClaims) => void;
    const claims = f.getClaims();
    f.setVerify(() => new Promise((resolve) => { finish = resolve; }));
    const completing = f.complete(start);
    if (cancel === 'context') f.store.cancelContext('window-1');
    if (cancel === 'replacement') f.begin();
    if (cancel === 'reset') f.store.clearForReset();
    if (cancel === 'session') f.store.revokeForSession('session-1');
    finish(claims);
    await assert.rejects(completing, { code: 'unknown_or_expired' });
  }
});

test('transaction and proof expiry include verification time and JWT expiry', async () => {
  const f = fixture();
  const start = f.begin();
  f.setNow(new Date(NOW.getTime() + NATIVE_GOOGLE_TRANSACTION_TTL_MS));
  await assert.rejects(f.complete(start), { code: 'unknown_or_expired' });

  const g = fixture();
  const proofStart = g.begin();
  g.setClaims({ exp: NOW.getTime() / 1000 + 10 });
  const proof = await g.complete(proofStart);
  assert.equal(Date.parse(proof.expiresAt), NOW.getTime() + 10_000);
  g.setNow(new Date(NOW.getTime() + 10_000));
  assert.throws(() => g.store.consume({ token: proof.proofToken, binding: BINDING }),
    { code: 'unknown_or_expired' });

  const h = fixture();
  const pending = h.begin();
  const claims = h.getClaims();
  h.setVerify(async () => {
    h.setNow(new Date(NOW.getTime() + NATIVE_GOOGLE_TRANSACTION_TTL_MS));
    return claims;
  });
  await assert.rejects(h.complete(pending), { code: 'unknown_or_expired' });
});

test('callbacks are exact loopback targets; incomplete publisher registration fails closed', () => {
  const f = fixture();
  for (const callbackUrl of [
    'https://public.example/oauth/google/callback', 'http://localhost:34567/oauth/google/callback',
    'http://127.0.0.1/oauth/google/callback', `${CALLBACK}?query=1`, `${CALLBACK}#fragment`,
    'http://user@127.0.0.1:34567/oauth/google/callback',
  ]) {
    assert.throws(() => f.store.begin({ binding: BINDING, callbackUrl }), { code: 'invalid_callback' });
  }
  const unavailable = new MemoryPlatformGoogleProofStore({
    clientId: null, verifier: { async verifyIdToken() { throw new Error(); } },
  });
  assert.throws(() => unavailable.begin({ binding: BINDING, callbackUrl: CALLBACK }),
    { code: 'not_configured' });
});

test('stores isolate profiles, cap concurrency, and supersede one window without evicting others',
  async () => {
    const f = fixture();
    const proof = await f.complete(f.begin());
    const other = fixture();
    assert.throws(() => other.store.consume({ token: proof.proofToken, binding: BINDING }),
      { code: 'unknown_or_expired' });
    f.begin();
    assert.throws(() => f.store.consume({ token: proof.proofToken, binding: BINDING }),
      { code: 'unknown_or_expired' });
    for (let i = 1; i < MAX_PENDING_PLATFORM_GOOGLE_TRANSACTIONS; i++) {
      f.begin({ ...BINDING, contextId: `window-${i + 1}` });
    }
    assert.throws(() => f.begin({ ...BINDING, contextId: 'overflow' }), { code: 'capacity' });
    assert.doesNotThrow(() => f.begin());
  });
