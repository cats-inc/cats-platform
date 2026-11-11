import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from '../build/server/app/server/index.js';
import { ChatEventHub } from '../build/server/products/chat/api/chatEventHub.js';
import { isOwnerPrincipal } from '../build/server/products/chat/api/resources/productScopeRoutes.js';
import { resolveChannelProductScope } from '../build/server/products/chat/shared/channelTopology.js';
import { createHostToolsInvocationEnricher } from '../build/server/platform/mcp/hostToolsEnricher.js';
import { readHostToolsInvocationMarker } from '../build/server/platform/mcp/hostTools.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  createCat,
  createChannel,
  createParallelChatGroup,
  productScopeRaiseRevision,
  raiseChannelProductScope,
  setChannelStatus,
} from '../build/server/products/chat/state/model/index.js';
import { keepRaisedProductScopes } from '../build/server/products/chat/state/model/productScope.js';
import { mergeCompletedDispatchState } from '../build/server/products/chat/state/runtime-dispatch/merge.js';
import { FileChatStore, MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createAuthenticatedTestSession, createTestAuthConfig } from './testUtils.js';

// SPEC-141 FR-20 to FR-26 (PLAN-134 Phase 5): the raise on the server.

const NOW = new Date('2026-11-12T00:00:00.000Z');
const SOURCE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function room(originSurface, title, extra = {}) {
  return { title, topic: '', originSurface, roomMode: 'chat_channel', ...extra };
}

/** Conversations of every shape the raise has a rule for. */
function world() {
  let state = createCat(createDefaultChatState(), { name: 'Milo', provider: 'claude', products: ['chat', 'code', 'work'] }, NOW);
  const catId = state.cats[0].id;
  const ids = {};
  const create = (key, input) => { state = createChannel(state, input, NOW); ids[key] = state.selectedChannelId; };
  create('chat', room('chat', 'On Chat', { participantCatIds: [catId] }));
  create('code', room('code', 'On Code', { participantCatIds: [catId], repoPath: path.join(os.tmpdir(), 'cats-raise-repo') }));
  create('work', room('work', 'On Work', { participantCatIds: [catId] }));
  create('archived', room('chat', 'Archived', { participantCatIds: [catId] }));
  state = setChannelStatus(state, ids.archived, 'archived', NOW);
  create('lane', { title: '', topic: '', originSurface: 'chat', roomMode: 'direct_message', participantCatIds: [catId] });
  state = createParallelChatGroup(state, {
    title: 'Race', originSurface: 'chat',
    targets: [
      { provider: 'claude', instance: null, model: 'claude-opus-4-6', modelSelection: null },
      { provider: 'codex', instance: null, model: 'gpt-5.4', modelSelection: null },
    ],
  }, NOW);
  const group = state.parallelChatGroups.at(-1);
  ids.member = group.memberChannelIds[0];
  return { state, ids, catId };
}

async function start(t, { seed } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-raise-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'state'), { recursive: true });
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({ now: new Date(), sessionSecret: authConfig.sessionSecret, sessionTtlMs: authConfig.sessionTtlMs });
  const fixture = world();
  seed?.(fixture);
  const chatStore = new MemoryChatStore(fixture.state);
  const eventHub = new ChatEventHub();
  const events = [];
  eventHub.subscribe((event) => events.push(event));
  const server = createServer({
    shared: { config: { host: '127.0.0.1', port: 0, runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeApiKey: '',
      platformDir: dir, chatStatePath: path.join(dir, 'state', 'chat-state.local.json'), runtimeDataDir: path.join(dir, 'runtime'),
      auth: authConfig }, authStore: auth.authStore, runtimeClient: { async getHealth() { return { reachable: true, status: 'ok' }; } } },
    chat: { chatStore, eventHub },
  });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:8181',
    cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken };
  const url = (channelId) => `${base}/api/channels/${channelId}/product-scope`;
  const read = async (channelId, extra = headers) => fetch(url(channelId), { headers: extra });
  const raise = async (channelId, body, extra = headers) => fetch(url(channelId), {
    method: 'POST', headers: extra, body: JSON.stringify(body) });
  const setRoles = async (roles) => {
    const authState = await auth.authStore.readState();
    authState.memberships[0].roles = roles;
    await auth.authStore.writeState(authState);
  };
  return { ...fixture, chatStore, events, base, headers, read, raise, setRoles };
}

const channelOf = (state, id) => state.channels.find((channel) => channel.id === id);

test('FR-21: the read route says what a raise would do', async (t) => {
  const h = await start(t);
  const response = await h.read(h.ids.code);
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.scope, 'code');
  assert.equal(body.origin, 'code');
  assert.equal(body.canRaise, true);
  assert.equal(body.refusal, null);
  assert.deepEqual(body.widerLevels, ['work']);
  assert.deepEqual(body.participants.map((entry) => entry.kind), ['cat']);
  assert.equal(body.workspace.repoPath, path.join(os.tmpdir(), 'cats-raise-repo'));
  assert.equal(body.livePreviewsEnabled, false, 'Settings › Code is off by default');
  assert.equal(body.revision, productScopeRaiseRevision(await h.chatStore.read(), h.ids.code));

  const chat = await (await h.read(h.ids.chat)).json();
  assert.deepEqual(chat.widerLevels, ['code', 'work']);
  // The conversations that cannot be raised say why.
  for (const [key, refusal] of [['work', 'not_wider'], ['archived', 'archived'], ['lane', 'direct_lane'], ['member', 'parallel_member']]) {
    const standing = await (await h.read(h.ids[key])).json();
    assert.equal(standing.canRaise, false, key);
    assert.equal(standing.refusal, refusal, key);
    assert.deepEqual(standing.widerLevels, [], key);
  }
  assert.equal((await h.read('no-such-conversation')).status, 404);
});

test('FR-22 and FR-24: the owner raises a conversation, with one system line and the update events', async (t) => {
  const h = await start(t);
  const before = await h.chatStore.read();
  const { revision } = await (await h.read(h.ids.chat)).json();
  const response = await h.raise(h.ids.chat, { target: 'code', revision });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.from, 'chat');
  assert.equal(body.to, 'code');
  assert.equal(body.scope, 'code');
  assert.deepEqual(body.widerLevels, ['work']);

  const after = await h.chatStore.read();
  const raised = channelOf(after, h.ids.chat);
  assert.equal(raised.productScope, 'code');
  assert.equal(raised.originSurface, 'chat', 'the origin never changes');
  const line = raised.messages.at(-1);
  assert.equal(line.senderKind, 'system');
  assert.equal(line.metadata.event, 'product_scope_raised');
  assert.equal(line.metadata.fromScope, 'chat');
  assert.equal(line.metadata.toScope, 'code');
  assert.equal(raised.messages.length, channelOf(before, h.ids.chat).messages.length + 1, 'exactly one line');
  // Nothing else about the conversation changes (FR-24).
  const unchanged = (channel) => ({ participants: channel.participantAssignments, coordinator: channel.coordinatorParticipantId,
    repoPath: channel.repoPath, access: channel.runtimeWorkspaceAccess, mode: channel.runtimePermissionMode,
    kind: channel.runtimeWorkspaceKind, policy: channel.runtimeExecutionPolicy ?? null });
  assert.deepEqual(unchanged(raised), unchanged(channelOf(before, h.ids.chat)));
  const mutations = h.events.filter((event) => event.channelId === h.ids.chat).map((event) => event.detail?.mutation ?? event.type);
  assert.ok(mutations.includes('message_added'), JSON.stringify(mutations));
  assert.ok(mutations.includes('updated'), JSON.stringify(mutations));

  // FR-25: the next turn of each participant carries Code's tools; nothing restarts now.
  const enricher = createHostToolsInvocationEnricher();
  const levelOf = (channel) => readHostToolsInvocationMarker(
    enricher.enrich(channel, {}, { phase: 'message_send' })?.context)?.level;
  assert.equal(levelOf(channelOf(before, h.ids.chat)), 'chat', 'before the raise');
  assert.equal(levelOf(raised), 'code', 'after it');

  // And on to Work with the new revision.
  const next = await (await h.read(h.ids.chat)).json();
  assert.equal((await h.raise(h.ids.chat, { target: 'work', revision: next.revision })).status, 200);
  assert.equal(channelOf(await h.chatStore.read(), h.ids.chat).productScope, 'work');
});

test('FR-23: each refusal has its own code, and a refused raise changes nothing', async (t) => {
  const h = await start(t);
  const revisionOf = async (key) => (await (await h.read(h.ids[key])).json()).revision;
  const cases = [
    ['chat', { target: 'chat' }, 409, 'not_wider'],
    ['code', { target: 'chat' }, 409, 'not_wider'],
    ['chat', { target: 'everything' }, 400, 'invalid_scope'],
    ['archived', { target: 'code' }, 409, 'archived'],
    ['lane', { target: 'code' }, 409, 'direct_lane'],
    ['member', { target: 'code' }, 409, 'parallel_member'],
  ];
  const before = JSON.stringify(await h.chatStore.read());
  for (const [key, body, status, code] of cases) {
    const response = await h.raise(h.ids[key], { ...body, revision: await revisionOf(key) });
    assert.equal(response.status, status, `${key} ${JSON.stringify(body)}`);
    assert.equal((await response.json()).error.code, code, key);
  }
  // The revision the owner saw no longer matches: something the confirmation shows changed.
  const seen = await revisionOf('chat');
  const changed = await h.chatStore.read();
  channelOf(changed, h.ids.chat).runtimePermissionMode = 'default';
  await h.chatStore.write(changed);
  const stale = await h.raise(h.ids.chat, { target: 'code', revision: seen });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'revision_stale');
  assert.equal((await h.raise(h.ids.chat, { target: 'code' })).status, 400, 'a revision is required');
  // A body that is not an object is the same missing revision, not an internal error.
  for (const body of [null, ['code'], 'code']) {
    const response = await h.raise(h.ids.chat, body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.code, 'revision_required', JSON.stringify(body));
  }
  assert.equal((await h.raise('no-such-conversation', { target: 'code', revision: seen })).status, 404);
  const after = await h.chatStore.read();
  channelOf(after, h.ids.chat).runtimePermissionMode = channelOf(JSON.parse(before), h.ids.chat).runtimePermissionMode;
  assert.equal(channelOf(after, h.ids.chat).productScope, 'chat');
});

test('FR-20: only an owner principal can read or raise', async (t) => {
  const h = await start(t);
  const { revision } = await (await h.read(h.ids.chat)).json();
  // Signed in, but a member who is neither owner nor admin.
  await h.setRoles(['member']);
  assert.equal((await h.read(h.ids.chat)).status, 403);
  const denied = await h.raise(h.ids.chat, { target: 'code', revision });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'owner_required');
  // An admin is an owner principal too (SPEC-141 terminology).
  await h.setRoles(['admin']);
  assert.equal((await h.read(h.ids.chat)).status, 200);
  // No session at all, and a cookie without its CSRF token.
  assert.equal((await h.read(h.ids.chat, { origin: 'http://127.0.0.1:8181' })).status, 401);
  const { 'x-cats-csrf-token': _csrf, ...withoutCsrf } = h.headers;
  assert.equal((await h.raise(h.ids.chat, { target: 'code', revision }, withoutCsrf)).status, 403);
  assert.equal(channelOf(await h.chatStore.read(), h.ids.chat).productScope, 'chat');

  // The rule itself: owner or admin, on Desktop's cookie or mobile's bearer, never without auth.
  const auth = (roles, credentialKind) => ({ principal: { membership: { roles } }, credentialKind });
  assert.equal(isOwnerPrincipal(auth(['owner'], 'browser_cookie')), true);
  assert.equal(isOwnerPrincipal(auth(['admin'], 'mobile_bearer')), true);
  assert.equal(isOwnerPrincipal(auth(['member', 'operator'], 'browser_cookie')), false);
  assert.equal(isOwnerPrincipal(auth(['owner'], null)), false);
  assert.equal(isOwnerPrincipal(undefined), false);
});

test('D2: a writer holding a copy from before the raise does not lower it', async (t) => {
  // The forced interleaving Phase 1's review found: read, raise, write the old copy back.
  for (const makeStore of [
    async (state) => new MemoryChatStore(state),
    async (state) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-raise-store-'));
      t.after(() => rm(dir, { recursive: true, force: true }));
      const store = new FileChatStore(path.join(dir, 'state.json'));
      await store.write(state);
      return store;
    },
  ]) {
    const { state, ids } = world();
    const store = await makeStore(state);
    const stale = await store.read();
    await store.write(raiseChannelProductScope(await store.read(), ids.chat, 'work', NOW));
    // A whole-state writer (a continuation replay, a setup route) writes its copy back.
    const returned = await store.write(stale);
    assert.equal(channelOf(await store.read(), ids.chat).productScope, 'work', 'write keeps the raise');
    assert.equal(channelOf(returned, ids.chat).productScope, 'work', 'and hands back what it kept');
    await store.writeSnapshot(stale, await store.readCore());
    assert.equal(channelOf(await store.read(), ids.chat).productScope, 'work', 'writeSnapshot keeps it too');
    // The Core task's scope copy follows the kept value, which Code's canvas route reads.
    const task = (await store.readCore()).tasks.find((entry) => entry.metadata?.channelId === ids.chat);
    assert.equal(task?.metadata.productScope, 'work');
    // Other changes in the stale copy still land.
    const renamed = structuredClone(stale);
    channelOf(renamed, ids.chat).title = 'Renamed';
    await store.write(renamed);
    const latest = channelOf(await store.read(), ids.chat);
    assert.equal(latest.title, 'Renamed');
    assert.equal(latest.productScope, 'work');
  }
  // A running turn's merge keeps it as well (FR-25: it finishes with what it started with).
  const { state, ids } = world();
  const baseline = structuredClone(state);
  const turn = appendMessage(baseline, ids.chat, { senderKind: 'agent', senderName: 'Milo', body: 'Done.' }, NOW).state;
  const raised = raiseChannelProductScope(state, ids.chat, 'code', NOW);
  const merged = mergeCompletedDispatchState(raised, baseline, turn, ids.chat, NOW);
  assert.equal(channelOf(merged, ids.chat).productScope, 'code');
  // The pure rule: only a wider stored value is kept, and only for a conversation that exists.
  const lowered = structuredClone(raised);
  channelOf(lowered, ids.chat).productScope = 'chat';
  assert.deepEqual(keepRaisedProductScopes(raised, lowered).keptChannelIds, [ids.chat]);
  assert.deepEqual(keepRaisedProductScopes(lowered, raised).keptChannelIds, [], 'a raise is not kept back');
  assert.deepEqual(keepRaisedProductScopes(raised, { ...lowered, channels: [] }).keptChannelIds, [], 'a removed conversation stays removed');
});

test('FR-20: the raise has one production caller, and no other code sets a scope', async () => {
  const callers = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.tsx?$/u.test(entry.name)) {
        const text = await readFile(full, 'utf8');
        if (/\braiseChannelProductScope\(/u.test(text)) callers.push(path.relative(SOURCE_ROOT, full).split(path.sep).join('/'));
      }
    }
  };
  await walk(SOURCE_ROOT);
  // The definition and the route. No agent tool, transport command, schedule, heartbeat or create
  // request reaches it.
  assert.deepEqual(callers.sort(), [
    'products/chat/api/resources/productScopeRoutes.ts',
    'products/chat/state/model/productScope.ts',
  ]);
});

test('the raise and the conversation it raises read the same scope everywhere', () => {
  const { state, ids } = world();
  const raised = raiseChannelProductScope(state, ids.code, 'work', NOW);
  assert.equal(resolveChannelProductScope(channelOf(raised, ids.code)), 'work');
});
