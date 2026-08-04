import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createPlatformChildProcessEnv } from '../src/shared/platformChildProcessEnv.ts';

const CREDENTIAL_ENV_KEY_SUFFIXES = [
  'SECRET',
  'TOKEN',
  'AUTHTOKEN',
  'API_KEY',
  'PRIVATE_KEY',
  'ACCESS_KEY',
  'PASSWORD',
  'PASSPHRASE',
  'CREDENTIAL',
  'CREDENTIALS',
  'COOKIE',
];
const CREDENTIAL_ENV_KEY_PATTERN = new RegExp(
  `(?:${CREDENTIAL_ENV_KEY_SUFFIXES.join('|')})$`,
  'u',
);

test('platform child process env strips every host-owned credential after applying overrides', () => {
  const childEnv = createPlatformChildProcessEnv({
    CATS_AUTH_SESSION_SECRET: 'override-must-also-be-removed',
    CATS_TELEGRAM_BOT_TOKEN: 'telegram-override-must-be-removed',
    CATS_NGROK_AUTHTOKEN: 'ngrok-override-must-be-removed',
    CHILD_ONLY_VALUE: 'child',
  }, {
    CATS_AUTH_SESSION_SECRET: 'base-must-be-removed',
    CATS_RUNTIME_API_KEY: 'runtime-base-must-be-removed',
    CATS_TELEGRAM_BOT_TOKEN: 'telegram-base-must-be-removed',
    CATS_TELEGRAM_WEBHOOK_SECRET: 'webhook-base-must-be-removed',
    CATS_NGROK_AUTHTOKEN: 'ngrok-base-must-be-removed',
    NGROK_AUTHTOKEN: 'generic-ngrok-base-must-be-removed',
    BASE_ONLY_VALUE: 'base',
  });

  assert.equal(childEnv.CATS_AUTH_SESSION_SECRET, undefined);
  assert.equal(childEnv.CATS_RUNTIME_API_KEY, undefined);
  assert.equal(childEnv.CATS_TELEGRAM_BOT_TOKEN, undefined);
  assert.equal(childEnv.CATS_TELEGRAM_WEBHOOK_SECRET, undefined);
  assert.equal(childEnv.CATS_NGROK_AUTHTOKEN, undefined);
  assert.equal(childEnv.NGROK_AUTHTOKEN, undefined);
  assert.equal(childEnv.BASE_ONLY_VALUE, 'base');
  assert.equal(childEnv.CHILD_ONLY_VALUE, 'child');
});

test('every credential documented in .env.example is stripped from platform child processes', async () => {
  const envExample = await readFile(path.join(process.cwd(), '.env.example'), 'utf8');
  const documentedCredentialKeys = envExample
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && line.includes('='))
    .map((line) => line.slice(0, line.indexOf('=')).trim())
    .filter((key) => CREDENTIAL_ENV_KEY_PATTERN.test(key));

  assert.ok(
    documentedCredentialKeys.length > 0,
    '.env.example should document at least one credential entry',
  );

  const credentialEnv = Object.fromEntries(
    documentedCredentialKeys.map((key) => [key, `must-strip-${key}`]),
  );
  const sanitized = createPlatformChildProcessEnv({}, credentialEnv);
  const unstripped = documentedCredentialKeys.filter((key) => sanitized[key] !== undefined);
  assert.deepEqual(
    unstripped,
    [],
    'Update createPlatformChildProcessEnv so Cats Code child processes cannot read these '
      + `.env.example credentials: ${unstripped.join(', ')}`,
  );
});
