import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/memoryStore.js';
import { resolveLeadParticipantLease } from '../build/server/products/chat/state/model/index.js';
import { createCompanionHeartbeatSpeaker } from '../build/server/products/chat/api/companionLifeLoop.js';
import {
  buildCompanionHeartbeatPrompt,
  parseCompanionHeartbeatReply,
} from '../build/server/products/chat/companion/life/heartbeat.js';
import { createCompanionLifeLoop } from '../build/server/products/chat/companion/life/loop.js';
import { normalizeCompanionLifeProfile } from '../build/server/products/chat/companion/life/profile.js';
import {
  isSessionTurnGateHeld,
  runWithSessionTurnGate,
} from '../build/server/products/chat/state/runtime-dispatch/sessionTurnGate.js';
import { createMemoryCompanionActivityStore } from '../build/server/products/chat/companion/activityStore.js';
import {
  createAuthenticatedTestSession,
  createTestAuthConfig,
  installAuthenticatedFetch,
  waitForCondition,
} from './testUtils.js';

const NOW_ISO = '2026-09-29T00:00:00.000Z';

/** Local wall-clock times keep these tests independent of the host time zone. */
function at(hours, minutes = 0, day = 29) {
  return new Date(2026, 8, day, hours, minutes);
}

test('heartbeat reply: only an exact [quiet] stays quiet', () => {
  assert.deepEqual(parseCompanionHeartbeatReply('  [Quiet]\n'), { quiet: true });
  assert.deepEqual(parseCompanionHeartbeatReply(''), { quiet: true });
  assert.deepEqual(parseCompanionHeartbeatReply('Morning! [quiet] later'), {
    quiet: false,
    body: 'Morning! [quiet] later',
  });
});

test('heartbeat prompt tells the Cat the time, the moment and how to stay quiet', () => {
  const prompt = buildCompanionHeartbeatPrompt({
    kind: 'regular',
    now: at(10, 30),
    awakeSince: at(7, 30),
    lastOwnerMessageAt: at(9, 50),
    companionContext: 'Your companion memory (curated by your owner; use it naturally, do not recite it):\n- (preference) Likes sunny windows',
  });
  assert.match(prompt, /not a message from your owner/u);
  assert.match(prompt, /Local time: .*2026, 10:30\./u);
  assert.match(prompt, /awake for about 3 hours/u);
  assert.match(prompt, /last wrote to you 40 minutes ago/u);
  assert.match(prompt, /Likes sunny windows/u);
  assert.match(prompt, /reply with exactly \[quiet\]/u);
  assert.match(
    buildCompanionHeartbeatPrompt({ kind: 'wake', now: at(7, 40), awakeSince: null, lastOwnerMessageAt: null, companionContext: null }),
    /just woken up for the day[\s\S]*has not written to you yet/u,
  );
});

test('session turn gate: a waiting turn runs only after the heartbeat releases', async () => {
  let release;
  const heartbeat = runWithSessionTurnGate('session-g', () => new Promise((resolve) => { release = resolve; }));
  assert.equal(isSessionTurnGateHeld('session-g'), true);
  const order = [];
  const owner = runWithSessionTurnGate('session-g', async () => { order.push('owner'); });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, []);
  order.push('heartbeat');
  release();
  await Promise.all([heartbeat, owner]);
  assert.deepEqual(order, ['heartbeat', 'owner']);
  assert.equal(isSessionTurnGateHeld('session-g'), false);
});

function laneFixture({ leaseStatus, messages = [], lastMessageAt = null }) {
  return {
    id: 'lane-1',
    title: '',
    topic: '',
    status: 'active',
    channelKind: 'direct_message',
    roomRouting: { mode: 'direct_message', defaultRecipientId: 'cat-1' },
    catAssignments: [{
      participantId: 'cat-1',
      sourceKind: 'cat',
      sourceRefId: 'cat-1',
      catId: 'cat-1',
      name: 'Mochi',
      status: 'active',
      roles: [],
      roleHint: null,
      joinedAt: NOW_ISO,
      leftAt: null,
      execution: {
        target: { provider: 'claude', instance: null, model: null },
        lease: {
          sessionId: leaseStatus === 'ready' ? 'session-1' : null,
          status: leaseStatus,
          laneId: null,
          cwd: null,
          lastError: null,
          provider: 'claude',
          model: null,
          startedAt: null,
          lastUsedAt: null,
        },
      },
    }],
    messages,
    lastMessageAt,
  };
}

function heartbeatMessage(kind, createdAt) {
  return {
    id: `m-${kind}-${createdAt}`,
    senderKind: 'agent',
    senderName: 'Mochi',
    body: 'hello',
    createdAt,
    metadata: { companionHeartbeat: { kind } },
  };
}

function createHeartbeatHarness({ leaseStatus = 'closed', messages = [], lastMessageAt = null, speakResult = 'spoke' } = {}) {
  const state = {
    cats: [{ id: 'cat-1', name: 'Mochi', status: 'active', roles: ['companion'] }],
    channels: [laneFixture({ leaseStatus, messages, lastMessageAt })],
  };
  const spoken = [];
  const harness = {
    state,
    spoken,
    deactivations: 0,
    now: at(7, 0),
    speakResult,
    loop: null,
  };
  harness.loop = createCompanionLifeLoop({
    readChatState: async () => state,
    readCompanionSnapshot: async () => ({
      boxes: [{
        catId: 'cat-1',
        life: {
          ...normalizeCompanionLifeProfile(undefined, NOW_ISO),
          wakeWindowStart: '07:00',
          wakeWindowEnd: '07:00',
          bedtime: '23:00',
        },
      }],
    }),
    runtimeClient: {
      observeSession: async () => ({ session: { status: 'ready' } }),
      getHealth: async () => ({ reachable: true }),
    },
    activityStore: createMemoryCompanionActivityStore(),
    activateLane: async () => {
      state.channels[0] = laneFixture({ leaseStatus: 'ready', messages: state.channels[0].messages, lastMessageAt: state.channels[0].lastMessageAt });
      return [{ targetKind: 'cat', targetId: 'cat-1', status: 'started' }];
    },
    deactivateLane: async () => {
      harness.deactivations += 1;
      return { closedSessionCount: 1 };
    },
    speak: async (request) => {
      spoken.push({ kind: request.kind, at: request.now });
      return harness.speakResult;
    },
    random: () => 0,
    now: () => harness.now,
  });
  return harness;
}

test('heartbeat: waking on the rhythm greets once, a few minutes later, then settles', async () => {
  const harness = createHeartbeatHarness();
  assert.equal((await harness.loop.tick())[0].outcome, 'woke');
  harness.now = at(7, 1);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken, []);
  harness.now = at(7, 2);
  assert.deepEqual((await harness.loop.tick())[0].heartbeat, { kind: 'wake', result: 'spoke' });
  harness.now = at(7, 31);
  await harness.loop.tick();
  assert.equal(harness.spoken.length, 1, 'the next beat is at least 30 minutes away');
  harness.now = at(7, 32);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken.map((beat) => beat.kind), ['wake', 'regular']);
});

test('heartbeat: never talks over a conversation, and skips the greeting once one started', async () => {
  const harness = createHeartbeatHarness();
  await harness.loop.tick();
  harness.state.channels[0].lastMessageAt = at(7, 1).toISOString();
  harness.now = at(7, 2);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken, []);
  harness.now = at(7, 11);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken, []);
  harness.now = at(7, 41);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken.map((beat) => beat.kind), ['regular']);
});

test('heartbeat: a restart after the morning greeting does not greet again', async () => {
  const harness = createHeartbeatHarness({
    leaseStatus: 'ready',
    messages: [heartbeatMessage('wake', at(7, 3).toISOString())],
    lastMessageAt: at(7, 3).toISOString(),
  });
  harness.now = at(8, 0);
  await harness.loop.tick();
  harness.now = at(8, 2);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken, []);
  harness.now = at(8, 30);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken.map((beat) => beat.kind), ['regular']);
});

test('heartbeat: a busy session retries the same beat a few minutes later', async () => {
  const harness = createHeartbeatHarness({ speakResult: 'busy' });
  await harness.loop.tick();
  harness.now = at(7, 2);
  await harness.loop.tick();
  harness.speakResult = 'quiet';
  harness.now = at(7, 5);
  await harness.loop.tick();
  assert.equal(harness.spoken.length, 1);
  harness.now = at(7, 6);
  await harness.loop.tick();
  assert.deepEqual(harness.spoken.map((beat) => beat.kind), ['wake', 'wake']);
});

test('heartbeat: going to bed on the rhythm says good night once, then sleeps', async () => {
  const harness = createHeartbeatHarness({ leaseStatus: 'ready', lastMessageAt: at(22, 0).toISOString() });
  harness.now = at(23, 20);
  const [entry] = await harness.loop.tick();
  assert.equal(entry.outcome, 'slept');
  assert.deepEqual(entry.heartbeat, { kind: 'bedtime', result: 'spoke' });
  assert.equal(harness.deactivations, 1);

  const already = createHeartbeatHarness({
    leaseStatus: 'ready',
    messages: [heartbeatMessage('bedtime', at(23, 5).toISOString())],
    lastMessageAt: at(22, 0).toISOString(),
  });
  already.now = at(23, 20);
  assert.equal((await already.loop.tick())[0].heartbeat, undefined);
  assert.deepEqual(already.spoken, []);
});

function createHeartbeatRuntimeStub(workingDir) {
  let nextSession = 1;
  const stub = {
    sentMessages: [],
    heartbeatReply: '[quiet]',
    ownerReply: 'Purr, I am here.',
    async getHealth() {
      return { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' };
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
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
    async createSession(input) {
      const id = `session-${nextSession++}`;
      return {
        id,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: path.join(workingDir, '.cats', 'runtime', 'sessions', id),
      };
    },
    async observeSession(sessionId) {
      return { session: { id: sessionId, status: 'ready' } };
    },
    async sendMessage(sessionId, content) {
      stub.sentMessages.push({ sessionId, content });
      const text = content.startsWith('[Cats heartbeat') ? stub.heartbeatReply : stub.ownerReply;
      return {
        segments: [{ kind: 'text', text, toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async closeSession() {},
  };
  return stub;
}

async function withHeartbeatServer(callback) {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-companion-heartbeat-'));
  const now = new Date('2026-03-23T12:00:00.000Z');
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({
    now,
    sessionSecret: authConfig.sessionSecret,
    sessionTtlMs: authConfig.sessionTtlMs,
  });
  const runtimeClient = createHeartbeatRuntimeStub(workingDir);
  const chatStore = new MemoryChatStore();
  const companionStore = new MemoryCompanionBoxStore();
  const config = {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    auth: authConfig,
    chatStatePath: path.join(workingDir, 'platform', 'state', 'chat-state.local.json'),
    // Attachment copies default to the real ~/.cats/runtime/data otherwise.
    runtimeDataDir: path.join(workingDir, 'runtime-data'),
  };
  const server = createServer({
    shared: { config, runtimeClient, authStore: auth.authStore, now: () => now },
    chat: { chatStore, companionStore, companionActivityStore: createMemoryCompanionActivityStore() },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const restoreFetch = installAuthenticatedFetch(baseUrl, auth, { origin: 'http://127.0.0.1:8181' });
  const post = (route, body) => fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  try {
    const { cat } = await (await post('/api/cats', { name: 'Mochi', provider: 'claude', roles: ['companion'] })).json();
    const { channel } = await (await post('/api/channels', {
      title: '',
      topic: 'Private companion lane',
      originSurface: 'chat',
      roomMode: 'direct_message',
      participantCatIds: [cat.id],
    })).json();
    assert.equal((await post(`/api/channels/${channel.id}/activations`)).status, 200);
    const lease = resolveLeadParticipantLease(
      (await chatStore.read()).channels.find((candidate) => candidate.id === channel.id),
    );
    const speak = createCompanionHeartbeatSpeaker({
      chatStore,
      runtimeClient,
      companionStore,
      config,
      mutationGate: { run: (_key, operation) => operation() },
      now: () => now,
    });
    await callback({
      baseUrl,
      post,
      cat,
      lane: channel,
      sessionId: lease.sessionId,
      now,
      runtimeClient,
      chatStore,
      speak,
    });
  } finally {
    restoreFetch();
    server.close();
    await once(server, 'close');
  }
}

test('heartbeat speaker: a quiet Cat leaves the lane untouched', async () => {
  await withHeartbeatServer(async ({ cat, lane, sessionId, now, runtimeClient, chatStore, speak }) => {
    const before = (await chatStore.read()).channels.find((channel) => channel.id === lane.id).messages.length;
    const result = await speak({
      catId: cat.id,
      laneId: lane.id,
      sessionId,
      kind: 'regular',
      now,
      awakeSince: null,
      lastOwnerMessageAt: null,
    });
    assert.equal(result, 'quiet');
    assert.equal(runtimeClient.sentMessages.at(-1).sessionId, sessionId, 'the heartbeat runs in the lane session');
    assert.equal(
      (await chatStore.read()).channels.find((channel) => channel.id === lane.id).messages.length,
      before,
    );
  });
});

test('heartbeat speaker: what the Cat says lands in its lane as its own message', async () => {
  await withHeartbeatServer(async ({ cat, lane, sessionId, now, runtimeClient, chatStore, speak }) => {
    runtimeClient.heartbeatReply = 'Good morning! The sun is on the windowsill.';
    const result = await speak({
      catId: cat.id,
      laneId: lane.id,
      sessionId,
      kind: 'wake',
      now,
      awakeSince: null,
      lastOwnerMessageAt: null,
    });
    assert.equal(result, 'spoke');
    const message = (await chatStore.read()).channels.find((channel) => channel.id === lane.id).messages.at(-1);
    assert.equal(message.body, 'Good morning! The sun is on the windowsill.');
    assert.equal(message.senderKind, 'agent');
    assert.equal(message.senderName, 'Mochi');
    assert.equal(message.metadata.origin, 'runtime');
    assert.deepEqual(message.metadata.companionHeartbeat, { kind: 'wake' });
    assert.notEqual(message.metadata.event, 'assistant_turn_segment');
  });
});

test('an owner message sent during a heartbeat waits for it instead of hitting a busy session', async () => {
  await withHeartbeatServer(async ({ post, lane, sessionId, runtimeClient }) => {
    let release;
    const heartbeat = runWithSessionTurnGate(sessionId, () => new Promise((resolve) => { release = resolve; }));
    const laneSends = () => runtimeClient.sentMessages.filter((message) => message.sessionId === sessionId);
    const sendsBefore = laneSends().length;
    assert.equal((await post(`/api/channels/${lane.id}/messages`, { body: 'Are you up?' })).status, 200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(laneSends().length, sendsBefore, 'the owner turn is held behind the heartbeat');
    release();
    await heartbeat;
    await waitForCondition(
      () => laneSends().slice(sendsBefore).some((message) => message.content.includes('Are you up?')),
      { timeoutMs: 2000 },
    );
  });
});

test('an ordinary companion reply can send any photo from the album, and nothing outside it', async () => {
  await withHeartbeatServer(async ({ baseUrl, post, cat, lane, sessionId, runtimeClient, chatStore }) => {
    const album = await mkdtemp(path.join(tmpdir(), 'cats-companion-album-'));
    await mkdir(path.join(album, 'trips'));
    await writeFile(path.join(album, 'trips', 'sunset.png'), 'png bytes');
    const patched = await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/life`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ photoFolder: album }),
    });
    assert.equal(patched.status, 200);
    const catReplies = async () => (await chatStore.read()).channels
      .find((candidate) => candidate.id === lane.id).messages
      .filter((message) => message.senderKind === 'agent');

    runtimeClient.ownerReply = 'Here is last summer.\n[photo: trips/sunset.png]';
    assert.equal((await post(`/api/channels/${lane.id}/messages`, { body: 'Show me the beach' })).status, 200);
    await waitForCondition(async () => (await catReplies()).some((message) => message.body.includes('summer')));
    const sent = (await catReplies()).find((message) => message.body.includes('summer'));
    assert.equal(
      sent.body,
      '[Attached files in working directory:]\n- .cats-attachments/sunset.png\n\nHere is last summer.',
    );
    assert.deepEqual(sent.metadata.transportMedia, {
      kind: 'photo',
      path: await realpath(path.join(album, 'trips', 'sunset.png')),
      fileName: 'sunset.png',
    });
    const ownerTurn = runtimeClient.sentMessages
      .filter((message) => message.sessionId === sessionId)
      .find((message) => message.content.includes('Show me the beach'));
    assert.ok(ownerTurn.content.includes(`Your photo album: ${album}`), 'the Cat is told where its album is');

    runtimeClient.ownerReply = 'Try this one.\n[photo: ../secret.png]';
    assert.equal((await post(`/api/channels/${lane.id}/messages`, { body: 'Another?' })).status, 200);
    await waitForCondition(async () => (await catReplies()).some((message) => message.body === 'Try this one.'));
    const refused = (await catReplies()).find((message) => message.body === 'Try this one.');
    assert.equal(refused.metadata.transportMedia, undefined, 'a path outside the album is never sent');
  });
});
