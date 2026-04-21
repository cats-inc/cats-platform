import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTelegramPollingSupervisor,
  telegramDeleteWebhook,
  telegramGetUpdates,
} from '../build/server/platform/transports/telegram/polling.js';

function createMockFetch(responses) {
  let callIndex = 0;
  const calls = [];

  const mockFetch = async (url, options) => {
    calls.push({ url, options });
    if (options?.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    const responseData = callIndex < responses.length
      ? responses[callIndex]
      : responses[responses.length - 1];
    callIndex++;
    return {
      ok: responseData.ok ?? true,
      status: responseData.status ?? 200,
      json: async () => responseData.json ?? { ok: true, result: [] },
      text: async () => responseData.text ?? '',
    };
  };

  return { mockFetch, calls };
}

test('telegramDeleteWebhook calls the correct endpoint', async () => {
  const { mockFetch, calls } = createMockFetch([
    { ok: true, json: { ok: true } },
  ]);
  const result = await telegramDeleteWebhook('test-token-123', mockFetch);
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/deleteWebhook'));
  assert.ok(calls[0].url.includes('test-token-123'));
});

test('telegramDeleteWebhook returns false on error', async () => {
  const { mockFetch } = createMockFetch([
    { ok: false, status: 500, json: { ok: false } },
  ]);
  const result = await telegramDeleteWebhook('bad-token', mockFetch);
  assert.equal(result, false);
});

test('telegramGetUpdates returns updates array', async () => {
  const updates = [
    { update_id: 100, message: { message_id: 1, text: 'hello', chat: { id: 42, type: 'private' } } },
    { update_id: 101, message: { message_id: 2, text: 'world', chat: { id: 42, type: 'private' } } },
  ];
  const { mockFetch, calls } = createMockFetch([
    { ok: true, json: { ok: true, result: updates } },
  ]);
  const controller = new AbortController();
  const result = await telegramGetUpdates('token-abc', 99, 30, controller.signal, mockFetch);
  assert.equal(result.length, 2);
  assert.equal(result[0].update_id, 100);
  assert.equal(result[1].update_id, 101);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/getUpdates'));
});

test('telegramGetUpdates throws on non-ok response', async () => {
  const { mockFetch } = createMockFetch([
    { ok: false, status: 409, text: 'Conflict' },
  ]);
  const controller = new AbortController();
  await assert.rejects(
    () => telegramGetUpdates('token-bad', null, 30, controller.signal, mockFetch),
    (err) => err.message.includes('409'),
  );
});

test('polling supervisor starts, polls, and stops cleanly', async () => {
  const { mockFetch, calls } = createMockFetch([
    // deleteWebhook
    { ok: true, json: { ok: true } },
    // getUpdates returns empty (loop will poll)
    { ok: true, json: { ok: true, result: [] } },
    { ok: true, json: { ok: true, result: [] } },
    { ok: true, json: { ok: true, result: [] } },
  ]);

  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: mockFetch,
    pollingTimeout: 0,
  });

  const mockRelay = {
    receiveUpdate: () => ({ status: 'ignored', platform: 'telegram', roomRouting: {} }),
    resolveBinding: () => null,
  };

  await supervisor.startPolling({
    bindingId: 'b1',
    botToken: 'mock-token',
    context: {
      bossCatId: 'cat-1', bossCatName: 'Cat', bossCatActorId: 'a1',
      botBindings: [], defaultBotBinding: null, selectedBotBinding: null,
    },
    chatStore: { read: async () => ({}), readCore: async () => ({}) },
    runtimeClient: { routeChannelMessage: async () => ({}) },
    telegramRelay: mockRelay,
  });

  // Wait for at least one poll cycle
  await new Promise((resolve) => setTimeout(resolve, 200));

  const status = supervisor.getPollingStatus('b1');
  assert.ok(status);
  assert.equal(status.bindingId, 'b1');
  assert.equal(status.health, 'healthy');
  assert.ok(status.lastPollTime);

  // deleteWebhook was called first
  assert.ok(calls[0].url.includes('/deleteWebhook'));
  // getUpdates was called at least once
  assert.ok(calls.some((c) => c.url.includes('/getUpdates')));

  supervisor.stopAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(supervisor.getPollingStatus('b1')?.health, 'stopped');
});

test('polling supervisor reports all statuses for multiple bindings', async () => {
  const { mockFetch } = createMockFetch([
    { ok: true, json: { ok: true } },
    { ok: true, json: { ok: true, result: [] } },
  ]);

  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: mockFetch,
    pollingTimeout: 0,
  });

  const sharedInput = {
    context: {
      bossCatId: 'cat-1', bossCatName: 'Cat', bossCatActorId: 'a1',
      botBindings: [], defaultBotBinding: null, selectedBotBinding: null,
    },
    chatStore: { read: async () => ({}), readCore: async () => ({}) },
    runtimeClient: { routeChannelMessage: async () => ({}) },
    telegramRelay: { receiveUpdate: () => ({ status: 'ignored' }), resolveBinding: () => null },
  };

  await supervisor.startPolling({ ...sharedInput, bindingId: 'ba', botToken: 'ta' });
  await supervisor.startPolling({ ...sharedInput, bindingId: 'bb', botToken: 'tb' });

  await new Promise((resolve) => setTimeout(resolve, 150));

  const all = supervisor.getAllPollingStatuses();
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((s) => s.bindingId).sort(), ['ba', 'bb']);

  supervisor.stopAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test('reconcilePolling starts polling bindings and ignores webhook bindings', async () => {
  const { mockFetch } = createMockFetch([
    { ok: true, json: { ok: true } },
    { ok: true, json: { ok: true, result: [] } },
  ]);

  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: mockFetch,
    pollingTimeout: 0,
  });

  await supervisor.reconcilePolling({
    bindings: [
      { bindingId: 'poll-1', botToken: 'token-poll', inboundMode: 'polling' },
      { bindingId: 'wh-1', botToken: 'token-wh', inboundMode: 'webhook' },
    ],
    context: {
      bossCatId: 'cat-1', bossCatName: 'Cat', bossCatActorId: 'a1',
      botBindings: [], defaultBotBinding: null, selectedBotBinding: null,
    },
    chatStore: { read: async () => ({}), readCore: async () => ({}) },
    runtimeClient: { routeChannelMessage: async () => ({}) },
    telegramRelay: { receiveUpdate: () => ({ status: 'ignored' }), resolveBinding: () => null },
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(supervisor.getPollingStatus('poll-1'));
  assert.equal(supervisor.getPollingStatus('wh-1'), null);

  supervisor.stopAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test('reconcilePolling forwards fresh scoped context into polling consumers', async () => {
  const { mockFetch } = createMockFetch([
    { ok: true, json: { ok: true } },
    {
      ok: true,
      json: {
        ok: true,
        result: [
          {
            update_id: 777,
            message: {
              message_id: 9,
              text: 'hello from polling',
              chat: { id: 42, type: 'private' },
            },
          },
        ],
      },
    },
    { ok: true, json: { ok: true, result: [] } },
  ]);

  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: mockFetch,
    pollingTimeout: 0,
  });

  let refreshCount = 0;
  const receivedContexts = [];

  await supervisor.reconcilePolling({
    bindings: [
      { bindingId: 'poll-1', botToken: 'token-poll', inboundMode: 'polling' },
    ],
    context: {
      bossCatId: 'stale-boss',
      bossCatName: 'Stale Boss',
      bossCatActorId: 'stale-actor',
      botBindings: [],
      defaultBotBinding: null,
      selectedBotBinding: null,
    },
    refreshContext: async () => {
      refreshCount += 1;
      return {
        bossCatId: 'fresh-boss',
        bossCatName: 'Fresh Boss',
        bossCatActorId: 'fresh-actor',
        botBindings: [
          {
            id: 'poll-1',
            platform: 'telegram',
            botName: 'fresh_bot',
            orchestratorActorId: 'orchestrator',
            catActorId: 'cat-actor-1',
            bossCatActorId: null,
            botToken: 'token-poll',
            webhookSecret: null,
            inboundMode: 'polling',
            roomMode: 'direct_cat_chat',
            status: 'active',
            createdAt: '2026-03-23T00:00:00.000Z',
            updatedAt: '2026-03-23T00:00:00.000Z',
          },
        ],
        defaultBotBinding: null,
        selectedBotBinding: null,
      };
    },
    chatStore: { read: async () => ({}), readCore: async () => ({}) },
    runtimeClient: { routeChannelMessage: async () => ({}) },
    telegramRelay: {
      receiveUpdate: ({ context }) => {
        receivedContexts.push(context);
        return { status: 'ignored', platform: 'telegram', roomRouting: {} };
      },
      resolveBinding: () => null,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(refreshCount >= 1);
  assert.ok(receivedContexts.length >= 1);
  assert.equal(receivedContexts[0].bossCatName, 'Fresh Boss');
  assert.equal(receivedContexts[0].selectedBotBinding?.id, 'poll-1');

  supervisor.stopAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test('polling supervisor reports bridge results for accepted updates', async () => {
  const { mockFetch } = createMockFetch([
    { ok: true, json: { ok: true } },
    {
      ok: true,
      json: {
        ok: true,
        result: [
          {
            update_id: 778,
            message: {
              message_id: 10,
              text: 'wake direct lane',
              chat: { id: 42, type: 'private' },
              from: { id: 7, first_name: 'Kenny' },
            },
          },
        ],
      },
    },
    { ok: true, json: { ok: true, result: [] } },
  ]);

  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: mockFetch,
    pollingTimeout: 0,
  });

  let roomState = {
    selectedChannelId: 'seed',
    channels: [{ id: 'seed' }],
    cats: [{ id: 'cat-1', name: 'Poll Cat' }],
  };
  const bridgeResults = [];
  const roomBridge = {
    readState: async () => roomState,
    writeState: async (state) => {
      roomState = state;
      return roomState;
    },
    findReusableRoomId: () => null,
    createRoom: (state) => ({
      roomId: 'room-poll-1',
      state: {
        ...state,
        selectedChannelId: 'room-poll-1',
        channels: [...state.channels, { id: 'room-poll-1' }],
      },
    }),
    readRoom: (state, roomId) => ({
      id: roomId,
      title: 'Polling room',
      messages: [],
    }),
    routeRoomMessage: async ({ state }) => ({ state }),
    buildRecoveryState: ({ state }) => state,
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
    roomMode: 'direct_cat_chat',
    status: 'active',
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z',
  };

  await supervisor.startPolling({
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
    telegramRelay: {
      receiveUpdate: () => ({
        status: 'accepted',
        platform: 'telegram',
        updateId: 778,
        chatId: '42',
        bindingId: 'poll-1',
        mappedConversationId: 'telegram:poll-1:42',
        messageId: '10',
        messageSummary: { textPreview: 'wake direct lane' },
        roomRouting: {},
      }),
      resolveBinding: () => null,
      linkRoom: ({ roomId }) => ({
        roomRoutingStatus: 'linked_room',
        linkedRoomId: roomId,
      }),
      deliver: async () => ({ status: 'sent' }),
      recordBridgeDispatchFailure: () => {},
    },
    onBridgeResult: (result) => {
      bridgeResults.push(result);
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(bridgeResults.length, 1);
  assert.equal(bridgeResults[0].roomId, 'room-poll-1');
  assert.equal(bridgeResults[0].receipt.roomRouting.linkedRoomId, 'room-poll-1');

  supervisor.stopAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test('stopPolling stops a specific consumer without affecting others', async () => {
  const { mockFetch } = createMockFetch([
    { ok: true, json: { ok: true } },
    { ok: true, json: { ok: true, result: [] } },
  ]);

  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: mockFetch,
    pollingTimeout: 0,
  });

  const sharedInput = {
    context: {
      bossCatId: 'cat-1', bossCatName: 'Cat', bossCatActorId: 'a1',
      botBindings: [], defaultBotBinding: null, selectedBotBinding: null,
    },
    chatStore: { read: async () => ({}), readCore: async () => ({}) },
    runtimeClient: { routeChannelMessage: async () => ({}) },
    telegramRelay: { receiveUpdate: () => ({ status: 'ignored' }), resolveBinding: () => null },
  };

  await supervisor.startPolling({ ...sharedInput, bindingId: 'keep', botToken: 'tk' });
  await supervisor.startPolling({ ...sharedInput, bindingId: 'stop', botToken: 'ts' });

  await new Promise((resolve) => setTimeout(resolve, 150));

  supervisor.stopPolling('stop');
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(supervisor.getPollingStatus('stop')?.health, 'stopped');
  assert.notEqual(supervisor.getPollingStatus('keep')?.health, 'stopped');

  supervisor.stopAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test('reconcilePolling restarts a consumer when its bot token changes', async () => {
  const { mockFetch, calls } = createMockFetch([
    { ok: true, json: { ok: true } },
    { ok: true, json: { ok: true, result: [] } },
    { ok: true, json: { ok: true } },
    { ok: true, json: { ok: true, result: [] } },
  ]);

  const supervisor = createTelegramPollingSupervisor({
    fetchImpl: mockFetch,
    pollingTimeout: 0,
  });

  const reconcileInput = {
    context: {
      bossCatId: 'cat-1',
      bossCatName: 'Cat',
      bossCatActorId: 'a1',
      botBindings: [],
      defaultBotBinding: null,
      selectedBotBinding: null,
    },
    chatStore: { read: async () => ({}), readCore: async () => ({}) },
    runtimeClient: { routeChannelMessage: async () => ({}) },
    telegramRelay: { receiveUpdate: () => ({ status: 'ignored' }), resolveBinding: () => null },
  };

  await supervisor.reconcilePolling({
    ...reconcileInput,
    bindings: [
      { bindingId: 'poll-1', botToken: 'token-old', inboundMode: 'polling' },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 150));

  await supervisor.reconcilePolling({
    ...reconcileInput,
    bindings: [
      { bindingId: 'poll-1', botToken: 'token-new', inboundMode: 'polling' },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 150));

  supervisor.stopAll();
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.ok(calls.some((call) => call.url.includes('bottoken-old/deleteWebhook')));
  assert.ok(calls.some((call) => call.url.includes('bottoken-new/deleteWebhook')));
  assert.ok(calls.some((call) => call.url.includes('bottoken-old/getUpdates')));
  assert.ok(calls.some((call) => call.url.includes('bottoken-new/getUpdates')));
});
