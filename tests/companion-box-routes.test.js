import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  createAuthenticatedTestSession,
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
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return {
        segments: [{ kind: 'text', text: 'Purr. I remember the companion box context.', toolName: null, toolId: null }],
        inputTokens: 12,
        outputTokens: 9,
        tokensUsed: 21,
      };
    },
    async closeSession() {},
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-companion-routes-'));
  const now = new Date('2026-03-23T12:00:00.000Z');
  const auth = await createAuthenticatedTestSession({
    now,
    sessionSecret: baseConfig.auth.sessionSecret,
    sessionTtlMs: baseConfig.auth.sessionTtlMs,
  });
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(workingDir, 'platform', 'state', 'chat-state.local.json'),
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
    assert.equal(ingestPayload.canonicalSync.status, 'synced');

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
    assert.equal(patchProfilePayload.canonicalSync.status, 'synced');

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
    const createMemoryPayload = await createMemoryResponse.json();
    assert.equal(createMemoryPayload.canonicalSync.status, 'synced');

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
    assert.ok(sessionContextPayload.sessionContext.retrieval);
    assert.ok(sessionContextPayload.sessionContext.retrieval.hits.length > 0);
    assert.ok(
      sessionContextPayload.sessionContext.ownerNotes.includes(
        'Prefer short meows and purr-like phrasing.',
      ),
    );
  });
});

test('companion source update/delete routes converge canonical retrieval and prune stale source lineage', async () => {
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
        title: 'Morning patrol',
        textContent: 'Companion watches birds by the window every morning.',
        metadata: {
          traits: ['observant'],
        },
      }),
    });
    assert.equal(ingestResponse.status, 201);
    const ingestPayload = await ingestResponse.json();
    assert.equal(ingestPayload.canonicalSync.status, 'synced');

    const createMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'fact',
        content: 'Track the morning patrol habit.',
        sourceIds: [ingestPayload.source.id],
      }),
    });
    assert.equal(createMemoryResponse.status, 201);

    const initialCanonicalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/canonical`);
    const initialCanonicalPayload = await initialCanonicalResponse.json();
    assert.ok(
      initialCanonicalPayload.records.some((record) =>
        record.content.includes('window every morning')
        || record.content.includes('observant'),
      ),
    );

    const updateSourceResponse = await fetch(
      `${baseUrl}/api/cats/${cat.id}/companion-box/sources/${ingestPayload.source.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          textContent: 'Companion now waits on the balcony for pigeon patrol every sunrise.',
          metadata: {
            traits: ['balcony-loving'],
          },
        }),
      },
    );
    assert.equal(updateSourceResponse.status, 200);
    const updateSourcePayload = await updateSourceResponse.json();
    assert.equal(updateSourcePayload.canonicalSync.status, 'synced');

    const updatedCanonicalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/canonical`);
    const updatedCanonicalPayload = await updatedCanonicalResponse.json();
    assert.ok(
      updatedCanonicalPayload.records.some((record) =>
        record.content.includes('balcony')
        || record.content.includes('balcony-loving'),
      ),
    );
    assert.ok(
      updatedCanonicalPayload.records.every((record) =>
        !record.content.includes('window every morning'),
      ),
    );

    const updatedRetrievalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/retrieval-context`);
    assert.equal(updatedRetrievalResponse.status, 200);
    const updatedRetrievalPayload = await updatedRetrievalResponse.json();
    assert.ok(updatedRetrievalPayload.retrieval.facts.some((fact) => fact.includes('balcony')));

    const deleteSourceResponse = await fetch(
      `${baseUrl}/api/cats/${cat.id}/companion-box/sources/${ingestPayload.source.id}`,
      {
        method: 'DELETE',
      },
    );
    assert.equal(deleteSourceResponse.status, 200);
    const deleteSourcePayload = await deleteSourceResponse.json();
    assert.equal(deleteSourcePayload.deleted, true);
    assert.equal(deleteSourcePayload.canonicalSync.status, 'synced');
    assert.ok(deleteSourcePayload.removedDerivedIds.length > 0);
    assert.ok(deleteSourcePayload.prunedMemoryIds.length > 0);

    const sourcesResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/sources`);
    const sourcesPayload = await sourcesResponse.json();
    assert.equal(sourcesPayload.sources.length, 0);

    const memoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/memory`);
    const memoryPayload = await memoryResponse.json();
    assert.deepEqual(memoryPayload.memory[0].sourceIds, []);

    const finalCanonicalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/canonical`);
    const finalCanonicalPayload = await finalCanonicalResponse.json();
    assert.ok(
      finalCanonicalPayload.records.every((record) =>
        !record.content.includes('balcony')
        && !record.content.includes('window every morning'),
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
        originSurface: 'chat',
        roomMode: 'direct_message',
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
    assert.equal(sendMessageResponse.status, 200, await sendMessageResponse.clone().text());
    const sendMessagePayload = await sendMessageResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1, JSON.stringify(sendMessagePayload));
    const createdSession = runtimeClient.createdSessions[0];
    assert.ok(createdSession.context.metadata.companionSession.retrieval);
    assert.ok(createdSession.context.metadata.companionSession.retrieval.hits.length > 0);
    assert.deepEqual(createdSession.skills.requestedSkills, ['companion']);
    assert.equal(
      createdSession.context.metadata.companionSession.responseProfile.expressionMode,
      'animalistic',
    );
    assert.equal(
      createdSession.context.metadata.companionSession.channelContext.channelId,
      channelId,
    );
    assert.equal(
      createdSession.context.metadata.companionSession.hydratedAt,
      '2026-03-23T12:00:00.000Z',
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

    await waitForCondition(
      () => runtimeClient.sentMessages.length === 1,
      { timeoutMs: 1000 },
    );
    const sentMessage = runtimeClient.sentMessages[0];
    assert.equal(
      sentMessage.input.context.metadata.companionSession.channelContext.channelId,
      channelId,
    );
    assert.equal(
      sentMessage.input.context.metadata.companionSession.hydratedAt,
      '2026-03-23T12:00:00.000Z',
    );
    assert.equal(
      sentMessage.input.skills.context.metadata.companionSession.responseProfile.outputMode,
      'text',
    );

    const flushCatMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/flush`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'pre_reset',
      }),
    });
    assert.equal(flushCatMemoryResponse.status, 200);
    const flushCatPayload = await flushCatMemoryResponse.json();
    assert.ok(flushCatPayload.flush.persistedCount > 0);

    const canonicalCatMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/canonical`);
    assert.equal(canonicalCatMemoryResponse.status, 200);
    const canonicalCatPayload = await canonicalCatMemoryResponse.json();
    assert.ok(canonicalCatPayload.records.length > 0);

    const catRetrievalResponse = await fetch(
      `${baseUrl}/api/cats/${cat.id}/memory/retrieval-context?channelId=${channelId}`,
    );
    assert.equal(catRetrievalResponse.status, 200);
    const catRetrievalPayload = await catRetrievalResponse.json();
    assert.ok(catRetrievalPayload.retrieval.hits.length > 0);

    const flushChannelMemoryResponse = await fetch(`${baseUrl}/api/channels/${channelId}/memory/flush`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'pre_compaction',
      }),
    });
    assert.equal(flushChannelMemoryResponse.status, 200);
    const flushChannelPayload = await flushChannelMemoryResponse.json();
    assert.ok(flushChannelPayload.flush.persistedCount > 0);

    const channelRetrievalResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/memory/retrieval-context?catId=${cat.id}`,
    );
    assert.equal(channelRetrievalResponse.status, 200);
    const channelRetrievalPayload = await channelRetrievalResponse.json();
    assert.ok(channelRetrievalPayload.retrieval.hits.length > 0);
  });
});

test('mentioning a companion in a Recents thread hydrates the participant runtime session', async () => {
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
        kind: 'note',
        storageMode: 'uploaded_copy',
        title: 'Favorite toy',
        textContent: 'Companion always brings the red toy mouse back after fetch.',
      }),
    });

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Default thread',
        topic: 'Start default, then bring a companion into the Recents chat.',
        originSurface: 'chat',
        skipBossCatGreeting: true,
        pendingProvider: 'antigravity',
        pendingModel: 'antigravity-default',
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const { channel } = await createChannelResponse.json();
    const channelId = channel.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${cat.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(assignResponse.status, 201);

    const sendMessageResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        body: '@Companion Tell me about your favorite toy.',
      }),
    });
    assert.equal(sendMessageResponse.status, 200, await sendMessageResponse.text());

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shellPayload = await shellResponse.json();
    const selectedChannel = shellPayload.chat.selectedChannel;
    assert.equal(selectedChannel.roomRouting.defaultRecipientId, cat.id);

    const createdSession = runtimeClient.createdSessions.at(-1);
    assert.ok(createdSession);
    assert.equal(createdSession.provider, 'claude');
    assert.equal(createdSession.context.metadata.companionSession.catId, cat.id);
    assert.equal(
      createdSession.context.metadata.companionSession.channelContext.channelId,
      channelId,
    );
    assert.ok(createdSession.context.metadata.companionSession.retrieval);
    assert.equal(
      createdSession.context.metadata.companionSession.retrieval.policy.visibility,
      'shared_room',
    );
    assert.ok(
      createdSession.context.metadata.companionSession.retrieval.excludedMemories.some(
        (record) => record.reason === 'policy_scope',
      ),
    );
  });
});

test('cat memory routes reject cross-subject mutations and accept empty flush bodies', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const { cat } = await createCatResponse.json();

    const createOwnerMemoryResponse = await fetch(`${baseUrl}/api/owner/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'style',
        content: 'Owner prefers concise updates.',
      }),
    });
    assert.equal(createOwnerMemoryResponse.status, 201);
    const { memory: ownerMemory } = await createOwnerMemoryResponse.json();

    const ownerCanonicalResponse = await fetch(`${baseUrl}/api/owner/memory/canonical`);
    assert.equal(ownerCanonicalResponse.status, 200);
    const ownerCanonicalPayload = await ownerCanonicalResponse.json();
    assert.ok(
      ownerCanonicalPayload.records.some((record) =>
        record.origin.kind === 'durable_memory'
        && record.content === 'Owner prefers concise updates.',
      ),
    );

    const createCatMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'fact',
        content: 'Companion keeps a moonlit nap routine by the window.',
      }),
    });
    assert.equal(createCatMemoryResponse.status, 201);
    const { memory: catMemory } = await createCatMemoryResponse.json();

    const initialCatCanonicalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/canonical`);
    assert.equal(initialCatCanonicalResponse.status, 200);
    const initialCatCanonicalPayload = await initialCatCanonicalResponse.json();
    assert.ok(
      initialCatCanonicalPayload.records.some((record) =>
        record.origin.kind === 'durable_memory'
        && record.content === 'Companion keeps a moonlit nap routine by the window.',
      ),
    );

    const initialRetrievalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/retrieval-context`);
    assert.equal(initialRetrievalResponse.status, 200);
    const initialRetrievalPayload = await initialRetrievalResponse.json();
    assert.ok(
      initialRetrievalPayload.retrieval.facts.some((fact) =>
        fact.includes('moonlit nap routine'),
      ),
    );
    assert.ok(
      initialRetrievalPayload.retrieval.ownerProfileHints.some((hint) =>
        hint.includes('concise updates'),
      ),
    );

    const updateResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/${ownerMemory.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: 'Attempted overwrite',
      }),
    });
    assert.equal(updateResponse.status, 404);
    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.error.code, 'memory_not_found');

    const deleteResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/${ownerMemory.id}`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 404);
    const deletePayload = await deleteResponse.json();
    assert.equal(deletePayload.error.code, 'memory_not_found');

    const ownerMemoryResponse = await fetch(`${baseUrl}/api/owner/memory`);
    assert.equal(ownerMemoryResponse.status, 200);
    const ownerMemoryPayload = await ownerMemoryResponse.json();
    assert.equal(ownerMemoryPayload.records.length, 1);
    assert.equal(ownerMemoryPayload.records[0].content, 'Owner prefers concise updates.');

    const updateOwnerMemoryResponse = await fetch(`${baseUrl}/api/owner/memory/${ownerMemory.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: 'Owner now prefers bullet summaries with next steps.',
      }),
    });
    assert.equal(updateOwnerMemoryResponse.status, 200);

    const updatedOwnerCanonicalResponse = await fetch(`${baseUrl}/api/owner/memory/canonical`);
    assert.equal(updatedOwnerCanonicalResponse.status, 200);
    const updatedOwnerCanonicalPayload = await updatedOwnerCanonicalResponse.json();
    const updatedOwnerDurableRecords = updatedOwnerCanonicalPayload.records.filter((record) =>
      record.origin.kind === 'durable_memory',
    );
    assert.equal(updatedOwnerDurableRecords.length, 1);
    assert.equal(
      updatedOwnerDurableRecords[0].content,
      'Owner now prefers bullet summaries with next steps.',
    );

    const updatedRetrievalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/retrieval-context`);
    assert.equal(updatedRetrievalResponse.status, 200);
    const updatedRetrievalPayload = await updatedRetrievalResponse.json();
    assert.ok(
      updatedRetrievalPayload.retrieval.ownerProfileHints.some((hint) =>
        hint.includes('bullet summaries with next steps'),
      ),
    );

    const updateCatMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/${catMemory.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: 'Companion now prefers sunrise window naps instead of moonlit ones.',
      }),
    });
    assert.equal(updateCatMemoryResponse.status, 200);

    const updatedCatCanonicalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/canonical`);
    assert.equal(updatedCatCanonicalResponse.status, 200);
    const updatedCatCanonicalPayload = await updatedCatCanonicalResponse.json();
    const updatedCatDurableRecords = updatedCatCanonicalPayload.records.filter((record) =>
      record.origin.kind === 'durable_memory',
    );
    assert.equal(updatedCatDurableRecords.length, 1);
    assert.equal(
      updatedCatDurableRecords[0].content,
      'Companion now prefers sunrise window naps instead of moonlit ones.',
    );

    const deleteOwnerMemoryResponse = await fetch(`${baseUrl}/api/owner/memory/${ownerMemory.id}`, {
      method: 'DELETE',
    });
    assert.equal(deleteOwnerMemoryResponse.status, 200);

    const emptyOwnerMemoryResponse = await fetch(`${baseUrl}/api/owner/memory`);
    assert.equal(emptyOwnerMemoryResponse.status, 200);
    const emptyOwnerMemoryPayload = await emptyOwnerMemoryResponse.json();
    assert.equal(emptyOwnerMemoryPayload.records.length, 0);

    const emptyOwnerCanonicalResponse = await fetch(`${baseUrl}/api/owner/memory/canonical`);
    assert.equal(emptyOwnerCanonicalResponse.status, 200);
    const emptyOwnerCanonicalPayload = await emptyOwnerCanonicalResponse.json();
    assert.equal(
      emptyOwnerCanonicalPayload.records.filter((record) => record.origin.kind === 'durable_memory').length,
      0,
    );

    const finalRetrievalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/retrieval-context`);
    assert.equal(finalRetrievalResponse.status, 200);
    const finalRetrievalPayload = await finalRetrievalResponse.json();
    assert.equal(
      finalRetrievalPayload.retrieval.ownerProfileHints.some((hint) =>
        hint.includes('bullet summaries with next steps'),
      ),
      false,
    );

    const deleteCatMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/${catMemory.id}`, {
      method: 'DELETE',
    });
    assert.equal(deleteCatMemoryResponse.status, 200);

    const emptyCatCanonicalResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/canonical`);
    assert.equal(emptyCatCanonicalResponse.status, 200);
    const emptyCatCanonicalPayload = await emptyCatCanonicalResponse.json();
    assert.equal(
      emptyCatCanonicalPayload.records.filter((record) => record.origin.kind === 'durable_memory').length,
      0,
    );

    const emptyFlushResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory/flush`, {
      method: 'POST',
    });
    assert.equal(emptyFlushResponse.status, 200);
    const emptyFlushPayload = await emptyFlushResponse.json();
    assert.equal(emptyFlushPayload.flush.reason, 'manual');
  });
});
