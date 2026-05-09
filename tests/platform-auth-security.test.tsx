import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalPasswordHash,
  findActiveSessionByToken,
  hashSessionToken,
  issueBrowserSession,
  issueMobileDeviceSession,
  LOCAL_PASSWORD_HASH_ALGORITHM,
  revokeSession,
  touchSession,
  verifyLocalPassword,
  verifySessionTokenHash,
} from '../src/platform/auth/index.ts';

const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';
const NOW = new Date('2026-05-10T00:00:00.000Z');

test('local password hashing stores scrypt metadata and never stores plaintext', async () => {
  const password = 'correct horse battery staple';
  const stored = await createLocalPasswordHash(password, {
    cost: 1024,
    blockSize: 8,
    parallelization: 1,
  });

  assert.equal(stored.passwordHashAlgorithm, LOCAL_PASSWORD_HASH_ALGORITHM);
  assert.doesNotMatch(stored.passwordHash, /correct horse/u);
  assert.equal(await verifyLocalPassword(password, stored), true);
  assert.equal(await verifyLocalPassword('wrong password', stored), false);
  assert.equal(
    await verifyLocalPassword(password, {
      ...stored,
      passwordHashAlgorithm: 'unknown',
    }),
    false,
  );
});

test('browser sessions store token and csrf hashes only', () => {
  const issued = issueBrowserSession({
    accountId: 'account-1',
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
  });

  assert.equal(issued.session.kind, 'browser');
  assert.equal(issued.session.accountId, 'account-1');
  assert.notEqual(issued.session.tokenHash, issued.token);
  assert.notEqual(issued.session.csrfTokenHash, issued.csrfToken);
  assert.equal(verifySessionTokenHash(issued.token, issued.session.tokenHash, SESSION_SECRET), true);
  assert.equal(
    verifySessionTokenHash(`${issued.token}-wrong`, issued.session.tokenHash, SESSION_SECRET),
    false,
  );
});

test('mobile device sessions carry device metadata and are bearer-token scoped', () => {
  const issued = issueMobileDeviceSession({
    accountId: 'account-1',
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
    deviceLabel: 'Owner iPhone',
    devicePlatform: 'ios',
    appVersion: '0.1.0',
    remoteAddress: '192.168.1.20',
  });

  assert.equal(issued.session.kind, 'mobile_device');
  assert.equal(issued.session.deviceLabel, 'Owner iPhone');
  assert.equal(issued.session.devicePlatform, 'ios');
  assert.equal(issued.session.appVersion, '0.1.0');
  assert.equal(issued.session.lastSeenAddress, '192.168.1.20');
  assert.notEqual(issued.session.tokenHash, issued.token);
});

test('session lookup rejects expired, revoked, wrong kind, and wrong secret tokens', () => {
  const issued = issueBrowserSession({
    accountId: 'account-1',
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
  });
  const sessions = [issued.session];

  assert.equal(
    findActiveSessionByToken(sessions, {
      token: issued.token,
      sessionSecret: SESSION_SECRET,
      kind: 'browser',
      now: new Date('2026-05-10T00:00:30.000Z'),
    })?.id,
    issued.session.id,
  );
  assert.equal(
    findActiveSessionByToken(sessions, {
      token: issued.token,
      sessionSecret: SESSION_SECRET,
      kind: 'mobile_device',
      now: new Date('2026-05-10T00:00:30.000Z'),
    }),
    null,
  );
  assert.equal(
    findActiveSessionByToken(sessions, {
      token: issued.token,
      sessionSecret: SESSION_SECRET,
      now: new Date('2026-05-10T00:02:00.000Z'),
    }),
    null,
  );
  assert.equal(
    findActiveSessionByToken([revokeSession(issued.session, NOW)], {
      token: issued.token,
      sessionSecret: SESSION_SECRET,
      now: NOW,
    }),
    null,
  );
});

test('session token hash uses the configured secret and touch updates last seen metadata', () => {
  const token = 'raw-token';
  assert.notEqual(hashSessionToken(token, SESSION_SECRET), hashSessionToken(token, `${SESSION_SECRET}-2`));

  const issued = issueBrowserSession({
    accountId: 'account-1',
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
  });
  const touched = touchSession(issued.session, {
    now: new Date('2026-05-10T00:00:10.000Z'),
    remoteAddress: '127.0.0.1',
  });
  assert.equal(touched.lastSeenAt, '2026-05-10T00:00:10.000Z');
  assert.equal(touched.lastSeenAddress, '127.0.0.1');
});
