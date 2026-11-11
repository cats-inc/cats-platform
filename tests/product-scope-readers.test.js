import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreRun,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import { ownerActionView } from '../build/server/core/ownerActions.js';
import { buildCatlasSnapshot, catlasSnapshotEntries } from '../build/server/products/chat/api/catlasSnapshot.js';
import { resolveVisibleChatPath as resolveChatLandingPath } from '../build/server/products/chat/shared/channelPaths.js';
import { resolveChannelProductScope } from '../build/server/products/chat/shared/channelTopology.js';
import { catlasConversationHref } from '../build/server/products/chat/api/guideCatAssist.js';
import { buildBossCatBoard } from '../build/server/products/chat/state/bossCatBoard.js';
import {
  postBossCatJoinRequest,
  readBossCatJoinRequestDetails,
} from '../build/server/products/chat/state/bossCatJoinRequests.js';
import { createConversationExecutionInspector } from '../build/server/products/chat/state/conversationExecutionInspection.js';
import { createConversationSessionDelegate } from '../build/server/products/chat/state/conversationSessionDelegate.js';
import { syncCoreStateWithChatState } from '../build/server/products/chat/state/core-projection/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  assignCatToChannel,
  buildChannelView,
  createCat,
  createChannel,
  raiseChannelProductScope,
  toChannelSummary,
  updateCatProducts,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createCodeAgentToolsInvocationEnricher } from '../build/server/products/code/agentTools/enricher.js';
import { resolveVisibleChatPath as resolveCodeLandingPath } from '../build/server/products/code/shared/channelPaths.js';
import { filterChatChannelsForProductRecents } from '../build/server/products/shared/recentsFilter.js';
import { buildWorkGraphProjection } from '../build/server/products/work/api/workGraphProjection.js';
import { resolveVisibleChatPath as resolveWorkLandingPath } from '../build/server/products/work/shared/channelPaths.js';
import { listExecutionHistory } from '../build/server/products/work/state/historyListing.js';
import { buildChatConversationId, buildChatWorkItemId } from '../build/server/shared/chatCoreIds.js';
import { isDirectLaneSource, readProductScope } from '../build/server/shared/productScope.js';

// SPEC-141 FR-8 and FR-12 to FR-15 (PLAN-134 Phase 2): the readers follow the scope.
//
// A conversation's scope equals its origin until the owner raises it, unless it has no
// recorded origin or is, or once was, a direct lane created outside Chat. For every other
// conversation each reader answers as it did when it read the origin, and the suites that
// already covered these readers are that proof. This file covers what they cannot: a
// conversation whose scope differs from its origin, one with no recorded origin (S4), and a
// direct lane created outside Chat, both while it is a lane and after it stops being one (S6).

const NOW = new Date('2026-11-11T00:00:00.000Z');
const LATER = new Date('2026-11-11T01:00:00.000Z');
const PRODUCTS = ['chat', 'code', 'work'];

function room(originSurface, title) {
  return { title, topic: `A conversation started on ${originSurface}.`, originSurface };
}

function lane(catId, originSurface) {
  return {
    title: '',
    topic: 'Hello',
    originSurface,
    roomMode: 'direct_message',
    defaultRecipientId: catId,
    participantCatIds: [catId],
  };
}

function channelOf(state, channelId) {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel, `conversation ${channelId} exists`);
  return channel;
}

/**
 * One conversation of each kind the readers must tell apart. `expected` is the scope each one
 * reads as, which is the product that lists it, routes it and decides its tools.
 */
function fixture() {
  let state = createDefaultChatState();
  for (const name of ['Milo', 'Mochi', 'Kiki']) {
    state = createCat(
      state,
      { name, provider: 'claude', instance: null, model: 'claude-sonnet-4', products: [...PRODUCTS] },
      NOW,
    );
  }
  const catId = (name) => state.cats.find((cat) => cat.name === name).id;
  const ids = {};
  const create = (key, input) => {
    state = createChannel(state, input, NOW);
    ids[key] = state.selectedChannelId;
  };

  create('chat', room('chat', 'Started on Chat'));
  create('code', room('code', 'Started on Code'));
  create('work', room('work', 'Started on Work'));
  // Started on Chat and raised by the owner: the scope and the origin differ.
  create('raisedToCode', room('chat', 'Raised to Code'));
  state = raiseChannelProductScope(state, ids.raisedToCode, 'code', NOW);
  create('raisedToWork', room('code', 'Raised to Work'));
  state = raiseChannelProductScope(state, ids.raisedToWork, 'work', NOW);
  // S4: stored before origins were recorded, as it sits in memory when nothing filled it in.
  create('noOrigin', room('work', 'No recorded origin'));
  channelOf(state, ids.noOrigin).originSurface = null;
  delete channelOf(state, ids.noOrigin).productScope;
  // S6: a direct lane created outside Chat.
  create('laneFromCode', lane(catId('Milo'), 'code'));
  // Data no path produces: a lane that carries a stored scope above chat.
  create('laneWithStoredCode', lane(catId('Mochi'), 'chat'));
  channelOf(state, ids.laneWithStoredCode).productScope = 'code';
  // S6, later: a lane created outside Chat whose Cat then left Chat. It is an ordinary
  // conversation with a Code origin and it stays at chat, where it was as a lane (FR-3).
  create('formerLaneFromCode', lane(catId('Kiki'), 'code'));
  state = updateCatProducts(state, catId('Kiki'), ['code']);
  assert.equal(channelOf(state, ids.formerLaneFromCode).channelKind, 'chat_channel');
  assert.equal(channelOf(state, ids.formerLaneFromCode).originSurface, 'code');

  const expected = {
    chat: 'chat',
    code: 'code',
    work: 'work',
    raisedToCode: 'code',
    raisedToWork: 'work',
    noOrigin: 'chat',
    formerLaneFromCode: 'chat',
    laneFromCode: 'chat',
    laneWithStoredCode: 'chat',
  };
  return { state, ids, expected, catId };
}

const ROOMS = ['chat', 'code', 'work', 'raisedToCode', 'raisedToWork', 'noOrigin', 'formerLaneFromCode'];
const LANES = ['laneFromCode', 'laneWithStoredCode'];

function summariesOf(state) {
  return state.channels.map((channel) => toChannelSummary(channel, state));
}

// ---------------------------------------------------------------------------------------------
// The read rule
// ---------------------------------------------------------------------------------------------

test('the read rule: a lane is chat, then a valid stored value, then the origin, then chat', () => {
  const cases = [
    [{ originSurface: 'code' }, 'code'],
    [{ originSurface: 'work', productScope: 'chat' }, 'chat'],
    [{ originSurface: 'chat', productScope: 'work' }, 'work'],
    [{ originSurface: 'code', productScope: 'admin' }, 'code'],
    [{ originSurface: 'code', productScope: null }, 'code'],
    [{ originSurface: null }, 'chat'],
    [{}, 'chat'],
    [{ originSurface: 'schedule', productScope: 7 }, 'chat'],
    // A direct lane, however the shape says so, whatever is stored.
    [{ originSurface: 'code', channelKind: 'direct_message' }, 'chat'],
    [{ originSurface: 'work', productScope: 'work', channelKind: 'direct_message' }, 'chat'],
    [{ originSurface: 'code', productScope: 'code', roomMode: 'direct_message' }, 'chat'],
    [{ originSurface: 'code', productScope: 'code', roomRouting: { mode: 'direct_message' } }, 'chat'],
    // Not a lane.
    [{ originSurface: 'code', channelKind: 'chat_channel', roomMode: 'chat_channel' }, 'code'],
    [{ originSurface: 'code', roomRouting: { mode: 'chat_channel' } }, 'code'],
    [{ originSurface: 'code', roomRouting: null }, 'code'],
  ];
  for (const [source, expected] of cases) {
    assert.equal(readProductScope(source), expected, JSON.stringify(source));
  }
  assert.equal(isDirectLaneSource({ channelKind: 'direct_message' }), true);
  assert.equal(isDirectLaneSource({ roomMode: 'direct_message' }), true);
  assert.equal(isDirectLaneSource({ roomRouting: { mode: 'direct_message' } }), true);
  assert.equal(isDirectLaneSource({ channelKind: 'chat_channel', roomMode: 'chat_channel' }), false);
  assert.equal(isDirectLaneSource({}), false);
});

test('the stored conversation, its summary and its view read as the same scope', () => {
  const { state, ids, expected } = fixture();
  for (const key of [...ROOMS, ...LANES]) {
    const channel = channelOf(state, ids[key]);
    assert.equal(resolveChannelProductScope(channel), expected[key], `${key}: stored conversation`);
    assert.equal(toChannelSummary(channel, state).productScope, expected[key], `${key}: summary`);
    assert.equal(buildChannelView(state, channel.id).productScope, expected[key], `${key}: view`);
    // A summary carries the scope, and it also reads right when only the origin is there.
    const summary = toChannelSummary(channel, state);
    assert.equal(readProductScope(summary), expected[key], `${key}: summary through the rule`);
    // Without the field the rule falls back to the origin, which is a different answer only
    // where the stored scope is not what the origin gives.
    const { productScope: _stored, ...withoutScope } = summary;
    const storedDiffers = ['raisedToCode', 'raisedToWork', 'formerLaneFromCode'].includes(key);
    const derived = storedDiffers ? channel.originSurface : expected[key];
    assert.equal(readProductScope(withoutScope), derived, `${key}: summary without the field`);
  }
});

test('a lane that carries a stored scope reads as chat, and the stored value is left alone', () => {
  const { state, ids, catId } = fixture();
  const stored = channelOf(state, ids.laneWithStoredCode);
  assert.equal(stored.productScope, 'code', 'reading does not rewrite what is stored');
  assert.equal(resolveChannelProductScope(stored), 'chat');

  // Nothing was lowered: once it is an ordinary conversation again, its stored level applies.
  const afterLeaving = updateCatProducts(state, catId('Mochi'), ['code']);
  const formerLane = channelOf(afterLeaving, ids.laneWithStoredCode);
  assert.equal(formerLane.channelKind, 'chat_channel');
  assert.equal(resolveChannelProductScope(formerLane), 'code');
});

// ---------------------------------------------------------------------------------------------
// FR-12: Recents
// ---------------------------------------------------------------------------------------------

test('Recents list a conversation under the product of its scope', () => {
  const { state, ids, expected } = fixture();
  const summaries = summariesOf(state);
  for (const product of PRODUCTS) {
    const listed = filterChatChannelsForProductRecents(summaries, product).map((channel) => channel.id);
    const wanted = ROOMS.filter((key) => expected[key] === product).map((key) => ids[key]);
    assert.deepEqual([...listed].sort(), [...wanted].sort(), `Recents on ${product}`);
    for (const key of LANES) {
      assert.equal(listed.includes(ids[key]), false, `${key} is not in Recents on ${product}`);
    }
  }
});

test('Recents still follow the origin for a conversation that was never raised', () => {
  // The same answers as before the readers moved, on summaries shaped as older code made them.
  const summaries = [
    { id: 'a', originSurface: 'chat', channelKind: 'chat_channel' },
    { id: 'b', originSurface: 'code', channelKind: 'chat_channel' },
    { id: 'c', originSurface: 'work', channelKind: 'chat_channel' },
    { id: 'd', originSurface: 'chat', channelKind: 'direct_message' },
    { id: 'e', originSurface: 'code', roomMode: 'direct_message' },
  ];
  assert.deepEqual(filterChatChannelsForProductRecents(summaries, 'chat').map((entry) => entry.id), ['a']);
  assert.deepEqual(filterChatChannelsForProductRecents(summaries, 'code').map((entry) => entry.id), ['b']);
  assert.deepEqual(filterChatChannelsForProductRecents(summaries, 'work').map((entry) => entry.id), ['c']);
});

// ---------------------------------------------------------------------------------------------
// FR-13 and FR-14: routes, links and labels
// ---------------------------------------------------------------------------------------------

test("a product's landing conversation is one of its scope", () => {
  const { state, ids, expected } = fixture();
  const summaries = summariesOf(state);
  const landing = { chat: resolveChatLandingPath, code: resolveCodeLandingPath, work: resolveWorkLandingPath };
  for (const key of ROOMS) {
    for (const product of PRODUCTS) {
      const path = landing[product](summaries, ids[key]);
      const own = `/${product}/chats/${ids[key]}`;
      if (expected[key] === product) {
        assert.equal(path, own, `${key} is ${product}'s to land on`);
      } else {
        assert.notEqual(path, own, `${key} is not ${product}'s to land on`);
      }
    }
  }
  for (const key of LANES) {
    for (const product of PRODUCTS) {
      assert.notEqual(landing[product](summaries, ids[key]), `/${product}/chats/${ids[key]}`, `${key} is a lane`);
    }
  }
});

test('the owner-action source link opens the conversation under its scope', () => {
  const { state, ids, expected } = fixture();
  const core = syncCoreStateWithChatState(state, createDefaultCoreState());
  for (const key of [...ROOMS, ...LANES]) {
    const view = ownerActionView(core, 'task', `task-channel-${ids[key]}`);
    assert.equal(view.sourcePath, `/${expected[key]}/chats/${ids[key]}`, key);
  }

  // A record that has not been synced since the field existed still links by its origin.
  const task = core.tasks.find((record) => record.id === `task-channel-${ids.code}`);
  delete task.metadata.productScope;
  assert.equal(ownerActionView(core, 'task', task.id).sourcePath, `/code/chats/${ids.code}`);
});

test('the Catlas snapshot labels a conversation with the product of its scope', () => {
  const { state, ids, expected } = fixture();
  // The snapshot keeps five recent conversations, so each one is looked at on its own.
  const surfaceOf = (key) => {
    const chat = { ...state, channels: state.channels.filter((channel) => channel.id === ids[key]) };
    const core = syncCoreStateWithChatState(chat, createDefaultCoreState());
    return catlasSnapshotEntries(buildCatlasSnapshot({ core, chat, now: LATER, locale: 'en' }))
      .find((entry) => entry.kind === 'conversation' && entry.id === buildChatConversationId(ids[key]))?.surface;
  };
  for (const key of ROOMS) {
    assert.equal(surfaceOf(key), expected[key], key);
  }
  for (const key of LANES) {
    assert.equal(surfaceOf(key), undefined, `${key}: a lane is not a recent conversation`);
  }
});

test('a Catlas link opens a conversation under the product of its scope', () => {
  const { state, ids, expected } = fixture();
  for (const key of [...ROOMS, ...LANES]) {
    assert.equal(
      catlasConversationHref(channelOf(state, ids[key])),
      `/${expected[key]}/chats/${ids[key]}`,
      key,
    );
  }
});

test('the Boss Cat board shows a conversation with the product of its scope', () => {
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, NOW);
  state = createCat(state, { name: 'Mochi', provider: 'claude' }, NOW);
  state = createCat(state, { name: 'Kiki', provider: 'codex' }, NOW);
  const idOf = (name) => state.cats.find((cat) => cat.name === name).id;
  state = createChannel(state, room('chat', 'Release plan'), NOW);
  const groupId = state.selectedChannelId;
  for (const name of ['Mochi', 'Kiki']) {
    state = assignCatToChannel(state, groupId, { catId: idOf(name), provider: 'claude' }, NOW);
  }
  const surfaceOn = (current) => buildBossCatBoard({ state: current, bossCatId: idOf('Boss'), now: LATER })
    .groups.find((entry) => entry.conversationId === groupId)?.surface;

  assert.equal(surfaceOn(state), 'chat');
  assert.equal(surfaceOn(raiseChannelProductScope(state, groupId, 'code', LATER)), 'code');

  // S4: no recorded origin.
  const legacy = structuredClone(state);
  channelOf(legacy, groupId).originSurface = null;
  delete channelOf(legacy, groupId).productScope;
  assert.equal(surfaceOn(legacy), 'chat');
});

// ---------------------------------------------------------------------------------------------
// FR-15: Work
// ---------------------------------------------------------------------------------------------

test("Work's own-record check reads the scope where it read the origin", () => {
  // The scope decides for a Task that came from a conversation and is not bound to Work, as
  // Work's graph projection builds it.
  const cases = {
    'origin-chat': [{ originSurface: 'chat' }, false],
    'origin-code-scope-code': [{ originSurface: 'code', productScope: 'code' }, false],
    // Written before the field existed: the origin still answers.
    'origin-work': [{ originSurface: 'work' }, true],
    // Raised by the owner.
    'origin-chat-scope-work': [{ originSurface: 'chat', productScope: 'work' }, true],
    'origin-work-scope-code': [{ originSurface: 'work', productScope: 'code' }, false],
    // S6: a direct lane created on Work, on a record without the copy.
    'origin-work-lane': [{ originSurface: 'work', roomRoutingMode: 'direct_message' }, false],
  };
  let core = upsertCoreConversation(createDefaultCoreState(), {
    id: 'conversation',
    title: 'Room',
    kind: 'chat_channel',
    sourceChannelId: 'channel',
  }).core;
  for (const [id, [metadata]] of Object.entries(cases)) {
    core = upsertCoreTask(core, {
      id,
      title: id,
      conversationId: 'conversation',
      metadata: { source: 'chat-channel', ...metadata },
    }).core;
  }
  const graph = buildWorkGraphProjection(core);
  for (const [id, [, own]] of Object.entries(cases)) {
    const object = graph.objects.find((candidate) => candidate.id === id);
    assert.ok(object, `${id} is in the graph`);
    assert.notEqual(object.productBinding, 'work', `${id} is not bound to Work, so the scope decides`);
    assert.equal(object.ownerManaged, own, id);
  }
});

test("Work already counts every conversation's projected Task and WorkItem as its own", () => {
  // The projection binds each conversation's Task to Work through its WorkItem, and the
  // WorkItem's graph object carries no conversation metadata. So the scope does not decide
  // for either today, whatever the conversation's origin or scope. SPEC-141 leaves that as it
  // is, and this pins it.
  const { state, ids } = fixture();
  const graph = buildWorkGraphProjection(syncCoreStateWithChatState(state, createDefaultCoreState()));
  for (const key of [...ROOMS, ...LANES]) {
    const task = graph.objects.find((object) => object.id === `task-channel-${ids[key]}`);
    const workItem = graph.objects.find((object) => object.id === buildChatWorkItemId(ids[key]));
    assert.equal(task?.ownerManaged, true, `${key}: Task`);
    assert.equal(workItem?.ownerManaged, true, `${key}: WorkItem`);
  }
});

test('the history listing copies the scope beside the origin', () => {
  const { state, ids } = fixture();
  let core = syncCoreStateWithChatState(state, createDefaultCoreState());
  const runFor = (key, metadata) => {
    core = upsertCoreRun(core, {
      id: `run-${key}`,
      title: `Run for ${key}`,
      conversationId: buildChatConversationId(ids[key]),
      taskId: `task-channel-${ids[key]}`,
      status: 'completed',
      createdAt: NOW.toISOString(),
      metadata,
    }, NOW).core;
  };
  runFor('raisedToCode', { source: 'chat-room-workflow', originSurface: 'chat', productScope: 'code' });
  runFor('work', { source: 'chat-room-workflow', originSurface: 'work' });

  const { items } = listExecutionHistory(core, new URLSearchParams({ family: 'run', source: 'all' }));
  const raised = items.find((item) => item.id === 'run-raisedToCode');
  assert.equal(raised.originSurface, 'chat');
  assert.equal(raised.productScope, 'code');
  const older = items.find((item) => item.id === 'run-work');
  assert.equal(older.originSurface, 'work');
  assert.equal(older.productScope, null, 'a record without the copy has none');
});

// ---------------------------------------------------------------------------------------------
// FR-8: tools for code and work
// ---------------------------------------------------------------------------------------------

test("Code's tools go to a conversation whose scope is code or work", () => {
  // PLAN-134 Phase 4 (ADR-149 D5): Work includes Code. Until then this test asserted that only
  // a `code` scope received them.
  const { state, ids, expected } = fixture();
  const enricher = createCodeAgentToolsInvocationEnricher();
  for (const key of [...ROOMS, ...LANES]) {
    const contribution = enricher.enrich(channelOf(state, ids[key]), { context: {} }, { phase: 'session_create' });
    assert.equal(contribution !== null, expected[key] === 'code' || expected[key] === 'work', key);
    if (contribution) {
      assert.ok(contribution.context.labels.includes('product:code'), key);
    }
  }
});

test("a Boss Cat's join request names the scope's product and whether joining brings Code's tools", () => {
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, NOW);
  state = createCat(state, { name: 'Kiki', provider: 'codex' }, NOW);
  const idOf = (name) => state.cats.find((cat) => cat.name === name).id;
  state = createChannel(state, lane(idOf('Boss'), 'chat'), NOW);
  const laneId = state.selectedChannelId;
  const asked = appendMessage(state, laneId, { senderKind: 'user', senderName: 'Owner', body: 'Join them.' }, NOW);
  state = createChannel(asked.state, room('chat', 'Release plan'), NOW);
  const targetId = state.selectedChannelId;
  state = assignCatToChannel(state, targetId, { catId: idOf('Kiki'), provider: 'codex' }, NOW);

  const request = (current) => {
    const posted = postBossCatJoinRequest(current, {
      laneId,
      sourceMessageId: asked.message.id,
      conversationId: targetId,
      bossCatId: idOf('Boss'),
      requestedVia: 'desktop',
      at: NOW,
    });
    assert.ok('requestId' in posted, 'the request is posted');
    const details = readBossCatJoinRequestDetails(posted.state, { laneId, requestId: posted.requestId, now: NOW });
    const notice = channelOf(posted.state, laneId).messages.at(-1);
    return { details, notice };
  };

  const onChat = request(state);
  assert.equal(onChat.details.conversation.surface, 'chat');
  assert.equal(onChat.details.grants.codeTools, false);
  assert.match(JSON.stringify(onChat.notice.metadata), /"surface":"chat"/u);

  const raised = request(raiseChannelProductScope(state, targetId, 'code', LATER));
  assert.equal(raised.details.conversation.surface, 'code');
  assert.equal(raised.details.grants.codeTools, true);
  assert.match(JSON.stringify(raised.notice.metadata), /"surface":"code"/u);

  // Work includes Code (ADR-149 D5, PLAN-134 Phase 4): joining a Work conversation brings them.
  const toWork = request(raiseChannelProductScope(state, targetId, 'work', LATER));
  assert.equal(toWork.details.conversation.surface, 'work');
  assert.equal(toWork.details.grants.codeTools, true);
  const onWork = structuredClone(state);
  channelOf(onWork, targetId).originSurface = 'work';
  delete channelOf(onWork, targetId).productScope;
  assert.equal(request(onWork).details.grants.codeTools, true, 'created on Work');

  // A Code origin and a chat scope, as a lane created on Code keeps after it stops being one:
  // joining brings no Code tools.
  const formerLane = structuredClone(state);
  channelOf(formerLane, targetId).originSurface = 'code';
  const below = request(formerLane);
  assert.equal(below.details.conversation.surface, 'chat');
  assert.equal(below.details.grants.codeTools, false);

  // S4: no recorded origin.
  const legacy = structuredClone(state);
  channelOf(legacy, targetId).originSurface = null;
  delete channelOf(legacy, targetId).productScope;
  const noOrigin = request(legacy);
  assert.equal(noOrigin.details.conversation.surface, 'chat');
  assert.equal(noOrigin.details.grants.codeTools, false);
});

test('the Code session and work-area seams expose the scope beside the origin', async () => {
  const { state, ids, expected } = fixture();
  const store = new MemoryChatStore(state);
  const delegate = createConversationSessionDelegate(store);
  const inspector = createConversationExecutionInspector(store);
  for (const key of [...ROOMS, ...LANES]) {
    let seen = null;
    await delegate.inspect(ids[key], (_core, channel) => {
      seen = channel;
      return true;
    });
    assert.equal(seen?.scope, expected[key], `${key}: session seam`);
    assert.equal(seen?.origin, channelOf(state, ids[key]).originSurface ?? '', `${key}: session seam keeps the origin`);

    const context = await inspector.read(buildChatConversationId(ids[key]));
    assert.equal(context?.scope, expected[key], `${key}: work-area seam`);
    assert.equal(context?.origin, channelOf(state, ids[key]).originSurface ?? '', `${key}: work-area seam keeps the origin`);
  }
});
