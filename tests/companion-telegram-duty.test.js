import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { createCatActorId } from '../build/server/core/actors.js';
import { setCatDirectLanePresence } from '../build/server/products/chat/api/companionPresenceControl.js';
import { reconcileTelegramTransportAfterBindingMutation } from '../build/server/products/chat/api/routeSupport.js';
import { handleTelegramPollingReconnect } from '../build/server/server/routes/telegram.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createCat, createChannel } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/memoryStore.js';
import { createMemoryCompanionActivityStore } from '../build/server/products/chat/companion/activityStore.js';

const NOW = new Date('2026-09-29T14:00:00.000Z');

async function createCompanionLaneStore() {
  let chat = createDefaultChatState();
  chat = createCat(chat, { name: 'Mochi', provider: 'claude', roles: ['companion'] }, NOW);
  const catId = chat.cats.find((cat) => cat.name === 'Mochi').id;
  chat = createCat(chat, { name: 'Loner', provider: 'claude' }, NOW);
  const lonerId = chat.cats.find((cat) => cat.name === 'Loner').id;
  chat = createChannel(chat, {
    title: 'Mochi',
    topic: 'Direct lane',
    originSurface: 'chat',
    roomMode: 'direct_message',
    defaultRecipientId: catId,
    participantCatIds: [catId],
    skipBossCatGreeting: true,
  }, NOW);
  const binding = {
    id: 'bot-binding-mochi',
    platform: 'telegram',
    botName: 'mochi_bot',
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: createCatActorId(catId),
    bossCatActorId: null,
    botToken: 'bot-token',
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: 'direct_message',
    status: 'active',
    outboundFanoutEnabled: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  const chatStore = new MemoryChatStore();
  await chatStore.writeSnapshot(chat, { ...createDefaultCoreState(NOW), botBindings: [binding] });
  return { chatStore, catId, lonerId, laneId: chat.selectedChannelId, binding };
}

function createRuntimeStub() {
  let next = 1;
  return {
    closed: [],
    async createSession(input) {
      return { id: `session-${next++}`, provider: input.provider, model: null, status: 'ready', cwd: null };
    },
    async observeSession(sessionId) {
      return { session: { id: sessionId, status: 'ready' } };
    },
    async closeSession(sessionId) {
      this.closed.push(sessionId);
    },
    async getHealth() {
      return { reachable: true, status: 'ok' };
    },
  };
}

test('/sleep and /wake from a transport share the owner intent the life loop reads', async () => {
  const { chatStore, catId, lonerId } = await createCompanionLaneStore();
  const companionStore = new MemoryCompanionBoxStore();
  const companionActivityStore = createMemoryCompanionActivityStore();
  const dependencies = {
    chatStore,
    runtimeClient: createRuntimeStub(),
    companionStore,
    companionActivityStore,
    config: {},
    mutationGate: { run: (_key, operation) => operation() },
    now: () => NOW,
  };

  assert.deepEqual(await setCatDirectLanePresence(dependencies, catId, 'awake'), { outcome: 'changed' });
  assert.deepEqual(await setCatDirectLanePresence(dependencies, catId, 'awake'), { outcome: 'unchanged' });
  assert.deepEqual(await setCatDirectLanePresence(dependencies, catId, 'sleeping'), { outcome: 'changed' });
  const slept = await companionStore.getLifeProfile(catId);
  assert.ok(slept.sleepUntil && Date.parse(slept.sleepUntil) > NOW.getTime());
  assert.deepEqual(await setCatDirectLanePresence(dependencies, catId, 'sleeping'), { outcome: 'unchanged' });

  assert.deepEqual(await setCatDirectLanePresence(dependencies, catId, 'awake'), { outcome: 'changed' });
  assert.equal((await companionStore.getLifeProfile(catId)).sleepUntil, null);
  assert.deepEqual(
    (await companionActivityStore.list(catId)).map((event) => event.metadata),
    [
      { presence: 'awake', reason: 'owner' },
      { presence: 'sleeping', reason: 'owner' },
      { presence: 'awake', reason: 'owner' },
    ],
  );

  assert.deepEqual(await setCatDirectLanePresence(dependencies, lonerId, 'awake'), { outcome: 'no_lane' });
});

test('a polling consumer restarted after a binding change keeps the transport commands', async () => {
  const { chatStore } = await createCompanionLaneStore();
  const commands = { owns: () => true, handle: async () => null };
  let reconciled = null;
  await reconcileTelegramTransportAfterBindingMutation({
    dependencies: {
      chatStore,
      telegramRelay: {},
      telegramRoomBridge: {},
      memoryService: {},
      runtimeClient: {},
      telegramCommands: commands,
      pollingSupervisor: {
        async reconcilePolling(input) {
          reconciled = input;
        },
      },
    },
  });
  assert.equal(reconciled?.commands, commands);
});

test('a manually reconnected polling consumer keeps the transport commands and /work', async () => {
  const { chatStore, binding } = await createCompanionLaneStore();
  const commands = { owns: () => true, handle: async () => null };
  const goldenPath = { ownsCallback: () => false };
  let reconnected = null;
  const response = {
    statusCode: 0,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end() {},
  };
  await handleTelegramPollingReconnect(response, {
    bindingId: binding.id,
    chatStore,
    telegramRoomBridge: {},
    memoryService: {},
    telegramRelay: {},
    runtimeClient: {},
    commands,
    goldenPath,
    pollingSupervisor: {
      async reconnect(input) {
        reconnected = input;
      },
      getPollingStatus: () => null,
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(reconnected?.commands, commands);
  assert.equal(reconnected?.goldenPath, goldenPath);
});
