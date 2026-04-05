import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/products/chat/state/store.js';

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

test('POST /api/platform/runtime-setup/scan proxies the runtime setup scan', async () => {
  const runtimeStub = createRuntimeSetupStub({ providers: [] });

  await withServer(runtimeStub, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/runtime-setup/scan`, {
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

test('POST /api/platform/runtime-setup/apply uses ready providers and exits bootstrap mode', async () => {
  const runtimeStub = createRuntimeSetupStub();

  await withServer(runtimeStub, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/runtime-setup/apply`, {
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

test('runtime setup apply records product diagnostics events for the active bootstrap attempt', async () => {
  const runtimeStub = createRuntimeSetupStub();

  await withServer(runtimeStub, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/runtime-setup/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-apply' }),
    });

    assert.equal(response.status, 200);

    const diagnosticsResponse = await fetch(`${baseUrl}/api/platform/bootstrap-diagnostics`);
    assert.equal(diagnosticsResponse.status, 200);
    const diagnostics = await diagnosticsResponse.json();
    assert.equal(diagnostics.attemptId, 'attempt-apply');
    assert.deepEqual(
      diagnostics.events.map((event) => event.kind),
      ['runtime_apply_confirmed', 'runtime_apply_requested'],
    );
  });
});

test('POST /api/platform/setup/complete rejects setup until runtime bootstrap is applied', async () => {
  await withServer(createRuntimeSetupStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: false,
      }),
    });

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.error.code, 'runtime_setup_required');
    assert.equal(payload.error.details.runtimeSetup.status, 'attention_required');
  });
});

test('platform setup succeeds after runtime setup apply completes', async () => {
  const runtimeStub = createRuntimeSetupStub();

  await withServer(runtimeStub, async (baseUrl) => {
    const applyResponse = await fetch(`${baseUrl}/api/platform/runtime-setup/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-complete' }),
    });
    assert.equal(applyResponse.status, 200);

    const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        attemptId: 'attempt-complete',
        ownerDisplayName: 'Kenny',
        selectedProduct: 'chat',
        createGuideCat: false,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.runtimeSetup.status, 'ready');
    assert.equal(payload.ownerDisplayName, 'Kenny');

    const diagnosticsResponse = await fetch(`${baseUrl}/api/platform/bootstrap-diagnostics`);
    assert.equal(diagnosticsResponse.status, 200);
    const diagnostics = await diagnosticsResponse.json();
    assert.equal(diagnostics.attemptId, 'attempt-complete');
    assert.equal(diagnostics.events[0].kind, 'setup_completed');
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
