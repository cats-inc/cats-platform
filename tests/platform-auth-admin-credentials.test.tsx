import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countUnicodeCodePoints,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  hasExistingPlatformAdmin,
  PLATFORM_ADMIN_PASSWORD_MAX_CODE_POINTS,
  PLATFORM_ADMIN_PASSWORD_MIN_CODE_POINTS,
  PlatformAdminCredentialError,
  PlatformFirstAdminExistsError,
  assertPlatformAdminCredentials,
  validatePlatformAdminCredentials,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-09-02T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

function repeat(character: string, count: number): string {
  return character.repeat(count);
}

test('admin password policy accepts the inclusive 8 to 256 code point range', () => {
  assert.equal(PLATFORM_ADMIN_PASSWORD_MIN_CODE_POINTS, 8);
  assert.equal(PLATFORM_ADMIN_PASSWORD_MAX_CODE_POINTS, 256);

  const sevenCodePoints = validatePlatformAdminCredentials({
    identifier: 'owner@example.test',
    password: repeat('a', 7),
  });
  assert.equal(sevenCodePoints.ok, false);
  if (!sevenCodePoints.ok) {
    assert.equal(sevenCodePoints.reason, 'password_too_short');
  }

  assert.equal(validatePlatformAdminCredentials({
    identifier: 'owner@example.test',
    password: repeat('a', 8),
  }).ok, true);

  assert.equal(validatePlatformAdminCredentials({
    identifier: 'owner@example.test',
    password: repeat('a', 256),
  }).ok, true);

  const tooLong = validatePlatformAdminCredentials({
    identifier: 'owner@example.test',
    password: repeat('a', 257),
  });
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) {
    assert.equal(tooLong.reason, 'password_too_long');
  }
});

test('admin password policy applies no composition rules', () => {
  const candidates = [
    'aaaaaaaa',
    'AAAAAAAA',
    '12345678',
    '        ',
    'correct horse battery staple',
    '!!!!!!!!',
    'åäöüéñçß',
  ];
  for (const password of candidates) {
    assert.equal(
      validatePlatformAdminCredentials({ identifier: 'owner', password }).ok,
      true,
      `expected ${JSON.stringify(password)} to be accepted`,
    );
  }
});

test('admin password length is measured in unicode code points, not utf-16 units', () => {
  // Eight astral-plane code points are sixteen UTF-16 code units. Counting code
  // units would wrongly accept a four-emoji password as eight characters.
  const eightEmoji = '😀😀😀😀😀😀😀😀';
  assert.equal(eightEmoji.length, 16);
  assert.equal(countUnicodeCodePoints(eightEmoji), 8);
  assert.equal(
    validatePlatformAdminCredentials({ identifier: 'owner', password: eightEmoji }).ok,
    true,
  );

  const fourEmoji = '😀😀😀😀';
  assert.equal(fourEmoji.length, 8);
  assert.equal(countUnicodeCodePoints(fourEmoji), 4);
  const rejected = validatePlatformAdminCredentials({
    identifier: 'owner',
    password: fourEmoji,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.reason, 'password_too_short');
  }

  const maxEmoji = '😀'.repeat(256);
  assert.equal(countUnicodeCodePoints(maxEmoji), 256);
  assert.equal(
    validatePlatformAdminCredentials({ identifier: 'owner', password: maxEmoji }).ok,
    true,
  );
  assert.equal(
    validatePlatformAdminCredentials({ identifier: 'owner', password: '😀'.repeat(257) }).ok,
    false,
  );
});

test('admin credentials require both an identifier and a password', () => {
  const missingIdentifier = validatePlatformAdminCredentials({
    identifier: '   ',
    password: 'correct-password',
  });
  assert.equal(missingIdentifier.ok, false);
  if (!missingIdentifier.ok) {
    assert.equal(missingIdentifier.reason, 'identifier_required');
  }

  const missingPassword = validatePlatformAdminCredentials({
    identifier: 'owner@example.test',
    password: '',
  });
  assert.equal(missingPassword.ok, false);
  if (!missingPassword.ok) {
    assert.equal(missingPassword.reason, 'password_required');
  }

  assert.throws(
    () => assertPlatformAdminCredentials({ identifier: undefined, password: undefined }),
    PlatformAdminCredentialError,
  );
});

test('first-admin creation enforces the shared password policy', async () => {
  await assert.rejects(
    () => createFirstAdminLocalAuthState({
      state: createEmptyPlatformAuthState(NOW),
      displayName: 'Owner',
      identifier: 'owner@example.test',
      password: 'short',
      sessionSecret: SESSION_SECRET,
      sessionTtlMs: 60_000,
      now: NOW,
    }),
    PlatformAdminCredentialError,
  );
});

test('first-admin creation refuses to run when an admin already exists', async () => {
  const first = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  assert.equal(hasExistingPlatformAdmin(createEmptyPlatformAuthState(NOW)), false);
  assert.equal(hasExistingPlatformAdmin(first.state), true);

  await assert.rejects(
    () => createFirstAdminLocalAuthState({
      state: first.state,
      displayName: 'Second',
      identifier: 'second@example.test',
      password: 'correct-password',
      sessionSecret: SESSION_SECRET,
      sessionTtlMs: 60_000,
      now: NOW,
    }),
    PlatformFirstAdminExistsError,
  );
});

test('an orphaned admin membership still blocks first-admin creation', async () => {
  const first = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  // Accounts removed but the admin membership left behind: the workspace is
  // not a clean slate and must not silently accept a new first admin.
  assert.equal(hasExistingPlatformAdmin({ ...first.state, accounts: [] }), true);
});
