import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../dist-server/config.js';

test('loadConfig prefers canonical CATS_* variables over compatibility aliases', () => {
  const config = loadConfig({
    CATS_HOST: '0.0.0.0',
    CATS_PORT: '9191',
    CATS_STATE_PATH: 'C:/state/cats.json',
    CATS_INC_HOST: '127.0.0.9',
    CATS_INC_PORT: '9292',
    CATS_INC_STATE_PATH: 'C:/state/legacy.json',
    CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:3110/',
    CATS_RUNTIME_API_KEY: 'token',
    CATS_RUNTIME_STALE_SESSION_RETRY_LIMIT: '3',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 9191);
  assert.equal(config.chatStatePath, 'C:/state/cats.json');
  assert.equal(config.runtimeBaseUrl, 'http://127.0.0.1:3110');
  assert.equal(config.runtimeApiKey, 'token');
  assert.equal(config.debugKeepRuntimeSessionsOnProductDelete, false);
  assert.equal(config.runtimeStaleSessionRetryLimit, 3);
});

test('loadConfig falls back to CATS_INC_* compatibility aliases', () => {
  const config = loadConfig({
    CATS_INC_HOST: '127.0.0.2',
    CATS_INC_PORT: '8282',
    CATS_INC_STATE_PATH: 'C:/state/legacy.json',
    CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:3110',
  });

  assert.equal(config.host, '127.0.0.2');
  assert.equal(config.port, 8282);
  assert.equal(config.chatStatePath, 'C:/state/legacy.json');
  assert.equal(config.debugKeepRuntimeSessionsOnProductDelete, false);
  assert.equal(config.runtimeStaleSessionRetryLimit, 1);
});

test('loadConfig enables runtime session retention override only when explicitly true', () => {
  const enabled = loadConfig({
    CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE: 'true',
  });
  const disabled = loadConfig({
    CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE: 'false',
  });

  assert.equal(enabled.debugKeepRuntimeSessionsOnProductDelete, true);
  assert.equal(disabled.debugKeepRuntimeSessionsOnProductDelete, false);
});
