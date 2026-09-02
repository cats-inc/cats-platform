import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PENDING_PLATFORM_AUTH_ACTION_GRANTS,
  MemoryPlatformAuthActionGrantStore,
  PLATFORM_AUTH_ACTION_GRANT_TTL_MS,
  createPlatformAuthSecurityEvent,
  isPlatformAuthActionGrantPurpose,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-09-02T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

function createStore() {
  return new MemoryPlatformAuthActionGrantStore();
}

function issue(store: MemoryPlatformAuthActionGrantStore, overrides = {}) {
  return store.issue({
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google',
    sessionSecret: SESSION_SECRET,
    now: NOW,
    ...overrides,
  });
}

test('action grant tokens are opaque, high-entropy, and returned exactly once', () => {
  const store = createStore();
  const first = issue(store);
  const second = issue(store);

  assert.notEqual(first.token, second.token);
  // 32 random bytes base64url-encoded is 43 characters, i.e. 256 bits.
  assert.equal(first.token.length, 43);
  assert.match(first.token, /^[A-Za-z0-9_-]+$/u);
  assert.equal(
    Date.parse(first.expiresAt) - NOW.getTime(),
    PLATFORM_AUTH_ACTION_GRANT_TTL_MS,
  );
  assert.equal(PLATFORM_AUTH_ACTION_GRANT_TTL_MS, 5 * 60 * 1000);
});

test('action grant is consumed on first use', () => {
  const store = createStore();
  const grant = issue(store);
  const input = {
    token: grant.token,
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google' as const,
    sessionSecret: SESSION_SECRET,
    now: NOW,
  };

  assert.deepEqual(store.consume(input), { ok: true, purpose: 'link_google' });
  assert.deepEqual(store.consume(input), { ok: false, reason: 'unknown_or_expired' });
});

test('action grant expires after its five minute lifetime', () => {
  const store = createStore();
  const grant = issue(store);

  const justBefore = store.consume({
    token: grant.token,
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google',
    sessionSecret: SESSION_SECRET,
    now: new Date(NOW.getTime() + PLATFORM_AUTH_ACTION_GRANT_TTL_MS - 1),
  });
  assert.equal(justBefore.ok, true);

  const expired = issue(store);
  const afterTtl = store.consume({
    token: expired.token,
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google',
    sessionSecret: SESSION_SECRET,
    now: new Date(NOW.getTime() + PLATFORM_AUTH_ACTION_GRANT_TTL_MS),
  });
  assert.deepEqual(afterTtl, { ok: false, reason: 'unknown_or_expired' });
});

test('action grant rejects a mismatched purpose, account, or session', () => {
  const store = createStore();
  const base = {
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google' as const,
    sessionSecret: SESSION_SECRET,
    now: NOW,
  };

  const wrongPurpose = issue(store);
  assert.deepEqual(
    store.consume({ ...base, token: wrongPurpose.token, purpose: 'unlink_google' }),
    { ok: false, reason: 'purpose_mismatch' },
  );

  const wrongAccount = issue(store);
  assert.deepEqual(
    store.consume({ ...base, token: wrongAccount.token, accountId: 'account-2' }),
    { ok: false, reason: 'account_mismatch' },
  );

  const wrongSession = issue(store);
  assert.deepEqual(
    store.consume({ ...base, token: wrongSession.token, sessionId: 'session-2' }),
    { ok: false, reason: 'session_mismatch' },
  );
});

test('a grant that fails a binding check is still spent', () => {
  const store = createStore();
  const grant = issue(store);
  const base = {
    token: grant.token,
    accountId: 'account-1',
    sessionId: 'session-1',
    sessionSecret: SESSION_SECRET,
    now: NOW,
  };

  assert.deepEqual(
    store.consume({ ...base, purpose: 'unlink_google' }),
    { ok: false, reason: 'purpose_mismatch' },
  );
  // Requirement 22: the first matching attempt consumes it even on failure.
  assert.deepEqual(
    store.consume({ ...base, purpose: 'link_google' }),
    { ok: false, reason: 'unknown_or_expired' },
  );
});

test('action grant rejects an empty token and a token minted under another secret', () => {
  const store = createStore();
  const grant = issue(store);

  assert.deepEqual(store.consume({
    token: '',
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google',
    sessionSecret: SESSION_SECRET,
    now: NOW,
  }), { ok: false, reason: 'missing_token' });

  assert.deepEqual(store.consume({
    token: grant.token,
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google',
    sessionSecret: 'a-completely-different-session-secret',
    now: NOW,
  }), { ok: false, reason: 'unknown_or_expired' });
});

test('action grants are bounded and evict the oldest entry', () => {
  const store = createStore();
  const first = issue(store, { now: NOW });
  for (let index = 1; index <= MAX_PENDING_PLATFORM_AUTH_ACTION_GRANTS; index += 1) {
    issue(store, { now: new Date(NOW.getTime() + index) });
  }

  assert.deepEqual(store.consume({
    token: first.token,
    accountId: 'account-1',
    sessionId: 'session-1',
    purpose: 'link_google',
    sessionSecret: SESSION_SECRET,
    now: NOW,
  }), { ok: false, reason: 'unknown_or_expired' });
});

test('revoking a session drops its outstanding grants', () => {
  const store = createStore();
  const kept = issue(store, { sessionId: 'session-keep' });
  const dropped = issue(store, { sessionId: 'session-drop' });

  store.revokeForSession('session-drop');

  assert.deepEqual(store.consume({
    token: dropped.token,
    accountId: 'account-1',
    sessionId: 'session-drop',
    purpose: 'link_google',
    sessionSecret: SESSION_SECRET,
    now: NOW,
  }), { ok: false, reason: 'unknown_or_expired' });
  assert.equal(store.consume({
    token: kept.token,
    accountId: 'account-1',
    sessionId: 'session-keep',
    purpose: 'link_google',
    sessionSecret: SESSION_SECRET,
    now: NOW,
  }).ok, true);
});

test('only the two bounded purposes are accepted', () => {
  assert.equal(isPlatformAuthActionGrantPurpose('link_google'), true);
  assert.equal(isPlatformAuthActionGrantPurpose('unlink_google'), true);
  assert.equal(isPlatformAuthActionGrantPurpose('delete_account'), false);
  assert.equal(isPlatformAuthActionGrantPurpose(undefined), false);
});

test('security events carry no secret material and bound the reason code', () => {
  const event = createPlatformAuthSecurityEvent({
    kind: 'google_link_failed',
    outcome: 'failure',
    now: NOW,
    accountId: 'account-1',
    sessionId: 'session-1',
    reason: 'email_mismatch',
  });

  assert.deepEqual(event, {
    kind: 'google_link_failed',
    outcome: 'failure',
    occurredAt: NOW.toISOString(),
    accountId: 'account-1',
    sessionId: 'session-1',
    reason: 'email_mismatch',
  });

  // Free text — such as a password or a raw token that leaked into a reason —
  // is replaced rather than echoed.
  const sanitized = createPlatformAuthSecurityEvent({
    kind: 'step_up_failed',
    outcome: 'failure',
    now: NOW,
    reason: 'correct horse battery staple',
  });
  assert.equal(sanitized.reason, 'unspecified');
  assert.equal(sanitized.accountId, null);
  assert.equal(sanitized.sessionId, null);
});
