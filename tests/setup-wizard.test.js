import assert from 'node:assert/strict';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';
import { resolveOrchestratorDisplayName } from '../dist-server/chat/model.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  let nextSession = 1;
  return {
    createdSessions: [],
    sentMessages: [],
    closedSessions: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
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
        models: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        warnings: [],
      };
    },
    async createSession(input) {
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(tmpdir(), '.cats-runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        content: 'Acknowledged.',
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient,
      now: () => new Date('2026-03-19T00:00:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/app-shell returns setupCompleteAt: null for uninitialized chat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.ownerDisplayName, 'Owner');
    assert.equal(payload.chat.bossCatId, null);
  });
});

test('POST /api/setup/complete creates Boss Cat and marks setup done without creating a channel', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
        bossCatInstance: 'native',
        bossCatModel: 'claude-opus-4-6',
      }),
    });
    assert.equal(response.status, 200);

    const payload = await response.json();

    // Setup is marked complete
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.ownerDisplayName, 'Kenny');

    // Boss Cat was created
    assert.ok(payload.chat.bossCatId);
    assert.ok(payload.chat.cats.length >= 1);
    const bossCat = payload.chat.cats.find((p) => p.id === payload.chat.bossCatId);
    assert.equal(bossCat?.defaultExecutionTarget.instance, 'native');

    // No channel created — user navigates to New Chat instead
    assert.equal(payload.chat.channels.length, 0);
    assert.equal(payload.chat.selectedChannelId, '');

    // Orchestrator executionTarget matches Boss Cat config
    const orch = payload.chat.globalOrchestrator;
    assert.equal(orch.executionTarget.provider, 'claude');
    assert.equal(orch.executionTarget.instance, 'native');
    assert.equal(orch.executionTarget.model, 'claude-opus-4-6');
  });
});

test('POST /api/setup/complete returns 409 if setup already completed', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first time
    const first = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(first.status, 200);

    // Try again
    const second = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Other',
        bossCatName: 'Other',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(second.status, 409);
  });
});

test('after setup complete, GET /api/app-shell reflects initialized state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup
    await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });

    // Verify app-shell reflects setup
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.ok(payload.chat.bossCatId);
    assert.equal(payload.chat.channels.length, 0);
  });
});

test('POST /api/setup/reset clears setup state and returns clean chat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    // Reset
    const resetResponse = await fetch(`${baseUrl}/api/setup/reset`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    assert.equal(resetResponse.status, 200);

    const payload = await resetResponse.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.ownerDisplayName, 'Owner');
    assert.equal(payload.chat.bossCatId, null);
    assert.deepEqual(payload.chat.cats, []);
    assert.deepEqual(payload.chat.channels, []);
  });
});

test('POST /api/setup/complete defaults Boss Cat name to Boss Cat if empty', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: '',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    const bossCat = payload.chat.cats.find(
      (p) => p.id === payload.chat.bossCatId,
    );
    assert.ok(bossCat);
    assert.equal(bossCat.name, 'Boss Cat');
  });
});

test('resolveOrchestratorDisplayName returns boss cat name when set, Orchestrator when null', () => {
  const state = {
    id: 'default',
    name: 'Chat',
    selectedChannelId: '',
    bossCatId: 'cat-1',
    cats: [
      { id: 'cat-1', name: '將將', roles: [], skillProfile: null, mcpProfile: null, status: 'active', createdAt: '', updatedAt: '', archivedAt: null, defaultExecutionTarget: { provider: 'claude', instance: null, model: null }, memory: { updatedAt: null, content: null } },
    ],
    channels: [],
    globalOrchestrator: { mode: 'global', status: 'ready', executionTarget: { provider: 'claude', instance: null, model: null }, systemPrompt: '', skillProfile: null, mcpProfile: null, telegramBotName: null, updatedAt: '' },
    capabilities: { maxChannels: 50, maxCatsPerChannel: 10, supportedProviders: [] },
  };

  assert.equal(resolveOrchestratorDisplayName(state), '將將');

  // When bossCatId is null, falls back to 'Orchestrator'
  const stateNoBoss = { ...state, bossCatId: null };
  assert.equal(resolveOrchestratorDisplayName(stateNoBoss), 'Orchestrator');

  // When bossCatId points to a missing cat, falls back to 'Orchestrator'
  const stateMissing = { ...state, bossCatId: 'nonexistent' };
  assert.equal(resolveOrchestratorDisplayName(stateMissing), 'Orchestrator');
});

test('after setup + activate, system messages stay generic and keep verbosity metadata', async () => {
  const runtimeClient = createRuntimeStub();
  await withServer(runtimeClient, async (baseUrl) => {
    // Complete setup with a named Boss Cat
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: '將將',
        bossCatProvider: 'claude',
        bossCatInstance: 'native',
      }),
    });
    assert.equal(setupResponse.status, 200);

    // Create a channel explicitly (setup no longer creates one)
    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Test chat', topic: 'Test' }),
    });
    assert.ok(createResponse.status === 200 || createResponse.status === 201);
    const createPayload = await createResponse.json();
    const channelId = createPayload.chat?.selectedChannelId ?? createPayload.channel?.id;

    // Activate channel sessions
    const activateResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/activations`,
      { method: 'POST' },
    );
    assert.equal(activateResponse.status, 200);

    // Fetch the channel to inspect messages
    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    const messages = channelPayload.channel.messages;

    // Find session_started system messages
    const sessionStartedMessages = messages.filter(
      (m) => m.metadata?.event === 'session_started',
    );
    assert.equal(
      sessionStartedMessages.length,
      1,
      'Fresh Boss Cat chat should start one implicit orchestrator session',
    );

    // Solo-room orchestrator startup stays generic and hidden from the visible cat identity.
    const orchMessage = sessionStartedMessages.find(
      (m) => m.metadata.targetKind === 'orchestrator',
    );
    assert.ok(orchMessage, 'Orchestrator session_started message should exist');
    assert.ok(orchMessage.body.includes('Orchestrator'), 'Should use generic orchestrator label in solo rooms');
    assert.ok(!orchMessage.body.includes('將將'), 'Should not expose boss cat name in solo session messages');
    assert.ok(
      /\n\(cwd: .*\.cats-runtime[\\/]sessions[\\/].+\)/u.test(orchMessage.body),
      'Should include runtime cwd in the session message',
    );

    // All session_started messages should have verbosity: 'verbose'
    for (const msg of sessionStartedMessages) {
      assert.equal(msg.metadata.verbosity, 'verbose', `session_started message should have verbosity: verbose`);
    }

    // session_start_failed messages (if any) should NOT have verbosity
    const failedMessages = messages.filter(
      (m) => m.metadata?.event === 'session_start_failed',
    );
    for (const msg of failedMessages) {
      assert.equal(msg.metadata.verbosity, undefined, 'session_start_failed should not have verbosity');
    }

    assert.equal(runtimeClient.createdSessions[0]?.instance, 'native');
  });
});

test('orchestrator self-routing draft is rewritten before it reaches the transcript', async () => {
  const runtimeClient = createRuntimeStub();
  let sendCount = 0;
  runtimeClient.sendMessage = async (sessionId, content) => {
    runtimeClient.sentMessages.push({ sessionId, content });
    sendCount += 1;

    if (sendCount === 1) {
      return {
        content: '@Smelly, the user is asking for a joke (in Chinese). Go ahead and tell them one!',
        inputTokens: 10,
        outputTokens: 12,
        tokensUsed: 22,
      };
    }

    return {
      content: '有一天兩隻貓在比誰比較會寫程式，結果其中一隻說：「我不是 bug，我是 feature 喵。」',
      inputTokens: 9,
      outputTokens: 20,
      tokensUsed: 29,
    };
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    // Create a channel explicitly (setup no longer creates one)
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Test chat', topic: 'Test' }),
    });
    assert.ok(createChannelResponse.status === 200 || createChannelResponse.status === 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.chat?.selectedChannelId ?? createChannelPayload.channel?.id;

    const activateResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/activations`,
      { method: 'POST' },
    );
    assert.equal(activateResponse.status, 200);

    const messageResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: '講個笑話' }),
    });
    assert.equal(messageResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    const latestMessage = channelPayload.channel.messages.at(-1);

    assert.ok(latestMessage, 'Final transcript message should exist');
    assert.equal(latestMessage.senderKind, 'agent');
    assert.equal(latestMessage.senderName, 'Orchestrator');
    assert.ok(
      !latestMessage.body.includes('@Smelly'),
      'Self-routing draft should not reach the user transcript',
    );
    assert.ok(
      latestMessage.body.includes('feature 喵'),
      'Rewritten direct answer should be persisted instead',
    );
    assert.equal(runtimeClient.sentMessages.length, 2);
  });
});

test('POST /api/channels seeds Boss Cat greeting without assigning Boss Cat as a worker', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);
    const setupPayload = await setupResponse.json();
    const bossCatId = setupPayload.chat.bossCatId;

    // Create a new channel with no cats
    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Auto Chat', topic: 'Testing auto-assign' }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();

    // Boss Cat should stay implicit instead of becoming an assigned worker.
    assert.equal(
      createPayload.channel.assignedCats.some((p) => p.catId === bossCatId),
      false,
      'Boss Cat should stay implicit in the new channel',
    );

    // Greeting message should exist
    const greeting = createPayload.channel.messages.find(
      (m) => m.senderKind === 'orchestrator' && m.senderName === 'Smelly',
    );
    assert.ok(greeting, 'Boss Cat greeting message should exist');
    assert.ok(greeting.body.includes('Smelly'));
  });
});

test('POST /api/channels can skip Boss Cat greeting for the first optimistic user turn', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'First turn',
        topic: 'Send before any greeting',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createResponse.status, 201);

    const createPayload = await createResponse.json();
    assert.equal(createPayload.channel.messages.length, 0);
    assert.equal(
      createPayload.channel.messages.some(
        (m) => m.senderKind === 'orchestrator' && m.senderName === 'Smelly',
      ),
      false,
    );
  });
});

test('POST /api/channels does NOT auto-assign when cats are explicitly provided', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);
    const setupPayload = await setupResponse.json();
    const bossCatId = setupPayload.chat.bossCatId;

    // Create a new channel with explicit cats
    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Custom Chat',
        topic: 'Testing explicit cats',
        cats: [{ name: 'Custom-Agent', provider: 'gemini', roles: ['coder'] }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();

    // Boss Cat should NOT be auto-assigned (explicit cats provided)
    const hasBossCat = createPayload.channel.assignedCats.some((p) => p.catId === bossCatId);
    assert.equal(hasBossCat, false, 'Boss Cat should not be auto-assigned when cats are explicitly provided');

    // Should have the explicit cat instead
    assert.ok(
      createPayload.channel.assignedCats.some((p) => p.name === 'Custom-Agent'),
      'Explicit cat should be assigned',
    );
    assert.equal(
      createPayload.channel.messages.some(
        (m) => m.senderKind === 'orchestrator' && m.senderName === 'Smelly',
      ),
      false,
      'Boss Cat greeting should not be injected when explicit cats are provided',
    );
  });
});

test('Boss Cat cannot be assigned as a regular chat participant', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);
    const setupPayload = await setupResponse.json();
    const bossCatId = setupPayload.chat.bossCatId;

    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Manual Assign', topic: 'Should reject Boss Cat assignment' }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    const channelId = createPayload.channel.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${bossCatId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'claude' }),
    });
    assert.equal(assignResponse.status, 400);

    const assignPayload = await assignResponse.json();
    assert.equal(assignPayload.error.code, 'bad_request');
    assert.equal(assignPayload.error.message, 'Boss Cat is already the default chat entrypoint');
  });
});
