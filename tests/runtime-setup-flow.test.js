import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

let tempDir;
let tempFileCounter = 0;

test.before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cats-runtime-setup-flow-'));
});

test.after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function createConfig() {
  tempFileCounter += 1;
  return {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    chatStatePath: path.join(tempDir, `chat-state-${tempFileCounter}.json`),
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
    appliedProviders: [],
    scanCalls: [],
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
    async scanSetup(input = {}) {
      this.scanCalls.push({ manual: input.manual === true });
      if (input.manual === true) {
        lastManualScanAt = '2026-03-30T11:05:00.000Z';
      }
      lastScanAt = '2026-03-30T11:05:00.000Z';
      return buildReadModel();
    },
    async applySetup(providerNames) {
      this.appliedProviders.push([...providerNames]);
      currentBootstrapRequired = false;
      appliedAt = '2026-03-30T11:10:00.000Z';
      currentProviders = currentProviders.map((provider) =>
        providerNames.includes(provider.provider)
          ? { ...provider, available: true, remediationCount: 0 }
          : provider,
      );
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
          : 'C:/Users/test/AppData/Roaming/Cats/runtime/providers.yaml',
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
  const server = createServer({
    shared: {
      config: createConfig(),
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
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/app-shell includes runtime setup summary for packaged setup', async () => {
  await withServer(createRuntimeSetupStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.runtimeSetup.status, 'attention_required');
    assert.equal(payload.runtimeSetup.bootstrapRequired, true);
    assert.equal(payload.runtimeSetup.availableCount, 1);
    assert.deepEqual(payload.runtimeSetup.suggestedProviders, ['claude']);
  });
});

test('POST /api/suite/runtime-setup/scan proxies the runtime setup scan', async () => {
  const runtimeStub = createRuntimeSetupStub({ providers: [] });

  await withServer(runtimeStub, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/runtime-setup/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manual: true }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'scan_required');
    assert.deepEqual(runtimeStub.scanCalls, [{ manual: true }]);
  });
});

test('POST /api/suite/runtime-setup/apply uses ready providers and exits bootstrap mode', async () => {
  const runtimeStub = createRuntimeSetupStub();

  await withServer(runtimeStub, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/runtime-setup/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ready');
    assert.equal(payload.bootstrapRequired, false);
    assert.deepEqual(runtimeStub.appliedProviders, [['claude']]);
  });
});

test('POST /api/suite/setup/complete rejects setup until runtime bootstrap is applied', async () => {
  await withServer(createRuntimeSetupStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.error.code, 'runtime_setup_required');
    assert.equal(payload.error.details.runtimeSetup.status, 'attention_required');
  });
});

test('suite setup succeeds after runtime setup apply completes', async () => {
  const runtimeStub = createRuntimeSetupStub();

  await withServer(runtimeStub, async (baseUrl) => {
    const applyResponse = await fetch(`${baseUrl}/api/suite/runtime-setup/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(applyResponse.status, 200);

    const response = await fetch(`${baseUrl}/api/suite/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createBossCat: false,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.runtimeSetup.status, 'ready');
    assert.equal(payload.ownerDisplayName, 'Kenny');
  });
});

test('legacy POST /api/setup/complete also respects runtime setup gating', async () => {
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

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.error.code, 'runtime_setup_required');
    assert.equal(payload.error.details.runtimeSetup.bootstrapRequired, true);
  });
});
