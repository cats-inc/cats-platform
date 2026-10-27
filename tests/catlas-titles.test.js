import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { catlasFixture, message, catlas } from './fixtures/catlasAssist.js';
import { titleCatlasConversation } from '../build/server/products/chat/api/catlasTitles.js';
import { renameChannel, createChannel } from '../build/server/products/chat/state/model/index.js';
import { updateChatState } from '../build/server/products/chat/state/store.js';
import { catlasStatePath } from '../build/server/shared/guideCatCurationStore.js';
import { inferCatlasData } from '../build/server/platform/catlas/inference.js';

function defer() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('first completed reply produces a bounded title in a fresh read-only session exactly once', async t => {
  const f = await catlasFixture(t, () => ({ title: '  Roadmap\n  next\u0000 release  ' }));
  await titleCatlasConversation(f.title, f.channelId);
  const channel = (await f.store.read()).channels.find(item => item.id === f.channelId);
  assert.equal(channel.title, 'Roadmap next release'); assert.equal(channel.titleSource, 'catlas');
  assert.equal(channel.catlasTitleAttempts.count, 1);
  assert.deepEqual(f.calls.send[0].payload, { locale: 'en', ownerMessage: 'Help plan the roadmap', assistantReply: 'Start with the next release' });
  await titleCatlasConversation(f.title, f.channelId);
  assert.equal(f.calls.create.length, 1);
  const receipts = JSON.parse(await readFile(catlasStatePath(f.chatStatePath, 'receipts'), 'utf8')).receipts;
  assert.equal(receipts[0].kind, 'title'); assert.equal(receipts[0].units[0].outcome, 'applied');
});

test('manual rename wins while the title model is in flight and receipt records rejection', async t => {
  const started = defer(), release = defer();
  const f = await catlasFixture(t, async () => { started.resolve(); await release.promise; return { title: 'Generated' }; });
  const pending = titleCatlasConversation(f.title, f.channelId);
  await started.promise;
  await updateChatState(f.store, state => renameChannel(state, f.channelId, 'Owner rename'));
  release.resolve(); await pending;
  const channel = (await f.store.read()).channels.find(item => item.id === f.channelId);
  assert.equal(channel.title, 'Owner rename'); assert.equal(channel.titleSource, 'manual');
  const receipts = JSON.parse(await readFile(catlasStatePath(f.chatStatePath, 'receipts'), 'utf8')).receipts;
  assert.deepEqual(receipts[0].units[0].reasons, ['title_changed']);
});

test('invalid output retries only after a different completed reply, with two attempts maximum across restarts', async t => {
  const f = await catlasFixture(t, () => ({ title: '', unexpected: true }));
  await titleCatlasConversation(f.title, f.channelId);
  await titleCatlasConversation(f.title, f.channelId);
  assert.equal(f.calls.create.length, 1);
  await updateChatState(f.store, state => { state.channels.find(item => item.id === f.channelId).messages.push(message('reply-2', 'agent', 'Next reply')); return state; });
  await titleCatlasConversation(f.title, f.channelId);
  await updateChatState(f.store, state => { state.channels.find(item => item.id === f.channelId).messages.push(message('reply-3', 'agent', 'Another reply')); return state; });
  await titleCatlasConversation(f.title, f.channelId);
  assert.equal(f.calls.create.length, 2);
  const channel = (await f.store.read()).channels.find(item => item.id === f.channelId);
  assert.equal(channel.catlasTitleAttempts.count, 2); assert.equal(channel.titleSource, 'draft');
});

test('old, manually created, DM, parallel, disabled and dismissed conversations never invoke a title model', async t => {
  for (const kind of ['old', 'manual', 'dm', 'parallel', 'dismissed', 'streaming']) {
    const f = await catlasFixture(t, () => ({ title: 'Generated' }));
    await updateChatState(f.store, state => {
      const channel = state.channels.find(item => item.id === f.channelId);
      if (kind === 'old') delete channel.titleSource;
      if (kind === 'manual') channel.titleSource = 'manual';
      if (kind === 'dm') channel.channelKind = 'direct_message';
      if (kind === 'parallel') state.parallelChatGroups.push({ id: 'group', memberChannelIds: [f.channelId] });
      if (kind === 'streaming') { channel.messages[1].metadata = { assistantTurnId: 'incomplete', terminal: false }; }
      return state;
    });
    if (kind === 'dismissed') await f.store.updateCore(core => ({ ...core, guideCat: { ...catlas, status: 'dismissed' } }));
    await titleCatlasConversation(f.title, f.channelId);
    assert.equal(f.calls.create.length, 0, kind);
  }
});

test('input truncation limits the first exchange and preserves first-turn text segments', async t => {
  const f = await catlasFixture(t, () => ({ title: 'x'.repeat(70) }));
  await updateChatState(f.store, state => {
    const channel = state.channels.find(item => item.id === f.channelId);
    channel.messages[0].body = 'u'.repeat(3000);
    channel.messages[1].metadata = { assistantTurnId: 'first', terminal: false };
    channel.messages[1].body = 'a'.repeat(1500);
    channel.messages.push(message('segment-2', 'agent', 'b'.repeat(1500), { metadata: { assistantTurnId: 'first', terminal: true } }));
    return state;
  });
  await titleCatlasConversation(f.title, f.channelId);
  assert.equal(f.calls.send[0].payload.ownerMessage.length, 2000);
  assert.equal(f.calls.send[0].payload.assistantReply.length, 2000);
  assert.equal((await f.store.read()).channels.find(item => item.id === f.channelId).title.length, 48);
});

test('unexpected runtime tool segments reject the data call and close the session', async t => {
  const f = await catlasFixture(t);
  f.runtimeClient.sendMessage = async () => ({ segments: [{ kind: 'tool_call', name: 'shell' }] });
  await assert.rejects(inferCatlasData({ runtimeClient: f.runtimeClient, guideCat: catlas, kind: 'title',
    payload: {}, format: 'Return a title', requestId: 'test', signal: new AbortController().signal }));
  assert.equal(f.calls.close.length, 1);
});
