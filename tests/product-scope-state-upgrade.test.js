import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { CATS_CORE_STATE_VERSION } from '../build/server/core/types.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel, raiseChannelProductScope } from '../build/server/products/chat/state/model/index.js';
import { FileChatStore } from '../build/server/products/chat/state/store.js';
import { normalizePersistedChatSnapshot } from '../build/server/products/chat/state/chat-snapshot/index.js';

// SPEC-141 D9 (PLAN-134 Phase 5): the state version rises to 7 with the raise. Version 6 files
// upgrade once, keeping their original bytes under a name of their own.

const NOW = new Date('2026-11-12T00:00:00.000Z');

function snapshot(version) {
  let chat = createDefaultChatState();
  chat = createChannel(chat, { title: 'On Chat', topic: '', originSurface: 'chat',
    cats: [{ name: 'Fixture', provider: 'codex', roles: ['coder'] }] }, NOW);
  chat = createChannel(chat, { title: 'On Code', topic: '', originSurface: 'code',
    cats: [{ name: 'Second', provider: 'claude' }] }, NOW);
  // A first read marks setup complete and writes that back; start from a profile that already
  // has it, so the tests see the upgrade's write alone.
  return { ...createDefaultCoreState(), chat, version, setupCompleteAt: NOW.toISOString() };
}

async function isolated(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-scope-upgrade-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, 'state.json');
}

function withoutVersionAndWriteTime(file) {
  const { version: _version, updatedAt: _updatedAt, ...rest } = file;
  return rest;
}

test('a version 6 profile upgrades to 7, keeping its exact bytes, and only the version changes', async (t) => {
  const file = await isolated(t);
  // Write through this build first, so the version 6 bytes are what a version 6 build writes,
  // then stamp version 6 on them.
  const store = new FileChatStore(file);
  await store.writeSnapshot(snapshot(CATS_CORE_STATE_VERSION).chat, snapshot(CATS_CORE_STATE_VERSION));
  const written = JSON.parse(await readFile(file, 'utf8'));
  const raw = `${JSON.stringify({ ...written, version: 6, setupCompleteAt: NOW.toISOString() }, null, 2)}\n`;
  await writeFile(file, raw);

  const state = await new FileChatStore(file).read();
  assert.equal(await readFile(`${file}.pre-product-scope.bak`, 'utf8'), raw, 'the original bytes are kept');
  const upgraded = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(upgraded.version, 7);
  assert.equal(CATS_CORE_STATE_VERSION, 7);
  // The upgrade writes what any load of the same content gives, at version 7: it adds nothing
  // of its own.
  const asLoaded = JSON.parse(JSON.stringify(normalizePersistedChatSnapshot({ ...JSON.parse(raw), version: 7 })));
  assert.deepEqual(withoutVersionAndWriteTime(upgraded), withoutVersionAndWriteTime(asLoaded),
    'nothing but the version and the ordinary load changes');
  assert.equal(state.channels.length, 2);

  // A second start reads the upgraded file as it is and leaves the backup alone.
  await new FileChatStore(file).read();
  assert.equal(await readFile(`${file}.pre-product-scope.bak`, 'utf8'), raw);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 7);
});

test('a profile that went through the version 6 upgrade can go to 7', async (t) => {
  // Its `.pre-provider-policy.bak` holds older bytes, which a reused backup name would refuse.
  const file = await isolated(t);
  const older = `${JSON.stringify(snapshot(5))}\n`;
  await writeFile(`${file}.pre-provider-policy.bak`, older);
  const raw = `${JSON.stringify(snapshot(6))}\n`;
  await writeFile(file, raw);
  await new FileChatStore(file).read();
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 7);
  assert.equal(await readFile(`${file}.pre-provider-policy.bak`, 'utf8'), older, 'the earlier backup is untouched');
  assert.equal(await readFile(`${file}.pre-product-scope.bak`, 'utf8'), raw);
});

test('a version 5 profile goes straight to 7 under the version 6 backup name', async (t) => {
  const file = await isolated(t);
  const raw = `${JSON.stringify(snapshot(5))}\n`;
  await writeFile(file, raw);
  await new FileChatStore(file).read();
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 7);
  assert.equal(await readFile(`${file}.pre-provider-policy.bak`, 'utf8'), raw);
  await assert.rejects(readFile(`${file}.pre-product-scope.bak`, 'utf8'), { code: 'ENOENT' });
});

test('a failed upgrade leaves the original in place, and a retry finishes', async (t) => {
  const file = await isolated(t);
  const raw = `${JSON.stringify(snapshot(6))}\n`;
  await writeFile(file, raw);
  // Something that is not a file holds the backup's name, so the backup cannot be kept.
  await mkdir(`${file}.pre-product-scope.bak`);
  await assert.rejects(new FileChatStore(file).read(), /Product scope profile upgrade failed/u);
  assert.equal(await readFile(file, 'utf8'), raw, 'the original is untouched');
  await rm(`${file}.pre-product-scope.bak`, { recursive: true });
  await new FileChatStore(file).read();
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 7);
  assert.equal(await readFile(`${file}.pre-product-scope.bak`, 'utf8'), raw);
});

test('recovery from a version 6 `.bak` after the upgrade does not need the upgrade backup', async (t) => {
  // After the upgrade the rotating `.bak` holds version 6 bytes that differ from the upgrade's
  // own backup. Recovery reads `.bak` and writes no upgrade backup, so they cannot conflict.
  const file = await isolated(t);
  await writeFile(file, `${JSON.stringify(snapshot(6))}\n`);
  const store = new FileChatStore(file);
  const state = await store.read();
  const onChat = state.channels.find((channel) => channel.title === 'On Chat');
  await store.write(raiseChannelProductScope(state, onChat.id, 'code', NOW));
  const backup = `${JSON.stringify({ ...snapshot(6), chat: { ...snapshot(6).chat, title: 'different bytes' } })}\n`;
  await writeFile(`${file}.bak`, backup);
  await writeFile(file, '{ damaged');
  const recovered = await new FileChatStore(file).read();
  assert.equal(recovered.channels.length, 2);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 7, 'the recovered primary is written at 7');
  assert.equal(await readFile(`${file}.bak`, 'utf8'), backup, 'the backup it recovered from is kept');
});

test('a file newer than this build is refused, primary or backup, and left as it is', async (t) => {
  for (const which of ['primary', 'backup']) {
    const file = await isolated(t);
    const primary = snapshot(7), backup = snapshot(7);
    (which === 'primary' ? primary : backup).version = 8;
    const raw = JSON.stringify(primary), savedBackup = JSON.stringify(backup);
    await writeFile(file, raw);
    await writeFile(`${file}.bak`, savedBackup);
    await assert.rejects(async () => { const store = new FileChatStore(file); await store.write(await store.read()); });
    assert.equal(await readFile(file, 'utf8'), raw, which);
    assert.equal(await readFile(`${file}.bak`, 'utf8'), savedBackup, which);
  }
});
