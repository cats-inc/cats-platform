import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { createProfileLease } from '../build/server/products/chat/state/database/profileLease.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { sqliteDriver } from '../build/server/platform/persistence/state-db/sqliteDriver.js';
import { fileDigest } from '../build/server/platform/persistence/state-db/fileDigest.js';
import { withProfileLock } from '../build/server/platform/persistence/state-db/profileLock.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { STATE_SCHEMA_VERSION } from '../build/server/platform/persistence/state-db/stateSchema.js';
import { schemaUpgradeManifestName } from '../build/server/products/chat/state/database/schemaUpgrade.js';
import { downgradeDatabaseSchema } from './fixtures/desktop-state-schema.mjs';
import { archivedProfile } from './fixtures/desktop-state-archive.mjs';
import { verifyArchiveAssets } from '../build/server/products/chat/state/database/archiveAssets.js';

async function fixture(t, pending = false, sourceSchema = 1, basename = 'profile.json') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-schema 升級 '));
  const file = path.join(root, basename); const stores = [];
  await writeFile(file, JSON.stringify(snapshot()));
  const create = options => { const store = new DatabaseChatStore(file, options); stores.push(store); return store; };
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  let armed = false;
  const store = create({ checkpoint: stage => { if (armed && stage === 'database_committed') throw Error('pending old commit'); } });
  await store.initialize();
  const expected = await store.logicalDigest();
  if (pending) {
    armed = true;
    await assert.rejects(store.updateCore(core => ({ ...core,
      ownerProfile: { ...core.ownerProfile, displayName: 'Committed before upgrade' } })), /pending old commit/);
  }
  await store.close();
  const raw = new (sqliteDriver().DatabaseSync)(databasePath(file));
  try { downgradeDatabaseSchema(raw, sourceSchema); } finally { raw.close(); }
  const backups = async () => (await readdir(root)).filter(name => name.includes('.pre-state-db-schema-'));
  return { root, file, create, expected, backups };
}

function version(file) {
  const database = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  try { return database.meta('schema_version'); } finally { database.close(); }
}

for (const sourceSchema of [1, 2, 3, 4]) test(`schema ${sourceSchema} upgrades only after a paired verified backup and retains logical state`, async t => {
  const { file, create, expected, root, backups } = await fixture(t, false, sourceSchema);
  const metadata = await readFile(file);
  const store = create(); await store.initialize();
  assert.equal(version(file), String(STATE_SCHEMA_VERSION));
  assert.equal(await store.logicalDigest(), expected);
  const directory = path.join(root, (await backups())[0]);
  const manifest = JSON.parse(await readFile(path.join(directory, schemaUpgradeManifestName(file)), 'utf8'));
  assert.equal(manifest.kind, 'before-schema-upgrade'); assert.equal(manifest.sourceSchema, sourceSchema);
  for (const entry of manifest.files) assert.equal(fileDigest(path.join(directory, entry.name)), entry.sha256);
  assert.deepEqual(await readFile(path.join(directory, path.basename(file))), metadata);
  const saved = openStateDatabase({ file: path.join(directory, path.basename(databasePath(file))), mode: 'reader' });
  try { assert.equal(saved.meta('schema_version'), String(sourceSchema)); } finally { saved.close(); }
});

test('schema 4 cold profiles receive a standalone asset backup before staging-schema upgrade', async t => {
  const { file, create, channelId } = await archivedProfile(t);
  const first = create(), expected = await first.logicalDigest(); await first.close();
  const raw = new (sqliteDriver().DatabaseSync)(databasePath(file));
  try { downgradeDatabaseSchema(raw, 4); } finally { raw.close(); }
  const metadata = await readFile(file), store = create(); await store.initialize();
  assert.equal(await store.logicalDigest(), expected);
  assert.equal((await store.readChannel(channelId)).messages.length, 401);
  const directory = path.join(path.dirname(file), (await readdir(path.dirname(file))).find(name => name.includes('.pre-state-db-schema-4-')));
  const manifest = JSON.parse(await readFile(path.join(directory, schemaUpgradeManifestName(file)), 'utf8'));
  assert.equal(manifest.sourceSchema, 4); assert.equal(manifest.targetSchema, STATE_SCHEMA_VERSION); assert.equal(manifest.archives.length, 2);
  assert.deepEqual(await readFile(path.join(directory, path.basename(file))), metadata);
  const backup = openStateDatabase({ file: databasePath(path.join(directory, path.basename(file))), mode: 'reader' });
  try { assert.equal(backup.meta('schema_version'), '4'); await verifyArchiveAssets(backup, manifest.archives, undefined, true); }
  finally { backup.close(); }
});

test('an interruption after backup leaves schema 1 and retry reuses the verified backup', async t => {
  const { file, create, expected, backups } = await fixture(t);
  await assert.rejects(create({ checkpoint: stage => { if (stage === 'schema_backup_complete') throw Error('paused before upgrade'); } }).initialize(), /paused before upgrade/);
  assert.equal(version(file), '1'); assert.equal((await backups()).length, 1);
  const store = create(); await store.initialize();
  assert.equal(version(file), String(STATE_SCHEMA_VERSION)); assert.equal((await backups()).length, 1);
  assert.equal(await store.logicalDigest(), expected);
});

for (const sourceSchema of [1, 2, 3, 4]) test(`schema ${sourceSchema} upgrades a manifest.json profile without overwriting metadata`, async t => {
  const { file, create, expected, root, backups } = await fixture(t, false, sourceSchema, 'manifest.json');
  const bytes = await readFile(file); const store = create(); await store.initialize();
  assert.equal(await store.logicalDigest(), expected); assert.equal(version(file), String(STATE_SCHEMA_VERSION));
  const directory = path.join(root, (await backups())[0]);
  assert.deepEqual(await readFile(path.join(directory, path.basename(file))), bytes);
  const manifest = JSON.parse(await readFile(path.join(directory, schemaUpgradeManifestName(file)), 'utf8'));
  assert.equal(manifest.kind, 'before-schema-upgrade'); assert.equal(manifest.sourceSchema, sourceSchema);
  for (const entry of manifest.files) assert.equal(fileDigest(path.join(directory, entry.name)), entry.sha256);
});

test('a pending old-schema handoff is backed up and recovered once during upgrade', async t => {
  const { file, create, root, backups } = await fixture(t, true);
  const previous = await readFile(file);
  const store = create(); await store.initialize();
  assert.equal((await store.readCore()).ownerProfile.displayName, 'Committed before upgrade');
  const directory = path.join(root, (await backups())[0]);
  assert.equal(JSON.parse(await readFile(path.join(directory, schemaUpgradeManifestName(file)), 'utf8')).pendingHandoff, true);
  assert.deepEqual(await readFile(path.join(directory, path.basename(file))), previous);
});

test('an old-schema live connection lease rejects upgrade before any format mutation', async t => {
  const { file, create, backups } = await fixture(t);
  const release = await withProfileLock(file, () => createProfileLease(file));
  try {
    await assert.rejects(create().initialize(), { code: 'profile_busy' });
    assert.equal(version(file), '1'); assert.deepEqual(await backups(), []);
  } finally { await withProfileLock(file, release); }
  await create().initialize(); assert.equal(version(file), String(STATE_SCHEMA_VERSION));
});

test('future profile metadata is refused before old database schema changes', async t => {
  const { file, create, backups } = await fixture(t);
  const changed = JSON.parse(await readFile(file, 'utf8')); changed.version = 999;
  const bytes = JSON.stringify(changed); await writeFile(file, bytes);
  await assert.rejects(create().initialize(), { code: 'newer_profile' });
  assert.equal(version(file), '1'); assert.deepEqual(await backups(), []);
  assert.equal(await readFile(file, 'utf8'), bytes);
});

test('a failed SQL upgrade rolls back every DDL change and keeps the original and backup', async t => {
  const { file, create, root, backups } = await fixture(t);
  const raw = new (sqliteDriver().DatabaseSync)(databasePath(file));
  raw.exec("create table channel_catalog(unexpected text); insert into channel_catalog values ('preserve')"); raw.close();
  await assert.rejects(create().initialize());
  assert.equal(version(file), '1');
  const database = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  try { assert.equal(database.get('select unexpected from channel_catalog').unexpected, 'preserve'); } finally { database.close(); }
  const directory = path.join(root, (await backups())[0]);
  assert.ok(await readFile(path.join(directory, schemaUpgradeManifestName(file))));
});

test('an installation receipt mismatch is rejected before schema upgrade or backup admission', async t => {
  const { file, create, backups } = await fixture(t);
  const receipt = `${JSON.stringify({ format: 1, installationId: randomUUID() })}\n`;
  await writeFile(`${file}.database.json`, receipt);
  await assert.rejects(create().initialize(), { code: 'installation_mismatch' });
  assert.equal(version(file), '1'); assert.deepEqual(await backups(), []);
  assert.equal(await readFile(`${file}.database.json`, 'utf8'), receipt);
});

test('a valid profile swap after backup is preserved without upgrading the unbacked replacement', async t => {
  const original = await fixture(t); const replacement = await fixture(t);
  const expected = await readFile(replacement.file);
  await assert.rejects(original.create({ checkpoint: async stage => {
    if (stage !== 'schema_backup_complete') return;
    await copyFile(databasePath(replacement.file), databasePath(original.file));
    await copyFile(replacement.file, original.file);
    await copyFile(`${replacement.file}.database.json`, `${original.file}.database.json`);
  } }).initialize(), { code: 'schema_source_changed' });
  assert.equal(version(original.file), '1');
  assert.deepEqual(await readFile(original.file), expected);
});

test('SQL upgrade verifies the admitted identity inside its transaction', async t => {
  const { file } = await fixture(t);
  const reader = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  const upgradeAdmission = { schemaVersion: 1, installationId: reader.meta('installation_id'),
    revision: reader.meta('revision'), metadataDigest: reader.meta('metadata_digest') }; reader.close();
  const raw = new (sqliteDriver().DatabaseSync)(databasePath(file));
  raw.prepare("update meta set value = ? where key = 'revision'").run(randomUUID()); raw.close();
  assert.throws(() => openStateDatabase({ file: databasePath(file), mode: 'writer', upgradeAdmission }),
    { code: 'upgrade_source_changed' });
  assert.equal(version(file), '1');
});

test('close prevents a preparing upgrade from starting a new native maintenance worker', async t => {
  const { file, create, root, backups } = await fixture(t);
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const store = create({ checkpoint: async stage => {
    if (stage === 'schema_backup_preparing') { entered(); await held; }
  } });
  const initializing = store.initialize();
  const rejected = assert.rejects(initializing, { code: 'cancelled' });
  await ready;
  const closing = store.close(); release();
  await rejected; await closing;
  assert.equal(version(file), '1');
  const directory = path.join(root, (await backups())[0]);
  assert.equal((await readdir(directory)).some(name => name.includes('.sqlite') || name === schemaUpgradeManifestName(file)), false);
});
