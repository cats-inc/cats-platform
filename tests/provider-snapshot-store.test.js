import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PROVIDER_SNAPSHOT_SCHEMA_VERSION,
  createEmptyProviderSnapshot,
  loadProviderSnapshot,
  writeProviderSnapshot,
} from '../build/server/server/routes/providerSnapshotStore.js';

async function withTempDir(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cats-platform-snapshot-'));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('loadProviderSnapshot returns null when the file is missing', async () => {
  await withTempDir(async (directory) => {
    const snapshot = await loadProviderSnapshot(path.join(directory, 'missing.json'));
    assert.equal(snapshot, null);
  });
});

test('writeProviderSnapshot then loadProviderSnapshot round-trips registry and catalogs', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'snapshot.json');
    const sample = {
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
            models: [
              { id: 'claude-default', label: 'Claude default', default: true },
            ],
            warnings: [],
          },
          advanced: null,
        },
      ],
    };

    await writeProviderSnapshot(snapshotPath, sample);
    const loaded = await loadProviderSnapshot(snapshotPath);
    assert.ok(loaded);
    assert.equal(loaded.schemaVersion, PROVIDER_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(loaded.registry?.state, 'ready');
    assert.equal(loaded.registry?.providers[0]?.id, 'claude');
    assert.equal(loaded.catalogs[0]?.provider, 'claude');
    assert.equal(loaded.catalogs[0]?.models?.defaultModel, 'claude-default');
    assert.equal(loaded.catalogs[0]?.advanced, null);
  });
});

test('writeProviderSnapshot stamps savedAt with the current time', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'snapshot.json');
    const before = Date.now();
    await writeProviderSnapshot(snapshotPath, createEmptyProviderSnapshot());
    const raw = await readFile(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    const savedAtMs = Date.parse(parsed.savedAt);
    assert.ok(
      Number.isFinite(savedAtMs) && savedAtMs >= before,
      `savedAt must reflect the write moment; got ${parsed.savedAt}`,
    );
  });
});

test('loadProviderSnapshot drops files with a mismatching schema version', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'snapshot.json');
    await writeFile(
      snapshotPath,
      JSON.stringify({
        schemaVersion: PROVIDER_SNAPSHOT_SCHEMA_VERSION + 99,
        savedAt: new Date().toISOString(),
        registry: null,
        catalogs: [],
      }),
      'utf8',
    );
    const loaded = await loadProviderSnapshot(snapshotPath);
    assert.equal(loaded, null);
  });
});

test('loadProviderSnapshot returns null on malformed JSON', async () => {
  await withTempDir(async (directory) => {
    const snapshotPath = path.join(directory, 'snapshot.json');
    await writeFile(snapshotPath, '{not valid json', 'utf8');
    const loaded = await loadProviderSnapshot(snapshotPath);
    assert.equal(loaded, null);
  });
});
