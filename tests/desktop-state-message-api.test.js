import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { createAuthenticatedTestSession, createTestAuthConfig } from './testUtils.js';

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
  const get = (pathname, authenticated = true, method = 'GET') => fetch(`${url}${pathname}`, {
    method, headers: authenticated ? { cookie: auth.cookie } : {} });
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
