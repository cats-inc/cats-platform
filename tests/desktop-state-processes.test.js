import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { assertProfileOffline } from '../build/server/products/chat/state/database/profileLease.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-db-process '));
  const file = path.join(dir, 'profile.json'); const children = []; const stores = [];
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'close'); }
    }
    for (const store of stores) await store.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 10 });
  });
  const source = snapshot(); source.ownerProfile.displayName = '0';
  await writeFile(file, JSON.stringify(source));
  const create = () => { const store = new DatabaseChatStore(file); stores.push(store); return store; };
  const start = (count, checkpoint = '') => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/desktop-state-store-worker.mjs', import.meta.url)),
      file, String(count), checkpoint], { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let error = '';
    child.stderr.on('data', bytes => { error += bytes; });
    const done = new Promise((resolve, reject) => {
      child.once('error', reject); child.once('close', code => resolve({ code, error }));
    });
    return { child, done };
  };
  return { file, create, start };
}

test('concurrent cold startup and writers preserve coupled SQLite messages and JSON Core', { timeout: 60_000 }, async t => {
  const { create, start } = await fixture(t);
  const workers = [start(8), start(8), start(8)];
  for (const result of await Promise.all(workers.map(worker => worker.done))) assert.equal(result.code, 0, result.error);
  const store = create();
  const state = await store.updateSnapshot(value => value);
  assert.equal(state.ownerProfile.displayName, '24');
  assert.equal(state.chat.channels.reduce((sum, channel) => sum + channel.messages.length, 0), 26);
  const numbers = state.chat.channels.flatMap(channel => channel.messages)
    .filter(message => message.body.startsWith('increment ')).map(message => Number(message.body.slice(10))).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 24 }, (_, index) => index + 1));
});

test('an unsupported runtime gives capability guidance without labelling healthy state corrupt', { timeout: 30_000 }, async t => {
  const { start } = await fixture(t);
  const result = await start(0, 'unsupported_sqlite').done;
  assert.notEqual(result.code, 0);
  assert.match(result.error, /runtime does not support.*SQLite/);
  assert.doesNotMatch(result.error, /state check or restore before retrying/);
});

for (const stage of ['database_committed', 'metadata_published', 'handoff_acknowledged']) {
  test(`killed writer at ${stage} resumes its committed coupled state without duplicates`, { timeout: 30_000 }, async t => {
    const { file, create, start } = await fixture(t);
    const seed = create(); await seed.initialize(); await seed.close();
    const held = start(1, stage);
    await Promise.race([once(held.child.stdout, 'data'), held.done.then(value => { throw new Error(value.error || 'worker exited before checkpoint'); })]);
    held.child.kill(); await held.done;
    const store = create();
    const state = await store.updateSnapshot(value => value);
    assert.equal(state.ownerProfile.displayName, '1');
    assert.equal(state.chat.channels.reduce((sum, channel) => sum + channel.messages.length, 0), 3);
    await store.close();
    await assertProfileOffline(file); // Reclaims the killed process's stale connection lease.
  });
}

test('killed migration after database publication recovers before serving state', { timeout: 30_000 }, async t => {
  const { create, start } = await fixture(t);
  const held = start(0, 'database_published');
  await Promise.race([once(held.child.stdout, 'data'), held.done.then(value => { throw new Error(value.error || 'worker exited before checkpoint'); })]);
  held.child.kill(); await held.done;
  const state = await create().updateSnapshot(value => value);
  assert.equal(state.ownerProfile.displayName, '0');
  assert.equal(state.chat.channels.length, 2);
  assert.equal(state.chat.channels.reduce((sum, channel) => sum + channel.messages.length, 0), 2);
});

test('a killed lease publication is reclaimed on startup and permits offline recovery', { timeout: 30_000 }, async t => {
  const { file, create, start } = await fixture(t);
  const held = start(0, 'lease_prepared');
  await Promise.race([once(held.child.stdout, 'data'), held.done.then(value => { throw new Error(value.error || 'worker exited before checkpoint'); })]);
  assert.ok((await readdir(`${file}.leases`)).some(name => name.endsWith('.unfinished')));
  await assert.rejects(assertProfileOffline(file), { code: 'profile_busy' });
  held.child.kill(); await held.done;
  const store = create(); await store.initialize(); await store.close();
  await assertProfileOffline(file);
  assert.equal((await readdir(`${file}.leases`)).length, 0);
});
