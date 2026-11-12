import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { maintainProfileSnapshot, inspectProfileSnapshot, profileSnapshotDirectory, ProfileSnapshotMaintenance } from '../build/server/products/chat/state/database/profileSnapshots.js';
import { withProfileLock } from '../build/server/platform/persistence/state-db/profileLock.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { logicalDatabaseSnapshot } from '../build/server/products/chat/state/database/logicalExport.js';
import { canonicalDigest } from '../build/server/platform/persistence/state-db/canonicalJson.js';
import { databasePath, bytesDigest } from '../build/server/products/chat/state/database/profileFormat.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

const DAY = 24 * 60 * 60_000;
const baseTime = Date.parse('2026-01-01T00:00:00.000Z');
const date = day => new Date(baseTime + day * DAY);
async function fixture(t, options) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats paired snapshot 資料 '));
  const file = path.join(root, 'custom profile.json');
  const source = snapshot(); await writeFile(file, JSON.stringify(source));
  const store = new DatabaseChatStore(file, options); await store.initialize();
  t.after(async () => { await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  const capture = signal => withProfileLock(file, async () => { signal.throwIfAborted(); return readFile(file); }, { signal });
  const take = options => maintainProfileSnapshot(file, capture, { now: date(0), ...options });
  const list = async () => (await readdir(profileSnapshotDirectory(file))).filter(name => name.startsWith('snapshot-'));
  const change = async () => store.updateChannel(source.chat.channels[0].id, channel => {
    channel.messages.push({ ...channel.messages[0], id: randomUUID(), body: 'A concurrent isolated write' }); return { channel };
  });
  return { root, file, store, source, capture, take, list, change };
}

test('a daily pair reopens with exact metadata, complete logical state and standalone SQLite', async t => {
  const { file, store, take, list } = await fixture(t);
  const before = await readFile(file); const digest = await store.logicalDigest();
  const result = await take(); assert.equal(result.status, 'published');
  const manifest = await inspectProfileSnapshot(result.directory, file);
  assert.deepEqual(await readFile(path.join(result.directory, path.basename(file))), before);
  assert.equal(manifest.metadataDigest, bytesDigest(before));
  const db = openStateDatabase({ file: databasePath(path.join(result.directory, path.basename(file))), mode: 'reader' });
  try {
    const envelope = JSON.parse(before);
    assert.equal(canonicalDigest(logicalDatabaseSnapshot(envelope, db)), digest);
    assert.equal(db.meta('revision'), envelope.storage.revision);
  } finally { db.close(); }
  assert.equal((await take({ now: date(0.9) })).status, 'not_due');
  assert.equal((await list()).length, 1); assert.deepEqual(await readFile(file), before);
});

test('a write between JSON capture and SQLite snapshot defers without blocking the writer or publishing a mismatched pair', async t => {
  const { file, take, change, list } = await fixture(t); const good = await take();
  const before = await readFile(path.join(good.directory, path.basename(file)));
  const result = await take({ force: true, now: date(1), checkpoint: async stage => { if (stage === 'captured') await change(); } });
  assert.equal(result.status, 'changed'); assert.equal((await list()).length, 1);
  assert.deepEqual(await readFile(path.join(good.directory, path.basename(file))), before);
  assert.ok((await readdir(profileSnapshotDirectory(file))).every(name => !name.startsWith('.unfinished-')));
  assert.notDeepEqual(await readFile(file), before);
});

test('a write after VACUUM does not reject an already matching older committed pair', async t => {
  const { file, take, change } = await fixture(t); const before = await readFile(file);
  const result = await take({ checkpoint: async stage => { if (stage === 'snapshot_written') await change(); } });
  assert.equal(result.status, 'published'); await inspectProfileSnapshot(result.directory, file);
  assert.deepEqual(await readFile(path.join(result.directory, path.basename(file))), before);
  assert.notDeepEqual(await readFile(file), before);
});

for (const failAt of ['snapshot_written', 'verified', 'published']) test(`interruption at ${failAt} preserves the prior good pair and resumes cleanup/retention`, async t => {
  const { file, take, list } = await fixture(t); const first = await take();
  const original = await readFile(path.join(first.directory, 'manifest.json'));
  await assert.rejects(take({ now: date(1), retain: 1, checkpoint(stage) { if (stage === failAt) throw Error('private injected failure'); } }),
    error => error.code === 'snapshot_failed' && !error.message.includes('private'));
  assert.deepEqual(await readFile(path.join(first.directory, 'manifest.json')), original);
  await inspectProfileSnapshot(first.directory, file);
  assert.equal((await list()).length, failAt === 'published' ? 2 : 1);
  const resumed = await take({ now: date(1), retain: 1 });
  assert.equal(resumed.status, failAt === 'published' ? 'not_due' : 'published');
  assert.equal((await list()).length, 1);
  assert.ok((await readdir(profileSnapshotDirectory(file))).every(name => !name.startsWith('.unfinished-')));
});

test('retention ignores damaged/future pairs and a backward clock preserves previously good backups', async t => {
  const { file, take, list } = await fixture(t);
  const day0 = await take({ retain: 30 });
  const day1 = await take({ now: date(1), retain: 30 });
  const future = await take({ now: date(10), retain: 30 });
  const invalid = path.join(profileSnapshotDirectory(file), `snapshot-20260103T000000000Z-${randomUUID()}`);
  await mkdir(invalid); await writeFile(path.join(invalid, 'manifest.json'), JSON.stringify({ createdAt: date(2).toISOString() }));
  const orphan = path.join(profileSnapshotDirectory(file), `.unfinished-${randomUUID()}`);
  await mkdir(orphan); await writeFile(path.join(orphan, path.basename(file)), 'Interrupted metadata');
  const day2 = await take({ now: date(2), retain: 2 }); assert.equal(day2.status, 'published');
  await assert.rejects(readFile(path.join(day0.directory, 'manifest.json')), { code: 'ENOENT' });
  for (const entry of [day1, day2, future]) await inspectProfileSnapshot(entry.directory, file);
  assert.equal((await list()).length, 4, 'Three valid pairs plus the ignored damaged directory');
  const back = await take({ now: date(-1), retain: 2 }); assert.equal(back.status, 'published');
  for (const entry of [day1, day2, future, back]) await inspectProfileSnapshot(entry.directory, file);
  assert.equal((await take({ now: date(2.1), retain: 2 })).status, 'not_due');
  await assert.rejects(readFile(path.join(back.directory, 'manifest.json')), { code: 'ENOENT' });
  await inspectProfileSnapshot(future.directory, file);
  assert.equal((await readdir(profileSnapshotDirectory(file))).some(name => name.startsWith('.unfinished-')), false);
});

test('manifest path injection and profile-case aliases follow the fixed sibling contract', async t => {
  const { file, take, root } = await fixture(t); const result = await take();
  if (process.platform === 'win32') await inspectProfileSnapshot(result.directory, file.toUpperCase());
  const outside = path.join(root, 'outside.txt'); await writeFile(outside, 'Untouched unrelated data');
  const manifestFile = path.join(result.directory, 'manifest.json'); const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.files[0].name = '../outside.txt'; await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(inspectProfileSnapshot(result.directory, file));
  assert.equal(await readFile(outside, 'utf8'), 'Untouched unrelated data');
  assert.equal((await take({ now: date(0.1) })).status, 'published', 'A damaged current-day pair does not suppress a good snapshot');
});

for (const alreadyPublished of [false, true]) test(`retention revalidates ${alreadyPublished ? 'discovered' : 'newly published'} pairs before removing any good backup`, async t => {
  const { file, take, list } = await fixture(t); const original = await take({ retain: 30 });
  if (alreadyPublished) await take({ now: date(1), retain: 30 });
  await assert.rejects(take({ now: date(1.1), retain: 1, checkpoint: async stage => {
    if (stage !== 'before_prune') return;
    const newer = (await list()).find(name => path.join(profileSnapshotDirectory(file), name) !== original.directory);
    const target = databasePath(path.join(profileSnapshotDirectory(file), newer, path.basename(file)));
    await writeFile(target, Buffer.concat([await readFile(target), Buffer.from('Damaged after verification')]));
  } }), { code: 'snapshot_failed' });
  await inspectProfileSnapshot(original.directory, file);
  const recovered = await take({ now: date(1.2), retain: 1 }); assert.equal(recovered.status, 'published');
  await inspectProfileSnapshot(recovered.directory, file);
});

test('forced snapshots at the same timestamp retain the new returned pair', async t => {
  const { file, take, list } = await fixture(t); await take({ retain: 1 });
  const result = await take({ retain: 1, force: true });
  assert.equal((await list()).length, 1); await inspectProfileSnapshot(result.directory, file);
});

test('Windows profile aliases prune the old pair using the same filename identity', { skip: process.platform !== 'win32' }, async t => {
  const { file, take, capture, list } = await fixture(t); const first = await take({ retain: 1 });
  const second = await maintainProfileSnapshot(file.toUpperCase(), capture, { now: date(1), retain: 1 });
  assert.equal(second.status, 'published'); assert.equal((await list()).length, 1);
  await assert.rejects(readFile(path.join(first.directory, 'manifest.json')), { code: 'ENOENT' });
  await inspectProfileSnapshot(second.directory, file);
});

test('a redirected snapshot root is refused without touching its destination', async t => {
  const { root, file, take } = await fixture(t); const outside = path.join(root, 'unrelated'); await mkdir(outside);
  await symlink(outside, profileSnapshotDirectory(file), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(take(), { code: 'snapshot_failed' }); assert.deepEqual(await readdir(outside), []);
});

test('background backup failures stay nonfatal and ordinary conversation work continues', async t => {
  const fatal = []; const { root, file, store, change } = await fixture(t, {
    snapshotMaintenance: { initialDelayMs: 5, intervalMs: 60_000 }, onFatal: error => fatal.push(error.code),
  });
  const outside = path.join(root, 'unrelated'); await mkdir(outside);
  await symlink(outside, profileSnapshotDirectory(file), process.platform === 'win32' ? 'junction' : 'dir');
  const errors = [];
  t.mock.method(process.stderr, 'write', message => { errors.push(String(message)); return true; });
  store.startMaintenance();
  for (let i = 0; !errors.length; i++) {
    if (i > 250) throw Error('The backup failure was not reported');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.deepEqual(errors, ['[cats-platform-store] snapshot_failed\n']);
  await change(); assert.equal((await store.read()).channels[0].messages.length, 2);
  assert.deepEqual(fatal, []); assert.deepEqual(await readdir(outside), []);
});

test('the cross-process maintenance lock does not make a second snapshot wait for native work', async t => {
  const { file, take, capture } = await fixture(t); let release; let captured;
  const reached = new Promise(resolve => { captured = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = maintainProfileSnapshot(file, capture, { now: date(0), checkpoint: async stage => {
    if (stage === 'captured') { captured(); await gate; }
  } });
  t.after(async () => { release(); await first.catch(() => {}); }); await reached;
  assert.equal((await take()).status, 'busy'); release(); assert.equal((await first).status, 'published');
});

test('scheduler coalesces active work, aborts queued captures, and never starts again after stop', async t => {
  const { file, list } = await fixture(t); let calls = 0; let captured;
  const reached = new Promise(resolve => { captured = resolve; });
  const maintenance = new ProfileSnapshotMaintenance(file, async signal => {
    calls++; captured(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    throw Error('Unreachable after cancellation');
  }, { initialDelayMs: 5, intervalMs: 5 });
  t.after(() => maintenance.stop());
  const first = maintenance.run(); const second = maintenance.run(); assert.equal(first, second);
  const rejected = assert.rejects(first, { code: 'cancelled' }); await reached;
  await maintenance.stop(); await rejected;
  maintenance.start(); await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls, 1); assert.deepEqual(await list(), []);
  await assert.rejects(maintenance.run(), { code: 'cancelled' });
});

test('a failing diagnostic sink does not stop background retry or reject the serving process', async t => {
  const { file } = await fixture(t); let attempts = 0; let reports = 0;
  const maintenance = new ProfileSnapshotMaintenance(file, async () => { attempts++; throw Error('Private snapshot failure'); },
    { initialDelayMs: 5, intervalMs: 5, onError() { reports++; throw Error('Private reporting failure'); } });
  t.after(() => maintenance.stop()); maintenance.start();
  for (let i = 0; reports < 2; i++) {
    if (i > 250) throw Error('Background retry did not continue');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await maintenance.stop(); assert.ok(attempts >= 2); assert.ok(reports >= 2);
});

test('reset cancels a maintenance capture queued behind its own profile lock and the reopened store resumes scheduling', { timeout: 20_000 }, async t => {
  const { file, store } = await fixture(t, { snapshotMaintenance: { initialDelayMs: 5, intervalMs: 60_000 } });
  await store.withDataReset(async () => {
    store.startMaintenance();
    const lock = path.join(profileSnapshotDirectory(file), 'maintenance.operation-lock');
    for (let i = 0; ; i++) {
      if (await readFile(lock).catch(() => null)) break;
      if (i > 250) throw Error('The background capture did not reach its maintenance lock');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await store.removeOwnedState(async () => {});
  });
  await store.read();
  let complete;
  for (let i = 0; i < 500; i++) {
    complete = (await readdir(profileSnapshotDirectory(file))).filter(name => name.startsWith('snapshot-'));
    if (complete.length) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(complete.length, 1); await inspectProfileSnapshot(path.join(profileSnapshotDirectory(file), complete[0]), file);
  await store.close(); const before = await readdir(profileSnapshotDirectory(file));
  store.startMaintenance(); await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(await readdir(profileSnapshotDirectory(file)), before);
});
