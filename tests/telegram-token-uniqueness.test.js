import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../dist-server/app/server/index.js';
import { MemoryChatStore } from '../dist-server/products/chat/state/store.js';

function createRuntimeStub() {
  return {
    getHealth: async () => ({ reachable: true, status: 'ok' }),
    routeChannelMessage: async () => ({ summary: 'ok' }),
    getProviderCatalog: async () => ({ providers: [], models: [] }),
  };
}

function createTestServer() {
  const chatStore = new MemoryChatStore();
  const runtimeClient = createRuntimeStub();
  const server = createServer({
    config: {
      host: '127.0.0.1',
      port: 0,
      chatStatePath: ':memory:',
      suiteId: 'cats-test',
      publicUrl: null,
    },
    runtimeClient,
    chatStore,
  });
  return { server, chatStore };
}

async function withServer(fn) {
  const { server } = createTestServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    server.close();
  }
}

async function setupBossCat(baseUrl) {
  const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ownerDisplayName: 'Owner',
      bossCatName: 'BossBot',
      bossCatProvider: 'claude',
    }),
  });
  assert.equal(setupResponse.status, 200);
  const payload = await setupResponse.json();
  return payload.chat.bossCatId;
}

test('duplicate bot token is rejected on create', async () => {
  await withServer(async (baseUrl) => {
    const bossCatId = await setupBossCat(baseUrl);

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
  await withServer(async (baseUrl) => {
    const bossCatId = await setupBossCat(baseUrl);

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
  await withServer(async (baseUrl) => {
    const bossCatId = await setupBossCat(baseUrl);

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
  await withServer(async (baseUrl) => {
    const bossCatId = await setupBossCat(baseUrl);

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
  await withServer(async (baseUrl) => {
    const bossCatId = await setupBossCat(baseUrl);

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
  await withServer(async (baseUrl) => {
    const bossCatId = await setupBossCat(baseUrl);

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
