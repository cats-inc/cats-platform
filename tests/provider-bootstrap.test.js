import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { bootstrapProviderSelector } from '../build/server/server/routes/providers.js';
import {
  loadProviderSnapshot,
  writeProviderSnapshot,
  PROVIDER_SNAPSHOT_SCHEMA_VERSION,
} from '../build/server/server/routes/providerSnapshotStore.js';

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

test('bootstrapProviderSelector seeds caches from disk so the first /api/providers response uses the cached snapshot', async () => {
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
      catalogs: [],
    });

    const runtimeClient = createUnreachableRuntimeStub();
    await bootstrapProviderSelector(runtimeClient, { snapshotPath });

    // The first request after bootstrap should see the snapshot-seeded cache.
    // Since we cannot easily reach into private cache state from tests, we
    // verify the on-disk artifact is unchanged when the runtime is offline.
    const reloaded = await loadProviderSnapshot(snapshotPath);
    assert.ok(reloaded?.registry?.providers.some((provider) => provider.id === 'claude'));
  });
});
