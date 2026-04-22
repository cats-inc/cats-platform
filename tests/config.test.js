import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { loadConfig } from '../build/server/config.js';

test('loadConfig derives storage paths from canonical root directories', () => {
  const config = loadConfig({
    CATS_HOST: '0.0.0.0',
    CATS_PORT: '9191',
    CATS_PLATFORM_DIR: 'C:/Users/test/.cats/platform',
    CATS_DESKTOP_DIR: 'C:/Users/test/.cats/desktop',
    CATS_RUNTIME_DIR: 'C:/Users/test/.cats/runtime',
    CATS_INC_HOST: '127.0.0.9',
    CATS_INC_PORT: '9292',
    CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:3110/',
    CATS_RUNTIME_API_KEY: 'token',
    CATS_RUNTIME_SETUP_PROXY_TIMEOUT_MS: '12345',
    CATS_RUNTIME_STALE_SESSION_RETRY_LIMIT: '3',
    CATS_MAX_CHAT_PARTICIPANTS: '7',
    CATS_MAX_AUDIENCE_PARTICIPANTS: '2',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 9191);
  assert.equal(
    config.chatStatePath,
    path.join('C:/Users/test/.cats/platform', 'state', 'chat-state.local.json'),
  );
  assert.equal(
    config.desktopHostStatePath,
    path.join('C:/Users/test/.cats/desktop', 'state.json'),
  );
  assert.equal(
    config.runtimeDataDir,
    path.join('C:/Users/test/.cats/runtime', 'data'),
  );
  assert.equal(config.runtimeBaseUrl, 'http://127.0.0.1:3110');
  assert.equal(config.runtimeApiKey, 'token');
  assert.equal(config.runtimeSetupProxyTimeoutMs, 12345);
  assert.equal(config.runtimeSetupScanProxyTimeoutMs, 12345);
  assert.equal(config.runtimeSetupApplyProxyTimeoutMs, 12345);
  assert.equal(config.debugLiveTrace, false);
  assert.equal(config.debugKeepRuntimeSessionsOnProductDelete, false);
  assert.equal(config.runtimeStaleSessionRetryLimit, 3);
  assert.equal(config.maxChatParticipants, 7);
  assert.equal(config.maxAudienceParticipants, 2);
  assert.equal(config.maxParallelChats, 3);
});

test('loadConfig falls back to CATS_INC_* compatibility aliases for host and port', () => {
  const config = loadConfig({
    CATS_INC_HOST: '127.0.0.2',
    CATS_INC_PORT: '8282',
    CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:3110',
  });

  assert.equal(config.host, '127.0.0.2');
  assert.equal(config.port, 8282);
  assert.ok(
    config.chatStatePath.endsWith(path.join('.cats', 'platform', 'state', 'chat-state.local.json')),
  );
  assert.equal(config.debugLiveTrace, false);
  assert.equal(config.debugKeepRuntimeSessionsOnProductDelete, false);
  assert.equal(config.runtimeSetupProxyTimeoutMs, undefined);
  assert.equal(config.runtimeSetupScanProxyTimeoutMs, 120000);
  assert.equal(config.runtimeSetupApplyProxyTimeoutMs, 30000);
  assert.equal(config.runtimeStaleSessionRetryLimit, 1);
  assert.equal(config.maxChatParticipants, 5);
  assert.equal(config.maxAudienceParticipants, 3);
  assert.equal(config.maxParallelChats, 3);
});

test('loadConfig derives the default chat-state path from CATS_PLATFORM_DIR', () => {
  const config = loadConfig({
    CATS_PLATFORM_DIR: 'C:/Users/test/.cats/platform',
  });

  assert.equal(
    config.chatStatePath,
    path.join('C:/Users/test/.cats/platform', 'state', 'chat-state.local.json'),
  );
});

test('loadConfig defaults chat-state path under ~/.cats/platform', () => {
  const originalHome = process.env.USERPROFILE;
  process.env.USERPROFILE = 'C:/Users/tester';

  try {
    const config = loadConfig({});
    assert.equal(
      config.chatStatePath,
      'C:\\Users\\tester\\.cats\\platform\\state\\chat-state.local.json',
    );
    assert.equal(config.maxAudienceParticipants, 3);
    assert.equal(config.maxParallelChats, 3);
  } finally {
    process.env.USERPROFILE = originalHome;
  }
});

test('loadConfig enables runtime session retention override only when explicitly true', () => {
  const traced = loadConfig({
    CATS_DEBUG_LIVE_TRACE: 'true',
  });
  const enabled = loadConfig({
    CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE: 'true',
  });
  const disabled = loadConfig({
    CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE: 'false',
  });

  assert.equal(traced.debugLiveTrace, true);
  assert.equal(enabled.debugKeepRuntimeSessionsOnProductDelete, true);
  assert.equal(disabled.debugKeepRuntimeSessionsOnProductDelete, false);
});
