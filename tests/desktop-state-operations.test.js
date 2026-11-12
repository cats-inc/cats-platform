import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { createProfileLease, assertProfileOffline } from '../build/server/products/chat/state/database/profileLease.js';
import { withProfileLock } from '../build/server/platform/persistence/state-db/profileLock.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-operation 保留 ')), file = path.join(root, 'profile.json');
  const source = snapshot(), stores = [];
  await writeFile(file, JSON.stringify(source));
  const create = options => { const store = new DatabaseChatStore(file, options); stores.push(store); return store; };
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  const store = create(); await store.initialize();
  return { file, root, source, store, create, id: source.chat.channels[0].id, other: source.chat.channels[1].id };
}

test('catalog and scoped mutation revisions agree; no-op/rejected context changes never publish', async t => {
  const f = await fixture(t), initial = await f.store.readCatalog(), bytes = await readFile(f.file);
  assert.ok(initial.revision);
  await f.store.updateChannels([f.id], (state, context) => {
    assert.equal(context.revision, initial.revision); return state;
  });
  assert.deepEqual(await readFile(f.file), bytes);
  for (const mutate of [
    () => f.store.updateChannel(f.id, (channel, context) => { context.revision = 'forged'; return { channel }; }),
    () => f.store.updateChannels([f.id], (state, context) => { context.revision = 'forged'; return state; }),
  ]) await assert.rejects(mutate(), TypeError);
  await f.store.updateChannel(f.id, channel => ({ channel: { ...channel, title: 'New revision' } }));
  assert.notEqual((await f.store.readCatalog()).revision, initial.revision);
});

test('overlapping operation leases block only their target and preserve the domain revision', async t => {
  const f = await fixture(t), before = await readFile(f.file), release = await f.store.reserveConversationOperation(f.id);
  const second = await f.store.reserveConversationOperation(f.id);
  try {
    assert.deepEqual(await readFile(f.file), before);
    await assert.rejects(f.store.archiveConversation(f.id, 'archive'), { code: 'archive_active' });
    await f.store.archiveConversation(f.other, 'archive');
    await release();
    await assert.rejects(f.store.archiveConversation(f.id, 'archive'), { code: 'archive_active' });
  } finally { await second(); await release(); }
  await f.store.archiveConversation(f.id, 'archive');
});

test('an operation lease survives store.close and prevents offline replacement until exact release', async t => {
  const f = await fixture(t), release = await f.store.reserveConversationOperation(f.id);
  await f.store.close();
  try {
    await assert.rejects(withProfileLock(f.file, () => assertProfileOffline(f.file)), { code: 'profile_busy' });
    const other = f.create(); await other.initialize();
    await assert.rejects(other.archiveConversation(f.id, 'archive'), { code: 'archive_active' });
  } finally { await release(); }
  const other = f.create(); await other.initialize(); await other.archiveConversation(f.id, 'archive');
});

test('release retries profile-lock contention independently of a closed store', async t => {
  const f = await fixture(t), release = await f.store.reserveConversationOperation(f.id);
  await f.store.close();
  let unlock, entered;
  const locked = new Promise(resolve => { entered = resolve; });
  const hold = withProfileLock(f.file, async () => { entered(); await new Promise(resolve => { unlock = resolve; }); });
  await locked;
  let done = false; const pending = release().then(() => { done = true; });
  try { await new Promise(resolve => setTimeout(resolve, 1200)); assert.equal(done, false); }
  finally { unlock(); await hold; await pending; }
  await withProfileLock(f.file, () => assertProfileOffline(f.file));
});

test('post-insert failure retires its independent lease and leaves reclaimable operational state', async t => {
  const f = await fixture(t), failing = f.create({ checkpoint: stage => {
    if (stage === 'conversation_operation_reserved') throw Error('Interrupted reservation publication');
  } });
  await failing.initialize();
  const before = (await readdir(`${f.file}.leases`)).sort();
  await assert.rejects(failing.reserveConversationOperation(f.id), /Interrupted reservation publication/);
  assert.deepEqual((await readdir(`${f.file}.leases`)).sort(), before);
  await f.store.archiveConversation(f.id, 'archive');
});

test('operation admission is header-only and refuses archived, absent and reset-owned targets safely', async t => {
  const f = await fixture(t);
  await f.store.archiveConversation(f.id, 'archive');
  const db = openStateDatabase({ file: databasePath(f.file), mode: 'writer' });
  db.run('update messages set json = ? where channel_id = ?', '{malformed unrelated', f.other); db.close();
  assert.equal(await f.store.reserveConversationOperation('missing'), null);
  await assert.rejects(f.store.reserveConversationOperation(f.id), { code: 'conversation_archived' });
  const release = await f.store.reserveConversationOperation(f.other); await release();
  await assert.rejects(f.store.withDataReset(() => f.store.reserveConversationOperation(f.other)), { code: 'profile_busy' });
});

for (const admission of ['parent', 'native']) test(`archive ${admission} final admission rechecks an operation started after preparation`, async t => {
  const f = await fixture(t); let release;
  const lease = admission === 'native' ? await withProfileLock(f.file, () => createProfileLease(f.file)) : null;
  try {
    await assert.rejects(f.store.archiveConversation(f.id, 'archive', {
      checkpoint: async phase => { if (admission === 'parent' && phase === 'prepared') release = await f.store.reserveConversationOperation(f.id); },
      workerCheckpoint: async phase => {
        if (admission === 'native' && phase === 'archive_before_operation_admission') {
          const db = openStateDatabase({ file: databasePath(f.file), mode: 'writer' });
          try { db.run('insert into conversation_operations values (?, ?, ?)', randomUUID(), f.id, lease.token); }
          finally { db.close(); }
        }
      },
    }), { code: 'archive_active' });
    assert.notEqual((await f.store.readChannelHeader(f.id)).status, 'archived');
    assert.deepEqual((await f.store.readChannel(f.id)).messages, f.source.chat.channels[0].messages);
  } finally { if (release) await release(); if (lease) await withProfileLock(f.file, lease); }
  await f.store.archiveConversation(f.id, 'archive');
});

test('a killed operation owner is reclaimed without preventing later archive', { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/desktop-state-operation-worker.mjs', import.meta.url)), f.file, f.id],
    { windowsHide: true, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close'); let error = '';
  child.stderr.on('data', bytes => { error += bytes.toString(); });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await Promise.race([once(child.stdout, 'data'), closed.then(() => { throw Error(error || 'Operation child stopped before reservation'); })]);
  await assert.rejects(f.store.archiveConversation(f.id, 'archive'), { code: 'archive_active' });
  child.kill('SIGKILL'); await closed;
  await f.store.archiveConversation(f.id, 'archive');
});
