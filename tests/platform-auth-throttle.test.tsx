import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearAllLoginThrottleState,
  clearLoginThrottleForAccount,
  createEmptyPlatformAuthState,
  createLoginThrottleSubject,
  evaluateLoginThrottle,
  recordFailedLogin,
  recordSuccessfulLogin,
  resolveLoginSubnetKey,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const POLICY = {
  loginFailureLimit: 2,
  loginLockoutMs: 30_000,
  accountDailyFailureCap: 4,
  accountCooldownMs: 60_000,
  subnetDailyFailureCap: 5,
};

test('login throttle locks only the composite account and address first', () => {
  let state = createEmptyPlatformAuthState(NOW);
  const subject = createLoginThrottleSubject({
    provider: 'local_password',
    accountKey: 'owner@example.test',
    remoteAddress: '192.168.1.42',
  });
  state = recordFailedLogin(state, { subject, policy: POLICY, now: NOW });
  state = recordFailedLogin(state, { subject, policy: POLICY, now: NOW });

  const blocked = evaluateLoginThrottle(state, { subject, policy: POLICY, now: NOW });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, 'composite_lockout');

  const otherAddress = createLoginThrottleSubject({
    provider: 'local_password',
    accountKey: 'owner@example.test',
    remoteAddress: '192.168.1.43',
  });
  assert.equal(
    evaluateLoginThrottle(state, { subject: otherAddress, policy: POLICY, now: NOW }).blocked,
    false,
  );
});

test('login throttle applies account daily cooldown across addresses', () => {
  let state = createEmptyPlatformAuthState(NOW);
  for (let index = 0; index < POLICY.accountDailyFailureCap; index += 1) {
    state = recordFailedLogin(state, {
      subject: createLoginThrottleSubject({
        provider: 'local_password',
        accountKey: 'owner@example.test',
        remoteAddress: `10.0.${index}.10`,
      }),
      policy: POLICY,
      now: NOW,
    });
  }

  const freshAddress = createLoginThrottleSubject({
    provider: 'local_password',
    accountKey: 'owner@example.test',
    remoteAddress: '172.16.0.20',
  });
  const blocked = evaluateLoginThrottle(state, { subject: freshAddress, policy: POLICY, now: NOW });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, 'account_daily_cap');

  const cleared = recordSuccessfulLogin(state, { subject: freshAddress, now: NOW });
  assert.equal(
    evaluateLoginThrottle(cleared, { subject: freshAddress, policy: POLICY, now: NOW }).blocked,
    false,
  );
});

test('login throttle applies subnet budget to IPv4 mapped remote addresses', () => {
  let state = createEmptyPlatformAuthState(NOW);
  for (let index = 0; index < POLICY.subnetDailyFailureCap; index += 1) {
    state = recordFailedLogin(state, {
      subject: createLoginThrottleSubject({
        provider: 'local_password',
        accountKey: `account-${index}@example.test`,
        remoteAddress: `::ffff:192.168.9.${index + 1}`,
      }),
      policy: POLICY,
      now: NOW,
    });
  }

  const sameSubnet = createLoginThrottleSubject({
    provider: 'local_password',
    accountKey: 'new@example.test',
    remoteAddress: '192.168.9.200',
  });
  const blocked = evaluateLoginThrottle(state, { subject: sameSubnet, policy: POLICY, now: NOW });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, 'subnet_daily_cap');
  assert.equal(resolveLoginSubnetKey('::ffff:192.168.9.42'), '192.168.9.0/24');
});

test('login throttle account clearing preserves subnet cooldowns', () => {
  let state = createEmptyPlatformAuthState(NOW);
  for (let index = 0; index < POLICY.subnetDailyFailureCap; index += 1) {
    state = recordFailedLogin(state, {
      subject: createLoginThrottleSubject({
        provider: 'local_password',
        accountKey: index === 0 ? 'owner@example.test' : `other-${index}@example.test`,
        remoteAddress: `192.168.20.${index + 1}`,
      }),
      policy: POLICY,
      now: NOW,
    });
  }

  const ownerSubject = createLoginThrottleSubject({
    provider: 'local_password',
    accountKey: 'owner@example.test',
    remoteAddress: '192.168.20.200',
  });
  const cleared = clearLoginThrottleForAccount(state, {
    provider: 'local_password',
    accountKey: 'owner@example.test',
    now: NOW,
  });
  const stillBlocked = evaluateLoginThrottle(cleared, {
    subject: ownerSubject,
    policy: POLICY,
    now: NOW,
  });

  assert.equal(stillBlocked.blocked, true);
  assert.equal(stillBlocked.reason, 'subnet_daily_cap');
  assert.equal(cleared.loginFailures.some((failure) =>
    failure.accountKey === 'owner@example.test'), false);
  assert.ok(cleared.loginCooldowns.some((cooldown) => cooldown.reason === 'subnet_daily_cap'));
});

test('login throttle recovery clearing removes all active failure budgets', () => {
  let state = createEmptyPlatformAuthState(NOW);
  for (let index = 0; index < POLICY.accountDailyFailureCap; index += 1) {
    state = recordFailedLogin(state, {
      subject: createLoginThrottleSubject({
        provider: 'local_password',
        accountKey: 'owner@example.test',
        remoteAddress: `10.10.${index}.10`,
      }),
      policy: POLICY,
      now: NOW,
    });
  }

  const subject = createLoginThrottleSubject({
    provider: 'local_password',
    accountKey: 'owner@example.test',
    remoteAddress: '172.16.0.20',
  });
  assert.equal(evaluateLoginThrottle(state, { subject, policy: POLICY, now: NOW }).blocked, true);

  const cleared = clearAllLoginThrottleState(state, { now: NOW });
  assert.equal(cleared.loginFailures.length, 0);
  assert.equal(cleared.loginCooldowns.length, 0);
  assert.equal(
    evaluateLoginThrottle(cleared, { subject, policy: POLICY, now: NOW }).blocked,
    false,
  );
});
