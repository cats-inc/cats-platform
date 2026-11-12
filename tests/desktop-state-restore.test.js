import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { LegacyJsonChatStore } from '../build/server/products/chat/state/store.js';
import { restoreLegacyProfile } from '../build/server/products/chat/state/database/restoreProfile.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { fileDigest } from '../build/server/platform/persistence/state-db/fileDigest.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { emptyOwnerLifecycle } from '../build/server/core/ownerLifecycle.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

async function fixture(t, source = snapshot()) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-db-restore 資料 '));
  const file = path.join(dir, 'profile.json'); const stores = [];
  t.after(async () => {
    for (const store of stores) await store.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 10 });
  });
  const raw = `${JSON.stringify(source, null, 2)}\n`; await writeFile(file, raw);
  const create = () => { const store = new DatabaseChatStore(file); stores.push(store); return store; };
  const store = create(); await store.initialize();
  await store.updateCore(core => ({ ...core, ownerProfile: { ...core.ownerProfile, displayName: 'New minor changed this' } }));
  const db = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  let manifest;
  try { manifest = path.resolve(dir, db.meta('legacy_manifest')); } finally { db.close(); }
  await store.close();
  return { dir, file, raw, create, manifest, source };
}

test('offline restore preserves current bytes and returns to a readable previous JSON minor', async t => {
  const { file, raw, manifest, create, source } = await fixture(t);
  const current = await readFile(file);
  const currentDbDigest = fileDigest(databasePath(file));
  const restored = await restoreLegacyProfile(file, manifest);
  assert.equal(await readFile(file, 'utf8'), raw);
  assert.equal(restored.restoredVersion, 7);
  await assert.rejects(readFile(databasePath(file)), { code: 'ENOENT' });
  await assert.rejects(readFile(`${file}.database.json`), { code: 'ENOENT' });
  const rollback = JSON.parse(await readFile(path.join(restored.backupDirectory, 'manifest.json'), 'utf8'));
  const primary = rollback.files.find(entry => entry.original === path.basename(file));
  const db = rollback.files.find(entry => entry.original === path.basename(databasePath(file)));
  assert.deepEqual(await readFile(path.join(restored.backupDirectory, primary.name)), current);
  assert.equal(fileDigest(path.join(restored.backupDirectory, db.name)), currentDbDigest);
  assert.equal((await new LegacyJsonChatStore(file).readCore()).version, 7);
  const upgradedAgain = await create().read();
  assert.equal(upgradedAgain.channels.length, source.chat.channels.length);
  assert.deepEqual(upgradedAgain.channels[0].messages, source.chat.channels[0].messages);
});

for (const stage of ['restore_prepared', 'restore_primary_published', 'restore_files_removed']) {
  test(`restore marker prevents startup and resumes after failure at ${stage}`, async t => {
    const { file, raw, manifest, create } = await fixture(t);
    await assert.rejects(restoreLegacyProfile(file, manifest, { checkpoint: checkpoint => {
      if (checkpoint === stage) throw new Error('injected restore interruption');
    } }), /injected restore interruption/);
    await assert.rejects(create().readCore(), { code: 'restore_pending' });
    await restoreLegacyProfile(file, manifest);
    assert.equal(await readFile(file, 'utf8'), raw);
    await assert.rejects(readFile(`${file}.state-db-restore.json`), { code: 'ENOENT' });
  });
}

test('idle open connections forbid restore before any current data is replaced', async t => {
  const { file, manifest, create } = await fixture(t);
  const active = create(); await active.initialize();
  const current = await readFile(file);
  await assert.rejects(restoreLegacyProfile(file, manifest), { code: 'profile_busy' });
  assert.deepEqual(await readFile(file), current);
  await assert.rejects(readFile(`${file}.state-db-restore.json`), { code: 'ENOENT' });
});

test('tampered backup data is refused without changing current state', async t => {
  const { file, manifest } = await fixture(t);
  const before = await readFile(file);
  await writeFile(path.join(path.dirname(manifest), 'primary.json'), 'corrupt selected source');
  await assert.rejects(restoreLegacyProfile(file, manifest));
  assert.deepEqual(await readFile(file), before);
  await assert.rejects(readFile(`${file}.state-db-restore.json`), { code: 'ENOENT' });
});

test('a valid replacement source between verification and reading is refused', async t => {
  const { file, manifest } = await fixture(t);
  const before = await readFile(file);
  const value = JSON.parse(await readFile(manifest, 'utf8'));
  await assert.rejects(restoreLegacyProfile(file, manifest, { checkpoint: async stage => {
    if (stage !== 'restore_source_verified') return;
    const replacement = snapshot(); replacement.ownerProfile.displayName = 'Substituted source';
    await writeFile(path.join(path.dirname(manifest), value.source), JSON.stringify(replacement));
  } }), { code: 'restore_invalid' });
  assert.deepEqual(await readFile(file), before);
  await assert.rejects(readFile(`${file}.state-db-restore.json`), { code: 'ENOENT' });
});

test('manifest traversal cannot read or remove another file', async t => {
  const { dir, file, manifest } = await fixture(t);
  const outside = path.join(dir, 'unrelated.json'); await writeFile(outside, 'keep this');
  const value = JSON.parse(await readFile(manifest, 'utf8'));
  value.files[0].name = '../unrelated.json';
  await writeFile(manifest, JSON.stringify(value));
  const before = await readFile(file);
  await assert.rejects(restoreLegacyProfile(file, manifest));
  assert.equal(await readFile(outside, 'utf8'), 'keep this');
  assert.deepEqual(await readFile(file), before);
});

test('a changed primary during interrupted restore is never overwritten on resume', async t => {
  const { file, manifest } = await fixture(t);
  await assert.rejects(restoreLegacyProfile(file, manifest, { checkpoint: stage => {
    if (stage === 'restore_prepared') throw new Error('pause');
  } }), /pause/);
  await writeFile(file, 'new external changes');
  await assert.rejects(restoreLegacyProfile(file, manifest), { code: 'restore_invalid' });
  assert.equal(await readFile(file, 'utf8'), 'new external changes');
});

test('rollback cannot silently re-enable an older automatic-cleanup policy', async t => {
  const source = snapshot(); source.ownerLifecycle = emptyOwnerLifecycle();
  source.ownerLifecycle.retention.enabled = true; source.ownerLifecycle.revision = 5;
  const { file, manifest } = await fixture(t, source);
  await restoreLegacyProfile(file, manifest);
  const restored = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(restored.ownerLifecycle.retention.enabled, false);
  assert.equal(restored.ownerLifecycle.revision, 6);
});

test('Unicode paths and a read-only current database survive backup and removal', async t => {
  const { file, manifest } = await fixture(t);
  const db = databasePath(file); await chmod(db, 0o444);
  try {
    await restoreLegacyProfile(file, manifest);
    await assert.rejects(readFile(db), { code: 'ENOENT' });
  } finally { await chmod(db, 0o600).catch(() => {}); }
});

test('malformed restore markers are preserved and cannot redirect cleanup', async t => {
  const { dir, file, manifest } = await fixture(t);
  const before = await readFile(file);
  await writeFile(`${file}.state-db-restore.json`, JSON.stringify({ format: 1, profile: path.basename(file),
    currentDirectory: '../other' }));
  await assert.rejects(restoreLegacyProfile(file, manifest), { code: 'restore_invalid' });
  assert.deepEqual(await readFile(file), before);
  assert.ok((await readdir(dir)).includes('profile.sqlite'));
});

test('Windows restore resumes through a case alias without deleting the restored primary', { skip: process.platform !== 'win32' }, async t => {
  const { file, manifest, raw } = await fixture(t);
  const uppercase = path.join(path.dirname(file), path.basename(file).toUpperCase());
  await assert.rejects(restoreLegacyProfile(uppercase, manifest, { checkpoint: stage => {
    if (stage === 'restore_primary_published') throw Error('interrupted alias restore');
  } }), /interrupted alias restore/);
  await restoreLegacyProfile(file, manifest);
  assert.equal(await readFile(file, 'utf8'), raw);
  await assert.rejects(readFile(databasePath(file)), { code: 'ENOENT' });
});
