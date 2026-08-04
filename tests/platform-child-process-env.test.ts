import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlatformChildProcessEnv } from '../src/shared/platformChildProcessEnv.ts';

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
