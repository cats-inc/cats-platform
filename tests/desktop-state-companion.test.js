import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { normalizeImportedChatSnapshot } from '../build/server/products/chat/state/store.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { archiveDirectory } from '../build/server/products/chat/state/database/archiveAssets.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createCat, createChannel, setChannelParticipantLease, setChannelStatus, appendMessage, resolveLeadParticipantLease } from '../build/server/products/chat/state/model/index.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/index.js';
import { createCompanionHeartbeatSpeaker, readCompanionLifeState } from '../build/server/products/chat/api/companionLifeLoop.js';
import { createCompanionPublications } from '../build/server/products/chat/api/companionPublications.js';
import { CompanionGenerationService } from '../build/server/products/chat/companion/generationService.js';
import { findLastOwnerMessageAcross } from '../build/server/products/chat/companion/life/review.js';
import { runWithSessionTurnGate } from '../build/server/products/chat/state/runtime-dispatch/sessionTurnGate.js';

const now = new Date('2026-11-13T12:00:00.000Z');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-companion scoped ')), file = path.join(root, 'state', 'chat-state.local.json');
  await mkdir(path.dirname(file), { recursive: true });
  let state = createCat(createDefaultChatState(), { name: 'Native Companion', provider: 'codex', roles: ['companion'], group: 'standard' }, now);
  const cat = state.cats.find(row => row.name === 'Native Companion');
  state = createChannel(state, { title: 'Direct', topic: '', roomMode: 'direct_message', originSurface: 'chat', defaultRecipientId: cat.id, participantCatIds: [cat.id] }, now);
  const id = state.selectedChannelId;
  state = setChannelStatus(state, id, 'active', now);
  state = setChannelParticipantLease(state, id, cat.id, { status: 'ready', sessionId: 'heartbeat-session' }, now);
  state = appendMessage(state, id, { senderKind: 'user', senderName: 'Owner', body: 'Keep my private continuity marker' }, now).state;
  state = createChannel(state, { title: 'Related Chat', topic: '', originSurface: 'chat', roomMode: 'chat_channel', participantCatIds: [cat.id] }, now);
  const related = state.selectedChannelId;
  state = setChannelStatus(state, related, 'active', now);
  state = appendMessage(state, related, { senderKind: 'user', senderName: 'Owner', body: 'A later owner message' }, new Date(now.getTime() + 60_000)).state;
  state = createChannel(state, { title: 'Unrelated Code', topic: '', originSurface: 'code', cats: [{ name: 'Other', provider: 'claude' }] }, now);
  const other = state.selectedChannelId;
  state = appendMessage(state, other, { senderKind: 'user', senderName: 'Owner', body: 'Unrelated' }, now).state;
  await writeFile(file, JSON.stringify(normalizeImportedChatSnapshot(state)));
  const store = new DatabaseChatStore(file); await store.initialize();
  t.after(async () => { await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  const companionStore = new MemoryCompanionBoxStore(), sent = [];
  let perform = async () => ({ segments: [{ kind: 'text', text: 'A native heartbeat reply', toolName: null, toolId: null }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 });
  const runtimeClient = { async sendMessage(...args) { sent.push(args); return perform(...args); } };
  const deps = { chatStore: store, companionStore, runtimeClient, config: { platformDir: root, chatStatePath: file, runtimeDataDir: path.join(root, 'runtime') },
    mutationGate: { run: async (_key, operation) => operation() }, now: () => now, publicOrigin: () => undefined };
  const request = { catId: cat.id, laneId: id, sessionId: 'heartbeat-session', kind: 'regular', now, awakeSince: now, lastOwnerMessageAt: now, mode: 'companion', unanswered: 0, review: null };
  const damage = () => { const db = openStateDatabase({ file: databasePath(file), mode: 'writer' }); try { db.run('update messages set json = ? where channel_id = ?', '{malformed unrelated', other); } finally { db.close(); } };
  const noGlobal = () => { store.read = store.updateSnapshot = async () => { throw Error('Companion used global history'); }; };
  const initialCount = (await store.readChannel(id)).messages.length;
  return { initialCount, root, file, id, related, other, cat, store, companionStore, deps, request, sent, damage, noGlobal, speak: createCompanionHeartbeatSpeaker(deps), setPerform(fn) { perform = fn; } };
}

test('Companion tick preserves related Chat history and database order without unrelated/cold hydration', async t => {
  const f = await fixture(t);
  const archived = await f.store.archiveConversation(f.other, 'archive');
  const assets = archiveDirectory(databasePath(f.file));
  const manifest = JSON.parse(await readFile(path.join(assets, `${archived.archiveId}.manifest.json`), 'utf8'));
  await writeFile(path.join(assets, manifest.file), 'damaged unrelated cold evidence'); f.noGlobal();
  const state = await readCompanionLifeState(f.store);
  assert.deepEqual(state.channels.map(row => row.id), (await f.store.readCatalog()).headers.map(row => row.id));
  assert.equal(state.channels.find(row => row.id === f.related).messages.at(-1).body, 'A later owner message');
  assert.equal(findLastOwnerMessageAcross(state.channels, f.cat.id), now.getTime() + 60_000);
  assert.equal(state.channels.find(row => row.id === f.other).messages.length, 0);
  assert.match(state.channels.find(row => row.id === f.id).messages.at(-1).body, /private continuity/);
});

test('native heartbeat retains target continuity and blocks archive until the actual turn settles', async t => {
  const f = await fixture(t); f.damage(); f.noGlobal();
  let enter, release; const entered = new Promise(resolve => { enter = resolve; }), blocked = new Promise(resolve => { release = resolve; });
  f.setPerform(async () => { enter(); await blocked; return { segments: [{ kind: 'text', text: 'Scoped reply' }] }; });
  const running = f.speak(f.request);
  try { await entered; await assert.rejects(f.store.archiveConversation(f.id, 'archive'), { code: 'archive_active' }); }
  finally { release(); }
  assert.equal(await running, 'spoke'); assert.equal(f.sent.length, 1);
  assert.match(JSON.stringify(f.sent), /private continuity marker/);
  assert.equal((await f.store.readChannel(f.id)).messages.at(-1).body, 'Scoped reply');
  await f.store.archiveConversation(f.id, 'archive');
});

test('a heartbeat waiting for its session gate never sends after the owner replaces the session', async t => {
  const f = await fixture(t); f.noGlobal(); let release;
  const blocked = runWithSessionTurnGate(f.request.sessionId, () => new Promise(resolve => { release = resolve; }));
  let captured;
  const capture = new Promise(resolve => { captured = resolve; }), read = f.store.readChannelStates.bind(f.store);
  f.store.readChannelStates = async (...args) => { const state = await read(...args); if (!args[1]?.metadataOnly) captured(); return state; };
  const running = f.speak(f.request);
  await capture; await new Promise(setImmediate);
  // The metadata read in the acquired gate must see this replacement, even if earlier capture has not finished.
  await f.store.updateChannels([f.id], state => setChannelParticipantLease(state, f.id, f.cat.id,
    { status: 'ready', sessionId: 'replacement-session' }, now));
  release(); await blocked;
  assert.equal(await running, 'failed'); assert.equal(f.sent.length, 0);
  assert.equal((await f.store.readChannel(f.id)).messages.length, f.initialCount);
});

test('an old heartbeat reply never appends after a post-Runtime session replacement', async t => {
  const f = await fixture(t); f.damage(); f.noGlobal();
  f.setPerform(async () => {
    await f.store.updateChannels([f.id], state => setChannelParticipantLease(state, f.id, f.cat.id, { status: 'ready', sessionId: 'replacement-session' }, now));
    return { segments: [{ kind: 'text', text: 'Must not appear' }] };
  });
  assert.equal(await f.speak(f.request), 'failed'); assert.equal(f.sent.length, 1);
  assert.equal((await f.store.readChannel(f.id)).messages.some(row => row.body === 'Must not appear'), false);
  await f.store.archiveConversation(f.id, 'archive');
});

test('native watching DM notification retries deduplicate beyond the newest message page', async t => {
  const f = await fixture(t); f.damage(); f.noGlobal();
  await f.store.updateChannel(f.id, channel => ({ channel: { ...channel, status: 'watching' } }));
  const publications = createCompanionPublications(f.deps);
  const post = await publications.posts.create(f.cat.id, { requestKey: 'native-notify', body: 'A private post' });
  const intent = await publications.notifications.enqueue(f.cat.id, `post:${post.id}`, 'dm');
  await publications.notifications.tick();
  const first = (await f.companionStore.readSnapshot()).notificationIntents.find(row => row.id === intent.id);
  assert.equal(first.state, 'sent', JSON.stringify(first));
  await f.store.updateChannel(f.id, channel => ({ channel: { ...channel, messages: [...channel.messages,
    ...Array.from({ length: 205 }, (_, n) => ({ ...channel.messages[0], id: `tail-${n}`, body: `Later ${n}` }))] } }));
  await f.companionStore.transaction(snapshot => { snapshot.notificationIntents.find(row => row.id === intent.id).state = 'pending'; });
  await publications.notifications.tick();
  const final = (await f.companionStore.readSnapshot()).notificationIntents.find(row => row.id === intent.id);
  assert.equal(final.state, 'sent'); assert.equal(final.transportMessageId, first.transportMessageId);
  assert.equal((await f.store.readChannel(f.id)).messages.filter(row => row.metadata.companionNotificationId === intent.id).length, 1);
});

test('native owner-profile generation and Cat authorization remain available without a direct lane', async t => {
  const f = await fixture(t);
  await f.store.archiveConversation(f.id, 'archive'); f.damage(); f.noGlobal(); let caller;
  const service = new CompanionGenerationService({ store: f.companionStore, media: {}, posts: { async queue() { return { state: 'waiting_for_media' }; } },
    chatStore: f.store, runtime: {}, service: () => ({ releaseTurn() {} }), now: () => now });
  await service.authorize({ catId: f.cat.id, trigger: 'manual' });
  service.generate = async current => { caller = current; return { id: 'synthetic-held', status: 'queued' }; };
  await service.ownerGenerate(f.cat.id, { requestKey: 'without-lane', body: 'A post' });
  assert.equal(caller.conversationId, `profile:${f.cat.id}`);
  assert.equal(caller.runtimeSessionId, `owner-profile:${f.cat.id}`);
});


test('an old provider-unavailable failure cannot overwrite an owner-closed heartbeat lease', async t => {
  const f = await fixture(t); f.noGlobal();
  f.setPerform(async () => {
    await f.store.updateChannels([f.id], state => setChannelParticipantLease(state, f.id, f.cat.id,
      { status: 'closed', sessionId: f.request.sessionId }, now));
    throw Error('provider_session_unavailable');
  });
  assert.equal(await f.speak(f.request), 'failed'); assert.equal(f.sent.length, 1);
  const lane = await f.store.readChannel(f.id);
  const lease = resolveLeadParticipantLease(lane);
  assert.equal(lease.status, 'closed'); assert.equal(lease.sessionId, f.request.sessionId);
});
