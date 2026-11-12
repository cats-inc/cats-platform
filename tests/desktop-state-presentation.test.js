import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { presentedChannelWindow } from '../build/server/products/chat/api/presentationReadModels.js';
import { buildChatConversationId } from '../build/server/shared/chatCoreIds.js';
import { readConversationPresentation } from '@cats-inc/platform-ui-web/contracts';
import { ConversationDatabase } from '../build/server/products/chat/state/database/conversationStore.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { sqliteDriver } from '../build/server/platform/persistence/state-db/sqliteDriver.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';

async function addPresentation(store, id, sourceId, phase = 'sealed', time = '2026-01-01T00:00:01.000Z') {
  await store.updateSnapshot(({ chat, core }) => {
    if (phase === 'streaming') {
      chat.channels.find(channel => channel.id === id).roomRouting.workflow.activeTurn = {
        id: 'test-turn', status: 'pending', sourceMessageId: sourceId, sourceSenderKind: 'user', sourceSenderName: 'Owner',
        guard: null, stageId: 'dispatch', workflowShape: 'linear', reviewRequired: false, lastCheckpointId: null,
        convergeTargetId: null, continuationCount: 0, dispatchCount: 1, targetStatuses: [], events: [],
        startedAt: time, updatedAt: time, completedAt: null,
      };
    } else {
      core.turns.push({ id: 'test-turn', conversationId: buildChatConversationId(id), kind: 'user_message', status: 'completed',
        sourceParticipantId: null, createdAt: time, startedAt: time, completedAt: time, updatedAt: time, metadata: {} });
    }
    core.segments.push({ id: 'presentation:test', conversationId: buildChatConversationId(id), turnId: 'test-turn',
      laneId: 'test-lane', sessionId: null, kind: 'status', content: null, sequence: 0,
      status: phase === 'sealed' ? 'complete' : 'streaming', createdAt: time, completedAt: null,
      metadata: { event: 'conversation_presentation', channelId: id, sourceMessageId: sourceId,
        targetStateId: 'test-target', targetId: 'cat', speakerLabel: 'Cat',
        presentation: { version: 1, id: 'presentation:test', phase,
          blocks: [{ id: 'text', index: 0, kind: 'text', text: 'Complete reply', title: null, toolName: null, toolId: null,
            status: phase === 'sealed' ? 'complete' : 'streaming' }] } } });
    return { chat, core };
  });
  assert.ok(readConversationPresentation((await store.readCore()).segments.find(segment => segment.id === 'presentation:test')?.metadata.presentation));
}

async function fixture(t, source = snapshot()) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-presentation '));
  const file = path.join(root, 'profile.json'); await writeFile(file, JSON.stringify(source));
  const stores = [];
  const create = options => { const store = new DatabaseChatStore(file, options); stores.push(store); return store; };
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  return { file, source, create };
}

test('application transcript preparation is separate from import, restartable and exactly once', async t => {
  const source = snapshot(); const channel = source.chat.channels[0];
  channel.messages.push({ ...structuredClone(channel.messages[0]), id: 'response', senderKind: 'agent', body: 'Reply',
    metadata: { event: 'assistant_turn_segment', assistantTurnId: 'assistant', sessionId: 'session-new', terminal: true } });
  const { file, create } = await fixture(t, source);
  let interrupt = false;
  const first = create({ checkpoint(stage) { if (interrupt && stage === 'database_committed') throw new Error('stop-after-repair-commit'); } });
  await first.initialize(); assert.equal((await first.readChannel(channel.id)).messages.length, 2);
  await assert.rejects(first.readPresentation(), { code: 'presentation_pending' });
  interrupt = true;
  await assert.rejects(first.prepareTranscriptReads(), /stop-after-repair-commit/); await first.close();
  const reopened = create(); await reopened.initialize(); await reopened.prepareTranscriptReads();
  const repaired = await reopened.readChannel(channel.id);
  assert.equal(repaired.messages.filter(message => message.metadata.event === 'session_started').length, 1);
  const before = await readFile(file); await reopened.prepareTranscriptReads();
  assert.deepEqual(await readFile(file), before);
  assert.equal((await reopened.readPresentation(channel.id)).selected.page.total, 3);
});

test('scoped and global writes maintain compact unresolved-choice facts without sibling transcripts', async t => {
  const { create, source } = await fixture(t); const store = create();
  await store.initialize(); await store.prepareTranscriptReads();
  const id = source.chat.channels[0].id;
  await store.updateChannel(id, channel => {
    channel.messages.push({ ...structuredClone(channel.messages[0]), id: 'question', senderKind: 'agent', body: 'Choose',
      metadata: {}, choices: [{ question: 'Which?', options: [{ id: 'one', label: 'One' }] }] });
    return { channel };
  });
  assert.deepEqual((await store.readPresentation(id)).awaitingReplyChannelIds, [id]);
  await store.updateSnapshot(({ chat, core }) => {
    const channel = chat.channels.find(value => value.id === id);
    channel.messages.push({ ...structuredClone(channel.messages[0]), id: 'answer', body: 'Next user' });
    return { chat, core };
  });
  assert.deepEqual((await store.readPresentation(id)).awaitingReplyChannelIds, []);
});

test('source and segmented response pages render one complete presentation at its indexed response placement', async t => {
  const source = snapshot(); const channel = source.chat.channels[0]; const owner = channel.messages[0];
  const part = (id, terminal, body, time) => ({ ...structuredClone(owner), id, body, senderKind: 'agent',
    createdAt: time, metadata: { event: 'assistant_turn_segment', turnId: 'test-turn', targetStateId: 'test-target',
      targetId: 'cat', assistantTurnId: 'assistant', terminal } });
  channel.messages.push(part('prefix', false, 'Complete ', '2026-01-01T00:00:02.000Z'),
    part('terminal', true, 'reply', '2026-01-01T00:00:03.000Z'));
  const { create, file } = await fixture(t, source); const store = create(); await store.initialize();
  await store.prepareTranscriptReads(); await addPresentation(store, channel.id, owner.id);
  const latest = await store.readMessageWindow(channel.id, 1);
  const reader = openStateDatabase({ file: databasePath(file), mode: 'reader' });
  const native = new (sqliteDriver().DatabaseSync)(databasePath(file), { readOnly: true });
  try {
    const queries = [];
    const traced = new ConversationDatabase({ get(sql, ...bindings) { queries.push({ sql, bindings }); return reader.get(sql, ...bindings); } });
    traced.presentationPlacements(latest.core, channel.id, latest.page, true);
    assert.ok(queries.length >= 2);
    for (const { sql, bindings } of queries) {
      const plan = native.prepare(`explain query plan ${sql}`).all(...bindings).map(row => row.detail).join('\n');
      assert.match(plan, /SEARCH messages USING (?:COVERING )?INDEX/u);
      assert.doesNotMatch(plan, /SCAN messages|USE TEMP B-TREE/u);
    }
  } finally { native.close(); reader.close(); }
  assert.equal(latest.page.messages.length, 1);
  assert.deepEqual(presentedChannelWindow(latest).messages.map(m => [m.id, m.body]), [['terminal', 'Complete reply']]);
  const middle = await store.readMessageWindow(channel.id, 1, latest.page.nextCursor);
  assert.equal(middle.page.messages[0].id, 'prefix');
  assert.deepEqual(presentedChannelWindow(middle).messages, []);
  const oldest = await store.readMessageWindow(channel.id, 1, middle.page.nextCursor);
  assert.deepEqual(presentedChannelWindow(oldest).messages.map(m => m.id), [owner.id]);
  // A rejection in another page suppresses the Core projection globally.
  await store.updateChannel(channel.id, next => {
    next.messages.push({ ...structuredClone(owner), id: 'rejection', senderKind: 'system', body: 'Rejected',
      createdAt: '2026-01-01T00:00:04.000Z', metadata: { event: 'assistant_finalization_rejected', turnId: 'test-turn', targetId: 'cat' } });
    return { channel: next };
  });
  const rejectedLatest = await store.readMessageWindow(channel.id, 1);
  const rejectedResponse = await store.readMessageWindow(channel.id, 1, rejectedLatest.page.nextCursor);
  assert.equal(presentedChannelWindow(rejectedResponse).messages[0].metadata.presentation, undefined);
  assert.deepEqual(presentedChannelWindow(await store.readMessageWindow(channel.id, 1, middle.page.nextCursor)).messages.map(m => m.id), [owner.id]);
});

test('a Core-only live presentation anchors once at the latest window when its source is far outside it', async t => {
  const source = snapshot(); const channel = source.chat.channels[0]; const owner = channel.messages[0];
  for (let index = 0; index < 60; index++) channel.messages.push({ ...structuredClone(owner), id: `tool-${index}`,
    senderKind: 'system', body: 'Tool event', createdAt: new Date(Date.parse(owner.createdAt) + (index + 2) * 1000).toISOString() });
  const { create } = await fixture(t, source); const store = create(); await store.initialize();
  await store.prepareTranscriptReads(); await addPresentation(store, channel.id, owner.id, 'streaming');
  const latest = await store.readMessageWindow(channel.id, 1);
  assert.equal(latest.page.messages.length, 1);
  assert.deepEqual(presentedChannelWindow(latest).messages.map(m => m.id).sort(), ['presentation:test', 'tool-59']);
  let page = latest;
  while (page.page.nextCursor) {
    page = await store.readMessageWindow(channel.id, 20, page.page.nextCursor);
    assert.ok(presentedChannelWindow(page).messages.every(m => m.id !== 'presentation:test'));
  }
});

test('an empty transcript retains a sealed Core-only response in its sole newest window', async t => {
  const source = snapshot(); const channel = source.chat.channels[0]; channel.messages = [];
  const { create } = await fixture(t, source); const store = create(); await store.initialize();
  await store.prepareTranscriptReads(); await addPresentation(store, channel.id, 'missing-source', 'sealed');
  const window = await store.readMessageWindow(channel.id, 1);
  assert.equal(window.page.messages.length, 0); assert.equal(window.page.nextCursor, null);
  assert.deepEqual(presentedChannelWindow(window).messages.map(message => [message.id, message.body]), [['presentation:test', 'Complete reply']]);
});

test('a pre-history Core-only response anchors to oldest persisted position with non-monotonic timestamps', async t => {
  const source = snapshot(); const channel = source.chat.channels[0]; const base = channel.messages[0];
  channel.messages = ['2026-02-01', '2026-01-01', '2026-03-01'].map((date, index) => ({ ...structuredClone(base),
    id: `position-${index}`, createdAt: `${date}T00:00:00.000Z` }));
  const { create } = await fixture(t, source); const store = create(); await store.initialize();
  await store.prepareTranscriptReads(); await addPresentation(store, channel.id, 'missing-source', 'sealed', '2025-12-01T00:00:00.000Z');
  const rendered = [];
  let cursor;
  do {
    const window = await store.readMessageWindow(channel.id, 1, cursor);
    rendered.push(...presentedChannelWindow(window).messages.map(message => message.id));
    cursor = window.page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(rendered.filter(id => id === 'presentation:test').length, 1);
  assert.deepEqual(new Set(rendered), new Set(['position-0', 'position-1', 'position-2', 'presentation:test']));
});
