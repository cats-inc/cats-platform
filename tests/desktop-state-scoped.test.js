import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { normalizeImportedChatSnapshot } from '../build/server/products/chat/state/store.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { createLockedDispatchChatStore } from '../build/server/products/chat/state/runtime-dispatch/merge.js';
import { buildChatConversationId, CHAT_ROOT_CONTAINER_ID } from '../build/server/shared/chatCoreIds.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

const TIME = '2026-01-01T00:00:00.000Z';
function richSource() {
  const source = snapshot();
  for (const channel of source.chat.channels) {
    const assignment = channel.catAssignments[0];
    const participant = { participantKind: 'cat', participantId: assignment.catId, participantName: 'Fixture' };
    const turn = { id: `active-${channel.id}`, status: 'pending', sourceMessageId: channel.messages[0].id,
      sourceSenderKind: 'user', sourceSenderName: 'Owner', guard: null, stageId: 'dispatch', workflowShape: 'linear',
      reviewRequired: false, lastCheckpointId: null, convergeTargetId: null, continuationCount: 0, dispatchCount: 1,
      targetStatuses: [{ id: `target-${channel.id}`, dispatchId: 'dispatch', participant,
        laneId: `lane-${channel.id}`, sessionId: `runtime-${channel.id}`, source: participant,
        sourceMessageId: channel.messages[0].id, trigger: 'explicit_mention', mentionNames: [], depth: 0,
        parentCheckpointId: null, branchStrategy: 'transplant_context', handoffReason: null,
        wakeRequestId: null, status: 'running', queuedAt: TIME, startedAt: TIME, completedAt: null,
        response: null, error: null }], events: [], startedAt: TIME, updatedAt: TIME, completedAt: null };
    channel.roomRouting.workflow.activeTurn = turn;
    channel.messages.push({ ...structuredClone(channel.messages[0]), id: `segment-${channel.id}`,
      senderKind: 'agent', senderName: 'Fixture', body: 'Existing response', metadata: {
        event: 'assistant_turn_segment', turnId: turn.id, targetStateId: turn.targetStatuses[0].id,
        assistantTurnId: `assistant-${channel.id}`, segmentIndex: 0, terminal: true,
      } });
  }
  return normalizeImportedChatSnapshot(source);
}

async function fixture(t, source = richSource()) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-db-scoped '));
  const file = path.join(root, 'profile.json'); const stores = [];
  await writeFile(file, JSON.stringify(source));
  const create = options => { const store = new DatabaseChatStore(file, options); stores.push(store); return store; };
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true }); });
  const store = create(); await store.initialize();
  return { file, source, create, store, id: source.chat.channels[0].id, other: source.chat.channels[1].id };
}

function append(channel, body = 'Scoped searchable 新訊息') {
  channel.messages.push({ ...structuredClone(channel.messages[0]), id: `added-${channel.messages.length}`,
    body, createdAt: new Date().toISOString(), metadata: {} });
  channel.updatedAt = channel.messages.at(-1).createdAt;
  return channel;
}

function otherRecords(core, channelId) {
  const conversationId = buildChatConversationId(channelId);
  return Object.fromEntries(Object.entries(core).filter(([, value]) => Array.isArray(value)).map(([key, value]) =>
    [key, value.filter(record => record.conversationId === conversationId || record.id === conversationId
      || record.metadata?.channelId === channelId)]));
}

test('scoped updates preserve unrelated active interaction records, rich fields and row identities', async t => {
  const { file, store, id, other } = await fixture(t);
  const before = await store.readCore();
  assert.ok(otherRecords(before, other).turns.length);
  assert.ok(otherRecords(before, other).lanes.length);
  assert.ok(otherRecords(before, other).sessions.length);
  const db = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  const rows = db.all('select id, json from messages where channel_id = ?', other);
  let notices = 0; store.subscribeCore(() => { notices++; });
  try {
    await store.updateChannel(id, channel => ({ channel: append(channel) }));
    const after = await store.readCore();
    assert.deepEqual(otherRecords(after, other), otherRecords(before, other));
    assert.deepEqual(db.all('select id, json from messages where channel_id = ?', other), rows);
    assert.equal(after.workItems.find(item => item.id === `work-item-chat-channel-${id}`).metadata.messageCount, 3);
    assert.deepEqual(after.containers.find(container => container.id === CHAT_ROOT_CONTAINER_ID).metadata.channelIds,
      before.containers.find(container => container.id === CHAT_ROOT_CONTAINER_ID).metadata.channelIds);
    assert.equal(notices, 1);
    assert.equal((await store.searchMessages('新訊息', { channelId: id })).length, 1);
  } finally { db.close(); }
});

test('a scoped mutation does not read or normalize another channel transcript', async t => {
  const { file, store, id, other } = await fixture(t);
  const db = openStateDatabase({ file: databasePath(file), mode: 'writer' });
  db.run('update messages set json = ? where channel_id = ?', '{not valid JSON', other);
  // The independent catalog must not parse the unrelated workflow JSON either.
  db.run('update channels set json = ? where id = ?', '{not valid workflow JSON', other); db.close();
  const result = await store.updateChannel(id, channel => ({ channel: append(channel) }));
  assert.equal(result.messages.length, 3);
  assert.equal((await store.readChannelState(id)).channels.length, 1);
  await assert.rejects(store.readChannel(other), { code: 'invalid_database_record' });
});

test('changed target and root Core records retain passive top-level and nested metadata', async t => {
  const source = richSource();
  const id = source.chat.channels[0].id;
  const conversation = source.conversations.find(value => value.id === buildChatConversationId(id));
  conversation.futurePassive = { keep: ['target', { rich: true }] };
  const item = source.workItems.find(value => value.id === `work-item-chat-channel-${id}`);
  item.metadata.futurePassive = { keep: 'target metadata' };
  const root = source.containers.find(value => value.id === CHAT_ROOT_CONTAINER_ID);
  root.metadata.futurePassive = { keep: ['root', 123] };
  const { store } = await fixture(t, source);
  const before = await store.readCore();
  await store.updateChannel(id, channel => ({ channel: append(channel) }));
  const after = await store.readCore();
  const target = after.conversations.find(value => value.id === conversation.id);
  assert.deepEqual(target.futurePassive, conversation.futurePassive);
  assert.deepEqual(after.workItems.find(value => value.id === item.id).metadata.futurePassive, item.metadata.futurePassive);
  assert.deepEqual(after.containers.find(value => value.id === root.id).metadata.futurePassive, root.metadata.futurePassive);
  assert.notEqual(target.updatedAt, before.conversations.find(value => value.id === conversation.id).updatedAt);
});

test('unchanged scoped mutations keep the revision and missing channels never invoke the callback', async t => {
  const { file, store, id } = await fixture(t);
  const before = await readFile(file, 'utf8');
  await store.updateChannel(id, channel => ({ channel }));
  assert.equal(await readFile(file, 'utf8'), before);
  let called = false;
  assert.equal(await store.updateChannel('absent', () => { called = true; }), null);
  assert.equal(called, false);
});

test('scoped projection updates a target segment while sibling Core timestamps remain exact', async t => {
  const { store, id, other } = await fixture(t);
  const before = await store.readCore();
  await store.updateChannel(id, channel => {
    channel.messages.find(message => message.senderKind === 'agent').body = 'Corrected response';
    return { channel };
  });
  const after = await store.readCore();
  assert.equal(after.segments.find(segment => segment.conversationId === buildChatConversationId(id)).content, 'Corrected response');
  assert.deepEqual(otherRecords(after, other), otherRecords(before, other));
});

test('projection deltas retain own __proto__ JSON keys without changing object prototypes', async t => {
  const source = richSource();
  source.chat.channels[0].messages.find(message => message.senderKind === 'agent').metadata.workflowRecommendation = {};
  const { store, id } = await fixture(t, normalizeImportedChatSnapshot(source));
  assert.deepEqual((await store.readCore()).segments.find(segment =>
    segment.conversationId === buildChatConversationId(id)).metadata.workflowRecommendation, {});
  const value = JSON.parse('{"__proto__":{"keep":true},"constructor":{"also":"kept"}}');
  await store.updateChannel(id, channel => {
    channel.messages.find(message => message.senderKind === 'agent').metadata.workflowRecommendation = value;
    return { channel };
  });
  const core = await store.readCore();
  const segment = core.segments.find(segment => segment.conversationId === buildChatConversationId(id));
  assert.deepEqual(segment.metadata.workflowRecommendation, value);
  assert.equal(Object.hasOwn(segment.metadata.workflowRecommendation, '__proto__'), true);
  assert.equal(Object.getPrototypeOf(segment.metadata.workflowRecommendation), Object.prototype);
});

test('async, global, Core, identity and cross-channel message mutations fail without a commit', async t => {
  const { file, store, id, other } = await fixture(t);
  const before = await readFile(file, 'utf8');
  const attempts = [
    async channel => ({ channel }),
    (channel, context) => { context.core.ownerProfile.displayName = 'not allowed'; return { channel }; },
    (channel, context) => { context.chat.selectedChannelId = other; return { channel }; },
    channel => ({ channel: { ...channel, id: other } }),
    channel => { channel.messages[0].channelId = other; return { channel }; },
    (channel, context) => ({ channel, metadata: { ...context.chat, selectedChannelId: other } }),
  ];
  for (const mutation of attempts) {
    await assert.rejects(store.updateChannel(id, mutation), TypeError);
    assert.equal(await readFile(file, 'utf8'), before);
  }
});

test('caller exceptions inside scoped writes do not signal fatal storage', async t => {
  const { create, id } = await fixture(t); const failures = [];
  const store = create({ onFatal: error => failures.push(error) });
  await assert.rejects(store.updateChannel(id, () => { throw new SyntaxError('caller failed'); }), SyntaxError);
  assert.deepEqual(failures, []);
});

for (const checkpoint of ['database_committed', 'metadata_published']) {
  test(`scoped row and Core changes recover once after ${checkpoint}`, async t => {
    const { create, id, other } = await fixture(t);
    let armed = true;
    const writer = create({ checkpoint: stage => { if (stage === checkpoint && armed) { armed = false; throw Error('interrupted scoped commit'); } } });
    const before = await writer.readCore();
    await assert.rejects(writer.updateChannel(id, channel => ({ channel: append(channel) })), /interrupted scoped commit/);
    const recovered = create(); const channel = await recovered.readChannel(id);
    assert.equal(channel.messages.length, 3);
    assert.equal((await recovered.readCore()).workItems.find(item => item.id === `work-item-chat-channel-${id}`).metadata.messageCount, 3);
    assert.deepEqual(otherRecords(await recovered.readCore(), other), otherRecords(before, other));
  });
}

test('dispatch uses scoped reads/writes, retains sibling memory context and preserves concurrent owner edits', async t => {
  const source = snapshot();
  source.chat.channels[1].catAssignments = structuredClone(source.chat.channels[0].catAssignments);
  source.chat.channels[1].participantAssignments = structuredClone(source.chat.channels[0].participantAssignments);
  const { store, id, other } = await fixture(t, normalizeImportedChatSnapshot(source));
  const baseline = await store.read();
  const writer = createLockedDispatchChatStore(store, id, baseline, () => new Date());
  const proposed = structuredClone(baseline);
  proposed.channels.find(channel => channel.id === id).messages[0].metadata.intakeMarker = 'admitted';
  await store.updateChannel(other, channel => ({ channel: { ...channel, title: 'Concurrent sibling' } }));
  store.read = () => { throw Error('Global read is forbidden in this scoped dispatch'); };
  store.updateSnapshot = () => { throw Error('Global projection is forbidden in this scoped dispatch'); };
  assert.equal((await writer.read()).channels.length, 1);
  const committed = await writer.write(proposed);
  assert.equal(committed.channels.length, 1);
  assert.equal(committed.channels[0].messages[0].metadata.intakeMarker, 'admitted');
  assert.ok(committed.cats.some(cat => cat.memory.facts.some(fact => fact.includes('Concurrent sibling'))));
  await store.updateChannel(id, channel => {
    channel.messages[0].body = 'Owner correction'; return { channel };
  });
  proposed.channels.find(channel => channel.id === id).messages[0].body = 'Late overwrite';
  await writer.write(proposed);
  assert.equal((await store.readChannel(id)).messages[0].body, 'Owner correction');
  assert.equal((await store.readChannel(other)).title, 'Concurrent sibling');
});

test('separate scoped writers preserve coupled Core counts across the same and sibling channels', { timeout: 60_000 }, async t => {
  const { file, store, id, other } = await fixture(t);
  const children = [];
  t.after(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const start = channelId => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/desktop-state-scoped-worker.mjs', import.meta.url)),
      file, channelId, '6'], { env: process.env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    children.push(child); let error = '';
    child.stderr.on('data', data => { error += data; });
    child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(Error(error || `Scoped writer exited ${code}`)));
  });
  await Promise.all([start(id), start(id), start(other)]);
  const core = await store.readCore();
  for (const [channelId, count] of [[id, 14], [other, 8]]) {
    const channel = await store.readChannel(channelId);
    assert.equal(channel.messages.length, count); assert.equal(channel.title, `Count ${count}`);
    assert.equal(new Set(channel.messages.map(message => message.id)).size, count);
    assert.equal(core.workItems.find(item => item.id === `work-item-chat-channel-${channelId}`).metadata.messageCount, count);
  }
});
