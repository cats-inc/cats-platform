import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { archiveDirectory } from '../build/server/products/chat/state/database/archiveAssets.js';
import { buildChatConversationId } from '../build/server/shared/chatCoreIds.js';
import { presentedChannelWindow } from '../build/server/products/chat/api/presentationReadModels.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { setTimeout as delay } from 'node:timers/promises';

async function fixture(t, options = {}, count = 401) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats cold pages 資料 '));
  const file = path.join(root, 'platform/state/profile.json'), source = snapshot();
  const channel = source.chat.channels[0], base = channel.messages[0];
  channel.messages = Array.from({ length: count }, (_, i) => ({ ...structuredClone(base), id: `message-${i}`,
    body: `冷資料 ${i} 🐈`, createdAt: new Date(Date.parse(base.createdAt) + i * 1000).toISOString() }));
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(source));
  const fatal = [], stores = [];
  const create = (config = options) => { const store = new DatabaseChatStore(file, { onFatal: error => fatal.push(error), ...config }); stores.push(store); return store; };
  const store = create(); await store.initialize(); await store.prepareTranscriptReads();
  t.after(async () => { for (const instance of stores) await instance.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  return { file, source, store, create, fatal, id: channel.id, other: source.chat.channels[1].id };
}

async function presentation(store, channelId, options = {}) {
  const { id = 'presentation:test', time = '2026-01-01T00:00:01.000Z', text = 'Complete reply' } = options;
  await store.updateSnapshot(({ chat, core }) => {
    if (!core.turns.some(turn => turn.id === 'test-turn')) core.turns.push({ id: 'test-turn', conversationId: buildChatConversationId(channelId),
      kind: 'user_message', status: 'completed', sourceParticipantId: null, createdAt: time, startedAt: time,
      completedAt: time, updatedAt: time, metadata: {} });
    core.segments.push({ id, conversationId: buildChatConversationId(channelId), turnId: 'test-turn', laneId: 'test-lane',
      sessionId: null, kind: 'status', content: null, sequence: 0, status: 'complete', createdAt: time, completedAt: time,
      metadata: { event: 'conversation_presentation', channelId, sourceMessageId: 'message-0', targetStateId: 'test-target',
        targetId: 'cat', speakerLabel: 'Cat', presentation: { version: 1, id, phase: 'sealed', blocks: [
          { id: 'text', index: 0, kind: 'text', text, title: null, toolName: null, toolId: null, status: 'complete' }] } } });
    return { chat, core };
  });
  assert.ok((await store.readCore()).segments.some(segment => segment.id === id));
}

test('cold windows use archive counts/current cursors, preserve raw pages and expose their read-only descriptor', async t => {
  const { store, id, fatal } = await fixture(t);
  const hot = await store.readMessagePage(id);
  await store.archiveConversation(id, 'archive');
  await assert.rejects(store.readMessagePage(id, 50, hot.nextCursor), { code: 'stale_message_cursor' });
  const first = await store.readMessageWindow(id);
  assert.equal(first.page.total, 401); assert.equal(first.page.messages.length, 50);
  assert.equal(first.page.messages[0].id, 'message-351'); assert.ok(first.page.archive.id);
  const second = await store.readMessagePage(id, 50, first.page.nextCursor);
  assert.equal(second.messages.at(-1).id, 'message-350'); assert.equal(second.total, 401);
  const selected = await store.readPresentation(id);
  assert.deepEqual(selected.selected.page.archive, first.page.archive);
  assert.deepEqual(presentedChannelWindow({ ...selected.selected, metadata: selected.metadata, core: selected.core }).messagePage.archive, first.page.archive);
  await store.archiveConversation(id, 'restore');
  await assert.rejects(store.readMessagePage(id, 50, first.page.nextCursor), { code: 'stale_message_cursor' });
  assert.equal((await store.readMessagePage(id)).archive, undefined); assert.deepEqual(fatal, []);
});

test('cold read workers are bounded across stores and queued readers cancel before native spawn', { timeout: 20_000 }, async t => {
  let count = 0, ready; const releases = [];
  const started = new Promise(resolve => { ready = resolve; });
  const options = { archiveReadWorkerCheckpoint(phase) {
    if (phase !== 'read_started') return;
    count++; if (count === 2) ready(); return new Promise(resolve => releases.push(resolve));
  } };
  const f = await fixture(t, options); await f.store.archiveConversation(f.id, 'archive');
  const otherStore = f.create();
  const jobs = Array.from({ length: 10 }, (_, i) => (i % 2 ? otherStore : f.store).readMessagePage(f.id).then(
    () => ({ ok: true }), error => ({ ok: false, code: error.code })));
  try {
    await Promise.race([started, delay(5000).then(() => { throw Error('Readers did not start'); })]);
    await delay(100); assert.equal(count, 2);
    await Promise.all([f.store.close(), otherStore.close()]);
    assert.ok((await Promise.all(jobs)).every(result => !result.ok)); assert.equal(count, 2);
  } finally { for (const release of releases) release(); }
});

for (const action of ['restore', 'delete']) test(`an already open cold read reports ${action === 'delete' ? 'missing' : 'stale'} when ${action} removes its source`, async t => {
  let change;
  const f = await fixture(t, { async archiveReadWorkerCheckpoint(phase) {
    if (phase === 'read_opened' && change) { const operation = change; change = null; await operation(); }
  } });
  await f.store.archiveConversation(f.id, 'archive');
  change = action === 'restore' ? () => f.store.archiveConversation(f.id, 'restore') : () => f.store.updateSnapshot(({ chat, core }) =>
    ({ chat: { ...chat, channels: chat.channels.filter(channel => channel.id !== f.id) }, core }));
  await assert.rejects(f.store.readMessageWindow(f.id), { code: action === 'delete' ? 'archive_missing' : 'stale_message_cursor' });
  assert.deepEqual(f.fatal, []);
});

for (const phase of ['captured', 'page_read']) test(`default presentation retries a deleted selected archive after ${phase}`, async t => {
  let change;
  const f = await fixture(t, { async archiveReadCheckpoint(current) {
    if (current === phase && change) { const operation = change; change = null; await operation(); }
  } });
  await f.store.archiveConversation(f.id, 'archive');
  await f.store.updateSnapshot(({ chat, core }) => ({ chat: { ...chat, selectedChannelId: f.id }, core }));
  change = () => f.store.updateSnapshot(({ chat, core }) => ({ chat: { ...chat, selectedChannelId: f.other,
    channels: chat.channels.filter(channel => channel.id !== f.id) }, core }));
  const selected = await f.store.readPresentation();
  assert.equal(selected.selected.channel.id, f.other); assert.equal(selected.metadata.selectedChannelId, f.other);
});

test('legacy numeric target-state metadata keeps the indexed hot predicate semantics in cold display', async t => {
  const f = await fixture(t, {}, 3); await presentation(f.store, f.id);
  await f.store.updateSnapshot(({ chat, core }) => {
    core.segments.find(segment => segment.id === 'presentation:test').metadata.targetStateId = 7;
    const channel = chat.channels.find(channel => channel.id === f.id);
    Object.assign(channel.messages[2], { senderKind: 'agent', body: 'Raw legacy response',
      metadata: { event: 'assistant_turn_segment', turnId: 'test-turn', targetStateId: 7, targetId: 'cat', terminal: true } });
    return { chat, core };
  });
  const hot = presentedChannelWindow(await f.store.readMessageWindow(f.id, 1)).messages;
  await f.store.archiveConversation(f.id, 'archive');
  assert.deepEqual(presentedChannelWindow(await f.store.readMessageWindow(f.id, 1)).messages, hot);
});

test('cold Core-only placement matches hot windows with non-monotonic timestamps, including the oldest anchor', async t => {
  const { store, id } = await fixture(t, {}, 3);
  await store.updateChannel(id, channel => {
    const times = ['2026-01-01T00:00:20.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:10.000Z'];
    channel.messages.forEach((message, index) => { message.createdAt = times[index]; }); return { channel };
  });
  await presentation(store, id, { time: '2025-12-31T23:59:59.000Z' });
  const pages = async () => {
    const values = []; let before;
    do { const window = await store.readMessageWindow(id, 1, before); values.push(presentedChannelWindow(window).messages.map(m => [m.id, m.body])); before = window.page.nextCursor; } while (before);
    return values;
  };
  const hot = await pages(); assert.ok(hot.at(-1).some(([id]) => id === 'presentation:test'));
  await store.archiveConversation(id, 'archive'); assert.deepEqual(await pages(), hot);
});

test('cold response placement suppresses off-page partials and honors a rejection in another member', async t => {
  const { store, id } = await fixture(t);
  await store.updateChannel(id, channel => {
    for (const [index, terminal] of [[0, false], [399, true]]) Object.assign(channel.messages[index], { senderKind: 'agent',
      metadata: { event: 'assistant_turn_segment', turnId: 'test-turn', targetStateId: 'test-target', targetId: 'cat',
        assistantTurnId: 'assistant', terminal } });
    channel.messages[400].metadata = { event: 'assistant_finalization_rejected', turnId: 'test-turn', targetId: 'cat' };
    return { channel };
  });
  await presentation(store, id);
  const hot = await store.readMessageWindow(id, 2), display = presentedChannelWindow(hot).messages;
  await store.archiveConversation(id, 'archive');
  assert.deepEqual(presentedChannelWindow(await store.readMessageWindow(id, 2)).messages, display);
});

test('prepared placement cache makes later pages member-bounded and a damaged target stays nonfatal', async t => {
  let proofs = 0;
  const { store, id, file, fatal } = await fixture(t, { archiveReadCheckpoint(phase) { if (phase === 'proof_prepared') proofs++; } });
  await presentation(store, id);
  const archived = await store.archiveConversation(id, 'archive');
  const first = await store.readMessagePage(id, 50); assert.equal(proofs, 1);
  const directory = archiveDirectory(databasePath(file));
  const manifest = JSON.parse(await readFile(path.join(directory, `${archived.archiveId}.manifest.json`), 'utf8'));
  const payload = path.join(directory, manifest.file), bytes = await readFile(payload);
  const oldBlock = manifest.blocks.find(block => block.kind === 'message'); bytes[oldBlock.offset + Math.floor(oldBlock.bytes / 2)] ^= 1;
  await writeFile(payload, bytes);
  const second = await store.readMessagePage(id, 20, first.nextCursor);
  assert.equal(second.messages.at(-1).id, 'message-350'); assert.equal(proofs, 1);
  const oldCursor = Buffer.from(JSON.stringify({ v: 1, channel: id, order: Number(first.orderRevision), before: 10 })).toString('base64url');
  await assert.rejects(store.readMessagePage(id, 10, oldCursor), { code: 'archive_invalid' }); assert.deepEqual(fatal, []);
});

test('current cold Core edits/redaction/deletion invalidate retained history and never resurrect captured Core content', async t => {
  let proofs = 0;
  const { store, id } = await fixture(t, { archiveReadCheckpoint(phase) { if (phase === 'proof_prepared') proofs++; } }, 3);
  await presentation(store, id); await store.archiveConversation(id, 'archive');
  const first = await store.readMessageWindow(id); assert.ok(presentedChannelWindow(first).messages.some(m => m.body === 'Complete reply'));
  await store.updateCore(core => {
    core.segments.find(segment => segment.id === 'presentation:test').metadata.presentation.blocks[0].text = 'Edited current content'; return core;
  });
  const edited = await store.readMessageWindow(id);
  assert.notEqual(edited.page.historyRevision, first.page.historyRevision);
  assert.ok(presentedChannelWindow(edited).messages.some(m => m.body === 'Edited current content')); assert.equal(proofs, 1);
  await store.updateCore(core => ({ ...core, segments: core.segments.filter(segment => segment.id !== 'presentation:test') }));
  const removed = await store.readMessageWindow(id); assert.notEqual(removed.page.historyRevision, edited.page.historyRevision);
  assert.ok(presentedChannelWindow(removed).messages.every(m => m.id !== 'presentation:test'));
  await presentation(store, id, { id: 'presentation:new', time: '2026-01-01T00:00:02.000Z', text: 'New current content' });
  const added = await store.readMessageWindow(id);
  assert.ok(presentedChannelWindow(added).messages.some(m => m.body === 'New current content')); assert.equal(proofs, 2);
});

test('default cold selection is retried after selection changes and unarchive races reject stale windows', async t => {
  let afterCapture;
  const { store, id, other } = await fixture(t, { async archiveReadCheckpoint(phase) {
    if (phase === 'captured' && afterCapture) { const action = afterCapture; afterCapture = null; await action(); }
  } });
  await store.archiveConversation(id, 'archive');
  await store.updateSnapshot(({ chat, core }) => ({ chat: { ...chat, selectedChannelId: id }, core }));
  afterCapture = () => store.updateSnapshot(({ chat, core }) => ({ chat: { ...chat, selectedChannelId: other }, core }));
  const selected = await store.readPresentation(); assert.equal(selected.selected.channel.id, other); assert.equal(selected.metadata.selectedChannelId, other);
  afterCapture = () => store.archiveConversation(id, 'restore');
  await assert.rejects(store.readMessageWindow(id), { code: 'stale_message_cursor' });
  assert.equal((await store.readMessageWindow(id)).page.archive, undefined);
});
