import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createChannel } from '../build/server/products/chat/state/model/index.js';
import { FileChatStore } from '../build/server/products/chat/state/store.js';

async function createStoreWithChannel(t) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-cache-'));
  t.after(() => rm(tempDir, { recursive: true, force: true }));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);
  const state = createChannel(await store.read(), {
    originSurface: 'chat',
    title: 'Original title',
    topic: 'Read cache coverage.',
    cats: [{ name: 'Agent-1', provider: 'claude', roles: ['coder'] }],
  }, new Date('2026-11-10T00:00:00.000Z'));
  await store.write(state);
  // A fresh profile's first read repairs setupCompleteAt and writes it back; settle that first.
  await store.read();
  return { store, statePath, channelId: state.selectedChannelId };
}

/** Counts JSON.parse calls on the snapshot file's text while `run` executes. */
async function countSnapshotParses(statePath, run) {
  const snapshotText = await readFile(statePath, 'utf8');
  const originalParse = JSON.parse;
  let parses = 0;
  JSON.parse = function countingParse(text, reviver) {
    if (text === snapshotText) parses += 1;
    return originalParse.call(this, text, reviver);
  };
  try {
    await run();
  } finally {
    JSON.parse = originalParse;
  }
  return parses;
}

test('FileChatStore reuses the normalized snapshot while the file text is unchanged', async (t) => {
  const { store, statePath } = await createStoreWithChannel(t);
  await store.read();

  const parses = await countSnapshotParses(statePath, async () => {
    await store.read();
    await store.readCore();
  });

  assert.equal(parses, 0);
});

test('FileChatStore sees a change another writer made to the file', async (t) => {
  const { store, statePath, channelId } = await createStoreWithChannel(t);
  assert.equal((await store.read()).channels.find((channel) => channel.id === channelId).title, 'Original title');

  const persisted = JSON.parse(await readFile(statePath, 'utf8'));
  persisted.chat.channels.find((channel) => channel.id === channelId).title = 'Edited elsewhere';
  await writeFile(statePath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');

  assert.equal((await store.read()).channels.find((channel) => channel.id === channelId).title, 'Edited elsewhere');
  const fresh = new FileChatStore(statePath);
  assert.deepEqual(
    (await store.readCore()).conversations.map((conversation) => conversation.id),
    (await fresh.readCore()).conversations.map((conversation) => conversation.id),
  );
});

test('FileChatStore never hands out the cached snapshot itself', async (t) => {
  const { store, channelId } = await createStoreWithChannel(t);

  const firstRead = await store.read();
  firstRead.channels.find((channel) => channel.id === channelId).title = 'Mutated by a caller';
  const firstCore = await store.readCore();
  firstCore.conversations.length = 0;
  const unchanged = await store.updateSnapshot((snapshot) => snapshot);
  unchanged.chat.channels.length = 0;

  const later = await store.read();
  assert.equal(later.channels.find((channel) => channel.id === channelId).title, 'Original title');
  assert.ok((await store.readCore()).conversations.length > 0);
});

test('FileChatStore reads its own writes after the cache was filled', async (t) => {
  const { store, channelId } = await createStoreWithChannel(t);
  await store.read();

  const state = await store.read();
  state.channels.find((channel) => channel.id === channelId).title = 'Renamed';
  await store.write(state);

  assert.equal((await store.read()).channels.find((channel) => channel.id === channelId).title, 'Renamed');
});
