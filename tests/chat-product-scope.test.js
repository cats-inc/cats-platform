import assert from 'node:assert/strict';
import { once } from 'node:events';
import { access, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from '../build/server/app/server/index.js';
import { CATS_CORE_STATE_VERSION } from '../build/server/core/types.js';
import { resolveChannelProductScope } from '../build/server/products/chat/shared/channelTopology.js';
import { collaborationExecutionRevision } from '../build/server/products/chat/state/collaborationExecutionSurface.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  ProductScopeRaiseError,
  appendMessage,
  archiveCat,
  assignCatToChannel,
  buildChannelView,
  createCat,
  createChannel,
  createParallelChatGroup,
  productScopeRaiseRevision,
  raiseChannelProductScope,
  removeCatFromChannel,
  renameChannel,
  selectChannel,
  setChannelChatCwd,
  setChannelRoomRouting,
  setChannelStatus,
  toChannelSummary,
  unarchiveCat,
  ungroupParallelChatGroup,
  updateCatProducts,
} from '../build/server/products/chat/state/model/index.js';
import { mergeCompletedDispatchState } from '../build/server/products/chat/state/runtime-dispatch/merge.js';
import { routeChannelMessage } from '../build/server/products/chat/state/runtimeActions.js';
import { FileChatStore, MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  PRODUCT_SCOPES,
  compareProductScopes,
  deriveProductScope,
  isProductScope,
} from '../build/server/shared/productScope.js';
import {
  createAuthenticatedTestSession,
  createTestAuthConfig,
  installAuthenticatedFetch,
} from './testUtils.js';

// SPEC-141 FR-1 to FR-7 (PLAN-134 Phase 1): the field exists, and nothing reads it yet.

const NOW = new Date('2026-11-11T00:00:00.000Z');
const LATER = new Date('2026-11-11T01:00:00.000Z');
const SOURCE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function stateWithCat(products = ['chat', 'code', 'work']) {
  const state = createCat(
    createDefaultChatState(),
    { name: 'Milo', provider: 'claude', instance: null, model: 'claude-sonnet-4', products },
    NOW,
  );
  return { state, catId: state.cats.find((cat) => cat.name === 'Milo').id };
}

function roomInput(originSurface, overrides = {}) {
  return {
    title: `${originSurface} room`,
    topic: `A conversation started on ${originSurface}.`,
    originSurface,
    ...overrides,
  };
}

function laneInput(catId, originSurface) {
  return {
    title: '',
    topic: 'Hello',
    originSurface,
    roomMode: 'direct_message',
    defaultRecipientId: catId,
    participantCatIds: [catId],
  };
}

function groupInput(originSurface) {
  return {
    title: 'Compare two models',
    originSurface,
    targets: [
      { provider: 'claude', instance: null, model: 'claude-opus-4-6', modelSelection: null },
      { provider: 'codex', instance: null, model: 'gpt-5.4', modelSelection: null },
    ],
  };
}

/** A Runtime that is reachable and is never asked to run anything. */
function idleRuntimeClient() {
  return {
    async getHealth() {
      return { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [],
        warnings: [],
      };
    },
  };
}

function channelOf(state, channelId) {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel, `conversation ${channelId} exists`);
  return channel;
}

function refuses(code) {
  return (error) => error instanceof ProductScopeRaiseError && error.code === code;
}

/** Removes every `productScope` key, wherever it sits: what a build without the field writes. */
function withoutProductScope(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutProductScope(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'productScope')
        .map(([key, entry]) => [key, withoutProductScope(entry)]),
    );
  }
  return value;
}

/** The snapshot's own `updatedAt` is the time of the write, so every save changes it. */
function withoutWriteTime(file) {
  const { updatedAt: _writeTime, ...rest } = file;
  return rest;
}

async function newStatePath() {
  return path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-product-scope-')), 'chat-state.json');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** A file written by this build: rooms of all three origins, a lane and a group started on Code. */
async function writeFixtureFile() {
  const statePath = await newStatePath();
  const store = new FileChatStore(statePath);
  let state = createCat(
    await store.read(),
    { name: 'Milo', provider: 'claude', instance: null, model: 'claude-sonnet-4', products: ['chat', 'code', 'work'] },
    NOW,
  );
  const catId = state.cats.find((cat) => cat.name === 'Milo').id;
  const ids = {};
  for (const [key, originSurface] of [
    ['chat', 'chat'],
    ['code', 'code'],
    ['work', 'work'],
    ['secondCode', 'code'],
    ['secondWork', 'work'],
  ]) {
    state = createChannel(state, roomInput(originSurface, { title: `${key} room` }), NOW);
    ids[key] = state.selectedChannelId;
  }
  state = createChannel(state, laneInput(catId, 'code'), NOW);
  ids.lane = state.selectedChannelId;
  state = createParallelChatGroup(state, groupInput('code'), NOW);
  ids.group = state.parallelChatGroups[0].id;
  ids.members = [...state.parallelChatGroups[0].memberChannelIds];
  await store.write(state);
  // A first read marks setup complete and writes that back; take the file after it has settled.
  await new FileChatStore(statePath).read();
  return { ids, text: await readFile(statePath, 'utf8') };
}

async function loadFile(file) {
  const statePath = await newStatePath();
  const text = `${JSON.stringify(file, null, 2)}\n`;
  await writeFile(statePath, text, 'utf8');
  const store = new FileChatStore(statePath);
  const state = await store.read();
  return { statePath, store, state, text };
}

function storedChannel(file, channelId) {
  const channel = file.chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel, `stored conversation ${channelId} exists`);
  return channel;
}

async function listSourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(entryPath));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------------------------
// FR-1: the ladder
// ---------------------------------------------------------------------------------------------

test('the product scope ladder is chat < code < work', () => {
  assert.deepEqual([...PRODUCT_SCOPES], ['chat', 'code', 'work']);
  assert.ok(compareProductScopes('chat', 'code') < 0);
  assert.ok(compareProductScopes('code', 'work') < 0);
  assert.ok(compareProductScopes('chat', 'work') < 0);
  assert.ok(compareProductScopes('work', 'code') > 0);
  assert.ok(compareProductScopes('work', 'chat') > 0);
  for (const scope of PRODUCT_SCOPES) {
    assert.equal(compareProductScopes(scope, scope), 0);
    assert.equal(isProductScope(scope), true);
  }
  for (const value of ['Chat', 'admin', 'schedule', 'api', '', null, undefined, 1, ['code'], { scope: 'code' }]) {
    assert.equal(isProductScope(value), false, `${JSON.stringify(value)} is not a scope`);
  }
});

test('a derived scope is the origin, chat for a direct lane, and chat when no origin is recorded', () => {
  for (const scope of PRODUCT_SCOPES) {
    assert.equal(deriveProductScope({ originSurface: scope, directLane: false }), scope);
    assert.equal(deriveProductScope({ originSurface: scope, directLane: true }), 'chat');
  }
  for (const originSurface of [null, undefined, '', 'schedule', 'Code', 3]) {
    assert.equal(deriveProductScope({ originSurface, directLane: false }), 'chat');
    assert.equal(deriveProductScope({ originSurface, directLane: true }), 'chat');
  }
});

// ---------------------------------------------------------------------------------------------
// FR-2: creation
// ---------------------------------------------------------------------------------------------

test('a new conversation starts at its origin', () => {
  for (const originSurface of PRODUCT_SCOPES) {
    const created = createChannel(createDefaultChatState(), roomInput(originSurface), NOW);
    const channel = channelOf(created, created.selectedChannelId);
    assert.equal(channel.originSurface, originSurface);
    assert.equal(channel.productScope, originSurface);
  }
});

test('a new direct lane starts at chat whatever its origin', () => {
  for (const originSurface of PRODUCT_SCOPES) {
    const { state, catId } = stateWithCat();
    const created = createChannel(state, laneInput(catId, originSurface), NOW);
    const lane = channelOf(created, created.selectedChannelId);
    assert.equal(lane.channelKind, 'direct_message');
    assert.equal(lane.originSurface, originSurface, 'the origin is kept as provenance');
    assert.equal(lane.productScope, 'chat');
  }
});

test('the create input cannot name a scope', () => {
  const created = createChannel(
    createDefaultChatState(),
    roomInput('chat', { productScope: 'work' }),
    NOW,
  );
  assert.equal(channelOf(created, created.selectedChannelId).productScope, 'chat');
});

test('each member of a parallel group starts at the group origin, and the group has no scope', () => {
  for (const originSurface of PRODUCT_SCOPES) {
    const created = createParallelChatGroup(createDefaultChatState(), groupInput(originSurface), NOW);
    const group = created.parallelChatGroups[0];
    assert.equal(group.originSurface, originSurface);
    assert.equal('productScope' in group, false);
    assert.equal(group.memberChannelIds.length, 2);
    for (const memberId of group.memberChannelIds) {
      assert.equal(channelOf(created, memberId).productScope, originSurface);
    }
  }
});

test('the create routes set the scope from the origin and ignore one named in the request', async () => {
  const workingDir = await mkdtemp(path.join(os.tmpdir(), 'cats-product-scope-api-'));
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({
    now: NOW,
    sessionSecret: authConfig.sessionSecret,
    sessionTtlMs: authConfig.sessionTtlMs,
  });
  const chatStore = new MemoryChatStore();
  const config = {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    auth: authConfig,
    chatStatePath: path.join(workingDir, 'platform', 'state', 'chat-state.local.json'),
  };
  const server = createServer({
    shared: { config, runtimeClient: idleRuntimeClient(), authStore: auth.authStore, now: () => NOW },
    chat: { chatStore },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const restoreFetch = installAuthenticatedFetch(baseUrl, auth, { origin: 'http://127.0.0.1:8181' });
  const post = (route, body) => fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    const named = await post('/api/channels', roomInput('chat', { productScope: 'work' }));
    assert.equal(named.status, 201);
    const { channel: chatRoom } = await named.json();
    assert.equal(chatRoom.originSurface, 'chat');
    assert.equal(chatRoom.productScope, 'chat', 'the request cannot name a scope');

    const onCode = await post('/api/channels', roomInput('code'));
    assert.equal(onCode.status, 201);
    const { channel: codeRoom } = await onCode.json();
    assert.equal(codeRoom.productScope, 'code');

    const { cat } = await (await post('/api/cats', { name: 'Milo', provider: 'claude' })).json();
    const laneResponse = await post('/api/channels', {
      ...laneInput(cat.id, 'work'),
      productScope: 'work',
    });
    assert.equal(laneResponse.status, 201);
    const { channel: lane } = await laneResponse.json();
    assert.equal(lane.originSurface, 'work');
    assert.equal(lane.productScope, 'chat', 'a direct lane is chat whatever its origin');

    const groupResponse = await post('/api/parallel-chat-groups', {
      ...groupInput('code'),
      productScope: 'work',
    });
    assert.equal(groupResponse.status, 201);
    const { group } = await groupResponse.json();

    const state = await chatStore.read();
    assert.equal(channelOf(state, chatRoom.id).productScope, 'chat');
    assert.equal(channelOf(state, codeRoom.id).productScope, 'code');
    assert.equal(channelOf(state, lane.id).productScope, 'chat');
    assert.equal(group.memberChannelIds.length, 2);
    for (const memberId of group.memberChannelIds) {
      assert.equal(channelOf(state, memberId).productScope, 'code', 'a member follows the group origin');
    }
  } finally {
    restoreFetch();
    server.close();
    await once(server, 'close');
  }
});

// ---------------------------------------------------------------------------------------------
// FR-3: loading
// ---------------------------------------------------------------------------------------------

test('the state version is unchanged by the field', () => {
  assert.equal(CATS_CORE_STATE_VERSION, 6);
});

test('loading a file written before the field existed and saving it adds the field and nothing else', async () => {
  const { ids, text } = await writeFixtureFile();
  const written = JSON.parse(text);
  const before = withoutProductScope(written);
  assert.notDeepEqual(before, written, 'this build writes the field');
  assert.equal(JSON.stringify(before).includes('productScope'), false);

  const { statePath, store, state, text: beforeText } = await loadFile(before);

  // Loading derives the value in memory only; the file changes on the next save.
  assert.equal(await readFile(statePath, 'utf8'), beforeText);
  assert.equal(channelOf(state, ids.chat).productScope, 'chat');
  assert.equal(channelOf(state, ids.code).productScope, 'code');
  assert.equal(channelOf(state, ids.work).productScope, 'work');
  assert.equal(channelOf(state, ids.lane).productScope, 'chat', 'a lane started on Code loads as chat');
  for (const memberId of ids.members) {
    assert.equal(channelOf(state, memberId).productScope, 'code');
  }

  await store.write(state);
  const saved = JSON.parse(await readFile(statePath, 'utf8'));

  assert.equal(saved.version, 6);
  assert.deepEqual(
    withoutWriteTime(withoutProductScope(saved)),
    withoutWriteTime(before),
    'no other stored field changes',
  );
  assert.deepEqual(
    withoutWriteTime(saved),
    withoutWriteTime(written),
    'the saved file is what this build writes for the same state',
  );
  for (const channel of saved.chat.channels) {
    assert.equal(isProductScope(channel.productScope), true, `${channel.title} has a stored scope`);
  }
  for (const group of saved.chat.parallelChatGroups) {
    assert.equal('productScope' in group, false);
  }
  assert.equal(await exists(`${statePath}.pre-provider-policy.bak`), false, 'no upgrade ran');
});

test('a missing or invalid stored scope is derived on load', async () => {
  const { ids, text } = await writeFixtureFile();
  const file = JSON.parse(text);
  delete storedChannel(file, ids.chat).productScope;
  storedChannel(file, ids.code).productScope = 'admin';
  storedChannel(file, ids.work).productScope = 7;
  storedChannel(file, ids.secondCode).productScope = null;
  storedChannel(file, ids.secondWork).productScope = 'Work';
  delete storedChannel(file, ids.lane).productScope;
  storedChannel(file, ids.members[0]).productScope = ['code'];
  delete storedChannel(file, ids.members[1]).productScope;

  const { statePath, store, state } = await loadFile(file);

  assert.equal(channelOf(state, ids.chat).productScope, 'chat');
  assert.equal(channelOf(state, ids.code).productScope, 'code');
  assert.equal(channelOf(state, ids.work).productScope, 'work');
  assert.equal(channelOf(state, ids.secondCode).productScope, 'code');
  assert.equal(channelOf(state, ids.secondWork).productScope, 'work');
  assert.equal(channelOf(state, ids.lane).productScope, 'chat');
  assert.equal(channelOf(state, ids.members[0]).productScope, 'code');
  assert.equal(channelOf(state, ids.members[1]).productScope, 'code');

  await store.write(state);
  const saved = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(storedChannel(saved, ids.code).productScope, 'code', 'the derived value is written on save');
  assert.equal(storedChannel(saved, ids.lane).productScope, 'chat');
});

test('a conversation or a group with no recorded origin loads as chat', async () => {
  const { ids, text } = await writeFixtureFile();
  const file = withoutProductScope(JSON.parse(text));
  storedChannel(file, ids.code).originSurface = null;
  delete storedChannel(file, ids.work).originSurface;
  storedChannel(file, ids.secondCode).originSurface = 'schedule';
  const storedGroup = file.chat.parallelChatGroups.find((group) => group.id === ids.group);
  delete storedGroup.originSurface;
  for (const memberId of ids.members) {
    delete storedChannel(file, memberId).originSurface;
  }

  const { state } = await loadFile(file);

  for (const channelId of [ids.code, ids.work, ids.secondCode, ...ids.members]) {
    const channel = channelOf(state, channelId);
    assert.equal(channel.originSurface, null, 'loading does not invent an origin');
    assert.equal(channel.productScope, 'chat');
  }
  const group = state.parallelChatGroups.find((candidate) => candidate.id === ids.group);
  assert.equal(group.originSurface, null);
  assert.equal('productScope' in group, false, 'a group has no scope of its own');
});

test('members of a group with no recorded origin load by their own origin', async () => {
  const { ids, text } = await writeFixtureFile();
  const file = withoutProductScope(JSON.parse(text));
  delete file.chat.parallelChatGroups.find((group) => group.id === ids.group).originSurface;

  const { state } = await loadFile(file);

  const group = state.parallelChatGroups.find((candidate) => candidate.id === ids.group);
  assert.equal(group.originSurface, null);
  assert.equal('productScope' in group, false);
  for (const memberId of ids.members) {
    assert.equal(channelOf(state, memberId).originSurface, 'code');
    assert.equal(channelOf(state, memberId).productScope, 'code');
  }
});

test('a valid stored scope is kept as stored, below the origin and above it', async () => {
  const { ids, text } = await writeFixtureFile();
  const file = JSON.parse(text);
  // A former lane started on Code: it stays at chat until the owner raises it.
  storedChannel(file, ids.code).productScope = 'chat';
  storedChannel(file, ids.work).productScope = 'code';
  // Conversations the owner raised.
  storedChannel(file, ids.chat).productScope = 'work';
  storedChannel(file, ids.secondCode).productScope = 'work';

  const { statePath, store, state } = await loadFile(file);

  assert.equal(channelOf(state, ids.code).productScope, 'chat', 'loading never raises a scope');
  assert.equal(channelOf(state, ids.work).productScope, 'code');
  assert.equal(channelOf(state, ids.chat).productScope, 'work');
  assert.equal(channelOf(state, ids.secondCode).productScope, 'work');
  assert.equal(channelOf(state, ids.code).originSurface, 'code');
  assert.equal(channelOf(state, ids.chat).originSurface, 'chat');

  await store.write(state);
  const reloaded = await new FileChatStore(statePath).read();
  assert.equal(channelOf(reloaded, ids.code).productScope, 'chat');
  assert.equal(channelOf(reloaded, ids.chat).productScope, 'work');
});

// ---------------------------------------------------------------------------------------------
// FR-4 and FR-5: the raise
// ---------------------------------------------------------------------------------------------

test('raising moves a conversation up the ladder and changes nothing else', () => {
  let state = createChannel(createDefaultChatState(), roomInput('chat', { title: 'Other' }), NOW);
  const otherId = state.selectedChannelId;
  state = createChannel(state, roomInput('chat'), NOW);
  const channelId = state.selectedChannelId;
  const untouched = structuredClone(state);

  const raised = raiseChannelProductScope(state, channelId, 'code', LATER);

  assert.deepEqual(state, untouched, 'the input state is not mutated');
  const channel = channelOf(raised, channelId);
  assert.equal(channel.productScope, 'code');
  assert.equal(channel.originSurface, 'chat', 'the origin stays as provenance');
  assert.equal(channel.updatedAt, LATER.toISOString());
  assert.equal(channel.messages.length, channelOf(state, channelId).messages.length, 'no record is created');
  assert.deepEqual(channelOf(raised, otherId), channelOf(state, otherId));

  const expected = structuredClone(state);
  channelOf(expected, channelId).productScope = 'code';
  channelOf(expected, channelId).updatedAt = LATER.toISOString();
  assert.deepEqual(raised, expected);

  const toWork = raiseChannelProductScope(raised, channelId, 'work', LATER);
  assert.equal(channelOf(toWork, channelId).productScope, 'work');
  const skipped = raiseChannelProductScope(state, channelId, 'work', LATER);
  assert.equal(channelOf(skipped, channelId).productScope, 'work', 'chat can go straight to work');
});

test('a raise to an equal or lower level is refused', () => {
  const created = createChannel(createDefaultChatState(), roomInput('code'), NOW);
  const channelId = created.selectedChannelId;

  assert.throws(() => raiseChannelProductScope(created, channelId, 'code'), refuses('not_wider'));
  assert.throws(() => raiseChannelProductScope(created, channelId, 'chat'), refuses('not_wider'));

  const atWork = raiseChannelProductScope(created, channelId, 'work');
  for (const target of PRODUCT_SCOPES) {
    assert.throws(() => raiseChannelProductScope(atWork, channelId, target), refuses('not_wider'));
  }
  assert.equal(channelOf(atWork, channelId).productScope, 'work');
});

test('a raise needs a real scope and a live conversation', () => {
  const created = createChannel(createDefaultChatState(), roomInput('chat'), NOW);
  const channelId = created.selectedChannelId;

  for (const target of ['admin', 'Work', '', null, undefined, 2, ['work']]) {
    assert.throws(() => raiseChannelProductScope(created, channelId, target), refuses('invalid_scope'));
  }
  assert.throws(() => raiseChannelProductScope(created, 'missing-conversation', 'code'), /not found/i);

  const archived = setChannelStatus(created, channelId, 'archived');
  assert.throws(() => raiseChannelProductScope(archived, channelId, 'code'), refuses('archived'));
});

test('a direct lane cannot be raised, and a former lane can', () => {
  const { state, catId } = stateWithCat(['chat', 'code']);
  const withLane = createChannel(state, laneInput(catId, 'code'), NOW);
  const laneId = withLane.selectedChannelId;

  assert.throws(() => raiseChannelProductScope(withLane, laneId, 'code'), refuses('direct_lane'));
  assert.throws(() => raiseChannelProductScope(withLane, laneId, 'work'), refuses('direct_lane'));

  // The Cat leaves Chat, so its lane becomes an ordinary conversation.
  const afterLeaving = updateCatProducts(withLane, catId, ['code']);
  const formerLane = channelOf(afterLeaving, laneId);
  assert.equal(formerLane.channelKind, 'chat_channel');
  assert.equal(formerLane.productScope, 'chat', 'ceasing to be a lane does not raise it to its origin');

  const raised = raiseChannelProductScope(afterLeaving, laneId, 'code');
  assert.equal(channelOf(raised, laneId).productScope, 'code');
});

test('a parallel member cannot be raised, and a former member can', () => {
  const created = createParallelChatGroup(createDefaultChatState(), groupInput('chat'), NOW);
  const group = created.parallelChatGroups[0];
  const [memberId] = group.memberChannelIds;

  assert.throws(() => raiseChannelProductScope(created, memberId, 'code'), refuses('parallel_member'));

  // SPEC-141: a parallel member belongs to an active group. Recents lists the members of a
  // group that is not active as ordinary conversations, so they are raised like one.
  const archivedGroup = structuredClone(created);
  archivedGroup.parallelChatGroups[0].status = 'archived';
  const raisedInArchivedGroup = raiseChannelProductScope(archivedGroup, memberId, 'code');
  assert.equal(channelOf(raisedInArchivedGroup, memberId).productScope, 'code');

  const ungrouped = ungroupParallelChatGroup(created, group.id, NOW);
  const raised = raiseChannelProductScope(ungrouped, memberId, 'code');
  assert.equal(channelOf(raised, memberId).productScope, 'code');
});

test('no other change to a conversation moves its scope', async () => {
  const { state, catId } = stateWithCat();
  let next = createCat(
    state,
    { name: 'Mochi', provider: 'codex', instance: null, model: 'gpt-5.4', products: ['chat', 'code'] },
    NOW,
  );
  const mochiId = next.cats.find((cat) => cat.name === 'Mochi').id;
  next = createChannel(next, roomInput('chat'), NOW);
  const channelId = next.selectedChannelId;
  next = raiseChannelProductScope(next, channelId, 'work', NOW);

  const steps = [
    (current) => renameChannel(current, channelId, 'Renamed', LATER),
    (current) => assignCatToChannel(current, channelId, { catId, provider: 'claude' }, LATER),
    (current) => assignCatToChannel(current, channelId, { catId: mochiId, provider: 'codex' }, LATER),
    (current) => appendMessage(
      current,
      channelId,
      { senderKind: 'user', senderName: 'Owner', body: 'Hello' },
      LATER,
    ).state,
    (current) => setChannelChatCwd(current, channelId, 'C:/work/demo', LATER),
    (current) => setChannelRoomRouting(
      current,
      channelId,
      structuredClone(channelOf(current, channelId).roomRouting),
      LATER,
    ),
    (current) => setChannelStatus(current, channelId, 'archived'),
    (current) => setChannelStatus(current, channelId, 'active'),
    (current) => selectChannel(current, channelId),
    // The ones that restructure a conversation: a participant leaves, a Cat is archived and
    // comes back, and a Cat leaves Chat altogether.
    (current) => removeCatFromChannel(current, channelId, mochiId, LATER),
    (current) => archiveCat(current, catId, LATER),
    (current) => unarchiveCat(current, catId, LATER),
    (current) => updateCatProducts(current, catId, ['code']),
  ];
  steps.forEach((step, index) => {
    next = step(next);
    const channel = channelOf(next, channelId);
    assert.equal(channel.productScope, 'work', 'step ' + (index + 1) + ' leaves the scope alone');
    assert.equal(channel.originSurface, 'chat', 'step ' + (index + 1) + ' leaves the origin alone');
  });

  const statePath = await newStatePath();
  await new FileChatStore(statePath).write(next);
  const reloaded = await new FileChatStore(statePath).read();
  assert.equal(channelOf(reloaded, channelId).productScope, 'work');
  assert.equal(channelOf(reloaded, channelId).originSurface, 'chat');
});

test('a raise that lands while a turn is running survives the turn', () => {
  const baseline = createChannel(createDefaultChatState(), roomInput('chat'), NOW);
  const channelId = baseline.selectedChannelId;
  // The turn worked on a copy taken before the raise, so its copy still says chat.
  const dispatch = appendMessage(
    baseline,
    channelId,
    { senderKind: 'agent', senderName: 'Milo', body: 'Done.' },
    LATER,
  ).state;
  const latest = raiseChannelProductScope(baseline, channelId, 'code', LATER);

  const merged = mergeCompletedDispatchState(latest, baseline, dispatch, channelId, LATER);

  const channel = channelOf(merged, channelId);
  assert.equal(channel.productScope, 'code');
  assert.equal(channel.messages.at(-1).body, 'Done.', "the turn's own changes are kept");
});

test('only creation, the raise and the view assign the field', async () => {
  // SPEC-141 FR-4: after creation, raiseChannelProductScope is the one writer. The view sets
  // the field on its own copy. Add a file here only for a change the spec allows.
  // This sees assignments only. The loader, the summary and the projection set the field in an
  // object literal, and a spread or a whole-object replacement is not an assignment either.
  const allowed = new Map([
    ['products/chat/state/model/index.ts', 1],
    ['products/chat/state/model/productScope.ts', 1],
    ['products/chat/state/model/readModels.ts', 1],
  ]);
  const assignment = /(?:\.productScope|\[['"]productScope['"]\])\s*(?:=(?!=)|\?\?=|\|\|=)/g;
  const found = new Map();
  for (const filePath of await listSourceFiles(SOURCE_ROOT)) {
    const count = [...(await readFile(filePath, 'utf8')).matchAll(assignment)].length;
    if (count > 0) {
      found.set(path.relative(SOURCE_ROOT, filePath).split(path.sep).join('/'), count);
    }
  }
  assert.deepEqual(Object.fromEntries(found), Object.fromEntries(allowed));
});

// ---------------------------------------------------------------------------------------------
// FR-7: the raise revision
// ---------------------------------------------------------------------------------------------

test('the raise revision follows what the confirmation shows and nothing else', () => {
  const { state, catId } = stateWithCat();
  let next = createChannel(state, roomInput('chat', { title: 'Other' }), NOW);
  const otherId = next.selectedChannelId;
  next = createChannel(next, roomInput('chat', { repoPath: 'C:/work/demo' }), NOW);
  const channelId = next.selectedChannelId;
  const revision = productScopeRaiseRevision(next, channelId);

  assert.match(revision, /^[0-9a-f]{64}$/);
  assert.equal(productScopeRaiseRevision(structuredClone(next), channelId), revision, 'stable');
  assert.notEqual(productScopeRaiseRevision(next, otherId), revision, 'bound to one conversation');

  // Unrelated changes leave it alone.
  const unrelated = [
    appendMessage(next, channelId, { senderKind: 'user', senderName: 'Owner', body: 'Hello' }, LATER).state,
    renameChannel(next, channelId, 'Renamed', LATER),
    renameChannel(next, otherId, 'Elsewhere', LATER),
    setChannelChatCwd(next, channelId, 'C:/sandbox/session-1', LATER),
    createCat(next, { name: 'Mochi', provider: 'codex', products: ['chat'] }, LATER),
    updateCatProducts(next, catId, ['chat', 'code']),
  ];
  for (const changed of unrelated) {
    assert.equal(productScopeRaiseRevision(changed, channelId), revision);
  }

  // What the confirmation shows makes it stale.
  const raised = raiseChannelProductScope(next, channelId, 'code', LATER);
  const withCat = assignCatToChannel(next, channelId, { catId, provider: 'claude' }, LATER);
  const archived = setChannelStatus(next, channelId, 'archived');
  const otherFolder = structuredClone(next);
  channelOf(otherFolder, channelId).repoPath = 'C:/work/other';
  const otherAccess = structuredClone(next);
  channelOf(otherAccess, channelId).runtimeWorkspaceAccess = 'read_only';
  const otherPermission = structuredClone(next);
  channelOf(otherPermission, channelId).runtimePermissionMode = 'default';
  const otherKind = structuredClone(next);
  channelOf(otherKind, channelId).runtimeWorkspaceKind = 'worktree';
  const asLane = structuredClone(next);
  channelOf(asLane, channelId).channelKind = 'direct_message';
  const stale = [raised, withCat, archived, otherFolder, otherAccess, otherPermission, otherKind, asLane];
  for (const changed of stale) {
    assert.notEqual(productScopeRaiseRevision(changed, channelId), revision);
  }

  assert.throws(() => productScopeRaiseRevision(next, 'missing-conversation'), /not found/i);
});

test('the raise revision changes when a conversation joins or leaves a parallel group', () => {
  const created = createParallelChatGroup(createDefaultChatState(), groupInput('chat'), NOW);
  const group = created.parallelChatGroups[0];
  const [memberId] = group.memberChannelIds;
  const ungrouped = ungroupParallelChatGroup(created, group.id, NOW);

  assert.notEqual(
    productScopeRaiseRevision(created, memberId),
    productScopeRaiseRevision(ungrouped, memberId),
  );
});

test('a raise does not change the collaboration execution revision', () => {
  const { state, catId } = stateWithCat();
  let next = createChannel(state, roomInput('chat', { participantCatIds: [catId] }), NOW);
  const channelId = next.selectedChannelId;
  const before = collaborationExecutionRevision(next, channelId);
  assert.ok(before);

  next = raiseChannelProductScope(next, channelId, 'work', LATER);

  assert.equal(collaborationExecutionRevision(next, channelId), before);
});

// ---------------------------------------------------------------------------------------------
// FR-6: where the scope is carried
// ---------------------------------------------------------------------------------------------

test('the summary and the view carry the scope beside the origin', () => {
  const created = createChannel(createDefaultChatState(), roomInput('code'), NOW);
  const channelId = created.selectedChannelId;

  const summary = toChannelSummary(channelOf(created, channelId), created);
  const view = buildChannelView(created, channelId);
  assert.equal(summary.originSurface, 'code');
  assert.equal(summary.productScope, 'code');
  assert.equal(view.originSurface, 'code');
  assert.equal(view.productScope, 'code');

  const raised = raiseChannelProductScope(created, channelId, 'work', LATER);
  assert.equal(toChannelSummary(channelOf(raised, channelId), raised).productScope, 'work');
  assert.equal(toChannelSummary(channelOf(raised, channelId), raised).originSurface, 'code');
  assert.equal(buildChannelView(raised, channelId).productScope, 'work');
  assert.equal(buildChannelView(raised, channelId).originSurface, 'code');
});

test('a conversation object without the field still reads as its derived scope', () => {
  const { state, catId } = stateWithCat();
  let next = createChannel(state, roomInput('work'), NOW);
  const roomId = next.selectedChannelId;
  next = createChannel(next, laneInput(catId, 'code'), NOW);
  const laneId = next.selectedChannelId;
  // State built in memory by a caller that never set the field, such as an older fixture.
  for (const channel of next.channels) {
    delete channel.productScope;
  }

  assert.equal(resolveChannelProductScope(channelOf(next, roomId)), 'work');
  assert.equal(resolveChannelProductScope(channelOf(next, laneId)), 'chat');
  assert.equal(toChannelSummary(channelOf(next, roomId), next).productScope, 'work');
  assert.equal(toChannelSummary(channelOf(next, laneId), next).productScope, 'chat');
  assert.equal(buildChannelView(next, roomId).productScope, 'work');
  assert.equal(buildChannelView(next, laneId).productScope, 'chat');
  assert.equal('productScope' in channelOf(next, roomId), false, 'reading does not write the field');
});

test('Core records projected from a conversation carry the scope beside the origin', async () => {
  const statePath = await newStatePath();
  const store = new FileChatStore(statePath);
  let state = createCat(await store.read(), { name: 'Smelly', provider: 'claude', roles: ['boss'] }, NOW);
  const smellyId = state.cats.find((cat) => cat.name === 'Smelly').id;
  state.cats.find((cat) => cat.id === smellyId).group = 'admin';
  state = createCat(state, { name: 'Agent-1', provider: 'claude', roles: ['reviewer'] }, NOW);
  const agentId = state.cats.find((cat) => cat.name === 'Agent-1').id;
  state = createChannel(
    state,
    roomInput('chat', { title: 'Projection', participantCatIds: [smellyId, agentId] }),
    NOW,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId: agentId, provider: 'claude', roles: ['reviewer'] }, NOW);

  const runtimeClient = {
    async getHealth() {
      return { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
    sessionCount: 0,
    async createSession(input) {
      this.sessionCount += 1;
      return {
        id: `session-${this.sessionCount}`,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? '/tmp/cats-product-scope',
      };
    },
    async sendMessage(_sessionId, content) {
      const text = content.includes('You are Smelly') ? '@Agent-1 take first pass.' : 'Done.';
      return {
        segments: [{ kind: 'text', text, toolName: null, toolId: null }],
        inputTokens: 10,
        outputTokens: 6,
        tokensUsed: 16,
      };
    },
    async closeSession() {},
  };
  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Smelly Start the room workflow.' },
    runtimeClient,
    NOW,
    // The turn's attachment folder and its local knowledge stay in this test's own directory.
    // Without these they resolve under the developer's `~/.cats`.
    { runtimeDataDir: path.join(path.dirname(statePath), 'runtime-data'),
      platformDir: path.join(path.dirname(statePath), 'platform') },
  );

  const projected = async (chatState) => {
    await store.write(chatState);
    const core = await store.readCore();
    return {
      Task: core.tasks,
      WorkItem: core.workItems,
      Run: core.runs,
      Mission: core.missions,
      Trace: core.traces,
      Checkpoint: core.checkpoints,
      Outcome: core.outcomes,
      Activity: core.activities,
    };
  };
  const expectScope = (records, productScope) => {
    for (const [kind, list] of Object.entries(records)) {
      const fromChannel = list.filter((record) => record.metadata?.channelId === channelId);
      assert.ok(fromChannel.length > 0, `a ${kind} is projected from the conversation`);
      for (const record of fromChannel) {
        assert.equal(record.metadata.originSurface, 'chat', `${kind} ${record.id} keeps the origin`);
        assert.equal(record.metadata.productScope, productScope, `${kind} ${record.id} carries the scope`);
      }
    }
  };

  expectScope(await projected(dispatched.state), 'chat');
  // The copy follows the scope, not the origin, once the two differ.
  expectScope(await projected(raiseChannelProductScope(dispatched.state, channelId, 'work', LATER)), 'work');
});

test('every projected origin copy has the scope next to it', async () => {
  const directory = path.join(SOURCE_ROOT, 'products', 'chat', 'state', 'core-projection');
  let pairs = 0;
  for (const filePath of await listSourceFiles(directory)) {
    const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.trim() !== 'originSurface: channel.originSurface,') {
        return;
      }
      assert.equal(
        lines[index + 1]?.trim(),
        'productScope: resolveChannelProductScope(channel),',
        `${path.basename(filePath)}:${index + 1} copies the origin without the scope`,
      );
      pairs += 1;
    });
  }
  assert.equal(pairs, 8, 'Task, WorkItem, Run, Mission, Trace, Checkpoint, Outcome and Activity');
});
