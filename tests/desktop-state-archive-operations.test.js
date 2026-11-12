import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { archiveDirectory } from '../build/server/products/chat/state/database/archiveAssets.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { buildChatConversationId } from '../build/server/shared/chatCoreIds.js';
import { fileDigest } from '../build/server/platform/persistence/state-db/fileDigest.js';
import { archiveJobDirectory, archiveJobLock } from '../build/server/products/chat/state/database/archiveJobs.js';
import { preparePlatformOwnedDataReset, removePlatformOwnedData } from '../build/server/shared/platformDataReset.js';
import { withProfileLock } from '../build/server/platform/persistence/state-db/profileLock.js';
import { assertProfileOffline } from '../build/server/products/chat/state/database/profileLease.js';

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats archive operation 資料 '));
  const file = path.join(root, 'platform/state/profile.json'), source = snapshot(), stores = [], fatal = [], children = [];
  const channel = source.chat.channels[0];
  channel.messages = Array.from({ length: 401 }, (_, i) => ({ ...channel.messages[0], id: `source-${i}`,
    body: `完整冷資料 ${i} distinctarchiveword 🐈\u0000`,
    metadata: JSON.parse('{"opaque":{"__proto__":{"preserved":true},"values":[1,"雪",null]}}') }));
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(source));
  const create = config => { const store = new DatabaseChatStore(file, { onFatal: value => fatal.push(value), ...config }); stores.push(store); return store; };
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const closed = once(child, 'close'); child.kill('SIGKILL'); await closed; }
    for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 });
  });
  const store = create(options); await store.initialize(); await store.prepareTranscriptReads();
  const chat = await store.read(), core = await store.readCore();
  const inspect = work => {
    const db = openStateDatabase({ file: databasePath(file), mode: 'reader' });
    try { return work(db); } finally { db.close(); }
  };
  return { root, file, store, create, chat, core, fatal, children, channelId: chat.channels[0].id, siblingId: chat.channels[1].id, inspect };
}

async function stoppedChild(f, action, phase) {
  const child = fork(fileURLToPath(new URL('./fixtures/desktop-state-archive-parent.mjs', import.meta.url)),
    [f.file, f.channelId, action, phase], { execArgv: ['--import', new URL('../scripts/testing/isolate-cats-home.mjs', import.meta.url).href],
      env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  f.children.push(child);
  let diagnostic = ''; child.stderr.on('data', chunk => { diagnostic = `${diagnostic}${chunk}`.slice(-8000); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Archive child did not reach its checkpoint')), 20_000);
    child.on('message', message => {
      if (message.type === 'ready') child.send({ type: 'start' });
      else if (message.type === 'checkpoint' && message.phase === phase) { clearTimeout(timer); resolve(); }
      else { clearTimeout(timer); reject(Error(`Archive child result: ${message.type}/${message.code ?? ''}`)); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); reject(Error(`Archive child closed before its checkpoint (${code}): ${diagnostic}`)); });
  });
  return child;
}
async function waitGone(pid) {
  for (let i = 0; i < 200; i++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await delay(25);
  }
  assert.fail('The observed native archive worker survived parent death');
}

test('native archive and unarchive preserve complete history/groups/Core while switching hot rows and search', async t => {
  const { file, store, chat, core, fatal, channelId, inspect } = await fixture(t);
  const archived = await store.archiveConversation(channelId, 'archive');
  assert.equal(archived.archived, true); assert.equal(archived.messageCount, 401); assert.equal(archived.unchanged, false);
  assert.equal(inspect(db => db.get('select count(*) as n from messages where channel_id = ?', channelId).n), 0);
  assert.equal((await store.readChannel(channelId)).status, 'archived');
  assert.deepEqual((await store.readChannel(channelId)).messages, chat.channels[0].messages);
  assert.deepEqual((await store.read()).parallelChatGroups, chat.parallelChatGroups);
  assert.deepEqual(await store.searchMessages('distinctarchiveword'), []);
  const archivedCore = await store.readCore();
  for (const [key, value] of Object.entries(core)) if (!['archives', 'conversations'].includes(key)) assert.deepEqual(archivedCore[key], value);
  assert.equal(archivedCore.archives.find(record => record.sourceChannelId === channelId).status, 'archived');
  assert.equal((await store.archiveConversation(channelId, 'archive')).unchanged, true);
  const restored = await store.archiveConversation(channelId, 'restore');
  assert.equal(restored.archived, false); assert.equal(restored.messageCount, 401);
  assert.deepEqual((await store.readChannel(channelId)).messages, chat.channels[0].messages);
  assert.equal((await store.readChannel(channelId)).status, chat.channels[0].status);
  assert.equal((await store.searchMessages('distinctarchiveword')).length, 50);
  assert.deepEqual((await store.read()).parallelChatGroups, chat.parallelChatGroups);
  assert.equal(inspect(db => db.get('select count(*) as n from conversation_archive_jobs').n), 0);
  assert.equal(inspect(db => db.get('select count(*) as n from conversation_archive_stage').n), 0);
  assert.equal(inspect(db => db.get('select count(*) as n from conversation_archives').n), 0);
  assert.deepEqual(await readdir(archiveDirectory(databasePath(file))), []);
  assert.deepEqual(fatal, []);
});

test('an edit to the target after native preparation refuses publication and retains the newest hot data', async t => {
  const { file, store, channelId, chat, fatal, inspect } = await fixture(t);
  await assert.rejects(store.archiveConversation(channelId, 'archive', { checkpoint: async phase => {
    if (phase === 'prepared') await store.updateChannel(channelId, channel => {
      channel.messages.push({ ...channel.messages[0], id: randomUUID(), body: 'Concurrent owner message' }); return { channel };
    });
  } }), error => error.code === 'archive_changed');
  const after = await store.readChannel(channelId);
  assert.equal(after.messages.length, 402); assert.deepEqual(after.messages.slice(0, 401), chat.channels[0].messages);
  assert.equal(after.messages.at(-1).body, 'Concurrent owner message'); assert.notEqual(after.status, 'archived');
  assert.equal(inspect(db => db.get('select count(*) as n from conversation_archives').n), 0);
  assert.equal(inspect(db => db.get('select count(*) as n from conversation_archive_jobs').n), 0);
  assert.deepEqual(await readdir(archiveDirectory(databasePath(file))), []); assert.deepEqual(fatal, []);
});

test('a sibling write after preparation does not invalidate an unchanged target or get overwritten', async t => {
  const { store, channelId, siblingId, chat } = await fixture(t);
  await store.archiveConversation(channelId, 'archive', { checkpoint: async phase => {
    if (phase === 'prepared') await store.updateChannel(siblingId, channel => ({ channel: { ...channel, title: 'Concurrent sibling title' } }));
  } });
  assert.equal((await store.readChannel(siblingId)).title, 'Concurrent sibling title');
  assert.deepEqual((await store.readChannel(channelId)).messages, chat.channels[0].messages);
});

test('unanswered choice facts survive archive/unarchive and a refused cold edit is nonfatal', async t => {
  const { store, channelId, fatal } = await fixture(t);
  await store.updateChannel(channelId, channel => {
    channel.messages.push({ ...channel.messages[0], id: 'pending-choice', senderKind: 'agent', body: 'Which?', metadata: {},
      choices: [{ question: 'Which?', options: [{ id: 'one', label: 'One' }] }] }); return { channel };
  });
  assert.ok((await store.readPresentation(channelId)).awaitingReplyChannelIds.includes(channelId));
  await store.archiveConversation(channelId, 'archive');
  assert.ok(!(await store.readPresentation(channelId)).awaitingReplyChannelIds.includes(channelId));
  await assert.rejects(store.updateChannel(channelId, channel => {
    channel.messages.push({ ...channel.messages[0], id: 'forbidden-cold-message' }); return { channel };
  }), error => error.code === 'conversation_archived');
  assert.deepEqual(fatal, []);
  await store.archiveConversation(channelId, 'restore');
  assert.ok((await store.readPresentation(channelId)).awaitingReplyChannelIds.includes(channelId));
});

test('latest active Core work refuses a prepared archive without discarding that work', async t => {
  const { store, channelId, fatal } = await fixture(t);
  const conversationId = buildChatConversationId(channelId);
  await assert.rejects(store.archiveConversation(channelId, 'archive', { checkpoint: async phase => {
    if (phase === 'prepared') {
      await store.updateCore(core => ({ ...core, runs: [...core.runs, {
      id: 'concurrent-supervised-run', title: 'Concurrent owner work', conversationId, status: 'running', taskId: null,
      parentRunId: null, orchestratorActorId: null, traceId: null, summary: null,
      createdAt: '2026-11-12T00:00:00.000Z', startedAt: '2026-11-12T00:00:00.000Z', completedAt: null,
      updatedAt: '2026-11-12T00:00:00.000Z', metadata: {},
      }] }));
      assert.equal((await store.readCore()).runs.find(run => run.id === 'concurrent-supervised-run')?.status, 'running');
    }
  } }), error => error.code === 'archive_active');
  assert.equal((await store.readCore()).runs.find(run => run.id === 'concurrent-supervised-run').status, 'running');
  assert.equal((await store.readChannel(channelId)).messages.length, 401); assert.deepEqual(fatal, []);
});

test('staged-row edits after verification invalidate unarchive before any hot data appears', async t => {
  const { file, store, channelId, inspect } = await fixture(t);
  await store.archiveConversation(channelId, 'archive');
  await assert.rejects(store.archiveConversation(channelId, 'restore', { checkpoint: phase => {
    if (phase !== 'prepared') return;
    const db = openStateDatabase({ file: databasePath(file), mode: 'writer' });
    try { db.run("update conversation_archive_stage set json = replace(json, 'distinctarchiveword', 'private-modified') where position = 0"); }
    finally { db.close(); }
  } }), error => error.code === 'archive_changed');
  assert.equal(inspect(db => db.get('select count(*) as n from messages where channel_id = ?', channelId).n), 0);
  assert.equal((await store.readChannel(channelId)).messages.length, 401);
  await store.archiveConversation(channelId, 'restore');
  assert.equal((await store.readChannel(channelId)).messages.length, 401);
});

for (const phase of ['archive_before_publish_payload', 'archive_payload_linked']) {
  test(`cold payload mutation at ${phase} cannot discard the hot transcript`, async t => {
    const { file, store, channelId, fatal, inspect } = await fixture(t);
    let reached = false;
    await assert.rejects(store.archiveConversation(channelId, 'archive', { workerCheckpoint: async value => {
      if (value !== phase) return; reached = true;
      const row = inspect(db => db.get('select token, archive_id from conversation_archive_jobs where channel_id = ?', channelId));
      const target = path.join(archiveJobDirectory(databasePath(file), row.token), `${row.archive_id}.jsonl.gz`);
      const bytes = await readFile(target); bytes[0] ^= 0xff; await writeFile(target, bytes);
    } }), error => error.code === 'archive_changed');
    assert.equal(reached, true); assert.equal((await store.readChannel(channelId)).messages.length, 401);
    assert.equal(inspect(db => db.get('select count(*) as n from conversation_archives').n), 0); assert.deepEqual(fatal, []);
  });
}

test('cleanup preserves a replacement published file after hashing an uncommitted archive', async t => {
  const { file, store, channelId, inspect } = await fixture(t); let replaced;
  await assert.rejects(store.archiveConversation(channelId, 'archive', { workerCheckpoint: async phase => {
    if (phase === 'archive_before_publish_manifest') throw Error('private injected stop before hot removal');
    if (phase === 'cleanup_uncommitted_hashed' && !replaced) {
      const root = archiveDirectory(databasePath(file));
      const payload = (await readdir(root)).find(name => name.endsWith('.jsonl.gz'));
      replaced = path.join(root, payload); await rename(replaced, `${replaced}.owner-copy`); await writeFile(replaced, 'external owner replacement');
    }
  } }), error => error.code === 'archive_failed');
  assert.ok(replaced); assert.equal(await readFile(replaced, 'utf8'), 'external owner replacement');
  assert.equal((await store.readChannel(channelId)).messages.length, 401);
  assert.equal(inspect(db => db.get('select count(*) as n from conversation_archives').n), 0);
});

test('cleanup preserves a replacement delete-pending payload after unarchive is already safe', async t => {
  const { file, store, channelId, fatal } = await fixture(t); let replaced;
  const archived = await store.archiveConversation(channelId, 'archive');
  await store.archiveConversation(channelId, 'restore', { workerCheckpoint: async phase => {
    if (phase !== 'cleanup_pending_hashed' || replaced) return;
    replaced = path.join(archiveDirectory(databasePath(file)), `${archived.archiveId}.jsonl.gz`);
    await rename(replaced, `${replaced}.owner-copy`); await writeFile(replaced, 'external owner replacement');
  } });
  assert.ok(replaced); assert.equal(await readFile(replaced, 'utf8'), 'external owner replacement');
  assert.equal((await store.readChannel(channelId)).messages.length, 401); assert.deepEqual(fatal, []);
});

for (const phase of ['reserved', 'prepared']) test(`cancellation at ${phase} leaves hot data and no busy reservation`, async t => {
  const { store, channelId, inspect, fatal } = await fixture(t), abort = new AbortController();
  await assert.rejects(store.archiveConversation(channelId, 'archive', { signal: abort.signal, checkpoint(value) {
    if (value === phase) abort.abort();
  } }), error => error.code === 'archive_cancelled');
  assert.equal((await store.readChannel(channelId)).messages.length, 401);
  assert.equal(inspect(db => db.get('select count(*) as n from conversation_archive_jobs').n), 0); assert.deepEqual(fatal, []);
});

test('a committed archive handoff recovers exactly once after publication was interrupted', async t => {
  const { file, store, create, channelId, chat, inspect } = await fixture(t);
  const before = await readFile(file);
  await assert.rejects(store.archiveConversation(channelId, 'archive', { checkpoint(phase) {
    if (phase === 'database_committed') throw Error('private interrupted owner process');
  } }), error => error.code === 'archive_failed');
  assert.deepEqual(await readFile(file), before);
  assert.ok(inspect(db => db.get('select revision from metadata_handoff where singleton = 1')));
  await store.close(); const recovered = create(); await recovered.initialize();
  assert.deepEqual((await recovered.readChannel(channelId)).messages, chat.channels[0].messages);
  assert.equal((await recovered.readChannel(channelId)).status, 'archived');
  const digest = await recovered.logicalDigest(); await recovered.maintainConversationArchives();
  assert.equal(await recovered.logicalDigest(), digest);
  assert.equal((await recovered.archiveConversation(channelId, 'archive')).unchanged, true);
});

for (const phase of ['prepared', 'database_committed', 'native:archive_payload_linked']) {
  test(`a killed archive owner recovers safely from ${phase}`, { timeout: 30_000 }, async t => {
    const f = await fixture(t); await f.store.close();
    const child = await stoppedChild(f, 'archive', phase);
    let nativePid;
    if (phase.startsWith('native:')) {
      const token = f.inspect(db => db.get('select token from conversation_archive_jobs').token);
      nativePid = JSON.parse(await readFile(`${archiveJobLock(databasePath(f.file), token)}.operation-lock`, 'utf8')).pid;
      process.kill(nativePid, 0);
    }
    const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
    if (nativePid) await waitGone(nativePid);
    const recovered = f.create(); await recovered.initialize();
    assert.deepEqual((await recovered.readChannel(f.channelId)).messages, f.chat.channels[0].messages);
    assert.equal((await recovered.readChannel(f.channelId)).status === 'archived', phase === 'database_committed');
    await recovered.maintainConversationArchives();
    assert.equal(f.inspect(db => db.get('select count(*) as n from conversation_archive_jobs').n), 0);
    assert.equal(f.inspect(db => db.get('select count(*) as n from conversation_archive_stage').n), 0);
    if (phase === 'database_committed') await recovered.archiveConversation(f.channelId, 'restore');
    assert.equal((await recovered.readChannel(f.channelId)).messages.length, 401);
  });
}

test('killing an unarchive owner reaps the native worker and discards only operational staged rows', { timeout: 30_000 }, async t => {
  const f = await fixture(t); await f.store.archiveConversation(f.channelId, 'archive'); await f.store.close();
  const child = await stoppedChild(f, 'restore', 'native:restore_staged_batch');
  const token = f.inspect(db => db.get('select token from conversation_archive_jobs').token);
  const nativePid = JSON.parse(await readFile(`${archiveJobLock(databasePath(f.file), token)}.operation-lock`, 'utf8')).pid;
  assert.ok(f.inspect(db => db.get('select count(*) as n from conversation_archive_stage').n) > 0);
  const closed = once(child, 'close'); child.kill('SIGKILL'); await closed; await waitGone(nativePid);
  const recovered = f.create(); await recovered.initialize(); await recovered.maintainConversationArchives();
  assert.equal(f.inspect(db => db.get('select count(*) as n from conversation_archive_stage').n), 0);
  assert.equal((await recovered.readChannel(f.channelId)).status, 'archived');
  assert.deepEqual((await recovered.readChannel(f.channelId)).messages, f.chat.channels[0].messages);
  await recovered.archiveConversation(f.channelId, 'restore'); assert.equal((await recovered.readChannel(f.channelId)).messages.length, 401);
});

test('close cancels native staging, reaps it and permits recovery with no connection leak', { timeout: 30_000 }, async t => {
  const f = await fixture(t); await f.store.archiveConversation(f.channelId, 'archive');
  let reached; const ready = new Promise(resolve => { reached = resolve; });
  const operation = f.store.archiveConversation(f.channelId, 'restore', { workerCheckpoint: phase => {
    if (phase === 'restore_staged_batch') { reached(); return new Promise(() => {}); }
  } });
  const rejected = assert.rejects(operation, error => error.code === 'archive_cancelled');
  await ready;
  const token = f.inspect(db => db.get('select token from conversation_archive_jobs').token);
  const nativePid = JSON.parse(await readFile(`${archiveJobLock(databasePath(f.file), token)}.operation-lock`, 'utf8')).pid;
  const leases = await Promise.all((await readdir(`${f.file}.leases`)).filter(name => name.endsWith('.json'))
    .map(async name => JSON.parse(await readFile(path.join(`${f.file}.leases`, name), 'utf8'))));
  const nativeLease = leases.find(lease => lease.pid === nativePid);
  assert.equal(nativeLease.purpose, 'archive-worker'); assert.equal(nativeLease.parentToken, f.inspect(db => db.get('select lease_token from conversation_archive_jobs').lease_token));
  await f.store.close(); await rejected; await waitGone(nativePid);
  await withProfileLock(f.file, () => assertProfileOffline(f.file));
  const recovered = f.create(); await recovered.initialize(); await recovered.maintainConversationArchives();
  assert.equal((await recovered.readChannel(f.channelId)).status, 'archived');
  assert.equal(f.inspect(db => db.get('select count(*) as n from conversation_archive_stage').n), 0);
});

test('authorized reset cancels native staging before removing the database and cold root', { timeout: 30_000 }, async t => {
  const f = await fixture(t); await f.store.archiveConversation(f.channelId, 'archive');
  let reached; const ready = new Promise(resolve => { reached = resolve; });
  const operation = f.store.archiveConversation(f.channelId, 'restore', { workerCheckpoint: phase => {
    if (phase === 'restore_staged_batch') { reached(); return new Promise(() => {}); }
  } });
  const rejected = assert.rejects(operation, error => error.code === 'archive_cancelled');
  await ready;
  await f.store.withDataReset(async () => {
    await preparePlatformOwnedDataReset(f.file, {});
    await f.store.removeOwnedState(() => removePlatformOwnedData(f.file, { report() {} }));
  });
  await rejected;
  await assert.rejects(readFile(databasePath(f.file)), { code: 'ENOENT' });
  await assert.rejects(readdir(archiveDirectory(databasePath(f.file))), { code: 'ENOENT' });
  assert.equal((await f.store.read()).channels.length, 0); assert.deepEqual(f.fatal, []);
});

test('actual archive CLI cooperates with a live store while existing offline commands still refuse its lease', { timeout: 40_000 }, async t => {
  const f = await fixture(t);
  const run = async args => {
    try { return { code: 0, ...await promisify(execFile)(process.execPath,
      [fileURLToPath(new URL('../build/server/index.js', import.meta.url)), 'state', ...args, '--profile', f.file],
      { cwd: f.root, env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
        windowsHide: true, timeout: 20_000 }) }; }
    catch (error) { if (typeof error.code !== 'number') throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  };
  const offline = await run(['check']); assert.equal(offline.code, 1); assert.equal(JSON.parse(offline.stderr).code, 'profile_busy');
  const archived = await run(['archive', '--channel', f.channelId]); assert.equal(archived.code, 0, archived.stderr);
  assert.equal(JSON.parse(archived.stdout).result.archived, true);
  assert.deepEqual((await f.store.readChannel(f.channelId)).messages, f.chat.channels[0].messages);
  const restored = await run(['unarchive', '--channel', f.channelId]); assert.equal(restored.code, 0, restored.stderr);
  assert.equal(JSON.parse(restored.stdout).result.archived, false);
  assert.equal((await f.store.readChannel(f.channelId)).messages.length, 401);
  assert.deepEqual(f.fatal, []);
});

test('a zero-deadline cancellation retries an abandoned live-lease reservation after contention clears', async t => {
  const f = await fixture(t, { lockTimeoutMs: 0 }), abort = new AbortController();
  let release; const gate = new Promise(resolve => { release = resolve; }); let holding;
  try {
    await assert.rejects(f.store.archiveConversation(f.channelId, 'archive', { signal: abort.signal, checkpoint: async phase => {
      if (phase !== 'prepared') return;
      let entered; const ready = new Promise(resolve => { entered = resolve; });
      holding = withProfileLock(f.file, async () => { entered(); await gate; }); await ready; abort.abort();
    } }), error => error.code === 'archive_cancelled');
    assert.equal(f.inspect(db => db.get('select count(*) as n from conversation_archive_jobs').n), 1);
  } finally { release(); await holding; }
  const retried = await f.store.archiveConversation(f.channelId, 'archive');
  assert.equal(retried.archived, true); assert.equal(f.inspect(db => db.get('select count(*) as n from conversation_archive_jobs').n), 0);
  assert.deepEqual((await f.store.readChannel(f.channelId)).messages, f.chat.channels[0].messages); assert.deepEqual(f.fatal, []);
});

test('authorized owner deletion queues bounded background cleanup of its cold assets', { timeout: 20_000 }, async t => {
  const f = await fixture(t, { archiveMaintenance: { retryDelayMs: 10 }, snapshotMaintenance: { initialDelayMs: 60_000 } });
  await f.store.archiveConversation(f.channelId, 'archive');
  f.store.startMaintenance(); await f.store.maintainConversationArchives();
  const state = await f.store.read(); state.channels = state.channels.filter(channel => channel.id !== f.channelId);
  await f.store.write(state);
  let cleaned = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (f.inspect(db => db.get('select count(*) as n from conversation_archives').n) === 0) { cleaned = true; break; }
    await delay(25);
  }
  assert.equal(cleaned, true);
  assert.deepEqual(await readdir(archiveDirectory(databasePath(f.file))), []);
  assert.ok(await f.store.readChannel(f.siblingId)); assert.deepEqual(f.fatal, []);
});

test('automatic cold deletion retries a transient lock failure without another write or restart', { timeout: 20_000 }, async t => {
  const f = await fixture(t, { lockTimeoutMs: 0, archiveMaintenance: { retryDelayMs: 20 }, snapshotMaintenance: { initialDelayMs: 60_000 } });
  await f.store.archiveConversation(f.channelId, 'archive');
  f.store.startMaintenance(); await f.store.maintainConversationArchives();
  const original = f.store.maintainConversationArchives.bind(f.store);
  let failed, failures = 0; const firstFailure = new Promise(resolve => { failed = resolve; });
  f.store.maintainConversationArchives = async options => {
    try { return await original(options); } catch (error) { failures++; failed(); throw error; }
  };
  const state = await f.store.read(); state.channels = state.channels.filter(channel => channel.id !== f.channelId);
  await f.store.write(state);
  let release, entered; const gate = new Promise(resolve => { release = resolve; }); const ready = new Promise(resolve => { entered = resolve; });
  const holding = withProfileLock(f.file, async () => { entered(); await gate; }); await ready;
  try { await firstFailure; } finally { release(); await holding; }
  let cleaned = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (f.inspect(db => db.get('select count(*) as n from conversation_archives').n) === 0) { cleaned = true; break; }
    await delay(25);
  }
  assert.ok(failures >= 1); assert.equal(cleaned, true); assert.deepEqual(f.fatal, []);
});
