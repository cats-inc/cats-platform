import assert from 'node:assert/strict';
import test from 'node:test';

import {
  issueBrowserSession,
  validateCatsCsrfToken,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('cats csrf validator accepts the current browser session token', () => {
  const issued = issueBrowserSession({
    accountId: 'account-1',
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
  });

  assert.deepEqual(validateCatsCsrfToken({
    session: issued.session,
    token: issued.csrfToken,
    sessionSecret: SESSION_SECRET,
  }), { ok: true });
});

test('cats csrf validator rejects missing and stale token material', () => {
  const issued = issueBrowserSession({
    accountId: 'account-1',
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
  });

  assert.deepEqual(validateCatsCsrfToken({
    session: issued.session,
    token: undefined,
    sessionSecret: SESSION_SECRET,
  }), { ok: false, reason: 'missing_token' });
  assert.deepEqual(validateCatsCsrfToken({
    session: { ...issued.session, csrfTokenHash: undefined },
    token: issued.csrfToken,
    sessionSecret: SESSION_SECRET,
  }), { ok: false, reason: 'missing_session_hash' });
  assert.deepEqual(validateCatsCsrfToken({
    session: issued.session,
    token: 'stale-token',
    sessionSecret: SESSION_SECRET,
  }), { ok: false, reason: 'mismatch' });
  assert.deepEqual(validateCatsCsrfToken({
    session: issued.session,
    token: issued.csrfToken,
    sessionSecret: null,
  }), { ok: false, reason: 'missing_secret' });
});
