import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  createGoogleBrowserSessionForLinkedIdentity,
  hashSessionToken,
  issueBrowserSession,
  linkGoogleIdentityToAccount,
  normalizePlatformAccountEmail,
  summarizePlatformLoginMethods,
  unlinkGoogleIdentityFromAccount,
  type PlatformAuthState,
  type PlatformVerifiedGoogleIdentity,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

const GOOGLE_IDENTITY = {
  providerSubject: 'google-subject-1',
  email: 'owner@example.test',
  hostedDomain: 'example.test',
  displayName: 'Owner',
  avatarUrl: 'https://example.test/avatar.png',
  audience: 'browser-client-id',
  issuer: 'https://accounts.google.com',
  expiresAt: '2026-05-10T01:00:00.000Z',
} satisfies PlatformVerifiedGoogleIdentity;

async function createLocalAdmin(identifier = 'owner@example.test') {
  return createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier,
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
}

function linkedState(state: PlatformAuthState, accountId: string): PlatformAuthState {
  const outcome = linkGoogleIdentityToAccount({
    state,
    accountId,
    identity: GOOGLE_IDENTITY,
    now: new Date(NOW.getTime() + 1_000),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    throw new Error('expected link to succeed');
  }
  return outcome.result.state;
}

test('google link helper links verified identity to matching local account', async () => {
  const first = await createLocalAdmin();
  const outcome = linkGoogleIdentityToAccount({
    state: first.state,
    accountId: first.account.id,
    identity: GOOGLE_IDENTITY,
    now: new Date(NOW.getTime() + 1_000),
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  const linked = outcome.result;
  assert.equal(linked.account.id, first.account.id);
  assert.equal(linked.account.email, GOOGLE_IDENTITY.email);
  assert.equal(linked.adoptedAccountEmail, false);
  assert.equal(linked.identity.provider, 'google');
  assert.equal(linked.identity.providerSubject, GOOGLE_IDENTITY.providerSubject);
  assert.equal(linked.identity.passwordHash, undefined);
  assert.equal(linked.membership.coreActorId, 'actor-owner');
  assert.equal(linked.state.identities.length, 2);
});

test('google link helper rejects a verified email that differs from the account email', async () => {
  const first = await createLocalAdmin();
  const outcome = linkGoogleIdentityToAccount({
    state: first.state,
    accountId: first.account.id,
    identity: { ...GOOGLE_IDENTITY, email: 'someone-else@example.test' },
    now: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }
  assert.equal(outcome.reason, 'email_mismatch');
});

test('google link helper compares emails after trim and lowercase only', async () => {
  const first = await createLocalAdmin();
  const outcome = linkGoogleIdentityToAccount({
    state: first.state,
    accountId: first.account.id,
    identity: { ...GOOGLE_IDENTITY, email: '  Owner@Example.TEST  ' },
    now: NOW,
  });

  assert.equal(outcome.ok, true);
  // Gmail dot/plus canonicalization is deliberately not applied.
  const aliased = linkGoogleIdentityToAccount({
    state: first.state,
    accountId: first.account.id,
    identity: { ...GOOGLE_IDENTITY, email: 'own.er@example.test' },
    now: NOW,
  });
  assert.equal(aliased.ok, false);
});

test('google link helper adopts the verified email only for a handle-only account', async () => {
  const first = await createLocalAdmin('owner-handle');
  assert.equal(first.account.email, null);

  const outcome = linkGoogleIdentityToAccount({
    state: first.state,
    accountId: first.account.id,
    identity: GOOGLE_IDENTITY,
    now: NOW,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.result.adoptedAccountEmail, true);
  assert.equal(outcome.result.account.email, 'owner@example.test');
});

test('google link helper is idempotent for the same subject on the same account', async () => {
  const first = await createLocalAdmin();
  const once = linkedState(first.state, first.account.id);
  const twice = linkGoogleIdentityToAccount({
    state: once,
    accountId: first.account.id,
    identity: GOOGLE_IDENTITY,
    now: new Date(NOW.getTime() + 2_000),
  });

  assert.equal(twice.ok, true);
  if (!twice.ok) {
    return;
  }
  assert.equal(
    twice.result.state.identities.filter((identity) => identity.provider === 'google').length,
    1,
  );
});

test('google link helper rejects cross-account provider subject conflicts', async () => {
  const first = await createLocalAdmin();
  const state = linkedState(first.state, first.account.id);
  const secondAccount = {
    ...first.account,
    id: 'auth-account-second',
    email: 'owner@example.test',
    displayName: 'Second Admin',
  };
  const secondMembership = {
    ...first.membership,
    id: 'auth-membership-second',
    accountId: secondAccount.id,
    coreActorId: null,
  };

  const outcome = linkGoogleIdentityToAccount({
    state: {
      ...state,
      accounts: [...state.accounts, secondAccount],
      memberships: [...state.memberships, secondMembership],
    },
    accountId: secondAccount.id,
    identity: GOOGLE_IDENTITY,
    now: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }
  assert.equal(outcome.reason, 'subject_owned_by_other_account');
});

test('google link helper refuses to replace a different google identity', async () => {
  const first = await createLocalAdmin();
  const state = linkedState(first.state, first.account.id);

  const outcome = linkGoogleIdentityToAccount({
    state,
    accountId: first.account.id,
    identity: { ...GOOGLE_IDENTITY, providerSubject: 'google-subject-2' },
    now: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }
  assert.equal(outcome.reason, 'account_has_other_google_identity');
});

test('google unlink helper removes the identity and revokes every other session', async () => {
  const first = await createLocalAdmin();
  const state = linkedState(first.state, first.account.id);
  const otherBrowser = issueBrowserSession({
    accountId: first.account.id,
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
  });
  const stateWithSessions: PlatformAuthState = {
    ...state,
    sessions: [...state.sessions, otherBrowser.session],
  };
  const keepSessionId = first.session.session.id;

  const outcome = unlinkGoogleIdentityFromAccount({
    state: stateWithSessions,
    accountId: first.account.id,
    keepSessionId,
    now: new Date(NOW.getTime() + 5_000),
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  const next = outcome.result.state;
  assert.equal(next.identities.some((identity) => identity.provider === 'google'), false);
  assert.equal(next.identities.some((identity) => identity.provider === 'local_password'), true);
  assert.deepEqual(outcome.result.revokedSessionIds, [otherBrowser.session.id]);
  assert.equal(
    next.sessions.find((session) => session.id === keepSessionId)?.revokedAt,
    null,
  );
  assert.equal(
    typeof next.sessions.find((session) => session.id === otherBrowser.session.id)?.revokedAt,
    'string',
  );
});

test('google unlink helper refuses when it would leave no local fallback', async () => {
  const first = await createLocalAdmin();
  const state = linkedState(first.state, first.account.id);
  const withoutLocal: PlatformAuthState = {
    ...state,
    identities: state.identities.filter((identity) => identity.provider !== 'local_password'),
  };

  const outcome = unlinkGoogleIdentityFromAccount({
    state: withoutLocal,
    accountId: first.account.id,
    keepSessionId: first.session.session.id,
    now: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }
  assert.equal(outcome.reason, 'local_fallback_missing');
});

test('google unlink helper refuses when no google identity is linked', async () => {
  const first = await createLocalAdmin();
  const outcome = unlinkGoogleIdentityFromAccount({
    state: first.state,
    accountId: first.account.id,
    keepSessionId: first.session.session.id,
    now: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }
  assert.equal(outcome.reason, 'google_not_linked');
});

test('login-method projection reports linked state from identity records', async () => {
  const first = await createLocalAdmin();
  const before = summarizePlatformLoginMethods(first.state, first.account.id);
  assert.deepEqual(before, {
    localPassword: { linked: true },
    google: { linked: false, email: null },
  });

  const after = summarizePlatformLoginMethods(
    linkedState(first.state, first.account.id),
    first.account.id,
  );
  assert.deepEqual(after, {
    localPassword: { linked: true },
    google: { linked: true, email: 'owner@example.test' },
  });
});

test('email normalization trims and lowercases without alias canonicalization', () => {
  assert.equal(normalizePlatformAccountEmail('  Owner@Example.test '), 'owner@example.test');
  assert.equal(normalizePlatformAccountEmail(''), null);
  assert.equal(normalizePlatformAccountEmail(null), null);
  assert.equal(normalizePlatformAccountEmail('o.wner+tag@example.test'), 'o.wner+tag@example.test');
});

test('ordinary google login does not rewrite the cats account email', async () => {
  const first = await createLocalAdmin();
  const state = linkedState(first.state, first.account.id);
  const login = createGoogleBrowserSessionForLinkedIdentity({
    state: { ...state, sessions: [] },
    identity: {
      ...GOOGLE_IDENTITY,
      email: 'new-owner@example.test',
      avatarUrl: 'https://example.test/new-avatar.png',
    },
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: new Date(NOW.getTime() + 1_000),
  });

  assert.ok(login);
  assert.equal(login.account.id, first.account.id);
  // SPEC-113 requirement 35: login never claims or merges an account by email.
  assert.equal(login.account.email, 'owner@example.test');
  assert.equal(login.account.avatarUrl, 'https://example.test/new-avatar.png');
  assert.equal(login.state.sessions.length, 1);
  assert.equal(
    login.state.sessions[0]?.tokenHash,
    hashSessionToken(login.session.token, SESSION_SECRET),
  );
});

test('google linked-identity helper preserves explicit membership actor mapping', async () => {
  const first = await createLocalAdmin();
  const state = linkedState(first.state, first.account.id);
  const login = createGoogleBrowserSessionForLinkedIdentity({
    state: {
      ...state,
      memberships: [{ ...first.membership, coreActorId: null }],
      sessions: [],
    },
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  assert.ok(login);
  assert.equal(login.membership.coreActorId, null);
});

test('google linked-identity helper rejects unknown or disabled accounts', async () => {
  const first = await createLocalAdmin();
  const state = linkedState(first.state, first.account.id);

  assert.equal(createGoogleBrowserSessionForLinkedIdentity({
    state,
    identity: { ...GOOGLE_IDENTITY, providerSubject: 'unknown-subject' },
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  }), null);
  assert.equal(createGoogleBrowserSessionForLinkedIdentity({
    state: {
      ...state,
      accounts: [{ ...first.account, status: 'disabled' }],
    },
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  }), null);
});
