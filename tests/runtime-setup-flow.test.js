import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

let tempDir;

test.before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cats-runtime-setup-flow-'));
});

test.after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function createConfig() {
  const rootDir = await mkdtemp(path.join(tempDir, 'case-'));
  return {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    desktopHostStatePath: path.join(rootDir, 'desktop', 'state.json'),
    chatStatePath: path.join(rootDir, 'platform', 'state', 'chat-state.local.json'),
  };
}

function createRuntimeSetupStub({
  bootstrapRequired = true,
  providers = [
    { provider: 'claude', family: 'Claude Code', available: true, remediationCount: 0 },
    { provider: 'codex', family: 'Codex CLI', available: false, remediationCount: 1 },
  ],
} = {}) {
  let currentBootstrapRequired = bootstrapRequired;
  let currentProviders = providers.map((provider) => ({ ...provider }));
  let lastScanAt = '2026-03-30T11:00:00.000Z';
  let lastManualScanAt = '2026-03-30T11:00:00.000Z';
  let appliedAt = null;

  const stub = {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getSetupState() {
      return buildReadModel();
    },
  };

  function buildReadModel() {
    const readyProviders = currentProviders.filter((provider) => provider.available);
    const attentionProviders = currentProviders.filter((provider) => !provider.available);
    const remediationCount = attentionProviders.reduce(
      (count, provider) => count + provider.remediationCount,
      0,
    );

    return {
      bootstrapRequired: currentBootstrapRequired,
      state: {
        status: currentBootstrapRequired ? 'ready' : 'applied',
        lastScanAt,
        lastManualScanAt,
        appliedAt,
        appliedConfigPath: currentBootstrapRequired
          ? null
          : 'C:/Users/test/.cats/runtime/config/providers.yaml',
        error: null,
      },
      repair: {
        status: currentBootstrapRequired
          ? readyProviders.length > 0
            ? attentionProviders.length > 0
              ? 'attention_required'
              : 'ready'
            : 'scan_required'
          : 'ready',
        summary: currentBootstrapRequired
          ? readyProviders.length > 0
            ? attentionProviders.length > 0
              ? `${attentionProviders.length} provider(s) in the latest setup scan still need repair or reconfiguration.`
              : 'Ready providers are available. Select one or more providers and apply the generated config to exit bootstrap mode.'
            : 'No persisted setup scan is available yet. Run a manual scan to capture current provider readiness and remediation.'
          : 'All providers in the latest setup scan are currently available.',
        preferredScan: {
          source: readyProviders.length + attentionProviders.length > 0 ? 'manualScan' : 'none',
          scannedAt: readyProviders.length + attentionProviders.length > 0 ? lastManualScanAt : null,
          providerCount: currentProviders.length,
          availableCount: readyProviders.length,
          unavailableCount: attentionProviders.length,
          remediationCount,
        },
        providersReadyToApply: readyProviders.map((provider) => ({
          provider: provider.provider,
          family: provider.family,
        })),
        providersNeedingAttention: attentionProviders.map((provider) => ({
          provider: provider.provider,
          family: provider.family,
          remediationCount: provider.remediationCount,
        })),
      },
    };
  }

  return stub;
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const config = await createConfig();
  const server = createServer({
    shared: {
      config,
      runtimeClient,
      now: () => new Date('2026-03-30T11:15:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`, config);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/app-shell includes runtime setup summary and bootstrap attempt id for packaged setup', async () => {
  await withServer(createRuntimeSetupStub(), async (baseUrl, config) => {
    await mkdir(path.dirname(config.desktopHostStatePath), { recursive: true });
    await writeFile(config.desktopHostStatePath, JSON.stringify({
      diagnostics: {
        activeAttemptId: 'attempt-123',
      },
    }));

    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.bootstrapAttemptId, 'attempt-123');
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.runtimeSetup.status, 'attention_required');
    assert.equal(payload.runtimeSetup.bootstrapRequired, true);
    assert.equal(payload.runtimeSetup.availableCount, 1);
    assert.deepEqual(payload.runtimeSetup.suggestedProviders, ['claude']);
  });
});

test('POST /api/platform/bootstrap-diagnostics/opened records a product-owned setup_opened event', async () => {
  await withServer(createRuntimeSetupStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/bootstrap-diagnostics/opened`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-opened' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.attemptId, 'attempt-opened');
    assert.equal(payload.events[0].kind, 'setup_opened');
    assert.equal(payload.events[0].attemptId, 'attempt-opened');
  });
});

test('POST /api/platform/setup/complete succeeds even when runtime bootstrap is still required', async () => {
  await withServer(createRuntimeSetupStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        attemptId: 'attempt-complete',
        ownerDisplayName: 'Kenny',
        createGuideCat: false,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.runtimeSetup.status, 'attention_required');
    assert.equal(payload.runtimeSetup.bootstrapRequired, true);
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.equal(payload.lastProductSurface, null);

    const diagnosticsResponse = await fetch(`${baseUrl}/api/platform/bootstrap-diagnostics`);
    assert.equal(diagnosticsResponse.status, 200);
    const diagnostics = await diagnosticsResponse.json();
    assert.equal(diagnostics.attemptId, 'attempt-complete');
    assert.deepEqual(
      diagnostics.events.map((event) => event.kind),
      ['setup_completed', 'setup_state_persisted', 'setup_started'],
    );
  });
});

test('legacy POST /api/setup/complete also succeeds without runtime bootstrap apply', async () => {
  await withServer(createRuntimeSetupStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Boss Cat',
        bossCatProvider: 'claude',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.runtimeSetup.status, 'attention_required');
    assert.equal(payload.runtimeSetup.bootstrapRequired, true);
    assert.ok(payload.chat.bossCatId);
  });
});
