import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addFirstLocalPasswordToAccount,
  createEmptyPlatformAuthState,
  createFirstAdminAuthState,
  createGoogleBrowserSessionForLinkedIdentity,
  FileBackedPlatformAuthStore,
  hasExistingPlatformAdmin,
  linkGoogleIdentityToAccount,
  normalizePlatformAuthState,
  summarizePlatformLoginMethods,
  unlinkGoogleIdentityFromAccount,
  verifyPlatformLocalPasswordCredential,
  type PlatformAuthState,
  type PlatformVerifiedGoogleIdentity,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-10-25T00:00:00Z');
const SECRET = 'convergent-account-test-session-secret';
const GOOGLE: PlatformVerifiedGoogleIdentity = {
  providerSubject: 'google-subject', email: 'owner@example.test',
  hostedDomain: null, displayName: 'Google Owner', avatarUrl: null,
  audience: 'desktop-client', issuer: 'https://accounts.google.com',
  expiresAt: '2026-10-25T01:00:00Z',
};

function createAdmin(provider: 'google' | 'local_password') {
  return createFirstAdminAuthState({
    state: createEmptyPlatformAuthState(NOW), displayName: 'Owner',
    credential: provider === 'google' ? { provider, identity: GOOGLE }
      : { provider, identifier: GOOGLE.email, password: 'correct-password' },
    sessionSecret: SECRET, sessionTtlMs: 3600_000, now: NOW,
  });
}

test('Google-first and password-first accounts converge in authority and login capabilities',
  async () => {
    const googleFirst = await createAdmin('google');
    assert.deepEqual(summarizePlatformLoginMethods(googleFirst.state, googleFirst.account.id), {
      localPassword: { linked: false }, google: { linked: true, email: GOOGLE.email },
    });
    assert.equal(googleFirst.identity.passwordHash, undefined);
    const completedGoogle = await addFirstLocalPasswordToAccount({
      state: googleFirst.state, accountId: googleFirst.account.id,
      sessionId: googleFirst.session.session.id, identity: GOOGLE, password: 'correct-password', now: NOW,
    });
    assert.deepEqual(completedGoogle.accounts, googleFirst.state.accounts);
    assert.deepEqual(completedGoogle.memberships, googleFirst.state.memberships);
    assert.deepEqual(completedGoogle.sessions, googleFirst.state.sessions);

    const localFirst = await createAdmin('local_password');
    const linked = linkGoogleIdentityToAccount({
      state: localFirst.state, accountId: localFirst.account.id, identity: GOOGLE, now: NOW,
    });
    assert.equal(linked.ok, true);
    if (!linked.ok) throw new Error('Expected link.');
    for (const [state, accountId] of [
      [completedGoogle, googleFirst.account.id], [linked.result.state, localFirst.account.id],
    ] as const) {
      assert.deepEqual(summarizePlatformLoginMethods(state, accountId), {
        localPassword: { linked: true }, google: { linked: true, email: GOOGLE.email },
      });
      assert.deepEqual(state.memberships[0]?.roles, ['owner', 'admin']);
      assert.equal(state.memberships[0]?.coreActorId, 'actor-owner');
      const local = await verifyPlatformLocalPasswordCredential(state, {
        identifier: GOOGLE.email, password: 'correct-password',
      });
      assert.equal(local?.account.id, accountId);
      const google = createGoogleBrowserSessionForLinkedIdentity({
        state, identity: GOOGLE, sessionSecret: SECRET, sessionTtlMs: 60_000, now: NOW,
      });
      assert.equal(google?.account.id, accountId);
    }
    assert.equal(googleFirst.state.identities.length, 1, 'input remains unchanged');
  });

test('first password rejects subject/email mismatch, expired proof, inactive session and overwrite',
  async () => {
    const admin = await createAdmin('google');
    const base = {
      state: admin.state, accountId: admin.account.id, sessionId: admin.session.session.id,
      identity: GOOGLE, password: 'correct-password', now: NOW,
    };
    for (const [overrides, reason] of [
      [{ identity: { ...GOOGLE, providerSubject: 'other-subject' } }, 'google_subject_mismatch'],
      [{ identity: { ...GOOGLE, email: 'other@example.test' } }, 'email_mismatch'],
      [{ identity: { ...GOOGLE, expiresAt: NOW.toISOString() } }, 'google_subject_mismatch'],
      [{ sessionId: 'unknown' }, 'session_inactive'],
      [{ now: new Date(NOW.getTime() + 3600_000) }, 'session_inactive'],
    ] as const) {
      await assert.rejects(addFirstLocalPasswordToAccount({ ...base, ...overrides }), { reason });
    }
    const completed = await addFirstLocalPasswordToAccount(base);
    await assert.rejects(addFirstLocalPasswordToAccount({ ...base, state: completed }),
      { reason: 'password_already_exists' });
    assert.equal(admin.state.identities.length, 1);
  });

test('first password does not steal another local identifier or repair damaged credentials',
  async () => {
    const admin = await createAdmin('google');
    const foreign = await createAdmin('local_password');
    const base = {
      accountId: admin.account.id, sessionId: admin.session.session.id,
      identity: GOOGLE, password: 'correct-password', now: NOW,
    };
    await assert.rejects(addFirstLocalPasswordToAccount({
      ...base, state: { ...admin.state, identities: [...admin.state.identities, foreign.identity] },
    }), { reason: 'identifier_conflict' });
    await assert.rejects(addFirstLocalPasswordToAccount({
      ...base, state: { ...admin.state, identities: [...admin.state.identities, {
        ...foreign.identity, accountId: admin.account.id, passwordHash: undefined,
      }] },
    }), { reason: 'password_already_exists' });
  });

test('Google-only is a valid Admin and cannot unlink its last usable method', async () => {
  const admin = await createAdmin('google');
  assert.equal(hasExistingPlatformAdmin(admin.state), true);
  assert.deepEqual(unlinkGoogleIdentityFromAccount({
    state: admin.state, accountId: admin.account.id, keepSessionId: admin.session.session.id, now: NOW,
  }), { ok: false, reason: 'local_fallback_missing' });
  assert.equal(createGoogleBrowserSessionForLinkedIdentity({
    state: admin.state, identity: { ...GOOGLE, providerSubject: 'unknown-same-email' },
    sessionSecret: SECRET, sessionTtlMs: 60_000, now: NOW,
  }), null);
});

test('orphan records and disabled accounts do not reopen first-Admin creation', async () => {
  const admin = await createAdmin('google');
  const states: PlatformAuthState[] = [
    { ...admin.state, accounts: admin.state.accounts.map((account) =>
      ({ ...account, status: 'disabled' as const })) },
    { ...createEmptyPlatformAuthState(NOW), identities: admin.state.identities },
    { ...createEmptyPlatformAuthState(NOW), sessions: admin.state.sessions },
    { ...createEmptyPlatformAuthState(NOW), memberships: admin.state.memberships.map((member) =>
      ({ ...member, roles: ['member'] })) },
  ];
  for (const state of states) {
    await assert.rejects(createFirstAdminAuthState({
      state, displayName: 'Intruder', credential: { provider: 'google', identity: GOOGLE },
      sessionSecret: SECRET, sessionTtlMs: 60_000, now: NOW,
    }), { name: 'PlatformFirstAdminExistsError' });
  }
});

test('v1 files retain identities, sessions, legacy handles and hashes across restart', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-convergent-auth-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const statePath = path.join(root, 'auth.json');
  const store = new FileBackedPlatformAuthStore(statePath, () => NOW);
  const local = await createAdmin('local_password');
  const legacy = { ...local.state, accounts: [{ ...local.account, email: null }],
    identities: [{ ...local.identity, providerSubject: 'old-handle', email: null }] };
  const linked = linkGoogleIdentityToAccount({
    state: legacy, accountId: local.account.id, identity: GOOGLE, now: NOW,
  });
  assert.ok(linked.ok);
  await store.writeState(linked.result.state);
  await writeFile(`${statePath}.interrupted.tmp`, 'incomplete replacement', 'utf8');
  const reopened = await new FileBackedPlatformAuthStore(statePath, () => NOW).readState();
  assert.equal(reopened.version, 1);
  assert.deepEqual(reopened, normalizePlatformAuthState(linked.result.state));
  assert.equal(reopened.identities[0]?.passwordHash, local.identity.passwordHash);
  assert.equal(reopened.identities[0]?.providerSubject, 'old-handle');
  assert.equal((await verifyPlatformLocalPasswordCredential(reopened, {
    identifier: 'old-handle', password: 'correct-password',
  }))?.account.id, local.account.id);
  assert.doesNotMatch(await readFile(statePath, 'utf8'), /correct-password/u);
  assert.deepEqual((await readdir(root)).sort(), ['auth.json', 'auth.json.interrupted.tmp']);
});

test('missing-file initialization cannot overwrite a concurrent Google Admin commit', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-auth-init-race-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let entered!: () => void;
  const paused = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  class PausedStore extends FileBackedPlatformAuthStore {
    private first = true;
    protected override async writeSnapshot(state: PlatformAuthState): Promise<void> {
      if (this.first) { this.first = false; entered(); await hold; }
      await super.writeSnapshot(state);
    }
  }
  const store = new PausedStore(path.join(root, 'auth.json'), () => NOW);
  const initializing = store.readState();
  await paused;
  const creating = store.updateState(async (state) => (await createFirstAdminAuthState({
    state, displayName: 'Owner', credential: { provider: 'google', identity: GOOGLE },
    sessionSecret: SECRET, sessionTtlMs: 60_000, now: NOW,
  })).state);
  try {
    await Promise.race([creating, new Promise((resolve) => setTimeout(resolve, 100))]);
  } finally { release(); }
  await initializing;
  await creating;
  assert.equal((await store.readState()).accounts.length, 1);
  assert.equal((await new FileBackedPlatformAuthStore(path.join(root, 'auth.json')).readState())
    .identities[0]?.provider, 'google');
});
