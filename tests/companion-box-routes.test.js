import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

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
      const session = {
        id: `session-${nextSession++}`,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? 'C:/chat/runtime',
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return {
        content: 'Purr. I remember the companion box context.',
        inputTokens: 12,
        outputTokens: 9,
        tokensUsed: 21,
      };
    },
    async closeSession() {},
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    chatStore,
    now: () => new Date('2026-03-23T12:00:00.000Z'),
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

test('companion box routes ingest records, persist profile/memory, and expose session context', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        roles: ['companion'],
        skillProfile: 'companion',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const { cat } = await createCatResponse.json();

    const ingestResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'note',
        storageMode: 'uploaded_copy',
        title: 'Favorite blanket',
        textContent: 'Companion always curls up on the blue blanket after lunch.',
        ownerNote: 'Mention this in private chats.',
        metadata: {
          tags: ['blanket', 'routine'],
          traits: ['cozy', 'ritual-loving'],
        },
      }),
    });
    assert.equal(ingestResponse.status, 201);
    const ingestPayload = await ingestResponse.json();
    assert.equal(ingestPayload.source.kind, 'note');
    assert.ok(ingestPayload.derivedRecords.some((record) => record.kind === 'summary'));
    assert.ok(ingestPayload.derivedRecords.some((record) => record.kind === 'traits'));

    const patchProfileResponse = await fetch(
      `${baseUrl}/api/cats/${cat.id}/companion-box/response-profile`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expressionMode: 'animalistic',
          outputMode: 'tts',
          notes: 'Prefer short meows and purr-like phrasing.',
        }),
      },
    );
    assert.equal(patchProfileResponse.status, 200);
    const patchProfilePayload = await patchProfileResponse.json();
    assert.equal(patchProfilePayload.responseProfile.outputMode, 'tts');

    const createMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'fact',
        content: 'Companion likes sunny window naps in the afternoon.',
        summary: 'Sunny nap routine',
        sourceIds: [ingestPayload.source.id],
      }),
    });
    assert.equal(createMemoryResponse.status, 201);

    const summaryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box`);
    assert.equal(summaryResponse.status, 200);
    const summaryPayload = await summaryResponse.json();
    assert.equal(summaryPayload.companionBox.sourceCount, 1);
    assert.equal(summaryPayload.companionBox.memoryCount, 1);
    assert.equal(summaryPayload.companionBox.box.responseProfile.expressionMode, 'animalistic');

    const sessionContextResponse = await fetch(
      `${baseUrl}/api/cats/${cat.id}/companion-box/session-context`,
    );
    assert.equal(sessionContextResponse.status, 200);
    const sessionContextPayload = await sessionContextResponse.json();
    assert.equal(sessionContextPayload.sessionContext.requestedSkills[0], 'companion');
    assert.equal(sessionContextPayload.sessionContext.channelContext.channelId, null);
    assert.ok(
      sessionContextPayload.sessionContext.ownerNotes.includes(
        'Prefer short meows and purr-like phrasing.',
      ),
    );
  });
});

test('direct companion chat routes hydrated companion session context into runtime session create and send', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        roles: ['companion'],
        skillProfile: 'companion',
      }),
    });
    const { cat } = await createCatResponse.json();

    await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'article',
        storageMode: 'imported_copy',
        title: 'Window habits',
        textContent: 'Companion watches birds from the living-room window every morning.',
        metadata: {
          tags: ['birds', 'window'],
        },
      }),
    });
    await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/response-profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expressionMode: 'animalistic',
        notes: 'Keep replies warm and lightly playful.',
      }),
    });

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '',
        topic: 'Private companion lane',
        roomMode: 'direct_cat_chat',
        participantCatIds: [cat.id],
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const sendMessageResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        body: 'How are you feeling today?',
      }),
    });
    assert.equal(sendMessageResponse.status, 200);

    assert.equal(runtimeClient.createdSessions.length, 1);
    const createdSession = runtimeClient.createdSessions[0];
    assert.deepEqual(createdSession.skills.requestedSkills, ['companion']);
    assert.equal(
      createdSession.context.metadata.companionSession.responseProfile.expressionMode,
      'animalistic',
    );
    assert.equal(
      createdSession.context.metadata.companionSession.channelContext.channelId,
      channelId,
    );
    assert.ok(
      createdSession.context.metadata.companionSession.sources.some(
        (record) => record.title === 'Window habits',
      ),
    );
    assert.ok(
      createdSession.skills.context.metadata.companionSession.ownerNotes.includes(
        'Keep replies warm and lightly playful.',
      ),
    );

    assert.equal(runtimeClient.sentMessages.length, 1);
    const sentMessage = runtimeClient.sentMessages[0];
    assert.equal(
      sentMessage.input.context.metadata.companionSession.channelContext.channelId,
      channelId,
    );
    assert.equal(
      sentMessage.input.skills.context.metadata.companionSession.responseProfile.outputMode,
      'text',
    );
  });
});
