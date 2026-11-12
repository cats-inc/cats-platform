import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { archivedProfile } from './fixtures/desktop-state-archive.mjs';
import { archiveDirectory, archiveAssetProofs, copyArchiveAssets, verifyArchiveAssets } from '../build/server/products/chat/state/database/archiveAssets.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { fileDigestAsync } from '../build/server/platform/persistence/state-db/fileDigest.js';
import { canonicalDigest } from '../build/server/platform/persistence/state-db/canonicalJson.js';
import { maintainProfileSnapshot, inspectProfileSnapshot } from '../build/server/products/chat/state/database/profileSnapshots.js';
import { restoreSnapshotProfile, restoreLegacyProfile } from '../build/server/products/chat/state/database/restoreProfile.js';
import { preparePlatformOwnedDataReset, removePlatformOwnedData } from '../build/server/shared/platformDataReset.js';
import { applyChannelReadRepairs } from '../build/server/products/chat/state/transcriptRepairs.js';

const safeFailure = code => error => error?.code === code && !/private|archiveuniqueterm|\.jsonl/.test(error.message);
const date = day => new Date(Date.UTC(2026, 10, 12 + day));
const take = (file, options) => maintainProfileSnapshot(file, () => readFile(file), { force: true, now: date(0), ...options });

test('full reads and logical exports hydrate exact cold messages without restoring hot/search rows', async t => {
  const { file, create, chat, core, channelId, siblingId } = await archivedProfile(t);
  const store = create();
  assert.deepEqual(await store.read(), chat);
  assert.deepEqual(await store.readCore(), core);
  assert.equal(await store.logicalDigest(), canonicalDigest({ ...core, chat }));
  const output = path.join(path.dirname(file), 'export.json'); await store.exportLogicalState(output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { ...core, chat });
  assert.deepEqual(await store.searchMessages('archiveuniqueterm'), []);
  await store.updateChannel(siblingId, channel => ({ channel: { ...channel, title: 'Sibling edited' } }));
  const renamed = structuredClone(await store.read()); renamed.channels[0].title = 'Archived title edited';
  await store.write(renamed);
  assert.equal((await store.readChannel(channelId)).title, 'Archived title edited');
  const db = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  try { assert.equal(db.get('select count(*) as count from messages where channel_id = ?', channelId).count, 0); }
  finally { db.close(); }
  await assert.rejects(store.updateChannel(channelId, channel => {
    channel.messages[0].body = 'private forbidden edit'; return { channel };
  }), safeFailure('conversation_archived'));
  assert.equal((await store.readChannel(channelId)).messages[0].body, chat.channels[0].messages[0].body);
});

test('content revisions track header/message changes independently of collection position and siblings', async t => {
  const { file, create, channelId, siblingId } = await archivedProfile(t), store = create();
  const revision = id => {
    const db = openStateDatabase({ file: databasePath(file), mode: 'reader' });
    try { return db.get('select content_revision from channels where id = ?', id).content_revision; }
    finally { db.close(); }
  };
  const cold = revision(channelId), sibling = revision(siblingId);
  await store.updateChannel(siblingId, channel => ({ channel: { ...channel, title: 'Changed title' } }));
  assert.notEqual(revision(siblingId), sibling); assert.equal(revision(channelId), cold);
  const state = await store.read(); state.channels.reverse(); await store.write(state);
  assert.equal(revision(channelId), cold);
  const afterHeader = revision(siblingId);
  await store.updateChannel(siblingId, channel => {
    channel.messages[0].body = 'Message content changed'; return { channel };
  });
  assert.notEqual(revision(siblingId), afterHeader);
});

for (const basename of ['profile.json', 'manifest.json']) test(`paired snapshots are standalone with cold assets for ${basename}`, async t => {
  const { file, assets, create, chat, core, channelId } = await archivedProfile(t, basename);
  const pair = await take(file); assert.equal(pair.status, 'published');
  const manifest = await inspectProfileSnapshot(pair.directory, file); assert.equal(manifest.archives.length, 2);
  const savedProfile = path.join(pair.directory, path.basename(file));
  const savedDb = openStateDatabase({ file: databasePath(savedProfile), mode: 'reader' });
  try { await verifyArchiveAssets(savedDb, manifest.archives, undefined, true); }
  finally { savedDb.close(); }
  // Delete original cold storage to prove this is a self-contained backup, not a path reference.
  await rm(assets, { recursive: true });
  const restored = await restoreSnapshotProfile(file, pair.manifest); assert.equal(restored.restoredVersion, 8);
  const store = create(); assert.deepEqual(await store.read(), chat); assert.deepEqual(await store.readCore(), core);
  assert.equal((await store.readChannel(channelId)).messages.length, 401);
});

for (const stage of ['restore_prepared', 'restore_archives_published', 'restore_database_published', 'restore_primary_published']) {
  test(`cold paired restore resumes after ${stage} with an independent rollback copy`, async t => {
    const { file, assets, create, chat, core } = await archivedProfile(t);
    const pair = await take(file); assert.equal(pair.status, 'published');
    await assert.rejects(restoreSnapshotProfile(file, pair.manifest, { checkpoint(value) {
      if (value === stage) throw Error('private injected interruption');
    } }), /private injected interruption/);
    const journal = JSON.parse(await readFile(`${file}.state-db-restore.json`, 'utf8'));
    const currentDir = path.join(path.dirname(file), journal.currentDirectory);
    const current = JSON.parse(await readFile(path.join(currentDir, 'manifest.json'), 'utf8'));
    assert.equal(current.archives.length, 2);
    for (const asset of current.archives) assert.equal(await fileDigestAsync(path.join(currentDir, 'archives', asset.name)), asset.sha256);
    await restoreSnapshotProfile(file, pair.manifest);
    const store = create(); assert.deepEqual(await store.read(), chat); assert.deepEqual(await store.readCore(), core);
    assert.equal((await readdir(assets)).length, 2);
  });
}

test('corrupt/missing cold source never displaces the last verified snapshot', async t => {
  const { file, assets, manifest } = await archivedProfile(t), first = await take(file);
  assert.equal(first.status, 'published');
  const payload = path.join(assets, manifest.file); await writeFile(payload, 'private corrupt cold data');
  await assert.rejects(take(file, { now: date(1), retain: 1 }), safeFailure('snapshot_failed'));
  await inspectProfileSnapshot(first.directory, file);
  await rm(payload);
  await assert.rejects(take(file, { now: date(2), retain: 1 }), safeFailure('snapshot_failed'));
  await inspectProfileSnapshot(first.directory, file);
});

test('a concurrent owner deletion defers a cold-file copy and preserves the earlier backup', async t => {
  const { file, assets, create, channelId } = await archivedProfile(t), first = await take(file);
  const result = await take(file, { now: date(1), retain: 1, checkpoint: async stage => {
    if (stage !== 'snapshot_written') return;
    const store = create(), state = await store.read();
    state.channels = state.channels.filter(channel => channel.id !== channelId); await store.write(state); await store.close();
    await rm(assets, { recursive: true });
  } });
  assert.equal(result.status, 'changed'); await inspectProfileSnapshot(first.directory, file);
});

test('retention removes only obsolete verified cold pairs, preserving current assets and unknown stage files', async t => {
  const { file, assets, manifest } = await archivedProfile(t), first = await take(file);
  const root = path.dirname(first.directory), unknown = path.join(root, `.unfinished-${randomUUID()}`);
  await mkdir(unknown); await mkdir(path.join(unknown, path.basename(assets)));
  await writeFile(path.join(unknown, path.basename(assets), 'private-unowned-file'), 'preserve');
  const second = await take(file, { now: date(1), retain: 1 }); assert.equal(second.status, 'published');
  await assert.rejects(readdir(first.directory), { code: 'ENOENT' });
  await inspectProfileSnapshot(second.directory, file);
  assert.equal(await readFile(path.join(unknown, path.basename(assets), 'private-unowned-file'), 'utf8'), 'preserve');
  assert.ok((await readFile(path.join(assets, manifest.file))).length > 100);
});

test('selected backup cold corruption rejects restore before creating a target journal or current backup', async t => {
  const { file } = await archivedProfile(t), pair = await take(file), manifest = await inspectProfileSnapshot(pair.directory, file);
  const before = await readFile(file), entries = await readdir(path.dirname(file));
  const asset = manifest.archives.find(item => item.name.endsWith('.jsonl.gz'));
  await writeFile(path.join(archiveDirectory(databasePath(path.join(pair.directory, path.basename(file)))), asset.name), 'private damaged backup');
  await assert.rejects(restoreSnapshotProfile(file, pair.manifest));
  assert.deepEqual(await readFile(file), before); assert.deepEqual(await readdir(path.dirname(file)), entries);
});

test('changed live cold assets during pending restore are preserved and refused', async t => {
  const { file, assets, manifest } = await archivedProfile(t), pair = await take(file);
  await assert.rejects(restoreSnapshotProfile(file, pair.manifest, { checkpoint(stage) {
    if (stage === 'restore_prepared') throw Error('pause');
  } }), /pause/);
  const payload = path.join(assets, manifest.file); await writeFile(payload, 'external owner edit');
  const before = await readFile(file);
  await assert.rejects(restoreSnapshotProfile(file, pair.manifest));
  assert.equal(await readFile(payload, 'utf8'), 'external owner edit'); assert.deepEqual(await readFile(file), before);
});

test('deleting a cold conversation records a tombstone without losing sibling/group/Core records', async t => {
  const { file, create, channelId, siblingId, assets } = await archivedProfile(t), store = create();
  const state = await store.read(); state.channels = state.channels.filter(channel => channel.id !== channelId); await store.write(state);
  assert.ok(await store.readChannel(siblingId)); assert.equal(await store.readChannel(channelId), null);
  const db = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  try { assert.equal(db.get('select state from conversation_archives where channel_id = ?', channelId).state, 'delete_pending'); }
  finally { db.close(); }
  assert.equal((await readdir(assets)).length, 2);
});

test('a legacy rollback retains exact cold assets alongside its current database backup', async t => {
  const { file, assets } = await archivedProfile(t);
  const root = path.dirname(file), directory = (await readdir(root)).find(name => name.includes('.pre-state-db-'));
  const result = await restoreLegacyProfile(file, path.join(root, directory, 'manifest.json'));
  const current = JSON.parse(await readFile(path.join(result.backupDirectory, 'manifest.json'), 'utf8'));
  assert.equal(current.archives.length, 2);
  for (const asset of current.archives) assert.equal(await fileDigestAsync(path.join(result.backupDirectory, 'archives', asset.name)), asset.sha256);
  assert.equal((await readdir(assets)).length, 2);
});

test('authorized reset removes the database-derived cold root before its primary', async t => {
  const { file, assets, create } = await archivedProfile(t), store = create(), removed = [];
  await store.initialize();
  await store.withDataReset(async () => {
    await preparePlatformOwnedDataReset(file, {});
    await store.removeOwnedState(() => removePlatformOwnedData(file, { report() {}, remove: async (entry, options) => {
      await rm(entry, options); removed.push(entry);
    } }));
  });
  await assert.rejects(readdir(assets), { code: 'ENOENT' });
  assert.ok(removed.indexOf(assets) >= 0 && removed.indexOf(assets) < removed.indexOf(file));
});

for (const field of ['messages_digest', 'source_revision', 'channel_revision', 'original_status', 'created_at']) {
  test(`a mismatched archive ${field} rejects full reads, logical exports and snapshots consistently`, async t => {
    const { file, create } = await archivedProfile(t);
    const db = openStateDatabase({ file: databasePath(file), mode: 'writer' });
    try {
      const value = field === 'messages_digest' ? '0'.repeat(64) : field === 'original_status' ? 'watching'
        : field === 'created_at' ? '2026-11-13T00:00:00.000Z' : 'another-revision';
      // Fixed internal column list above; never built from an external payload.
      db.run(`update conversation_archives set ${field} = ?`, value);
    } finally { db.close(); }
    const store = create();
    await assert.rejects(store.read(), safeFailure('archive_invalid'));
    await assert.rejects(store.logicalDigest(), safeFailure('archive_invalid'));
    const output = path.join(path.dirname(file), 'should-not-publish.json');
    await assert.rejects(store.exportLogicalState(output), safeFailure('archive_invalid'));
    await assert.rejects(stat(output), { code: 'ENOENT' });
    await store.close(); await assert.rejects(take(file), safeFailure('snapshot_failed'));
  });
}

for (const stage of ['restore_archives_published', 'restore_database_published']) {
  test(`good backup repairs same-ID corrupt cold files and resumes after ${stage}`, async t => {
    const { file, assets, create, chat, core, manifest } = await archivedProfile(t), pair = await take(file);
    const broken = new Map();
    for (const name of [manifest.file, `${manifest.archiveId}.manifest.json`]) {
      const bytes = Buffer.from(`private corrupt original ${name}`); broken.set(name, bytes);
      await writeFile(path.join(assets, name), bytes);
    }
    await assert.rejects(restoreSnapshotProfile(file, pair.manifest, { checkpoint(value) {
      if (value === stage) throw Error('pause after repair');
    } }), /pause after repair/);
    const journal = JSON.parse(await readFile(`${file}.state-db-restore.json`, 'utf8'));
    const rollback = path.join(path.dirname(file), journal.currentDirectory);
    for (const [name, bytes] of broken) assert.deepEqual(await readFile(path.join(rollback, 'archives', name)), bytes);
    await restoreSnapshotProfile(file, pair.manifest);
    const store = create(); assert.deepEqual(await store.read(), chat); assert.deepEqual(await store.readCore(), core);
  });
}

test('cold copies abort after a real written chunk, preserve sources and never replace an existing file', async t => {
  const { root, assets, manifest } = await archivedProfile(t);
  const name = manifest.file, proof = { name, sha256: await fileDigestAsync(path.join(assets, name)) };
  const destination = path.join(root, 'cancelled-copy'), abort = new AbortController();
  let checkpointReached = false;
  await assert.rejects(copyArchiveAssets(assets, destination, [proof], abort.signal, async () => {
    checkpointReached = true;
    const partial = (await readdir(destination)).find(file => file.endsWith('.unfinished'));
    assert.ok((await stat(path.join(destination, partial))).size > 0);
    abort.abort();
  }), error => error?.name === 'AbortError');
  assert.equal(checkpointReached, true); assert.deepEqual(await readdir(destination), []);
  assert.equal(await fileDigestAsync(path.join(assets, name)), proof.sha256);
  await writeFile(path.join(destination, name), 'external existing bytes');
  await assert.rejects(copyArchiveAssets(assets, destination, [proof]), safeFailure('archive_invalid'));
  assert.equal(await readFile(path.join(destination, name), 'utf8'), 'external existing bytes');
});

test('a cancelled cold copy preserves an external replacement of its own temporary pathname', async t => {
  const { root, assets, manifest } = await archivedProfile(t);
  const proof = { name: manifest.file, sha256: await fileDigestAsync(path.join(assets, manifest.file)) };
  const destination = path.join(root, 'replacement-copy'), abort = new AbortController();
  let replaced;
  await assert.rejects(copyArchiveAssets(assets, destination, [proof], abort.signal, async () => {
    const name = (await readdir(destination)).find(file => file.endsWith('.unfinished'));
    replaced = path.join(destination, name); await rename(replaced, `${replaced}.moved`);
    await writeFile(replaced, 'external replacement'); abort.abort();
  }), error => error?.name === 'AbortError');
  assert.equal(await readFile(replaced, 'utf8'), 'external replacement');
});

test('a replaced cold copy temporary is preserved without publishing it when no cancellation occurs', async t => {
  const { root, assets, manifest } = await archivedProfile(t);
  const proof = { name: manifest.file, sha256: await fileDigestAsync(path.join(assets, manifest.file)) };
  const destination = path.join(root, 'no-abort-replacement-copy');
  let replaced;
  await assert.rejects(copyArchiveAssets(assets, destination, [proof], undefined, async () => {
    if (replaced) return;
    const name = (await readdir(destination)).find(file => file.endsWith('.unfinished'));
    replaced = path.join(destination, name); await rename(replaced, `${replaced}.moved`);
    await writeFile(replaced, 'external replacement');
  }), safeFailure('archive_invalid'));
  assert.equal(await readFile(replaced, 'utf8'), 'external replacement');
  await assert.rejects(stat(path.join(destination, proof.name)), { code: 'ENOENT' });
});

test('Windows cold filename aliases remain readable, independently backed up and prunable', { skip: process.platform !== 'win32' }, async t => {
  const { file, assets, create } = await archivedProfile(t);
  for (const name of await readdir(assets)) await rename(path.join(assets, name), path.join(assets, name.toUpperCase()));
  const first = await take(file); assert.equal(first.status, 'published');
  const savedRoot = archiveDirectory(databasePath(path.join(first.directory, path.basename(file))));
  for (const name of await readdir(savedRoot)) await rename(path.join(savedRoot, name), path.join(savedRoot, name.toUpperCase()));
  await inspectProfileSnapshot(first.directory, file);
  const second = await take(file, { now: date(1), retain: 1 }); assert.equal(second.status, 'published');
  await assert.rejects(readdir(first.directory), { code: 'ENOENT' });
  const restored = await restoreSnapshotProfile(file, second.manifest);
  const current = JSON.parse(await readFile(path.join(restored.backupDirectory, 'manifest.json'), 'utf8'));
  assert.equal(current.archives.length, 2);
  assert.ok(current.archives.every(asset => asset.name === asset.name.toUpperCase()));
  const store = create(); assert.equal((await store.read()).channels[0].messages.length, 401);
});

test('background cold admission never uses synchronous manifest filesystem reads', async t => {
  const { file } = await archivedProfile(t);
  const script = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const { openStateDatabase } = await import(${JSON.stringify(new URL('../build/server/platform/persistence/state-db/stateDatabase.js', import.meta.url).href)});
    const { verifyArchiveAssets } = await import(${JSON.stringify(new URL('../build/server/products/chat/state/database/archiveAssets.js', import.meta.url).href)});
    const db = openStateDatabase({ file: process.argv[1], mode: 'reader' });
    fs.readSync = () => { throw Error('unexpected synchronous manifest read'); };
    fs.openSync = () => { throw Error('unexpected synchronous manifest open'); };
    fs.lstatSync = () => { throw Error('unexpected synchronous manifest stat'); };
    syncBuiltinESMExports();
    try { assert.equal((await verifyArchiveAssets(db)).length, 2); }
    finally { db.close(); }
  `;
  const child = spawnSync(process.execPath, ['--import', './scripts/testing/isolate-cats-home.mjs', '--input-type=module',
    '-e', script, databasePath(file)], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
});

test('actual offline CLI check/export include cold assets and refuse damaged cold evidence', async t => {
  const { root, file, assets, manifest, chat, core } = await archivedProfile(t);
  const invoke = args => spawnSync(process.execPath, ['--import', './scripts/testing/isolate-cats-home.mjs',
    'build/server/index.js', 'state', ...args, '--profile', file],
  { encoding: 'utf8', timeout: 20_000, windowsHide: true });
  const before = await readFile(file), dbBefore = await fileDigestAsync(databasePath(file));
  let result = invoke(['check']); assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).result.checked, true);
  const output = path.join(root, 'cli-cold-export.json'); result = invoke(['export', '--output', output]);
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { ...core, chat });
  await writeFile(path.join(assets, manifest.file), 'private damaged archiveuniqueterm');
  result = invoke(['check']); assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'archive_invalid'); assert.doesNotMatch(result.stderr, /private|archiveuniqueterm/);
  assert.deepEqual(await readFile(file), before); assert.equal(await fileDigestAsync(databasePath(file)), dbBefore);
});

test('startup and ordinary writes leave repairable archived history immutable', async t => {
  const { file, create, chat, core, channelId } = await archivedProfile(t, 'profile.json', source => {
    Object.assign(source.chat.channels[0].messages.at(-1), { senderKind: 'agent', senderName: 'Chat',
      metadata: { event: 'assistant_turn_segment', assistantTurnId: 'old-assistant-turn', terminal: true,
        targetKind: 'orchestrator', targetId: 'orchestrator', sessionId: 'missing-session-marker' } });
  });
  const active = structuredClone(chat); active.channels[0].status = 'active';
  assert.equal(applyChannelReadRepairs(active, channelId, { core }).repaired, true);
  const store = create(); await store.prepareTranscriptReads();
  assert.deepEqual(await store.read(), chat); assert.deepEqual(await store.readCore(), core);
  await store.updateChannel(channelId, channel => ({ channel: { ...channel, title: 'Retitled cold conversation' } }));
  assert.deepEqual((await store.readChannel(channelId)).messages, chat.channels[0].messages);
  const database = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  try { assert.equal(database.get('select count(*) as count from messages where channel_id = ?', channelId).count, 0); }
  finally { database.close(); }
});
