import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../build/server/app/server/index.js';
import { createCat } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

function createRuntimeStub() {
  return {
    getHealth: async () => ({ reachable: true, status: 'ok' }),
    routeChannelMessage: async () => ({ summary: 'ok' }),
    getProviderCatalog: async () => ({ providers: [], models: [] }),
  };
}

function createNoopPollingSupervisor() {
  return {
    startPolling: async () => {},
    stopPolling: () => {},
    stopAll: () => {},
    reconnect: async () => {},
    reconcilePolling: async () => {},
    getPollingStatus: () => null,
    getAllPollingStatuses: () => [],
  };
}

function createNoopCommandSurfaceSync() {
  return {
    reconcile: async () => {},
  };
}

function createTestServer(chatStatePath) {
  const chatStore = new MemoryChatStore();
  const runtimeClient = createRuntimeStub();
  const server = createServer({
    shared: {
      config: {
        host: '127.0.0.1',
        port: 0,
        chatStatePath,
        platformId: 'cats-test',
        publicUrl: null,
      },
      runtimeClient,
    },
    chat: {
      chatStore,
      pollingSupervisor: createNoopPollingSupervisor(),
      telegramCommandSurfaceSync: createNoopCommandSurfaceSync(),
    },
  });
  return { server, chatStore };
}

async function withServer(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-telegram-token-uniqueness-'));
  const chatStatePath = path.join(tempDir, 'platform', 'state', 'chat-state.local.json');
  const { server, chatStore } = createTestServer(chatStatePath);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl, chatStore);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function seedBossCat(chatStore) {
  const state = await chatStore.read();
  const nextState = createCat(state, {
    name: 'BossBot',
    provider: 'claude',
    makeBoss: true,
  }, new Date('2026-05-24T12:00:00.000Z'));
  await chatStore.write(nextState);
  const bossCatId = nextState.bossCatId;
  assert.ok(bossCatId, 'seeded Boss Cat should be available');
  return bossCatId;
}

test('duplicate bot token is rejected on create', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const bossCatId = await seedBossCat(chatStore);

    // First binding with a token
    const first = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'bot_one',
        catId: bossCatId,
        botToken: 'test-token-abc123',
      }),
    });
    assert.equal(first.status, 201);

    // Second binding with the same token
    const second = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'bot_two',
        catId: bossCatId,
        botToken: 'test-token-abc123',
      }),
    });
    assert.equal(second.status, 400);
    const body = await second.json();
    assert.ok(body.error?.message?.includes('already used'));
  });
});

test('null tokens do not conflict', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const bossCatId = await seedBossCat(chatStore);

    // Two bindings without tokens
    const first = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'bot_no_token_one',
        catId: bossCatId,
      }),
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'bot_no_token_two',
        catId: bossCatId,
      }),
    });
    assert.equal(second.status, 201);
  });
});

test('duplicate bot token is rejected on update', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const bossCatId = await seedBossCat(chatStore);

    // Create two bindings with different tokens
    const first = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'bot_a',
        catId: bossCatId,
        botToken: 'token-alpha',
      }),
    });
    const firstBody = await first.json();

    const second = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'bot_b',
        catId: bossCatId,
        botToken: 'token-beta',
      }),
    });
    const secondBody = await second.json();

    // Try to update second binding to use first binding's token
    const update = await fetch(`${baseUrl}/api/bot-bindings/${secondBody.botBinding.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botToken: 'token-alpha' }),
    });
    assert.equal(update.status, 400);
    const updateBody = await update.json();
    assert.ok(updateBody.error?.message?.includes('already used'));
  });
});

test('same token on same binding does not conflict on update', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const bossCatId = await seedBossCat(chatStore);

    const first = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'bot_self',
        catId: bossCatId,
        botToken: 'token-self',
      }),
    });
    const firstBody = await first.json();

    // Update the same binding with the same token (no conflict)
    const update = await fetch(`${baseUrl}/api/bot-bindings/${firstBody.botBinding.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botToken: 'token-self' }),
    });
    assert.equal(update.status, 200);
  });
});

test('new binding defaults to polling mode', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const bossCatId = await seedBossCat(chatStore);

    const result = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'poll_bot',
        catId: bossCatId,
        botToken: 'token-poll',
      }),
    });
    assert.equal(result.status, 201);
    const body = await result.json();
    assert.equal(body.botBinding.inboundMode, 'polling');
  });
});

test('binding can be created in webhook mode', async () => {
  await withServer(async (baseUrl, chatStore) => {
    const bossCatId = await seedBossCat(chatStore);

    const result = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'webhook_bot',
        catId: bossCatId,
        botToken: 'token-wh',
        inboundMode: 'webhook',
        webhookSecret: 'my-secret',
      }),
    });
    assert.equal(result.status, 201);
    const body = await result.json();
    assert.equal(body.botBinding.inboundMode, 'webhook');
  });
});
