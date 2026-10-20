/**
 * Non-blocking polling continuation (SPEC-114 FR-14, PLAN-105 Phase 2).
 *
 * Ingress used to await the whole assistant turn before advancing the Telegram
 * offset, so one long provider call stalled the next poll. Telegram is DM-only
 * (SPEC-125 FR-14a): every chat with a bot talks through that bot's cat's DM, so
 * the DM is the bridge's room lock. These tests pin the properties that made it
 * safe to stop awaiting:
 *
 *  - the poll loop keeps receiving while a DM turn is still running;
 *  - another cat's DM makes progress while one DM is stuck; and
 *  - a single DM still processes its updates in arrival order, because the
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
 * A polling harness for one or more bot bindings. Each binding is bound to its
 * own cat, so its chats land in that cat's DM (`dm-<n>`), which is also the
 * bridge's per-room lock key.
 */
function createHarness(options = {}) {
  const bots = (options.bots ?? [{ updates: options.updates ?? [] }]).map((bot, index) => ({
    bindingId: `poll-${index + 1}`,
    botToken: `token-poll-${index + 1}`,
    catId: `cat-${index + 1}`,
    roomId: `dm-${index + 1}`,
    updateQueue: [...(bot.updates ?? [])],
  }));
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
    const bot = bots.find((candidate) => parsed.pathname.startsWith(`/bot${candidate.botToken}/`));
    // getUpdates posts its parameters as a JSON body, so the offset is there.
    pollCalls.push(JSON.parse(init?.body ?? '{}').offset ?? null);
    const batch = bot?.updateQueue.shift() ?? [];
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: batch }),
      text: async () => '',
    };
  };

  // Every cat already has its DM, so the bridge reuses it rather than creating one.
  let roomState = {
    selectedChannelId: bots[0].roomId,
    channels: bots.map((bot) => ({ id: bot.roomId })),
    cats: bots.map((bot, index) => ({ id: bot.catId, name: `Poll Cat ${index + 1}` })),
  };

  const roomBridge = {
    runExclusive: (key, operation) => gate.run(key, operation),
    readState: async () => roomState,
    writeState: async (state) => {
      roomState = state;
      return roomState;
    },
    findReusableRoomId: (_state, input) => (
      bots.find((bot) => bot.catId === input.defaultRecipientId)?.roomId ?? null
    ),
    createRoom: () => {
      throw new Error('every cat already has its DM; creating one means the harness drifted');
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

  const botBindings = bots.map((bot) => ({
    id: bot.bindingId,
    platform: 'telegram',
    botName: `${bot.bindingId}_bot`,
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: `actor-cat-${bot.catId}`,
    bossCatActorId: null,
    botToken: bot.botToken,
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: 'direct_message',
    status: 'active',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  }));

  const telegramRelay = {
    receiveUpdate: ({ update, context }) => {
      const chatId = String(update.message.chat.id);
      const bindingId = context.selectedBotBinding.id;
      return {
        status: 'accepted',
        platform: 'telegram',
        updateId: update.update_id,
        chatId,
        bindingId,
        mappedConversationId: `telegram:${bindingId}:${chatId}`,
        messageId: String(update.message.message_id),
        messageSummary: { textPreview: update.message.text },
        roomRouting: {},
      };
    },
    // Each chat is already linked to its bot's DM, which is also the bridge's
    // per-room lock key — the shape this test is actually about.
    resolveBinding: ({ bindingId }) => {
      const bot = bots.find((candidate) => candidate.bindingId === bindingId);
      return bot ? { linkedRoomId: bot.roomId } : null;
    },
    linkRoom: ({ roomId }) => ({ roomRoutingStatus: 'linked_room', linkedRoomId: roomId }),
    deliver: async ({ request }) => {
      delivered.push(request.text);
      return { status: 'sent' };
    },
    recordBridgeDispatchFailure: () => {},
  };

  const startInputs = bots.map((bot, index) => ({
    bindingId: bot.bindingId,
    botToken: bot.botToken,
    context: {
      bossCatId: 'cat-1',
      bossCatName: 'Poll Cat 1',
      bossCatActorId: 'actor-cat-cat-1',
      botBindings,
      defaultBotBinding: botBindings[0],
      selectedBotBinding: botBindings[index],
    },
    roomBridge,
    memoryService: {},
    runtimeClient: {},
    telegramRelay,
    commands: options.commands ?? null,
  }));

  return {
    fetchImpl,
    pollCalls,
    started,
    finished,
    delivered,
    startInput: startInputs[0],
    startInputs,
  };
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

test('a stuck DM does not block updates for another cat\'s DM', async () => {
  const blocked = createDeferred();
  const harness = createHarness({
    bots: [
      { updates: [[update(1, 11, 'slow')]] },
      { updates: [[update(2, 22, 'fast')]] },
    ],
    holdFor: (marker) => (marker === 'dm-1:slow' ? blocked.promise : null),
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  for (const startInput of harness.startInputs) {
    await supervisor.startPolling(startInput);
  }

  // The second cat's DM finishes while the first is still inside its provider turn.
  await until(() => harness.finished.includes('dm-2:fast'), 'the other DM to finish');
  assert.ok(
    !harness.finished.includes('dm-1:slow'),
    'the slow DM is genuinely still in flight',
  );

  blocked.resolve();
  await until(() => harness.finished.includes('dm-1:slow'), 'the slow DM to finish');

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

  await until(() => harness.started.includes('dm-1:slow'), 'the bridge to start');
  await until(() => harness.pollCalls.includes('2'), 'the offset to advance past the in-flight update');
  assert.ok(!harness.finished.includes('dm-1:slow'), 'and it advanced without waiting');

  blocked.resolve();
  supervisor.stopAll();
  await supervisor.drain();
});

// --- What must not regress -----------------------------------------------------

test('same-DM updates keep arrival order even though dispatch does not await', async () => {
  const first = createDeferred();
  const harness = createHarness({
    updates: [[update(1, 11, 'a'), update(2, 11, 'b'), update(3, 11, 'c')]],
    holdFor: (marker) => (marker === 'dm-1:a' ? first.promise : null),
  });
  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: harness.fetchImpl,
    pollingTimeout: 0,
  });

  await supervisor.startPolling(harness.startInput);

  await until(() => harness.started.includes('dm-1:a'), 'the first update to start');
  assert.deepEqual(
    harness.started,
    ['dm-1:a'],
    'the later updates wait on the room lock rather than interleaving',
  );

  first.resolve();
  await until(() => harness.finished.length === 3, 'all three to finish');
  assert.deepEqual(harness.finished, ['dm-1:a', 'dm-1:b', 'dm-1:c']);

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
  await new Promise((resolve) => setTimeout(resolve, 80));
  // The DM lock alone would also hold the turns back; the ceiling is what keeps
  // the loop from taking the next update off the batch and polling again.
  assert.deepEqual(harness.pollCalls, [null], 'the ceiling holds the loop at one in flight');

  gates.get('dm-1:a').resolve();
  await until(() => harness.started.length === 2, 'the second to be admitted');
  gates.get('dm-1:b').resolve();
  await until(() => harness.started.length === 3, 'the third to be admitted');
  gates.get('dm-1:c').resolve();

  await until(() => harness.finished.length === 3, 'nothing was dropped');
  assert.deepEqual(
    harness.finished,
    ['dm-1:a', 'dm-1:b', 'dm-1:c'],
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
  await until(() => harness.started.includes('dm-1:slow'), 'the bridge to start');
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
  assert.ok(harness.finished.includes('dm-1:slow'));
});

test('a failing bridge does not stop the loop or reject into the process', async () => {
  const harness = createHarness({
    updates: [[update(1, 11, 'boom')], [update(2, 22, 'ok')]],
    holdFor: (marker) => (marker === 'dm-1:boom' ? Promise.reject(new Error('bridge exploded')) : null),
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
    await until(() => harness.finished.includes('dm-1:ok'), 'the later update to still be processed');
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
  await until(() => harness.finished.includes('dm-1:/chat'), 'the room turn to run');

  supervisor.stopAll();
  await supervisor.drain();
});
