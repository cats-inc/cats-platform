/**
 * Non-blocking polling continuation (SPEC-114 FR-14, PLAN-105 Phase 2).
 *
 * Ingress used to await the whole assistant turn before advancing the Telegram
 * offset, so one long provider call froze every other room on that binding and
 * stalled the next poll. These tests pin the two properties that made it safe to
 * stop awaiting:
 *
 *  - unrelated rooms make progress while one room is stuck; and
 *  - a single room still processes its updates in arrival order, because the
 *    room lock inside the bridge is entered synchronously at call time.
 *
 * The second is the one worth guarding. "Don't await" is easy; "don't await and
 * still never reorder a conversation" is the part a future refactor could break
 * without any other test noticing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTelegramPollingSupervisor } from '../build/server/platform/transports/telegram/polling.js';
import { createAsyncKeyedGate } from '../build/server/products/chat/shared/asyncControl.js';

/** Resolves once `predicate()` holds, so tests never sleep a fixed guess. */
async function until(predicate, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * A polling harness whose updates are chat-addressed, so each chat maps to its
 * own room and therefore its own bridge lock.
 */
function createHarness(options = {}) {
  const updateQueue = [...(options.updates ?? [])];
  const pollCalls = [];
  const started = [];
  const finished = [];
  const delivered = [];
  const gate = createAsyncKeyedGate();

  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/deleteWebhook')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, result: true }), text: async () => '' };
    }
    // getUpdates posts its parameters as a JSON body, so the offset is there.
    pollCalls.push(JSON.parse(init?.body ?? '{}').offset ?? null);
    const batch = updateQueue.shift() ?? [];
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: batch }),
      text: async () => '',
    };
  };

  // Every chat used here is already linked to an existing room, so the bridge
  // takes the ordinary "route into a known room" path rather than creating one.
  let roomState = {
    selectedChannelId: 'room-11',
    channels: [{ id: 'room-11' }, { id: 'room-22' }, { id: 'room-33' }],
    cats: [{ id: 'cat-1', name: 'Poll Cat' }],
  };

  const roomBridge = {
    runExclusive: (key, operation) => gate.run(key, operation),
    readState: async () => roomState,
    writeState: async (state) => {
      roomState = state;
      return roomState;
    },
    findReusableRoomId: () => null,
    createRoom: () => {
      throw new Error('these fixtures route into existing rooms; creating one means the harness drifted');
    },
    readRoom: (state, roomId) => ({ id: roomId, title: roomId, messages: [] }),
    buildRecoveryState: ({ state }) => state,
    routeRoomMessage: async ({ state, roomId, body }) => {
      const marker = `${roomId}:${body}`;
      started.push(marker);
      const hold = options.holdFor?.(marker);
      if (hold) {
        await hold;
      }
      finished.push(marker);
      return { state };
    },
  };

  const botBinding = {
    id: 'poll-1',
    platform: 'telegram',
    botName: 'poll_bot',
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: 'actor-cat-cat-1',
    bossCatActorId: null,
    botToken: 'token-poll',
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: 'chat_channel',
    status: 'active',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  };

  const telegramRelay = {
    receiveUpdate: ({ update }) => {
      const chatId = String(update.message.chat.id);
      return {
        status: 'accepted',
        platform: 'telegram',
        updateId: update.update_id,
        chatId,
        bindingId: 'poll-1',
        mappedConversationId: `telegram:poll-1:${chatId}`,
        messageId: String(update.message.message_id),
        messageSummary: { textPreview: update.message.text },
        roomRouting: {},
      };
    },
    // Each chat is already linked to its own room, which is also the bridge's
    // per-room lock key — the shape this test is actually about.
    resolveBinding: ({ chatId }) => (chatId ? { linkedRoomId: `room-${chatId}` } : null),
    linkRoom: ({ roomId }) => ({ roomRoutingStatus: 'linked_room', linkedRoomId: roomId }),
    deliver: async ({ request }) => {
      delivered.push(request.text);
      return { status: 'sent' };
    },
    recordBridgeDispatchFailure: () => {},
  };

  const startInput = {
    bindingId: 'poll-1',
    botToken: 'token-poll',
    context: {
      bossCatId: 'cat-1',
      bossCatName: 'Poll Cat',
      bossCatActorId: 'actor-cat-cat-1',
      botBindings: [botBinding],
      defaultBotBinding: botBinding,
      selectedBotBinding: botBinding,
    },
    roomBridge,
    memoryService: {},
    runtimeClient: {},
    telegramRelay,
    commands: options.commands ?? null,
  };

  return { fetchImpl, pollCalls, started, finished, delivered, startInput };
}

function update(id, chatId, text) {
  return {
    update_id: id,
    message: {
      message_id: id * 10,
      text,
      chat: { id: chatId, type: 'private' },
      from: { id: 900, is_bot: false, first_name: 'Owner' },
      date: 1_756_000_000,
    },
  };
}

// --- The point of the change ---------------------------------------------------

test('a stuck room does not block updates for a different room', async () => {
  const blocked = createDeferred();
  const harness = createHarness({
    updates: [[update(1, 11, 'slow')], [update(2, 22, 'fast')]],
    holdFor: (marker) => (marker === 'room-11:slow' ? blocked.promise : null),
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  await supervisor.startPolling(harness.startInput);

  // Room 22 finishes while room 11 is still inside its provider turn.
  await until(() => harness.finished.includes('room-22:fast'), 'the unrelated room to finish');
  assert.ok(
    !harness.finished.includes('room-11:slow'),
    'the slow room is genuinely still in flight',
  );

  blocked.resolve();
  await until(() => harness.finished.includes('room-11:slow'), 'the slow room to finish');

  supervisor.stopAll();
  await supervisor.drain();
});

test('the next poll is issued while a bridge is still running', async () => {
  const blocked = createDeferred();
  const harness = createHarness({
    updates: [[update(1, 11, 'slow')]],
    holdFor: () => blocked.promise,
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  await supervisor.startPolling(harness.startInput);

  await until(() => harness.started.includes('room-11:slow'), 'the bridge to start');
  await until(() => harness.pollCalls.includes('2'), 'the offset to advance past the in-flight update');
  assert.ok(!harness.finished.includes('room-11:slow'), 'and it advanced without waiting');

  blocked.resolve();
  supervisor.stopAll();
  await supervisor.drain();
});

// --- What must not regress -----------------------------------------------------

test('same-room updates keep arrival order even though dispatch does not await', async () => {
  const first = createDeferred();
  const harness = createHarness({
    updates: [[update(1, 11, 'a'), update(2, 11, 'b'), update(3, 11, 'c')]],
    holdFor: (marker) => (marker === 'room-11:a' ? first.promise : null),
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  await supervisor.startPolling(harness.startInput);

  await until(() => harness.started.includes('room-11:a'), 'the first update to start');
  assert.deepEqual(
    harness.started,
    ['room-11:a'],
    'the later updates wait on the room lock rather than interleaving',
  );

  first.resolve();
  await until(() => harness.finished.length === 3, 'all three to finish');
  assert.deepEqual(harness.finished, ['room-11:a', 'room-11:b', 'room-11:c']);

  supervisor.stopAll();
  await supervisor.drain();
});

test('the in-flight ceiling applies backpressure instead of dropping updates', async () => {
  const gates = new Map();
  const harness = createHarness({
    updates: [[update(1, 11, 'a'), update(2, 22, 'b'), update(3, 33, 'c')]],
    holdFor: (marker) => {
      const deferred = createDeferred();
      gates.set(marker, deferred);
      return deferred.promise;
    },
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
    maxInFlightPerBinding: 1,
  });

  await supervisor.startPolling(harness.startInput);

  await until(() => harness.started.length === 1, 'the first update to start');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(harness.started.length, 1, 'the ceiling holds the loop at one in flight');

  gates.get('room-11:a').resolve();
  await until(() => harness.started.length === 2, 'the second to be admitted');
  gates.get('room-22:b').resolve();
  await until(() => harness.started.length === 3, 'the third to be admitted');
  gates.get('room-33:c').resolve();

  await until(() => harness.finished.length === 3, 'nothing was dropped');
  assert.deepEqual(
    harness.finished.sort(),
    ['room-11:a', 'room-22:b', 'room-33:c'],
    'every update was processed, just later',
  );

  supervisor.stopAll();
  await supervisor.drain();
});

test('drain waits for dispatched work that has not settled', async () => {
  const blocked = createDeferred();
  const harness = createHarness({
    updates: [[update(1, 11, 'slow')]],
    holdFor: () => blocked.promise,
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  await supervisor.startPolling(harness.startInput);
  await until(() => harness.started.includes('room-11:slow'), 'the bridge to start');
  supervisor.stopAll();

  let drained = false;
  const draining = supervisor.drain().then(() => {
    drained = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(drained, false, 'drain does not resolve while work is in flight');

  blocked.resolve();
  await draining;
  assert.equal(drained, true);
  assert.ok(harness.finished.includes('room-11:slow'));
});

test('a failing bridge does not stop the loop or reject into the process', async () => {
  const harness = createHarness({
    updates: [[update(1, 11, 'boom')], [update(2, 22, 'ok')]],
    holdFor: (marker) => (marker === 'room-11:boom' ? Promise.reject(new Error('bridge exploded')) : null),
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);

  try {
    await supervisor.startPolling(harness.startInput);
    await until(() => harness.finished.includes('room-22:ok'), 'the later update to still be processed');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(rejections, [], 'the detached failure was absorbed');
  } finally {
    process.off('unhandledRejection', onRejection);
    supervisor.stopAll();
    await supervisor.drain();
  }
});

// --- Transport commands reach the polling path too (SPEC-114 FR-5) -------------

test('a transport-owned command is answered on long polling, not sent to the room', async () => {
  // Slash commands used to be intercepted in the webhook route only, so on long
  // polling `/status` was forwarded to the assistant as ordinary chat text.
  const handled = [];
  const harness = createHarness({
    updates: [[update(1, 11, '/status')]],
    commands: {
      owns: (text) => text.startsWith('/status'),
      handle: async (input) => {
        handled.push(input.text);
        return { replyText: 'Status: Connected' };
      },
    },
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  await supervisor.startPolling(harness.startInput);
  await until(() => harness.delivered.length === 1, 'the command reply to be delivered');

  assert.deepEqual(handled, ['/status']);
  assert.deepEqual(harness.delivered, ['Status: Connected']);
  assert.deepEqual(harness.started, [], 'the room turn never ran');

  supervisor.stopAll();
  await supervisor.drain();
});

test('a command the port does not own still reaches the room', async () => {
  const harness = createHarness({
    updates: [[update(1, 11, '/chat')]],
    commands: {
      owns: () => false,
      handle: async () => {
        throw new Error('must not be called for an unowned command');
      },
    },
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  await supervisor.startPolling(harness.startInput);
  await until(() => harness.finished.includes('room-11:/chat'), 'the room turn to run');

  supervisor.stopAll();
  await supervisor.drain();
});
