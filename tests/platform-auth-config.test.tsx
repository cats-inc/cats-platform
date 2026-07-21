import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import {
  DEFAULT_AUTH_ACCOUNT_COOLDOWN_MS,
  DEFAULT_AUTH_ACCOUNT_DAILY_FAILURE_CAP,
  DEFAULT_AUTH_LOGIN_FAILURE_LIMIT,
  DEFAULT_AUTH_LOGIN_LOCKOUT_MS,
  DEFAULT_AUTH_MOBILE_SESSION_TTL_MS,
  DEFAULT_AUTH_SESSION_TTL_MS,
  DEFAULT_AUTH_SUBNET_DAILY_FAILURE_CAP,
} from '../src/platform/auth/index.ts';

const TEST_HOME = process.platform === 'win32' ? 'C:/Users/tester' : '/home/tester';

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: TEST_HOME,
    ...overrides,
  };
}

test('loadConfig exposes default platform auth config and state paths', () => {
  const config = loadConfig(baseEnv());

  assert.equal(config.auth.enabled, true);
  assert.equal(config.auth.mode, 'default');
  assert.equal(config.auth.sessionSecret, null);
  assert.equal(config.auth.sessionTtlMs, DEFAULT_AUTH_SESSION_TTL_MS);
  assert.equal(config.auth.mobileSessionTtlMs, DEFAULT_AUTH_MOBILE_SESSION_TTL_MS);
  assert.equal(config.auth.loginFailureLimit, DEFAULT_AUTH_LOGIN_FAILURE_LIMIT);
  assert.equal(config.auth.loginLockoutMs, DEFAULT_AUTH_LOGIN_LOCKOUT_MS);
  assert.equal(config.auth.accountDailyFailureCap, DEFAULT_AUTH_ACCOUNT_DAILY_FAILURE_CAP);
  assert.equal(config.auth.accountCooldownMs, DEFAULT_AUTH_ACCOUNT_COOLDOWN_MS);
  assert.equal(config.auth.subnetDailyFailureCap, DEFAULT_AUTH_SUBNET_DAILY_FAILURE_CAP);
  assert.deepEqual(config.auth.google, {
    clientId: null,
    hostedDomains: [],
    mobileAudiences: [],
  });
  assert.ok(config.auth.allowedBrowserOrigins.includes('http://127.0.0.1:8181'));
  assert.ok(config.auth.allowedBrowserOrigins.includes('http://localhost:5173'));
  assert.equal(
    config.auth.authStatePath,
    path.join(TEST_HOME, '.cats', 'platform', 'state', 'auth-state.local.json'),
  );
  assert.equal(
    config.auth.recoveryTokenPath,
    path.join(TEST_HOME, '.cats', 'platform', 'state', 'auth-recovery-token.local.txt'),
  );
});

test('loadConfig parses platform auth env overrides', () => {
  const config = loadConfig(baseEnv({
    CATS_AUTH_ENABLED: 'false',
    CATS_AUTH_SESSION_SECRET: 'configured-session-secret',
    CATS_AUTH_SESSION_TTL_MS: '1000',
    CATS_AUTH_MOBILE_SESSION_TTL_MS: '2000',
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '6',
    CATS_AUTH_LOGIN_LOCKOUT_MS: '7000',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '80',
    CATS_AUTH_ACCOUNT_COOLDOWN_MS: '9000',
    CATS_AUTH_SUBNET_DAILY_FAILURE_CAP: '120',
    CATS_AUTH_ALLOWED_BROWSER_ORIGINS:
      'http://localhost:5173, https://cats.example.test/path',
    CATS_AUTH_GOOGLE_CLIENT_ID: 'google-client-id',
    CATS_AUTH_GOOGLE_HD: 'example.test, cats.example',
    CATS_AUTH_GOOGLE_MOBILE_AUDIENCES: 'mobile-ios, mobile-android',
  }));

  assert.equal(config.auth.enabled, false);
  assert.equal(config.auth.mode, 'unsafe_disabled');
  assert.equal(config.auth.sessionSecret, 'configured-session-secret');
  assert.equal(config.auth.sessionTtlMs, 1000);
  assert.equal(config.auth.mobileSessionTtlMs, 2000);
  assert.equal(config.auth.loginFailureLimit, 6);
  assert.equal(config.auth.loginLockoutMs, 7000);
  assert.equal(config.auth.accountDailyFailureCap, 80);
  assert.equal(config.auth.accountCooldownMs, 9000);
  assert.equal(config.auth.subnetDailyFailureCap, 120);
  assert.deepEqual(config.auth.allowedBrowserOrigins, [
    'http://localhost:5173',
    'https://cats.example.test',
  ]);
  assert.deepEqual(config.auth.google, {
    clientId: 'google-client-id',
    hostedDomains: ['example.test', 'cats.example'],
    mobileAudiences: ['mobile-ios', 'mobile-android'],
  });
});

test('loadConfig validates platform auth env values', () => {
  assert.throws(
    () => loadConfig(baseEnv({ CATS_AUTH_ALLOWED_BROWSER_ORIGINS: 'file:///tmp/cats' })),
    /Invalid auth browser origin/u,
  );
  assert.throws(
    () => loadConfig(baseEnv({ CATS_AUTH_LOGIN_LOCKOUT_MS: 'zero' })),
    /CATS_AUTH_LOGIN_LOCKOUT_MS must be a positive integer/u,
  );
  assert.throws(
    () => loadConfig(baseEnv({ CATS_AUTH_ENABLED: 'maybe' })),
    /CATS_AUTH_ENABLED must be true or false/u,
  );
});
