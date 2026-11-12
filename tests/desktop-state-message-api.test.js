import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../build/server/app/server/index.js';
import { loadConfig } from '../build/server/config.js';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { CONVERSATION_PROPOSAL_METADATA_KEY } from '../build/server/products/chat/state/conversationProposals.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { archiveDirectory } from '../build/server/products/chat/state/database/archiveAssets.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { buildChatConversationId } from '../build/server/shared/chatCoreIds.js';
import { createAuthenticatedTestSession, createTestAuthConfig } from './testUtils.js';
import { setTimeout as delay } from 'node:timers/promises';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-transcript-api '));
  const config = loadConfig({ HOME: root, CATS_PLATFORM_DIR: path.join(root, 'platform') });
  const now = new Date('2026-11-12T00:00:00.000Z');
  config.auth = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({ now, sessionSecret: config.auth.sessionSecret,
    sessionTtlMs: config.auth.sessionTtlMs });
  const source = snapshot();
  for (const [index, channel] of source.chat.channels.entries()) {
    const base = channel.messages[0];
    channel.messages = Array.from({ length: 70 }, (_, n) => ({ ...structuredClone(base), id: `${channel.id}-${n}`,
      body: `公園 hello lane${index} number${n}`, createdAt: new Date(now.getTime() + n * 1000).toISOString() }));
    channel.messages[69].metadata = { event: 'conversation_proposal', [CONVERSATION_PROPOSAL_METADATA_KEY]: {
      id: `proposal-${index}`, status: 'open', content: 'private-proposal-token', payload: { secret: 'private-proposal-token' } } };
  }
  await mkdir(path.dirname(config.chatStatePath), { recursive: true });
  await writeFile(config.chatStatePath, JSON.stringify(source));
  const store = new DatabaseChatStore(config.chatStatePath); await store.initialize();
  const server = createServer({ shared: { config, authStore: auth.authStore, now: () => now,
    runtimeClient: { async getHealth() { return { reachable: false, status: 'unavailable' }; } } },
    chat: { chatStore: store, startCompanionLifeLoop: false } });
  t.after(async () => {
    await server.closeAppHosting();
    await new Promise(resolve => server.close(resolve));
    await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  await server.startupRecovery; await server.appHostingReady();
  const url = `http://127.0.0.1:${server.address().port}`;
  const get = (pathname, authenticated = true, method = 'GET', csrf = true, signal) => fetch(`${url}${pathname}`, {
    method, signal, headers: authenticated ? { cookie: auth.cookie, ...(method !== 'GET' && csrf ? { 'x-cats-csrf-token': auth.csrfToken } : {}) } : {} });
  store.read = async () => { throw new Error('Query API must not materialize all transcripts'); };
  const [id, other] = source.chat.channels.map(channel => channel.id);
  return { get, store, source, config, id, other };
}

test('authenticated message pages are bounded, chronological, exclusive and redact proposal payloads', async t => {
  const { get, id, other, config } = await fixture(t);
  // A bad sibling transcript/workflow must not be read by a page query.
  const db = openStateDatabase({ file: databasePath(config.chatStatePath), mode: 'writer' });
  try { db.transaction(() => { db.run('update messages set json = ? where channel_id = ?', '{bad', other);
    db.run('update channels set json = ? where id = ?', '{bad', other); }); } finally { db.close(); }
  const initial = await get(`/api/channels/${id}/messages`); assert.equal(initial.status, 200);
  const first = await initial.json(); assert.equal(first.messages.length, 50); assert.equal(first.total, 70);
  assert.equal(first.messages[0].id, `${id}-20`); assert.equal(first.messages.at(-1).id, `${id}-69`);
  assert.ok(first.nextCursor); assert.ok(!JSON.stringify(first).includes('private-proposal-token'));
  assert.deepEqual(first.messages.at(-1).metadata[CONVERSATION_PROPOSAL_METADATA_KEY], { id: 'proposal-0', status: 'open' });
  const second = await (await get(`/api/channels/${id}/messages?before=${first.nextCursor}`)).json();
  assert.equal(second.messages.length, 20); assert.equal(second.messages[0].id, `${id}-0`);
  assert.equal(second.nextCursor, null); assert.equal(second.total, 70);
});

test('authenticated archive actions expose bounded redacted readback and explicit restore', async t => {
  const { get, id, store } = await fixture(t);
  assert.equal((await get(`/api/channels/${id}/archive`, false, 'POST')).status, 401);
  assert.equal((await get(`/api/channels/${id}/archive`, true, 'POST', false)).status, 403);
  assert.equal((await get(`/api/channels/${id}/archive`)).status, 405);
  const missing = await get('/api/channels/missing/archive', true, 'POST');
  assert.equal(missing.status, 404, await missing.text());
  const hot = await (await get(`/api/channels/${id}/messages`)).json();
  const archived = await get(`/api/channels/${id}/archive`, true, 'POST');
  assert.equal(archived.status, 200); assert.equal((await archived.json()).archived, true);
  assert.equal((await get(`/api/channels/${id}/messages?before=${hot.nextCursor}`)).status, 409);
  const cold = await (await get(`/api/channels/${id}/messages`)).json();
  assert.equal(cold.messages.length, 50); assert.equal(cold.total, 70); assert.ok(cold.archive.id); assert.equal(cold.archiveActions, true);
  assert.ok(!JSON.stringify(cold).includes('private-proposal-token')); assert.deepEqual(cold.messages, hot.messages);
  const channel = await (await get(`/api/channels/${id}`)).json();
  assert.ok(!JSON.stringify(channel).includes('private-proposal-token'));
  const readOnly = await get(`/api/channels/${id}/messages`, true, 'POST');
  assert.equal(readOnly.status, 409); assert.equal((await readOnly.json()).error.code, 'conversation_archived');
  assert.equal((await get(`/api/channels/${id}/messages/${id}-0/retry`, true, 'POST')).status, 409);
  assert.equal((await get(`/api/channels/${id}/activations`, true, 'POST')).status, 409);
  assert.equal((await store.searchMessages('hello', { channelId: id })).length, 0);
  const restored = await get(`/api/channels/${id}/unarchive`, true, 'POST');
  assert.equal(restored.status, 200); assert.equal((await restored.json()).archived, false);
  assert.equal((await store.searchMessages('hello', { channelId: id })).length, 50);
});

for (const action of ['archive', 'unarchive']) test(`a disconnected ${action} after durable commit still refreshes another real SSE client`, { timeout: 20_000 }, async t => {
  const { get, store, id } = await fixture(t);
  if (action === 'unarchive') assert.equal((await get(`/api/channels/${id}/archive`, true, 'POST')).status, 200);
  const subscription = new AbortController(), caller = new AbortController();
  const response = await get(`/api/subscribe?kind=channel&id=${id}`, true, 'GET', true, subscription.signal);
  assert.equal(response.status, 200); const reader = response.body.getReader(); let buffered = '';
  const until = async predicate => {
    for (;;) {
      let end;
      while ((end = buffered.indexOf('\n\n')) >= 0) {
        const frame = buffered.slice(0, end); buffered = buffered.slice(end + 2);
        const json = frame.split('\n').find(line => line.startsWith('data: '));
        if (json && predicate(JSON.parse(json.slice(6)))) return;
      }
      const chunk = await reader.read(); if (chunk.done) throw Error('Subscription ended before committed change');
      buffered += new TextDecoder().decode(chunk.value);
    }
  };
  try {
    await until(value => Boolean(value.state?.selectedChannel));
    const archive = store.archiveConversation.bind(store);
    store.archiveConversation = (channelId, kind, options) => archive(channelId, kind, { ...options, async workerCheckpoint(phase) {
      if (phase !== 'archive_database_committed') return;
      caller.abort();
      if (!options.signal.aborted) await Promise.race([
        new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true })),
        delay(3000).then(() => { throw Error('HTTP disconnect did not cancel native work'); }),
      ]);
    } });
    await assert.rejects(get(`/api/channels/${id}/${action}`, true, 'POST', true, caller.signal), { name: 'AbortError' });
    await Promise.race([until(value => {
      const channel = (value.patch?.state ?? value.state)?.selectedChannel;
      return channel && Boolean(channel.messagePage?.archive) === (action === 'archive');
    }), delay(8000).then(() => { throw Error('No committed channel notification'); })]);
    assert.equal((await store.readChannelHeader(id)).status === 'archived', action === 'archive');
  } finally { subscription.abort(); await reader.cancel().catch(() => {}); }
});

test('damaged cold page errors are controlled and do not disable other conversation queries', async t => {
  const { get, id, other, config } = await fixture(t);
  const archived = await (await get(`/api/channels/${id}/archive`, true, 'POST')).json();
  const root = archiveDirectory(databasePath(config.chatStatePath));
  const manifest = JSON.parse(await readFile(path.join(root, `${archived.archiveId}.manifest.json`), 'utf8'));
  const file = path.join(root, manifest.file), bytes = await readFile(file);
  const block = manifest.blocks.find(block => block.kind === 'message'); bytes[block.offset + Math.floor(block.bytes / 2)] ^= 1;
  await writeFile(file, bytes);
  const response = await get(`/api/channels/${id}/messages`); assert.equal(response.status, 422);
  const body = await response.text(); assert.equal(JSON.parse(body).error.code, 'archive_invalid');
  assert.ok(!body.includes('private-proposal-token')); assert.ok(!body.includes(config.chatStatePath));
  assert.equal((await get(`/api/channels/${other}/messages`)).status, 200);
});

test('page cursors survive edits/appends and explicitly reject changed ordering', async t => {
  const { get, id, store } = await fixture(t);
  const first = await (await get(`/api/channels/${id}/messages?limit=10`)).json();
  await store.updateChannel(id, channel => {
    channel.messages[0].body = 'Edited';
    channel.messages.push({ ...structuredClone(channel.messages.at(-1)), id: 'tail-append', body: 'New tail', metadata: {} });
    return { channel };
  });
  const next = await get(`/api/channels/${id}/messages?limit=10&before=${first.nextCursor}`);
  assert.equal(next.status, 200); assert.equal((await next.json()).messages.at(-1).id, `${id}-59`);
  await store.updateChannel(id, channel => { channel.messages.splice(0, 1); return { channel }; });
  const stale = await get(`/api/channels/${id}/messages?before=${first.nextCursor}`);
  assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'stale_message_cursor');
  assert.equal((await get(`/api/channels/${id}/messages`)).status, 200);
});

test('indexed search is authenticated, scoped, bounded and redacts private card records', async t => {
  const { get, id, other } = await fixture(t);
  for (const pathname of [`/api/channels/${id}/messages`, '/api/conversations/messages/search?q=hello']) {
    assert.equal((await get(pathname, false)).status, 401);
  }
  const path = `/api/conversations/messages/search?q=${encodeURIComponent('公園 hello')}&channelId=${id}&limit=3`;
  const response = await get(path); assert.equal(response.status, 200);
  const { hits } = await response.json(); assert.equal(hits.length, 3);
  assert.ok(hits.every(hit => hit.channelId === id && hit.channelId !== other));
  assert.ok(!JSON.stringify(hits).includes('private-proposal-token'));
  assert.ok(hits.some(hit => hit.message.metadata[CONVERSATION_PROPOSAL_METADATA_KEY]?.id === 'proposal-0'));
  const privateSearch = await (await get('/api/conversations/messages/search?q=private-proposal-token')).json();
  assert.deepEqual(privateSearch.hits, []);
  const missingScope = await (await get('/api/conversations/messages/search?q=hello&channelId=missing')).json();
  assert.deepEqual(missingScope.hits, []);
});

test('query routes reject ambiguous/invalid limits and cursors, missing channels and wrong methods', async t => {
  const { get, id, other } = await fixture(t);
  const page = `/api/channels/${id}/messages`;
  for (const query of ['limit=0', 'limit=201', 'limit=1.2', 'limit=2&limit=3', 'before=', 'before=%25', 'before=a&before=b']) {
    assert.equal((await get(`${page}?${query}`)).status, 400, query);
  }
  assert.equal((await get('/api/channels/missing/messages')).status, 404);
  const otherCursor = await (await get(`${page}?limit=1`)).json();
  assert.equal((await get(`/api/channels/${other}/messages?before=${otherCursor.nextCursor}`)).status, 400);
  assert.equal((await get('/api/conversations/messages/search?q=hello', true, 'HEAD')).status, 405);
  for (const query of ['', 'q=hello&limit=101', 'q=hello&q=other', 'q=hello&channelId=', `q=${'a'.repeat(201)}`,
    `q=${encodeURIComponent(Array.from({ length: 13 }, (_, i) => `word${i}`).join(' '))}`]) {
    assert.equal((await get(`/api/conversations/messages/search?${query}`)).status, 400, query);
  }
});

test('a malformed target row returns a content-safe storage failure', async t => {
  const { get, id, config } = await fixture(t);
  const db = openStateDatabase({ file: databasePath(config.chatStatePath), mode: 'writer' });
  try { db.run('update messages set json = ? where channel_id = ?', '{private-broken-record', id); }
  finally { db.close(); }
  const response = await get(`/api/channels/${id}/messages`);
  assert.equal(response.status, 503);
  const payload = await response.json(); assert.equal(payload.error.code, 'invalid_database_record');
  assert.ok(!JSON.stringify(payload).includes('private-broken-record'));
});

test('shell, channel and subscription read models use only the newest window after startup preparation', async t => {
  const { get, store, source, config, id } = await fixture(t);
  const selectedId = source.chat.selectedChannelId;
  const db = openStateDatabase({ file: databasePath(config.chatStatePath), mode: 'writer' });
  try { db.run('update messages set json = ? where position < 20', '{old-history-must-not-be-read'); }
  finally { db.close(); }
  const response = await get('/api/app-shell'); assert.equal(response.status, 200);
  const shell = await response.json();
  assert.equal(shell.chat.selectedChannel.id, selectedId); assert.equal(shell.chat.selectedChannel.messages.length, 50);
  assert.equal(shell.chat.selectedChannel.messagePage.total, 70);
  assert.equal(typeof shell.chat.selectedChannel.messagePage.orderRevision, 'string');
  const channel = await get(`/api/channels/${id}`); assert.equal(channel.status, 200);
  assert.equal((await channel.json()).channel.messages.length, 50);
  const { buildChannelSubscriptionView } = await import('../build/server/products/chat/api/routeSupport.js');
  const subscription = await buildChannelSubscriptionView({ chatStore: store }, id);
  assert.equal(subscription.selectedChannel.messages.length, 50);
  assert.equal(subscription.parallelChatGroups[0].members.length, 2);
  await store.prepareTranscriptReads(); // The durable stamp avoids another repair/history pass.
});

test('Memory fixture pages share append/edit and stale-order semantics without a production JSON fallback', async () => {
  const source = snapshot(); const channel = source.chat.channels[0];
  channel.messages = Array.from({ length: 5 }, (_, i) => ({ ...structuredClone(channel.messages[0]), id: `m${i}` }));
  const store = new MemoryChatStore(source);
  const first = await store.readMessagePage(channel.id, 2);
  assert.deepEqual(first.messages.map(m => m.id), ['m3', 'm4']);
  await store.updateSnapshot(({ chat, core }) => { chat.channels[0].messages[0].body = 'Edited';
    chat.channels[0].messages.push({ ...chat.channels[0].messages[0], id: 'm5' }); return { chat, core }; });
  assert.deepEqual((await store.readMessagePage(channel.id, 2, first.nextCursor)).messages.map(m => m.id), ['m1', 'm2']);
  await store.updateSnapshot(({ chat, core }) => { chat.channels[0].messages.pop(); return { chat, core }; });
  await assert.rejects(store.readMessagePage(channel.id, 2, first.nextCursor), { code: 'stale_message_cursor' });
  const refreshed = await store.readMessagePage(channel.id, 2);
  await store.updateSnapshot(({ chat, core }) => { chat.channels[0].messages.shift(); return { chat, core }; });
  await assert.rejects(store.readMessagePage(channel.id, 2, refreshed.nextCursor), { code: 'stale_message_cursor' });
});

test('HTTP pages keep raw row limits and project a cross-page reply only at its global placement', async t => {
  const { get, id, store } = await fixture(t);
  await store.updateSnapshot(({ chat, core }) => {
    const channel = chat.channels.find(value => value.id === id); const base = channel.messages[0];
    const time = '2026-11-12T00:02:00.000Z';
    channel.messages.push({ ...structuredClone(base), id: 'source-page', body: 'Question', createdAt: time, metadata: {} });
    for (const [index, terminal] of [false, true].entries()) channel.messages.push({ ...structuredClone(base),
      id: terminal ? 'terminal-page' : 'prefix-page', body: terminal ? 'reply' : 'One ', senderKind: 'agent',
      createdAt: `2026-11-12T00:02:0${index + 1}.000Z`, metadata: { event: 'assistant_turn_segment',
        turnId: 'page-turn', targetStateId: 'page-target', targetId: 'cat', terminal } });
    core.turns.push({ id: 'page-turn', conversationId: buildChatConversationId(id), kind: 'user_message', status: 'completed',
      sourceParticipantId: null, createdAt: time, startedAt: time, completedAt: time, updatedAt: time, metadata: {} });
    core.segments.push({ id: 'presentation:page', conversationId: buildChatConversationId(id), turnId: 'page-turn',
      laneId: 'page-lane', sessionId: null, kind: 'status', content: null, sequence: 0, status: 'complete', createdAt: time, completedAt: time,
      metadata: { event: 'conversation_presentation', channelId: id, sourceMessageId: 'source-page', targetStateId: 'page-target', targetId: 'cat',
        presentation: { version: 1, id: 'presentation:page', phase: 'sealed', blocks: [{ id: 'text', index: 0, kind: 'text',
          text: 'One reply', status: 'complete', title: null, toolName: null, toolId: null }] } } });
    return { chat, core };
  });
  const first = await (await get(`/api/channels/${id}/messages?limit=1`)).json();
  assert.equal(first.messages.length, 1); assert.equal(first.messages[0].body, 'reply');
  assert.equal(first.displayMessages.length, 1); assert.equal(first.displayMessages[0].body, 'One reply');
  const prefix = await (await get(`/api/channels/${id}/messages?limit=1&before=${first.nextCursor}`)).json();
  assert.equal(prefix.messages.length, 1); assert.deepEqual(prefix.displayMessages, []);
  const source = await (await get(`/api/channels/${id}/messages?limit=1&before=${prefix.nextCursor}`)).json();
  assert.deepEqual(source.displayMessages.map(message => message.id), ['source-page']);
});
