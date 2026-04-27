import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  bootstrapProviderSelector,
  seedProviderSelectorFromSnapshot,
  warmProviderSelectorCache,
} from '../build/server/server/routes/providers.js';
import {
  loadProviderSnapshot,
  writeProviderSnapshot,
  PROVIDER_SNAPSHOT_SCHEMA_VERSION,
} from '../build/server/server/routes/providerSnapshotStore.js';

async function withSeededServer(runtimeClient, snapshotPath, callback) {
  await seedProviderSelectorFromSnapshot(runtimeClient, snapshotPath);
  const server = createServer({
    shared: {
      config: {
        host: '127.0.0.1',
        port: 0,
        runtimeBaseUrl: 'http://127.0.0.1:3110',
        runtimeApiKey: '',
        chatStatePath: 'unused-for-tests',
      },
      runtimeClient,
      now: () => new Date('2026-04-28T00:00:00.000Z'),
    },
    chat: {
      chatStore: new MemoryChatStore(),
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

async function withTempDir(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cats-platform-bootstrap-'));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createReachableRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {
        claude: {
          defaultInstance: 'native',
          defaultBackend: 'cli',
          instances: [
            {
              id: 'native',
              target: 'cli/native',
              backend: 'cli',
              command: 'claude',
              runner: null,
              runtime: null,
              transport: null,
              model: null,
            },
          ],
        },
      };
    },
    async getProviderDiagnostics(query = {}) {
      const providers = [
        {
          provider: 'claude',
          backend: 'cli',
          instance: 'native',
          defaultTarget: true,
          availability: { status: 'ok', summary: 'CLI ready', attentionCodes: [] },
        },
      ];
      return {
        probe: 'light',
        providers: typeof query.provider === 'string' && query.provider.trim().length > 0
          ? providers.filter((entry) => entry.provider === query.provider)
          : providers,
      };
    },
    async getProviderModels(provider, instance) {
      return {
        provider,
        backend: 'cli',
        instance: instance ?? 'native',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider, instance) {
      return {
        provider,
        backend: 'cli',
        instance: instance ?? 'native',
        defaultSelection: null,
        entries: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        presets: [],
        controls: [],
        warnings: [],
      };
    },
  };
}

function createUnreachableRuntimeStub() {
  return {
    async getHealth() {
      return { baseUrl: 'http://127.0.0.1:3110', reachable: false, status: 'error' };
    },
    async getProviderConfig() {
      throw new Error('runtime offline');
    },
    async getProviderDiagnostics() {
      throw new Error('The operation was aborted due to timeout');
    },
    async getProviderModels() {
      throw new Error('runtime offline');
    },
    async getAdvancedProviderModels() {
      throw new Error('runtime offline');
    },
  };
}

test('bootstrapProviderSelector persists fresh registry and catalog data to disk', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createReachableRuntimeStub();
    const persisted = new Promise((resolve) => {
      bootstrapProviderSelector(runtimeClient, {
        snapshotPath,
        onSnapshotPersisted: () => resolve(),
      }).catch((error) => {
        // surface bootstrap errors to the test runner
        throw error;
      });
    });

    await persisted;

    const snapshot = await loadProviderSnapshot(snapshotPath);
    assert.ok(snapshot, 'snapshot file should exist after bootstrap');
    assert.equal(snapshot.schemaVersion, PROVIDER_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snapshot.registry?.state, 'ready');
    assert.ok(snapshot.registry?.providers.some((provider) => provider.id === 'claude'));
    const claudeCatalog = snapshot.catalogs.find((entry) => entry.provider === 'claude');
    assert.ok(claudeCatalog, 'expected claude catalog to be persisted');
    assert.equal(claudeCatalog.models?.defaultModel, 'claude-default');
    assert.ok(claudeCatalog.advanced, 'expected advanced catalog to be persisted');
  });
});

test('bootstrapProviderSelector tolerates an unreachable runtime without writing a stale-failure snapshot', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createUnreachableRuntimeStub();
    let persistedCalled = false;

    await bootstrapProviderSelector(runtimeClient, {
      snapshotPath,
      onSnapshotPersisted: () => {
        persistedCalled = true;
      },
    });

    // Wait one debounce window plus slack — even after, no persistence should
    // have happened because the registry value is runtime_unreachable.
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    const snapshot = await loadProviderSnapshot(snapshotPath);
    assert.equal(snapshot, null, 'failed-only bootstraps must not produce a disk snapshot');
    assert.equal(persistedCalled, false);
  });
});

test('seedProviderSelectorFromSnapshot makes the first /api/providers response serve the cached snapshot', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    await writeProviderSnapshot(snapshotPath, {
      schemaVersion: PROVIDER_SNAPSHOT_SCHEMA_VERSION,
      savedAt: new Date(0).toISOString(),
      registry: {
        state: 'ready',
        providers: [
          {
            id: 'claude',
            label: 'Claude',
            defaultModel: 'claude-default',
            defaultInstance: 'native',
            defaultBackend: 'cli',
            instances: [
              {
                id: 'native',
                label: 'cli/native',
                target: 'cli/native',
                backend: 'cli',
                default: true,
              },
            ],
            modelsPath: '/api/providers/claude/models',
          },
        ],
      },
      catalogs: [
        {
          provider: 'claude',
          instance: 'native',
          models: {
            provider: 'claude',
            backend: 'cli',
            instance: 'native',
            defaultModel: 'claude-default',
            source: 'config',
            cache: null,
            models: [{ id: 'claude-default', label: 'Claude default', default: true }],
            warnings: [],
          },
          advanced: null,
        },
      ],
    });

    let diagnosticsCalls = 0;
    const runtimeClient = createUnreachableRuntimeStub();
    const wrappedDiagnostics = runtimeClient.getProviderDiagnostics;
    runtimeClient.getProviderDiagnostics = async (...args) => {
      diagnosticsCalls += 1;
      return wrappedDiagnostics.apply(runtimeClient, args);
    };

    await withSeededServer(runtimeClient, snapshotPath, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/providers`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.state, 'ready');
      assert.ok(
        payload.providers.some((provider) => provider.id === 'claude'),
        'snapshot providers should appear in the first response',
      );
      assert.ok(
        payload.warnings?.some((warning) => warning.toLowerCase().includes('last saved')),
        'response should disclose that providers came from the on-disk snapshot',
      );
    });

    // Background SWR refresh fires once after the initial response; we don't
    // care whether it completed, only that the snapshot served the foreground.
    assert.ok(diagnosticsCalls <= 1, `expected at most 1 background probe, got ${diagnosticsCalls}`);
  });
});

test('GET /api/providers re-probes after a cold runtime failure instead of caching it', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    let diagnosticsCalls = 0;
    const runtimeClient = createReachableRuntimeStub();
    const originalDiagnostics = runtimeClient.getProviderDiagnostics;
    runtimeClient.getProviderDiagnostics = async (query = {}) => {
      diagnosticsCalls += 1;
      if (diagnosticsCalls === 1) {
        throw new Error('The operation was aborted due to timeout');
      }
      return originalDiagnostics.call(runtimeClient, query);
    };

    await withSeededServer(runtimeClient, snapshotPath, async (baseUrl) => {
      const initial = await fetch(`${baseUrl}/api/providers`);
      assert.equal(initial.status, 200);
      const initialPayload = await initial.json();
      assert.equal(initialPayload.state, 'runtime_unreachable');
      assert.equal(diagnosticsCalls, 1);

      const recovered = await fetch(`${baseUrl}/api/providers`);
      assert.equal(recovered.status, 200);
      const recoveredPayload = await recovered.json();
      assert.equal(recoveredPayload.state, 'ready');
      assert.equal(diagnosticsCalls, 2, 'cold runtime failures must not be cached');
    });
  });
});

test('GET /api/providers?force=1 bypasses a stuck inflight probe instead of joining it', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createReachableRuntimeStub();
    let diagnosticsCalls = 0;
    let releaseFirstCall;
    const firstCallReady = new Promise((resolve) => {
      releaseFirstCall = resolve;
    });
    const originalDiagnostics = runtimeClient.getProviderDiagnostics;
    runtimeClient.getProviderDiagnostics = async (query = {}) => {
      diagnosticsCalls += 1;
      if (diagnosticsCalls === 1) {
        await firstCallReady;
      }
      return originalDiagnostics.call(runtimeClient, query);
    };

    await withSeededServer(runtimeClient, snapshotPath, async (baseUrl) => {
      // Kick off a request that gets stuck waiting for the first probe.
      const stuckRequest = fetch(`${baseUrl}/api/providers`);
      // Give the route handler time to install the inflight promise.
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(diagnosticsCalls, 1, 'first probe should have started');

      const forced = await fetch(`${baseUrl}/api/providers?force=1`);
      assert.equal(forced.status, 200);
      const payload = await forced.json();
      assert.equal(payload.state, 'ready');
      assert.equal(diagnosticsCalls, 2, 'force=1 must spawn a new probe instead of joining the stuck one');

      // Release the stuck probe so the original request can settle before the
      // server is closed; otherwise node:test will hang on the open socket.
      releaseFirstCall();
      const stuck = await stuckRequest;
      assert.equal(stuck.status, 200);
    });
  });
});

test('a no_usable_targets refresh after a successful warm preserves the prior ready cache and disk snapshot', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createReachableRuntimeStub();
    let suppressProviders = false;
    const originalDiagnostics = runtimeClient.getProviderDiagnostics;
    runtimeClient.getProviderDiagnostics = async (query = {}) => {
      if (suppressProviders) {
        return { probe: 'light', providers: [] };
      }
      return originalDiagnostics.call(runtimeClient, query);
    };

    const persisted = new Promise((resolve) => {
      bootstrapProviderSelector(runtimeClient, {
        snapshotPath,
        onSnapshotPersisted: () => resolve(),
      }).catch((error) => {
        throw error;
      });
    });
    await persisted;

    const baseline = await loadProviderSnapshot(snapshotPath);
    assert.ok(baseline?.registry?.providers.some((provider) => provider.id === 'claude'));

    // Now flip the runtime to report no_usable_targets and trigger a refresh.
    suppressProviders = true;
    await withSeededServer(runtimeClient, snapshotPath, async (baseUrl) => {
      // The forced refresh hits a no_usable_targets runtime, but because we
      // already have a recent 'ready' baseline in the cache, the route falls
      // through to the stale-fallback path and returns the prior ready
      // registry (with a runtime-warning prefix).
      const forced = await fetch(`${baseUrl}/api/providers?force=1`);
      assert.equal(forced.status, 200);
      const payload = await forced.json();
      assert.equal(payload.state, 'ready');
      assert.ok(payload.providers.some((provider) => provider.id === 'claude'));
      assert.ok(
        payload.warnings?.some((warning) => warning.toLowerCase().includes('no usable provider targets')),
        'response should disclose that the latest runtime probe reported no usable targets',
      );

      // A subsequent non-forced read inside the cache window still returns
      // the preserved ready snapshot, not the stale no_usable_targets value.
      const followUp = await fetch(`${baseUrl}/api/providers`);
      const followUpPayload = await followUp.json();
      assert.equal(followUpPayload.state, 'ready');

      // Wait past the snapshot debounce window so any (incorrect) write would
      // have landed by now.
      await new Promise((resolve) => setTimeout(resolve, 1_300));

      const reloaded = await loadProviderSnapshot(snapshotPath);
      assert.equal(
        reloaded?.registry?.state,
        'ready',
        'no_usable_targets refresh must not overwrite a previously good registry on disk',
      );
      assert.ok(reloaded?.registry?.providers.some((provider) => provider.id === 'claude'));
    });
  });
});

test('flushProviderSnapshotPersistence drains a pending debounced write', async () => {
  const { flushProviderSnapshotPersistence } = await import(
    '../build/server/server/routes/providers.js'
  );

  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createReachableRuntimeStub();

    await bootstrapProviderSelector(runtimeClient, { snapshotPath });
    // bootstrapProviderSelector schedules the persist via 1s debounce; do NOT
    // wait for it. Flush should perform the write synchronously.
    await flushProviderSnapshotPersistence(runtimeClient);

    const reloaded = await loadProviderSnapshot(snapshotPath);
    assert.ok(reloaded, 'flush must persist the pending snapshot');
    assert.equal(reloaded.registry?.state, 'ready');
    assert.ok(reloaded.registry?.providers.some((provider) => provider.id === 'claude'));
  });
});

test('a stale background probe cannot clobber a forced fresh ready result', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createReachableRuntimeStub();
    let diagnosticsCalls = 0;
    let releaseFirstCall;
    const firstCallReady = new Promise((resolve) => {
      releaseFirstCall = resolve;
    });
    const originalDiagnostics = runtimeClient.getProviderDiagnostics;
    runtimeClient.getProviderDiagnostics = async (query = {}) => {
      diagnosticsCalls += 1;
      if (diagnosticsCalls === 1) {
        await firstCallReady;
        // First probe resolves *after* the forced one, with an empty
        // provider list — i.e. no_usable_targets. Without the identity
        // guard this would clobber the forced ready result.
        return { probe: 'light', providers: [] };
      }
      return originalDiagnostics.call(runtimeClient, query);
    };

    await withSeededServer(runtimeClient, snapshotPath, async (baseUrl) => {
      const stuckRequest = fetch(`${baseUrl}/api/providers`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(diagnosticsCalls, 1, 'first probe should be in flight');

      const forced = await fetch(`${baseUrl}/api/providers?force=1`);
      assert.equal(forced.status, 200);
      const forcedPayload = await forced.json();
      assert.equal(forcedPayload.state, 'ready');
      assert.equal(diagnosticsCalls, 2);

      // Release the now-stale first probe and let it resolve.
      releaseFirstCall();
      const stuck = await stuckRequest;
      assert.equal(stuck.status, 200);
      // Give the late probe's microtasks a beat to propagate.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // A subsequent read must still return the forced ready state, not the
      // stale no_usable_targets value the late probe carried.
      const followUp = await fetch(`${baseUrl}/api/providers`);
      const followUpPayload = await followUp.json();
      assert.equal(followUpPayload.state, 'ready');
    });
  });
});

test('a stale forced probe returns the current error-backoff warning when a newer force preserves ready cache', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createReachableRuntimeStub();
    const persisted = new Promise((resolve) => {
      bootstrapProviderSelector(runtimeClient, {
        snapshotPath,
        onSnapshotPersisted: () => resolve(),
      }).catch((error) => {
        throw error;
      });
    });
    await persisted;

    let diagnosticsCalls = 0;
    let releaseFirstCall;
    const firstCallReady = new Promise((resolve) => {
      releaseFirstCall = resolve;
    });
    runtimeClient.getProviderDiagnostics = async () => {
      diagnosticsCalls += 1;
      if (diagnosticsCalls === 1) {
        await firstCallReady;
      }
      return { probe: 'light', providers: [] };
    };

    await withSeededServer(runtimeClient, snapshotPath, async (baseUrl) => {
      const staleForcedRequest = fetch(`${baseUrl}/api/providers?force=1`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(diagnosticsCalls, 1, 'first forced probe should be in flight');

      const newerForced = await fetch(`${baseUrl}/api/providers?force=1`);
      assert.equal(newerForced.status, 200);
      const newerPayload = await newerForced.json();
      assert.equal(newerPayload.state, 'ready');
      assert.ok(
        newerPayload.warnings?.some((warning) => warning.toLowerCase().includes('no usable provider targets')),
        'newer forced response should disclose the failed runtime refresh',
      );

      releaseFirstCall();
      const staleForced = await staleForcedRequest;
      assert.equal(staleForced.status, 200);
      const stalePayload = await staleForced.json();
      assert.equal(stalePayload.state, 'ready');
      assert.ok(
        stalePayload.warnings?.some((warning) => warning.toLowerCase().includes('no usable provider targets')),
        'stale forced response should return the current cached warning too',
      );
    });
  });
});

test('flushProviderSnapshotPersistence waits for an inflight warm probe to complete and persist', async () => {
  const { flushProviderSnapshotPersistence } = await import(
    '../build/server/server/routes/providers.js'
  );

  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'provider-snapshot.json');
    const runtimeClient = createReachableRuntimeStub();
    let releaseProbe;
    let releaseCatalogs;
    const probeReady = new Promise((resolve) => {
      releaseProbe = resolve;
    });
    const catalogsReady = new Promise((resolve) => {
      releaseCatalogs = resolve;
    });
    const originalDiagnostics = runtimeClient.getProviderDiagnostics;
    const originalModels = runtimeClient.getProviderModels;
    const originalAdvanced = runtimeClient.getAdvancedProviderModels;
    runtimeClient.getProviderDiagnostics = async (query = {}) => {
      await probeReady;
      return originalDiagnostics.call(runtimeClient, query);
    };
    runtimeClient.getProviderModels = async (provider, instance) => {
      await catalogsReady;
      return originalModels.call(runtimeClient, provider, instance);
    };
    runtimeClient.getAdvancedProviderModels = async (provider, instance) => {
      await catalogsReady;
      return originalAdvanced.call(runtimeClient, provider, instance);
    };

    await seedProviderSelectorFromSnapshot(runtimeClient, snapshotPath);

    // Kick off warm without awaiting — probe is now stuck in flight.
    void warmProviderSelectorCache(runtimeClient).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start the flush and release the probe shortly after. flush must wait
    // until the probe lands in cache, schedules the debounce, and gets
    // drained — before resolving.
    const flushPromise = flushProviderSnapshotPersistence(runtimeClient, {
      inflightTimeoutMs: 5_000,
    });
    setTimeout(() => releaseProbe(), 60);
    setTimeout(() => releaseCatalogs(), 120);
    await flushPromise;

    const reloaded = await loadProviderSnapshot(snapshotPath);
    assert.ok(reloaded, 'flush must persist the inflight probe result');
    assert.equal(reloaded.registry?.state, 'ready');
    assert.ok(reloaded.registry?.providers.some((provider) => provider.id === 'claude'));
    const claudeCatalog = reloaded.catalogs.find((entry) => entry.provider === 'claude');
    assert.ok(claudeCatalog?.models, 'flush must wait for model catalog warm-up before writing');
    assert.ok(claudeCatalog?.advanced, 'flush must wait for advanced catalog warm-up before writing');
  });
});
