import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { canonicalDigest } from '../build/server/platform/persistence/state-db/canonicalJson.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { assertProfileOffline } from '../build/server/products/chat/state/database/profileLease.js';
import { emptyOwnerLifecycle } from '../build/server/core/ownerLifecycle.js';
import { normalizeLegacyRecord } from '../build/server/products/chat/state/database/legacyImport.js';
import { normalizeImportedChatSnapshot } from '../build/server/products/chat/state/store.js';

import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

async function fixture(t, source = snapshot()) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-db-store 資料 '));
  const file = path.join(dir, 'profile.json');
  const stores = [];
  t.after(async () => {
    for (const store of stores.reverse()) await store.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 10 });
  });
  const raw = source ? `${JSON.stringify(source, null, 2)}\n` : null;
  if (raw !== null) await writeFile(file, raw);
  const create = options => { const store = new DatabaseChatStore(file, options); stores.push(store); return store; };
  return { dir, file, raw, create, stores, source };
}

function reader(file) { return openStateDatabase({ file: databasePath(file), mode: 'reader' }); }

test('caller mutation failures never classify a healthy database as fatal storage', async t => {
  const { create } = await fixture(t);
  const failures = [];
  const store = create({ onFatal: error => failures.push(error) });
  await store.initialize();
  const before = await store.logicalDigest();
  const syntax = new SyntaxError('invalid caller input');
  await assert.rejects(store.updateSnapshot(() => { throw syntax; }), error => error === syntax);
  const unrelatedIo = Object.assign(new Error('unrelated external task failed'), { code: 'EACCES' });
  await assert.rejects(store.updateCore(async () => { throw unrelatedIo; }), error => error === unrelatedIo);
  await assert.rejects(store.withDataReset(() => store.updateSnapshot(() => { throw syntax; })), error => error === syntax);
  await assert.rejects(store.withDataReset(() => store.updateCore(async () => { throw unrelatedIo; })), error => error === unrelatedIo);
  assert.deepEqual(failures, []);
  assert.equal(await store.logicalDigest(), before);
});

test('a newer database keeps its actionable build category and original bytes', async t => {
  const { file, create } = await fixture(t);
  const old = create(); await old.initialize(); await old.close();
  const raw = openStateDatabase({ file: databasePath(file), mode: 'writer' });
  raw.setMeta('schema_version', '999'); raw.close();
  const before = await readFile(databasePath(file));
  const failures = [];
  await assert.rejects(create({ onFatal: error => failures.push(error) }).initialize(), {
    code: 'newer_schema', message: /newer Cats build/,
  });
  assert.equal(failures[0].code, 'newer_schema');
  assert.deepEqual(await readFile(databasePath(file)), before);
});

test('live backend imports conversations and Core into an admitted version-8 envelope', async t => {
  const { file, raw, create, source } = await fixture(t);
  const store = create(); await store.initialize();
  const envelope = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(envelope.version, 8);
  assert.deepEqual(envelope.chat.channels, []);
  assert.deepEqual(envelope.chat.parallelChatGroups, []);
  assert.equal((await store.readCore()).version, 7);
  const chat = await store.read();
  assert.equal(chat.channels.length, source.chat.channels.length);
  assert.deepEqual(chat.parallelChatGroups, source.chat.parallelChatGroups);
  assert.deepEqual(chat.channels.map(channel => channel.messages), source.chat.channels.map(channel => channel.messages));
  const db = reader(file);
  try {
    assert.equal(db.meta('profile_import_complete'), '1');
    assert.equal(db.meta('initial_logical_digest'), await store.logicalDigest());
    const manifestPath = path.resolve(path.dirname(file), db.meta('legacy_manifest'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(await readFile(path.join(path.dirname(manifestPath), 'primary.json'), 'utf8'), raw);
    assert.equal(manifest.source, 'primary.json');
  } finally { db.close(); }
});

test('recognized legacy extensions and rich JSON survive migration and logical export', async t => {
  const source = snapshot();
  source.futurePassive = { keep: 'root' };
  source.chat.channels[0].futurePassive = { keep: 'channel' };
  source.chat.channels[0].messages[0].futurePassive = { keep: 'message' };
  source.chat.cats[0].futurePassive = { keep: 'cat' };
  const { dir, create } = await fixture(t, source);
  const store = create(); await store.initialize();
  const chat = await store.read();
  assert.deepEqual(chat.channels[0].messages[0].futurePassive, { keep: 'message' });
  assert.deepEqual(chat.channels[0].futurePassive, { keep: 'channel' });
  assert.deepEqual(chat.cats[0].futurePassive, { keep: 'cat' });
  assert.deepEqual((await store.readCore()).futurePassive, { keep: 'root' });
  const output = path.join(dir, 'logical.json');
  await store.exportLogicalState(output);
  const exported = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(canonicalDigest(exported), await store.logicalDigest());
  assert.equal(exported.chat.channels[0].messages[0].body, source.chat.channels[0].messages[0].body);
  await assert.rejects(store.exportLogicalState(output), { code: 'EEXIST' });
});

test('reprojected history retains source timestamps and deterministic pre/post exports', async t => {
  const source = snapshot();
  const time = '2026-01-01T00:00:00.000Z';
  const channel = source.chat.channels[0];
  channel.roomRouting.workflow.turnHistory = [{ id: 'historical-turn', status: 'completed',
    sourceMessageId: channel.messages[0].id, sourceSenderKind: 'user', sourceSenderName: 'Owner',
    guard: null, stageId: 'done', workflowShape: 'linear', reviewRequired: false,
    lastCheckpointId: null, convergeTargetId: null, continuationCount: 0, dispatchCount: 0,
    targetStatuses: [], events: [], startedAt: time, updatedAt: time, completedAt: time }];
  const projected = normalizeImportedChatSnapshot(source);
  projected.turns[0].updatedAt = '2020-01-01T00:00:00.000Z';
  const expected = normalizeLegacyRecord(projected);
  assert.equal(expected.turns[0].updatedAt, '2020-01-01T00:00:00.000Z');
  const before = canonicalDigest(expected);
  await new Promise(done => setTimeout(done, 15));
  assert.equal(canonicalDigest(normalizeLegacyRecord(projected)), before);
  const { create } = await fixture(t, projected);
  const store = create(); await store.initialize();
  assert.equal(await store.logicalDigest(), before);
});

test('an uninitialized export cannot create or migrate a missing profile', async t => {
  const { dir, create } = await fixture(t, null);
  await assert.rejects(create().exportLogicalState(path.join(dir, 'out.json')), { code: 'not_initialized' });
  assert.deepEqual(await readdir(dir), []);
});

test('new installations initialize once and every domain commit gets a distinct revision', async t => {
  const { file, create } = await fixture(t, null);
  const store = create(); await store.initialize();
  const before = JSON.parse(await readFile(file, 'utf8'));
  await store.updateCore(core => ({ ...core, ownerProfile: { ...core.ownerProfile, displayName: 'Changed' } }));
  const after = JSON.parse(await readFile(file, 'utf8'));
  assert.notEqual(before.storage.revision, after.storage.revision);
  assert.equal(before.storage.installationId, after.storage.installationId);
  assert.equal((await store.readCore()).ownerProfile.displayName, 'Changed');
  const stable = await readFile(file, 'utf8');
  await store.updateSnapshot(value => value);
  assert.equal(await readFile(file, 'utf8'), stable);
});

for (const stage of ['backup_complete', 'import_verified', 'database_published', 'metadata_published', 'handoff_acknowledged']) {
  test(`migration retries safely after failure at ${stage}`, async t => {
    const { file, raw, create, source } = await fixture(t);
    let failed = false;
    const broken = create({ checkpoint: checkpoint => {
      if (checkpoint === stage && !failed) { failed = true; throw new Error('injected checkpoint'); }
    } });
    await assert.rejects(broken.initialize(), /injected checkpoint/);
    await broken.close();
    if (['backup_complete', 'import_verified', 'database_published'].includes(stage)) {
      assert.equal(await readFile(file, 'utf8'), raw);
    }
    const recovered = create(); await recovered.initialize();
    assert.equal((await recovered.read()).channels.length, source.chat.channels.length);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 8);
    const db = reader(file);
    try { assert.equal(db.get('select count(*) as n from metadata_handoff').n, 0); }
    finally { db.close(); }
  });
}

for (const stage of ['database_committed', 'metadata_published', 'handoff_acknowledged']) {
  test(`a committed mutation recovers exactly once after failure at ${stage}`, async t => {
    const { create, source } = await fixture(t);
    const seed = create(); await seed.initialize();
    let failed = false;
    const broken = create({ checkpoint: checkpoint => {
      if (checkpoint === stage && !failed) { failed = true; throw new Error('injected write failure'); }
    } });
    const id = source.chat.channels[0].id;
    await assert.rejects(broken.updateSnapshot(({ chat, core }) => {
      chat.channels.find(channel => channel.id === id).messages[0].body = 'committed new body';
      return { chat, core };
    }), /injected write failure/);
    const recovered = create();
    assert.equal((await recovered.readChannel(id)).messages[0].body, 'committed new body');
    assert.equal((await recovered.readMessagePage(id)).total, 1);
  });
}

test('backup recovery preserves damaged primary bytes and every existing upgrade backup', async t => {
  const { file, raw, create } = await fixture(t);
  await writeFile(`${file}.bak`, raw);
  await writeFile(`${file}.pre-provider-policy.bak`, 'original upgrade bytes');
  await writeFile(file, '{damaged primary');
  const store = create(); await store.initialize();
  assert.equal((await store.read()).channels.length, 2);
  const db = reader(file);
  try {
    const manifestPath = path.resolve(path.dirname(file), db.meta('legacy_manifest'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.source, 'backup.json');
    assert.equal(await readFile(path.join(path.dirname(manifestPath), 'primary.json'), 'utf8'), '{damaged primary');
    assert.equal(await readFile(path.join(path.dirname(manifestPath), 'upgrade-0.bak'), 'utf8'), 'original upgrade bytes');
    await assert.rejects(readFile(`${file}.bak`), { code: 'ENOENT' });
  } finally { db.close(); }
});

test('newer ordinary backups and unrecognized sources are refused without a reset', async t => {
  const { file, raw, create } = await fixture(t);
  const newer = JSON.stringify({ ...snapshot(), version: 99 });
  await writeFile(`${file}.bak`, newer);
  await assert.rejects(create().initialize(), { code: 'newer_profile' });
  assert.equal(await readFile(file, 'utf8'), raw);
  assert.equal(await readFile(`${file}.bak`, 'utf8'), newer);
  await assert.rejects(readFile(databasePath(file)), { code: 'ENOENT' });
});

test('unknown policies and dropped source records cannot become default data', async t => {
  const { file, create } = await fixture(t);
  const invalid = snapshot(); invalid.chat.channels[0].runtimeExecutionPolicy = { version: 999 };
  const raw = JSON.stringify(invalid); await writeFile(file, raw);
  await assert.rejects(create().initialize());
  assert.equal(await readFile(file, 'utf8'), raw);
  await assert.rejects(readFile(databasePath(file)), { code: 'ENOENT' });
  const malformed = snapshot(); malformed.chat.channels[0].messages.push({ id: null });
  const malformedRaw = JSON.stringify(malformed); await writeFile(file, malformedRaw);
  await assert.rejects(create().initialize(), { code: 'unrecognized_profile' });
  assert.equal(await readFile(file, 'utf8'), malformedRaw);
});

for (const damaged of [null, 'damaged', [{}]]) {
  test(`damaged Core collections cannot be normalized into a successful import (${JSON.stringify(damaged)})`, async t => {
    const { file, create } = await fixture(t);
    const invalid = snapshot(); invalid.projects = damaged === null ? [null] : damaged;
    const raw = JSON.stringify(invalid); await writeFile(file, raw);
    await assert.rejects(create().initialize(), { code: 'unrecognized_profile' });
    assert.equal(await readFile(file, 'utf8'), raw);
    await assert.rejects(readFile(databasePath(file)), { code: 'ENOENT' });
  });
}

for (const primary of ['missing', 'corrupt']) {
  test(`backup recovery never re-enables automatic cleanup with ${primary} primary`, async t => {
    const source = snapshot(); source.ownerLifecycle = emptyOwnerLifecycle();
    source.ownerLifecycle.retention.enabled = true; source.ownerLifecycle.revision = 4;
    const { file, raw, create } = await fixture(t, source);
    await writeFile(`${file}.bak`, raw);
    if (primary === 'missing') await unlink(file); else await writeFile(file, '{damaged');
    const core = await create().readCore();
    assert.equal(core.ownerLifecycle.retention.enabled, false);
    assert.equal(core.ownerLifecycle.revision, 5);
    assert.match(core.ownerLifecycle.retention.lastError, /disabled after profile recovery/);
  });
}

test('legacy concurrent-group extension fields follow their recognized collection rename', async t => {
  const source = snapshot();
  source.chat.concurrentGroups = source.chat.parallelChatGroups;
  source.chat.concurrentGroups[0].opaqueFuture = { note: 'preserve group data' };
  delete source.chat.parallelChatGroups;
  const { create } = await fixture(t, source);
  const chat = await create().read();
  assert.deepEqual(chat.parallelChatGroups[0].opaqueFuture, { note: 'preserve group data' });
  assert.equal('concurrentGroups' in chat, false);
});

test('manual changes during a committed handoff are preserved, then recover after explicit correction', async t => {
  const { file, create, source } = await fixture(t);
  const seed = create(); await seed.initialize();
  const previous = await readFile(file, 'utf8');
  const external = 'unrecognized external edit';
  const broken = create({ checkpoint: async stage => {
    if (stage === 'database_committed') await writeFile(file, external);
  } });
  await assert.rejects(broken.updateCore(core => ({ ...core,
    ownerProfile: { ...core.ownerProfile, displayName: 'Committed owner' } })), { code: 'handoff_conflict' });
  assert.equal(await readFile(file, 'utf8'), external);
  await writeFile(file, previous);
  const recovered = create();
  assert.equal((await recovered.readCore()).ownerProfile.displayName, 'Committed owner');
  assert.equal((await recovered.read()).channels.length, source.chat.channels.length);
});

test('missing metadata cannot fall back to a stale legacy .bak or reset a valid database', async t => {
  const { file, raw, create } = await fixture(t);
  const store = create(); await store.initialize(); await store.close();
  await unlink(file); await writeFile(`${file}.bak`, raw);
  await assert.rejects(create().read(), { code: 'missing_metadata' });
  const db = reader(file);
  try { assert.equal(db.get('select count(*) as n from channels').n, 2); }
  finally { db.close(); }
});

test('missing or damaged databases are never recreated from stale JSON', async t => {
  const { file, create } = await fixture(t);
  const store = create(); await store.initialize(); await store.close();
  const metadata = await readFile(file);
  await unlink(databasePath(file));
  await assert.rejects(create().read(), { code: 'missing_database' });
  assert.deepEqual(await readFile(file), metadata);
  await assert.rejects(readFile(databasePath(file)), { code: 'ENOENT' });
  const damaged = Buffer.from('damaged database bytes'); await writeFile(databasePath(file), damaged);
  await assert.rejects(create().read());
  assert.deepEqual(await readFile(databasePath(file)), damaged);
});

test('Core reads do not scan transcripts, and malformed row errors do not expose content', async t => {
  const { file, create, source } = await fixture(t);
  const store = create(); await store.initialize();
  const db = openStateDatabase({ file: databasePath(file), mode: 'writer' });
  try { db.run('update messages set json = ?', '{private-content-must-not-be-printed'); }
  finally { db.close(); }
  assert.equal((await store.readCore()).version, 7);
  await assert.rejects(store.readMessagePage(source.chat.channels[0].id), error =>
    error.code === 'invalid_database_record' && !error.message.includes('private-content'));
});

test('classified storage failures retain codes and phase without private diagnostics', async t => {
  for (const fields of [{ code: 'EPERM' }, { code: 'ERR_SQLITE_ERROR', errcode: 10 }]) {
    // Each case uses a separate profile so that the first interrupted migration
    // cannot bypass the publication checkpoint for the second case.
    const { create } = await fixture(t);
    const subject = create({ checkpoint(stage) {
      if (stage === 'database_published') throw Object.assign(new Error('private-source-sql-and-path'), fields,
        { path: 'private-source-sql-and-path' });
    } });
    await assert.rejects(subject.initialize(), error => {
      assert.equal(error.code, 'state_unavailable');
      assert.deepEqual(error.cause, { phase: 'opening', sourceCode: fields.code,
        ...(fields.errcode ? { sqliteResultCode: fields.errcode } : {}) });
      assert.ok(!String(error.stack).includes('private-source'));
      assert.ok(!JSON.stringify(error).includes('private-source'));
      return true;
    });
  }
});

test('mutators and subscriptions retain async-Core/synchronous-Chat contracts across instances', async t => {
  const { create, source } = await fixture(t);
  const a = create(); const b = create(); await a.initialize();
  let notifications = 0;
  a.subscribeCore(() => { notifications++; });
  await a.updateCore(async core => ({ ...core, ownerProfile: { ...core.ownerProfile, displayName: 'Async owner' } }));
  assert.equal(notifications, 1);
  assert.equal((await b.readCore()).ownerProfile.displayName, 'Async owner');
  await assert.rejects(a.updateSnapshot(async value => value), /must be synchronous/);
  const id = source.chat.channels[0].id;
  await a.updateSnapshot(({ chat, core }) => {
    chat.channels.find(channel => channel.id === id).productScope = 'work'; return { chat, core };
  });
  const stale = await b.read(); stale.channels.find(channel => channel.id === id).productScope = 'chat';
  await b.write(stale);
  assert.equal((await a.readChannel(id)).productScope, 'work');
});

test('connection leases protect offline restore and close rejects later operations', async t => {
  const { file, create } = await fixture(t);
  const a = create(); const b = create(); await a.initialize(); await b.initialize();
  await assert.rejects(assertProfileOffline(file), { code: 'profile_busy' });
  await a.close(); await assert.rejects(assertProfileOffline(file), { code: 'profile_busy' });
  await b.close(); await assertProfileOffline(file);
  await assert.rejects(a.readCore(), { code: 'closed' });
});
