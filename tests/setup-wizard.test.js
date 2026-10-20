import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { resolveOrchestratorDisplayName } from '../build/server/products/chat/state/model/index.js';
import {
  createUnprovisionedTestSession,
  TEST_ADMIN_CREDENTIALS,
  createTestAuthConfig,
  installAuthenticatedFetch,
  waitForCondition,
} from './testUtils.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  auth: createTestAuthConfig(),
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
        cwd: input.cwd ?? path.join(tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        segments: [{ kind: 'text', text: 'Acknowledged.', toolName: null, toolId: null }],
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
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'cats-platform-setup-wizard-'));
  const chatStatePath = path.join(tempRoot, 'state', 'chat-state.local.json');
  await mkdir(path.dirname(chatStatePath), { recursive: true });
  const now = new Date('2026-03-19T00:00:00.000Z');
  const auth = createUnprovisionedTestSession({ now });

  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath,
      },
      runtimeClient,
      authStore: auth.authStore,
      now: () => now,
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

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const restoreFetch = installAuthenticatedFetch(baseUrl, auth, {
    origin: 'http://127.0.0.1:8181',
  });
  try {
    await callback(baseUrl);
  } finally {
    restoreFetch();
    server.close();
    await once(server, 'close');
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Setup no longer creates a Boss Cat, so tests that need one make it through
 * the same API the product uses.
 */
/**
 * These fixtures start without an Admin, so a test that calls protected chat
 * routes has to complete setup first: that is what mints its session.
 */
async function completePlatformSetup(baseUrl) {
  const response = await fetch(`${baseUrl}/api/platform/setup/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...TEST_ADMIN_CREDENTIALS,
      ownerDisplayName: 'Kenny',
      bossCatProvider: 'claude',
    }),
  });
  if (response.status !== 200) {
    throw new Error(`completePlatformSetup failed with ${response.status}`);
  }
  return response.json();
}

async function rememberNewChatDefault(baseUrl, newChatDefaults) {
  const response = await fetch(`${baseUrl}/api/preferences`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newChatDefaults }),
  });
  if (response.status !== 200) {
    throw new Error(`rememberNewChatDefault failed with ${response.status}`);
  }
}

async function createBossCat(baseUrl, name = 'Smelly') {
  const response = await fetch(`${baseUrl}/api/cats`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
      group: 'admin',
    }),
  });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`createBossCat failed with ${response.status}`);
  }
  return (await response.json()).cat;
}

test('GET /api/app-shell returns setupCompleteAt: null for uninitialized chat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.ownerDisplayName, 'Owner');
    assert.equal(payload.chat.cats.some((cat) => cat.group === 'admin'), false);
  });
});

test('POST /api/platform/setup/complete returns 409 if setup already completed', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first time
    const first = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(first.status, 200);

    // Try again
    const second = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Other',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(second.status, 409);
  });
});

test('after setup complete, GET /api/app-shell reflects initialized state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup
    await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
      }),
    });
    await createBossCat(baseUrl);

    // Verify app-shell reflects setup
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.ok(payload.chat.cats.some((cat) => cat.group === 'admin'));
    assert.equal(payload.chat.channels.length, 0);
  });
});

test('POST /api/setup/reset clears setup state and returns clean chat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
      }),
    });
    await createBossCat(baseUrl);
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
    assert.equal(payload.chat.cats.some((cat) => cat.group === 'admin'), false);
    assert.deepEqual(payload.chat.cats, []);
    assert.deepEqual(payload.chat.channels, []);
  });
});

test('resolveOrchestratorDisplayName uses the first active Boss Cat, Orchestrator otherwise', () => {
  const cat = (id, name, group) => ({ id, name, group, roles: [], skillProfile: null, mcpProfile: null, status: 'active', createdAt: '', updatedAt: '', archivedAt: null, defaultExecutionTarget: { provider: 'claude', instance: null, model: null }, memory: { updatedAt: null, content: null } });
  const state = {
    id: 'default',
    name: 'Chat',
    selectedChannelId: '',
    cats: [cat('cat-0', 'Helper', 'standard'), cat('cat-1', '將將', 'admin')],
    channels: [],
    globalOrchestrator: { mode: 'global', status: 'ready', executionTarget: { provider: 'claude', instance: null, model: null }, systemPrompt: '', skillProfile: null, mcpProfile: null, telegramBotName: null, updatedAt: '' },
    capabilities: { maxChannels: 50, maxCatsPerChannel: 10, supportedProviders: [] },
  };

  assert.equal(resolveOrchestratorDisplayName(state), '將將');

  const stateNoBoss = { ...state, cats: [cat('cat-0', 'Helper', 'standard')] };
  assert.equal(resolveOrchestratorDisplayName(stateNoBoss), 'Orchestrator');
});

test('after setup + activate, system messages stay generic and keep verbosity metadata', async () => {
  const runtimeClient = createRuntimeStub();
  await withServer(runtimeClient, async (baseUrl) => {
    // Complete setup with a named Boss Cat
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
        bossCatInstance: 'native',
      }),
    });
    await createBossCat(baseUrl);
    await rememberNewChatDefault(baseUrl, { provider: 'claude', instance: 'native' });
    assert.equal(setupResponse.status, 200);

    // Create a channel explicitly (setup no longer creates one)
    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Test chat', topic: 'Test', originSurface: 'chat' }),
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
      'A fresh chat should start its default participant session',
    );

    // The default participant starts under its execution label, not a Boss Cat identity.
    const participantMessage = sessionStartedMessages.find(
      (m) => m.metadata.targetKind === 'cat',
    );
    assert.ok(participantMessage, 'Default participant session_started message should exist');
    assert.ok(participantMessage.body.includes('Claude-CLI'), 'Should use the execution label of the default participant');
    assert.ok(!participantMessage.body.includes('Orchestrator'), 'Should not expose the internal orchestrator placeholder');
    assert.ok(!participantMessage.body.includes('Smelly'), 'Should not expose the Boss Cat name in the session message');
    assert.ok(
      /\n\(cwd: .*[\\/]\.cats[\\/]runtime[\\/]sessions[\\/].+\)/u.test(participantMessage.body),
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

test('POST /api/channels starts a chat with its default participant instead of the Boss Cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
      }),
    });
    const bossCat = await createBossCat(baseUrl);
    assert.equal(setupResponse.status, 200);
    const bossCatId = bossCat.id;

    // Create a new channel with no cats
    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Auto Chat', topic: 'Testing auto-assign', originSurface: 'chat' }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();

    // The Boss Cat joins only when named; the remembered default participant starts the chat.
    assert.equal(
      createPayload.channel.assignedCats.some((p) => p.catId === bossCatId),
      false,
      'Boss Cat should not join the new channel unasked',
    );
    assert.deepEqual(
      createPayload.channel.assignedParticipants.map((participant) => participant.name),
      ['Codex-CLI'],
    );
    assert.equal(
      createPayload.channel.coordinatorParticipantId,
      createPayload.channel.assignedParticipants[0].participantId,
    );

    // A new chat seeds only the room_created system message.
    const roomCreated = createPayload.channel.messages.find(
      (m) => m.metadata?.event === 'room_created',
    );
    assert.ok(roomCreated, 'A new chat should seed a room_created system message');
    assert.equal(roomCreated.body, 'Room created: participant-led chat with Codex-CLI.');
    assert.equal(roomCreated.metadata.roomMode, 'chat_channel');
    assert.equal(
      createPayload.channel.messages.some(
        (m) => m.senderKind === 'orchestrator' && m.senderName === 'Smelly',
      ),
      false,
      'Default Boss Chat should not inject a Boss Cat greeting bubble',
    );
  });
});

test('POST /api/channels seeds only the room_created system message, with no Boss Cat greeting', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
      }),
    });
    await createBossCat(baseUrl);
    assert.equal(setupResponse.status, 200);

    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'First turn',
        topic: 'Send before any greeting',
        originSurface: 'chat',
      }),
    });
    assert.equal(createResponse.status, 201);

    const createPayload = await createResponse.json();
    assert.equal(createPayload.channel.messages.length, 1);
    assert.equal(createPayload.channel.messages[0]?.metadata?.event, 'room_created');
    assert.equal(
      createPayload.channel.messages.some(
        (m) => m.senderKind === 'orchestrator' && m.senderName === 'Smelly',
      ),
      false,
    );
  });
});

test('POST /api/channels treats explicit default entry as default even with participants', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await completePlatformSetup(baseUrl);
    const createBossResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Smelly',
        provider: 'claude',
        group: 'admin',
      }),
    });
    assert.equal(createBossResponse.status, 201);

    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Default With Participant',
        topic: 'Contradictory creation input should stay default for greetings.',
        originSurface: 'chat',
        entryKind: 'default',
        cats: [{ name: 'Custom-Agent', provider: 'antigravity', roles: ['coder'] }],
      }),
    });
    assert.equal(createResponse.status, 201);

    const createPayload = await createResponse.json();
    assert.equal(createPayload.channel.messages.length, 1);
    assert.equal(createPayload.channel.messages[0]?.metadata?.event, 'room_created');
    assert.equal(
      createPayload.channel.messages.some(
        (m) => m.senderKind === 'orchestrator' && m.senderName === 'Smelly',
      ),
      false,
      'Explicit default creation should not inject a Boss Cat greeting bubble',
    );
  });
});

test('POST /api/channels does NOT auto-assign when cats are explicitly provided', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await completePlatformSetup(baseUrl);
    const createBossResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Smelly',
        provider: 'claude',
        group: 'admin',
      }),
    });
    assert.equal(createBossResponse.status, 201);
    const createBossPayload = await createBossResponse.json();
    const bossCatId = createBossPayload.cat.id;

    // Create a new channel with explicit cats
    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Custom Chat',
        topic: 'Testing explicit cats',
        originSurface: 'chat',
        cats: [{ name: 'Custom-Agent', provider: 'antigravity', roles: ['coder'] }],
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

test('A Boss Cat joins a conversation as an ordinary participant', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...TEST_ADMIN_CREDENTIALS,
        ownerDisplayName: 'Kenny',
        bossCatProvider: 'claude',
      }),
    });
    const bossCat = await createBossCat(baseUrl);
    assert.equal(setupResponse.status, 200);
    const bossCatId = bossCat.id;

    const createResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Manual Assign', topic: 'Boss Cat joins as a participant', originSurface: 'chat' }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    const channelId = createPayload.channel.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${bossCatId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'claude' }),
    });
    assert.equal(assignResponse.status, 201);

    const assignPayload = await assignResponse.json();
    assert.equal(assignPayload.cat.catId, bossCatId);
    assert.equal(assignPayload.cat.status, 'active');
  });
});
