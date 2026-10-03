import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createCat,
  createChannel,
  findReusableDirectLaneForCreate,
  setChannelStatus,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  createAuthenticatedTestSession,
  createTestAuthConfig,
  installAuthenticatedFetch,
} from './testUtils.js';

function createStateWithCats() {
  let state = createDefaultChatState();
  for (const name of ['Milo', 'Mochi']) {
    state = createCat(state, {
      name,
      provider: 'claude',
      instance: null,
      model: 'claude-sonnet-4',
      products: ['chat'],
    });
  }
  const idOf = (name) => state.cats.find((cat) => cat.name === name).id;
  return { state, miloId: idOf('Milo'), mochiId: idOf('Mochi') };
}

function directLaneInput(catId, overrides = {}) {
  return {
    title: '',
    topic: 'Hello',
    originSurface: 'chat',
    roomMode: 'direct_message',
    defaultRecipientId: catId,
    participantCatIds: [catId],
    skipBossCatGreeting: true,
    ...overrides,
  };
}

test('a one-to-one direct message create reuses the Cat\'s existing lane', () => {
  const { state, miloId } = createStateWithCats();
  const withLane = createChannel(state, directLaneInput(miloId), new Date('2026-10-03T00:00:00Z'));
  const laneId = withLane.channels[0].id;

  assert.equal(findReusableDirectLaneForCreate(withLane, directLaneInput(miloId))?.id, laneId);
  assert.equal(
    findReusableDirectLaneForCreate(withLane, {
      title: '',
      topic: 'Hello',
      originSurface: 'work',
      entryKind: 'direct',
      participantCatIds: [miloId],
    })?.id,
    laneId,
    'entryKind=direct without roomMode and without defaultRecipientId still targets the lane',
  );
});

test('direct message creates that are not one-to-one, or have no live lane, create a room', () => {
  const { state, miloId, mochiId } = createStateWithCats();

  assert.equal(findReusableDirectLaneForCreate(state, directLaneInput(miloId)), null, 'no lane yet');

  const withLane = createChannel(state, directLaneInput(miloId), new Date('2026-10-03T00:00:00Z'));
  const laneId = withLane.channels[0].id;

  assert.equal(
    findReusableDirectLaneForCreate(withLane, directLaneInput(miloId, { participantCatIds: [miloId, mochiId] })),
    null,
    'another Cat in the request',
  );
  assert.equal(
    findReusableDirectLaneForCreate(withLane, directLaneInput(miloId, {
      temporaryParticipants: [{ participantId: 'temp-1', name: 'Helper', provider: 'claude' }],
    })),
    null,
    'a temporary participant in the request',
  );
  assert.equal(
    findReusableDirectLaneForCreate(withLane, directLaneInput(miloId, { roomMode: 'chat_channel' })),
    null,
    'not a direct message',
  );
  assert.equal(findReusableDirectLaneForCreate(withLane, directLaneInput(mochiId)), null, 'a different Cat');

  const archived = setChannelStatus(withLane, laneId, 'archived');
  assert.equal(findReusableDirectLaneForCreate(archived, directLaneInput(miloId)), null, 'archived lane');
});

test('POST /api/channels returns the existing direct lane instead of creating a second one', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-direct-lane-reuse-'));
  const now = new Date('2026-10-03T00:00:00.000Z');
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({
    now,
    sessionSecret: authConfig.sessionSecret,
    sessionTtlMs: authConfig.sessionTtlMs,
  });
  const chatStore = new MemoryChatStore();
  const config = {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    auth: authConfig,
    chatStatePath: path.join(workingDir, 'platform', 'state', 'chat-state.local.json'),
  };
  const server = createServer({
    shared: { config, runtimeClient: {}, authStore: auth.authStore, now: () => now },
    chat: { chatStore },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const restoreFetch = installAuthenticatedFetch(baseUrl, auth, { origin: 'http://127.0.0.1:8181' });
  const post = (route, body) => fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    const { cat } = await (await post('/api/cats', { name: 'Milo', provider: 'claude' })).json();

    const first = await post('/api/channels', directLaneInput(cat.id, { originSurface: 'work' }));
    assert.equal(first.status, 201);
    const { channel: created } = await first.json();

    const second = await post('/api/channels', directLaneInput(cat.id));
    assert.equal(second.status, 200);
    const { channel: reused } = await second.json();
    assert.equal(reused.id, created.id);

    const state = await chatStore.read();
    const lanes = state.channels.filter((channel) => channel.roomRouting.mode === 'direct_message');
    assert.equal(lanes.length, 1);
    assert.equal(state.selectedChannelId, created.id);
  } finally {
    restoreFetch();
    server.close();
    await once(server, 'close');
  }
});
