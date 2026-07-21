import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { loadConfig } from '../build/server/config.js';
import {
  DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS,
  DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS,
  resolveDefaultSessionCreateSlowWarningMs,
} from '../build/server/runtime/client.js';

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
    CATS_RUNTIME_SESSION_CREATE_TIMEOUT_MS: '45000',
    CATS_RUNTIME_SESSION_CREATE_SLOW_WARNING_MS: '6000',
    CATS_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS: '60000',
    CATS_RUNTIME_SETUP_PROXY_TIMEOUT_MS: '12345',
    CATS_RUNTIME_STALE_SESSION_RETRY_LIMIT: '3',
    CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG: 'C:/Users/test/bootstrap.yaml',
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
  assert.equal(config.runtimeSessionCreateTimeoutMs, 45000);
  assert.equal(config.runtimeSessionCreateSlowWarningMs, 6000);
  assert.equal(config.runtimeMessageIdleTimeoutMs, 60000);
  assert.equal(config.runtimeSetupProxyTimeoutMs, 12345);
  assert.equal(config.runtimeSetupScanProxyTimeoutMs, 12345);
  assert.equal(config.runtimeSetupApplyProxyTimeoutMs, 12345);
  assert.equal(config.providerCapabilityBootstrapConfigPath, 'C:/Users/test/bootstrap.yaml');
  assert.equal(config.debugLiveTrace, false);
  assert.equal(config.debugKeepRuntimeSessionsOnProductDelete, false);
  assert.equal(config.chatProviderAgentDecisionEnabled, false);
  assert.equal(config.chatNaturalProductIntentMode, 'off');
  assert.equal(config.mobilePairingEnabled, true);
  assert.equal(config.mobileBundleRoot, path.resolve(process.cwd(), 'build', 'mobile'));
  assert.equal(config.runtimeStaleSessionRetryLimit, 3);
  assert.equal(config.maxChatParticipants, 7);
  assert.equal(config.maxAudienceParticipants, 2);
  assert.equal(config.maxParallelChats, 3);
});

test('loadConfig reads mobile pairing gate and bundle root', () => {
  const config = loadConfig({
    CATS_DESKTOP_MOBILE_PAIRING_ENABLED: 'true',
    CATS_MOBILE_BUNDLE_ROOT: 'C:/Users/test/cats-mobile-build',
  });

  assert.equal(config.mobilePairingEnabled, true);
  assert.equal(config.mobileBundleRoot, 'C:/Users/test/cats-mobile-build');
});

test('loadConfig falls back to the runtime env file for the runtime API key', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'cats-platform-runtime-env-'));
  const envFile = path.join(tempDir, '.env');
  writeFileSync(envFile, 'CATS_RUNTIME_API_KEY="runtime\\\"token\\\\suffix"\n', 'utf-8');

  try {
    const config = loadConfig({
      CATS_RUNTIME_ENV_FILE: envFile,
    });

    assert.equal(config.runtimeApiKey, 'runtime"token\\suffix');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('loadConfig does not infer a sibling runtime env file without an explicit path', () => {
  const config = loadConfig({});

  assert.equal(config.runtimeApiKey, '');
});

test('loadConfig ignores missing and keyless runtime env files', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'cats-platform-runtime-env-empty-'));
  const envFile = path.join(tempDir, '.env');
  writeFileSync(envFile, [
    'MALFORMED_RUNTIME_ENV_LINE',
    'OTHER_KEY=other-token',
    '',
  ].join('\n'), 'utf-8');

  try {
    assert.equal(loadConfig({
      CATS_RUNTIME_ENV_FILE: path.join(tempDir, 'missing.env'),
    }).runtimeApiKey, '');
    assert.equal(loadConfig({
      CATS_RUNTIME_ENV_FILE: envFile,
    }).runtimeApiKey, '');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
  assert.equal(config.runtimeSessionCreateTimeoutMs, DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS);
  assert.equal(
    config.runtimeSessionCreateSlowWarningMs,
    resolveDefaultSessionCreateSlowWarningMs(DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS),
  );
  assert.equal(config.runtimeMessageIdleTimeoutMs, DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS);
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
  assert.equal(
    config.providerCapabilityBootstrapConfigPath,
    path.join('C:/Users/test/.cats/platform', 'config', 'provider-capability-bootstrap.yaml'),
  );
});

test('loadConfig defaults chat-state path under ~/.cats/platform', () => {
  // os.homedir() reads USERPROFILE on Windows and HOME on POSIX.
  const homeKey = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
  const testHome = process.platform === 'win32' ? 'C:/Users/tester' : '/home/tester';
  const originalHome = process.env[homeKey];
  process.env[homeKey] = testHome;

  try {
    const config = loadConfig({});
    assert.equal(
      config.chatStatePath,
      path.join(testHome, '.cats', 'platform', 'state', 'chat-state.local.json'),
    );
    assert.equal(config.maxAudienceParticipants, 3);
    assert.equal(config.maxParallelChats, 3);
  } finally {
    if (originalHome === undefined) {
      delete process.env[homeKey];
    } else {
      process.env[homeKey] = originalHome;
    }
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

test('loadConfig defaults runtimeSessionCreateSlowWarningMs to a fraction of the configured budget', () => {
  const config = loadConfig({
    CATS_RUNTIME_SESSION_CREATE_TIMEOUT_MS: '180000',
  });

  assert.equal(config.runtimeSessionCreateTimeoutMs, 180000);
  assert.equal(
    config.runtimeSessionCreateSlowWarningMs,
    resolveDefaultSessionCreateSlowWarningMs(180000),
  );
});

test('loadConfig enables Chat provider-agent decisions only when explicitly true', () => {
  const enabled = loadConfig({
    CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED: 'true',
  });
  const disabled = loadConfig({
    CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED: 'false',
  });
  const unset = loadConfig({});

  assert.equal(enabled.chatProviderAgentDecisionEnabled, true);
  assert.equal(disabled.chatProviderAgentDecisionEnabled, false);
  assert.equal(unset.chatProviderAgentDecisionEnabled, false);
});

test('loadConfig parses the Chat natural product-intent deployment mode', () => {
  const off = loadConfig({});
  const catTool = loadConfig({
    CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE: 'cat_tool',
  });
  const heuristic = loadConfig({
    CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE: 'heuristic_prefilter',
  });

  assert.equal(off.chatNaturalProductIntentMode, 'off');
  assert.equal(catTool.chatNaturalProductIntentMode, 'cat_tool');
  assert.equal(heuristic.chatNaturalProductIntentMode, 'heuristic_prefilter');
  assert.throws(
    () => loadConfig({ CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE: 'keywords' }),
    /Invalid CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE/u,
  );
});
