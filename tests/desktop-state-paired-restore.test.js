import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { restoreSnapshotProfile } from '../build/server/products/chat/state/database/restoreProfile.js';
import { maintainProfileSnapshot } from '../build/server/products/chat/state/database/profileSnapshots.js';
import { databasePath, envelopeCore } from '../build/server/products/chat/state/database/profileFormat.js';
import { fileDigest } from '../build/server/platform/persistence/state-db/fileDigest.js';
import { sqliteDriver } from '../build/server/platform/persistence/state-db/sqliteDriver.js';
import { emptyOwnerLifecycle } from '../build/server/core/ownerLifecycle.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { downgradeDatabaseSchema } from './fixtures/desktop-state-schema.mjs';

async function fixture(t, source = snapshot(), basename = 'profile.json') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-pair-restore 資料 '));
  const file = path.join(root, basename); const stores = [];
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  await writeFile(file, JSON.stringify(source));
  const create = () => { const store = new DatabaseChatStore(file); stores.push(store); return store; };
  let store = create(); await store.initialize(); const before = await store.logicalDigest(); await store.close();
  const result = await maintainProfileSnapshot(file, () => readFile(file), { force: true });
  assert.equal(result.status, 'published'); const manifest = result.manifest;
  store = create(); await store.updateChannel(source.chat.channels[0].id, channel => {
    channel.messages.push({ ...channel.messages[0], id: 'after-snapshot', body: 'Newer isolated data', metadata: { sessionId: 'kept-in-rollback-copy' } });
    return { channel };
  });
  await store.close();
  return { root, file, source, before, create, manifest };
}

test('pair restore reopens complete logical state and preserves exact current rollback bytes', async t => {
  const { file, before, create, manifest } = await fixture(t);
  const current = await readFile(file); const currentDb = fileDigest(databasePath(file));
  const restored = await restoreSnapshotProfile(file, manifest); assert.equal(restored.restoredVersion, 8);
  const saved = JSON.parse(await readFile(path.join(restored.backupDirectory, 'manifest.json'), 'utf8'));
  assert.equal(saved.kind, 'before-paired-restore');
  assert.deepEqual(await readFile(path.join(restored.backupDirectory, saved.files.find(f => f.original === path.basename(file)).name)), current);
  assert.equal(fileDigest(path.join(restored.backupDirectory, saved.files.find(f => f.original === path.basename(databasePath(file))).name)), currentDb);
  assert.equal(await create().logicalDigest(), before);
  await assert.rejects(readFile(`${file}.state-db-restore.json`), { code: 'ENOENT' });
});

test('a configured manifest.json profile has distinct backup metadata and a restorable manifest', async t => {
  const { file, before, create, manifest } = await fixture(t, snapshot(), 'manifest.json');
  assert.notEqual(path.basename(manifest), path.basename(file));
  await restoreSnapshotProfile(file, manifest); assert.equal(await create().logicalDigest(), before);
});

test('older generic-name snapshot manifests remain readable and restorable without a rewrite', async t => {
  const { file, before, create, manifest } = await fixture(t);
  const old = path.join(path.dirname(manifest), 'manifest.json'); const bytes = await readFile(manifest);
  await rename(manifest, old); await restoreSnapshotProfile(file, old);
  assert.deepEqual(await readFile(old), bytes); assert.equal(await create().logicalDigest(), before);
});

for (const checkpoint of ['restore_prepared', 'restore_files_removed', 'restore_database_published', 'restore_receipt_published', 'restore_primary_published']) {
  test(`paired restore blocks startup and resumes after ${checkpoint}`, async t => {
    const { file, before, create, manifest } = await fixture(t);
    await assert.rejects(restoreSnapshotProfile(file, manifest, { checkpoint(stage) {
      if (stage === checkpoint) throw Error('Isolated interruption');
    } }), /Isolated interruption/);
    await assert.rejects(create().readCore(), { code: 'restore_pending' });
    await restoreSnapshotProfile(file, manifest); assert.equal(await create().logicalDigest(), before);
  });
}

test('a live connection rejects pair restore before creating current backups or a marker', async t => {
  const { root, file, create, manifest } = await fixture(t); const active = create(); await active.initialize();
  const before = await readdir(root); const bytes = await readFile(file);
  await assert.rejects(restoreSnapshotProfile(file, manifest), { code: 'profile_busy' });
  assert.deepEqual(await readdir(root), before); assert.deepEqual(await readFile(file), bytes);
});

test('a pending authorized reset forbids pair restore before backing up or changing state', async t => {
  const { root, file, manifest } = await fixture(t);
  const reset = path.join(root, 'platform-data-reset.pending.json'); await writeFile(reset, JSON.stringify({ schemaVersion: 1, directories: [] }));
  const before = await readdir(root); const bytes = await readFile(file);
  await assert.rejects(restoreSnapshotProfile(file, manifest), { code: 'reset_pending' });
  assert.deepEqual(await readdir(root), before); assert.deepEqual(await readFile(file), bytes);
});

test('an external active-file edit during a pending pair restore is never overwritten', async t => {
  const { file, manifest } = await fixture(t);
  await assert.rejects(restoreSnapshotProfile(file, manifest, { checkpoint: async stage => {
    if (stage === 'restore_database_published') {
      await writeFile(file, 'Owner external edit'); throw Error('Interrupted after external edit');
    }
  } }), /Interrupted/);
  await assert.rejects(restoreSnapshotProfile(file, manifest), { code: 'restore_invalid' });
  assert.equal(await readFile(file, 'utf8'), 'Owner external edit');
});

test('a selected pair replaced after verification fails before any active file changes', async t => {
  const { file, manifest } = await fixture(t); const bytes = await readFile(file); const db = fileDigest(databasePath(file));
  await assert.rejects(restoreSnapshotProfile(file, manifest, { checkpoint: async stage => {
    if (stage === 'restore_source_verified') await writeFile(path.join(path.dirname(manifest), path.basename(file)), 'Replaced selected bytes');
  } }), { code: 'restore_invalid' });
  assert.deepEqual(await readFile(file), bytes); assert.equal(fileDigest(databasePath(file)), db);
  await assert.rejects(readFile(`${file}.state-db-restore.json`), { code: 'ENOENT' });
});

test('paired restore never resurrects an older automatic-cleanup opt-in', async t => {
  const source = snapshot(); source.ownerLifecycle = emptyOwnerLifecycle();
  source.ownerLifecycle.retention.enabled = true; source.ownerLifecycle.revision = 5;
  const { file, create, manifest } = await fixture(t, source);
  await restoreSnapshotProfile(file, manifest); const core = await create().readCore();
  assert.equal(core.ownerLifecycle.retention.enabled, false); assert.equal(core.ownerLifecycle.revision, 6);
  assert.equal((await create().read()).channels.length, source.chat.channels.length);
});

for (const [schema, enabled] of [[1, false], [2, true], [3, false], [3, true], [4, false], [4, true], [5, false], [5, true]]) test(`an older-schema pair ${schema} restores complete state with cleanup opt-in ${enabled}`, async t => {
  const source = snapshot(); source.ownerLifecycle = emptyOwnerLifecycle(); source.ownerLifecycle.retention.enabled = enabled;
  const { file, before, create, manifest } = await fixture(t, source);
  const metadata = JSON.parse(await readFile(path.join(path.dirname(manifest), path.basename(file)), 'utf8'));
  const expectedCore = envelopeCore(metadata); const savedDb = databasePath(path.join(path.dirname(manifest), path.basename(file)));
  const raw = new (sqliteDriver().DatabaseSync)(savedDb);
  try {
    downgradeDatabaseSchema(raw, schema);
  } finally { raw.close(); }
  const proof = JSON.parse(await readFile(manifest, 'utf8')); proof.schemaVersion = schema;
  proof.files.find(entry => entry.name === path.basename(savedDb)).sha256 = fileDigest(savedDb);
  await writeFile(manifest, JSON.stringify(proof)); const originalBackup = fileDigest(savedDb);
  await restoreSnapshotProfile(file, manifest); const restored = create(); const core = await restored.readCore();
  if (!enabled) assert.equal(await restored.logicalDigest(), before);
  else {
    assert.equal(core.ownerLifecycle.retention.enabled, false);
    assert.equal(core.ownerLifecycle.revision, expectedCore.ownerLifecycle.revision + 1);
    assert.ok(core.ownerLifecycle.retention.lastError);
    expectedCore.ownerLifecycle = { ...expectedCore.ownerLifecycle, revision: core.ownerLifecycle.revision,
      retention: { ...expectedCore.ownerLifecycle.retention, enabled: false, lastError: core.ownerLifecycle.retention.lastError } };
  }
  assert.deepEqual(core, expectedCore); assert.equal(fileDigest(savedDb), originalBackup);
});

test('read-only current database and Windows case aliases preserve the restored pair', async t => {
  const { file, before, create, manifest } = await fixture(t); await chmod(databasePath(file), 0o444);
  const alias = process.platform === 'win32' ? file.toUpperCase() : file;
  await assert.rejects(restoreSnapshotProfile(alias, manifest, { checkpoint(stage) {
    if (stage === 'restore_database_published') throw Error('Interrupted alias switch');
  } }), /Interrupted alias/);
  await restoreSnapshotProfile(file, manifest); assert.equal(await create().logicalDigest(), before);
});
