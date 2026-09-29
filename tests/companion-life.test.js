import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/memoryStore.js';
import { resolveLeadParticipantLease } from '../build/server/products/chat/state/model/index.js';
import {
  activateChannelLocked,
  deactivateChannelLocked,
} from '../build/server/products/chat/api/resources/channelActivation.js';
import {
  createAuthenticatedTestSession,
  createTestAuthConfig,
  installAuthenticatedFetch,
} from './testUtils.js';

import {
  COMPANION_LIFE_DEFAULTS,
  normalizeCompanionLifeProfile,
  validateCompanionLifeUpdate,
} from '../build/server/products/chat/companion/life/profile.js';
import {
  resolveCompanionDesiredPresence,
  resolveCompanionRhythm,
  resolveCompanionWakeTime,
} from '../build/server/products/chat/companion/life/rhythm.js';
import { createCompanionLifeLoop } from '../build/server/products/chat/companion/life/loop.js';
import { createMemoryCompanionActivityStore } from '../build/server/products/chat/companion/activityStore.js';

const NOW_ISO = '2026-09-29T00:00:00.000Z';

function life(overrides = {}) {
  return { ...normalizeCompanionLifeProfile(undefined, NOW_ISO), ...overrides };
}

/** Local wall-clock times keep these tests independent of the host time zone. */
function at(hours, minutes = 0, day = 29) {
  return new Date(2026, 8, day, hours, minutes);
}

test('life profile: a box written before SPEC-124 reads as the defaults', () => {
  assert.deepEqual(normalizeCompanionLifeProfile(undefined, NOW_ISO), {
    ...COMPANION_LIFE_DEFAULTS,
    sleepUntil: null,
    updatedAt: NOW_ISO,
  });
});

test('life profile: each malformed field falls back on its own', () => {
  const normalized = normalizeCompanionLifeProfile({
    enabled: false,
    bedtime: '25:00',
    wakeWindowStart: '06:30',
    wakeWindowEnd: 7,
    sleepUntil: 'not a date',
  }, NOW_ISO);
  assert.equal(normalized.enabled, false);
  assert.equal(normalized.bedtime, COMPANION_LIFE_DEFAULTS.bedtime);
  assert.equal(normalized.wakeWindowStart, '06:30');
  assert.equal(normalized.wakeWindowEnd, COMPANION_LIFE_DEFAULTS.wakeWindowEnd);
  assert.equal(normalized.sleepUntil, null);
});

test('life profile: owner updates are validated against the resulting profile', () => {
  const current = life();
  assert.equal(validateCompanionLifeUpdate(current, { bedtime: '7pm' }).ok, false);
  assert.equal(
    validateCompanionLifeUpdate(current, { wakeWindowStart: '09:30' }).code,
    'invalid_companion_life_wake_window',
  );
  assert.equal(
    validateCompanionLifeUpdate(current, { bedtime: '08:00' }).code,
    'invalid_companion_life_bedtime',
  );
  assert.equal(validateCompanionLifeUpdate(current, { enabled: 'yes' }).ok, false);
  assert.deepEqual(
    validateCompanionLifeUpdate(current, { bedtime: '00:30', sleepUntil: 'ignored' }),
    { ok: true, update: { bedtime: '00:30' } },
  );
});

test('rhythm: the wake time is fixed for the day and stays inside the window', () => {
  const profile = life();
  const morning = resolveCompanionWakeTime(profile, 'cat-1', at(1));
  assert.deepEqual(resolveCompanionWakeTime(profile, 'cat-1', at(22)), morning);
  const minutes = morning.getHours() * 60 + morning.getMinutes();
  assert.ok(minutes >= 7 * 60 && minutes <= 9 * 60, `wake minute ${minutes}`);
});

test('rhythm: awake from the wake time until bedtime, resting otherwise', () => {
  const profile = life({ wakeWindowStart: '07:00', wakeWindowEnd: '07:00', bedtime: '23:00' });
  assert.equal(resolveCompanionRhythm(profile, 'cat-1', at(6, 59)).phase, 'rest_hours');
  assert.equal(resolveCompanionRhythm(profile, 'cat-1', at(7, 0)).phase, 'awake_hours');
  assert.equal(resolveCompanionRhythm(profile, 'cat-1', at(22, 59)).phase, 'awake_hours');
  assert.equal(resolveCompanionRhythm(profile, 'cat-1', at(23, 0)).phase, 'rest_hours');
  assert.deepEqual(resolveCompanionRhythm(profile, 'cat-1', at(6)).nextWakeAt, at(7));
  assert.deepEqual(resolveCompanionRhythm(profile, 'cat-1', at(23, 30)).nextWakeAt, at(7, 0, 30));
});

test('rhythm: a bedtime after midnight keeps the late evening awake', () => {
  const profile = life({ wakeWindowStart: '08:00', wakeWindowEnd: '08:00', bedtime: '01:30' });
  assert.equal(resolveCompanionRhythm(profile, 'cat-1', at(0, 45)).phase, 'awake_hours');
  assert.equal(resolveCompanionRhythm(profile, 'cat-1', at(1, 30)).phase, 'rest_hours');
  assert.equal(resolveCompanionRhythm(profile, 'cat-1', at(23, 50)).phase, 'awake_hours');
});

test('rhythm: an owner sleep holds until sleepUntil, then the rhythm resumes', () => {
  const profile = life({
    wakeWindowStart: '07:00',
    wakeWindowEnd: '07:00',
    sleepUntil: at(15).toISOString(),
  });
  assert.deepEqual(resolveCompanionDesiredPresence(profile, 'cat-1', at(14)), {
    presence: 'sleeping',
    reason: 'owner',
  });
  assert.deepEqual(resolveCompanionDesiredPresence(profile, 'cat-1', at(15)), { presence: 'awake' });
  assert.deepEqual(resolveCompanionDesiredPresence(profile, 'cat-1', at(3, 0, 30)), {
    presence: 'sleeping',
    reason: 'rest',
  });
});

function laneState({
  leaseStatus = 'ready',
  sessionId = 'session-1',
  lastMessageAt = null,
  roles = ['companion'],
} = {}) {
  return {
    cats: [{ id: 'cat-1', name: 'Mochi', status: 'active', roles }],
    channels: [{
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
            sessionId,
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
      messages: [],
      lastMessageAt,
    }],
  };
}

function createHarness({
  state,
  profile = life({ wakeWindowStart: '07:00', wakeWindowEnd: '07:00', bedtime: '23:00' }),
  now = at(12),
  observe = async () => ({ session: { status: 'ready' } }),
  activation = [{ targetKind: 'cat', targetId: 'cat-1', status: 'started' }],
  closedSessionCount = 1,
} = {}) {
  const calls = { activate: 0, deactivate: 0 };
  const activityStore = createMemoryCompanionActivityStore();
  const harness = {
    calls,
    activityStore,
    now,
    loop: createCompanionLifeLoop({
      readChatState: async () => state,
      readCompanionSnapshot: async () => ({ boxes: [{ catId: 'cat-1', life: profile }] }),
      runtimeClient: {
        observeSession: (sessionId) => observe(sessionId),
        getHealth: async () => ({ reachable: true }),
      },
      activityStore,
      activateLane: async () => {
        calls.activate += 1;
        return typeof activation === 'function' ? activation() : activation;
      },
      deactivateLane: async () => {
        calls.deactivate += 1;
        return { closedSessionCount };
      },
      now: () => harness.now,
    }),
  };
  return harness;
}

test('life loop: a live session is left alone', async () => {
  const harness = createHarness({ state: laneState() });
  assert.deepEqual(await harness.loop.tick(), [
    { catId: 'cat-1', laneId: 'lane-1', outcome: 'awake' },
  ]);
  assert.equal(harness.calls.activate, 0);
  assert.deepEqual(await harness.activityStore.list('cat-1'), []);
});

test('life loop: a session the runtime closed is woken again (keep-alive)', async () => {
  const harness = createHarness({
    state: laneState(),
    observe: async () => { throw new Error('Session is closed. Resume it first.'); },
  });
  assert.deepEqual(await harness.loop.tick(), [
    { catId: 'cat-1', laneId: 'lane-1', outcome: 'woke', reason: 'keep_alive' },
  ]);
  assert.equal(harness.calls.activate, 1);
  const [event] = await harness.activityStore.list('cat-1');
  assert.equal(event.group, 'presence_changed');
  assert.deepEqual(event.metadata, { presence: 'awake', reason: 'keep_alive' });
});

test('life loop: a sleeping Cat wakes when its awake hours start', async () => {
  const harness = createHarness({ state: laneState({ leaseStatus: 'closed', sessionId: null }) });
  const [entry] = await harness.loop.tick();
  assert.equal(entry.outcome, 'woke');
  assert.equal(entry.reason, 'rhythm');
});

test('life loop: an unreachable runtime is unknown, not asleep', async () => {
  const harness = createHarness({
    state: laneState(),
    observe: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:3110'); },
  });
  const [entry] = await harness.loop.tick();
  assert.equal(entry.outcome, 'runtime_unknown');
  assert.equal(harness.calls.activate, 0);
});

test('life loop: a full session cap backs off and is recorded once', async () => {
  const harness = createHarness({
    state: laneState({ leaseStatus: 'error', sessionId: null }),
    activation: [{
      targetKind: 'cat',
      targetId: 'cat-1',
      status: 'error',
      error: 'Runtime request failed: Max sessions (10) reached',
    }],
  });
  assert.deepEqual(await harness.loop.tick(), [
    { catId: 'cat-1', laneId: 'lane-1', outcome: 'wake_failed', reason: 'no_capacity' },
  ]);
  harness.now = at(12, 2);
  assert.equal((await harness.loop.tick())[0].outcome, 'backoff');
  harness.now = at(12, 6);
  assert.equal((await harness.loop.tick())[0].outcome, 'wake_failed');
  assert.equal(harness.calls.activate, 2);
  const events = await harness.activityStore.list('cat-1');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].metadata, { presence: 'sleeping', reason: 'no_capacity' });
});

test('life loop: after bedtime it waits for a quiet lane before sleeping', async () => {
  const recent = createHarness({
    state: laneState({ lastMessageAt: at(23, 10).toISOString() }),
    now: at(23, 20),
  });
  assert.equal((await recent.loop.tick())[0].outcome, 'sleep_deferred');
  assert.equal(recent.calls.deactivate, 0);

  const quiet = createHarness({
    state: laneState({ lastMessageAt: at(22, 30).toISOString() }),
    now: at(23, 20),
  });
  assert.deepEqual(await quiet.loop.tick(), [
    { catId: 'cat-1', laneId: 'lane-1', outcome: 'slept', reason: 'rest' },
  ]);
  const [event] = await quiet.activityStore.list('cat-1');
  assert.deepEqual(event.metadata, { presence: 'sleeping', reason: 'rest' });
});

test('life loop: woken by a message at night, the Cat dozes off again when quiet', async () => {
  const harness = createHarness({
    state: laneState({ lastMessageAt: at(2, 0, 30).toISOString() }),
    now: at(2, 30, 30),
  });
  assert.equal((await harness.loop.tick())[0].reason, 'idle');
});

test('life loop: an owner sleep is never undone by the loop', async () => {
  const harness = createHarness({
    state: laneState({ leaseStatus: 'closed', sessionId: null }),
    profile: life({
      wakeWindowStart: '07:00',
      wakeWindowEnd: '07:00',
      sleepUntil: at(7, 0, 30).toISOString(),
    }),
  });
  assert.equal((await harness.loop.tick())[0].outcome, 'asleep');
  assert.equal(harness.calls.activate, 0);
});

test('life loop: disabled rhythms and non-companion Cats are ignored', async () => {
  const disabled = createHarness({
    state: laneState({ leaseStatus: 'closed' }),
    profile: life({ enabled: false }),
  });
  assert.deepEqual(await disabled.loop.tick(), []);
  const plain = createHarness({ state: laneState({ leaseStatus: 'closed', roles: [] }) });
  assert.deepEqual(await plain.loop.tick(), []);
});

function createLaneRuntimeStub() {
  let nextSession = 1;
  const stub = {
    closedSessionIds: [],
    deadSessionIds: new Set(),
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
        cwd: path.join(tmpdir(), '.cats', 'runtime', 'sessions', id),
      };
    },
    async resumeSession(sessionId) {
      stub.deadSessionIds.delete(sessionId);
      return { id: sessionId, provider: 'claude', model: null, status: 'ready', cwd: null };
    },
    async observeSession(sessionId) {
      return { session: { id: sessionId, status: stub.deadSessionIds.has(sessionId) ? 'closed' : 'ready' } };
    },
    async sendMessage() {
      return {
        segments: [{ kind: 'text', text: 'Purr.', toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async closeSession(sessionId) {
      stub.closedSessionIds.push(sessionId);
    },
  };
  return stub;
}

async function withLifeServer(callback) {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-companion-life-'));
  const now = new Date('2026-03-23T12:00:00.000Z');
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({
    now,
    sessionSecret: authConfig.sessionSecret,
    sessionTtlMs: authConfig.sessionTtlMs,
  });
  const runtimeClient = createLaneRuntimeStub();
  const chatStore = new MemoryChatStore();
  const companionStore = new MemoryCompanionBoxStore();
  const companionActivityStore = createMemoryCompanionActivityStore();
  const config = {
    host: '127.0.0.1',
    port: 8181,
    runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '',
    auth: authConfig,
    chatStatePath: path.join(workingDir, 'platform', 'state', 'chat-state.local.json'),
  };
  const server = createServer({
    shared: { config, runtimeClient, authStore: auth.authStore, now: () => now },
    chat: { chatStore, companionStore, companionActivityStore },
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
    const { cat } = await (await post('/api/cats', {
      name: 'Mochi',
      provider: 'claude',
      roles: ['companion'],
    })).json();
    const { channel } = await (await post('/api/channels', {
      title: '',
      topic: 'Private companion lane',
      originSurface: 'chat',
      roomMode: 'direct_message',
      participantCatIds: [cat.id],
    })).json();
    await callback({
      baseUrl,
      post,
      cat,
      lane: channel,
      now,
      config,
      runtimeClient,
      chatStore,
      companionStore,
      companionActivityStore,
    });
  } finally {
    restoreFetch();
    server.close();
    await once(server, 'close');
  }
}

async function patchLife(baseUrl, catId, body) {
  return fetch(`${baseUrl}/api/cats/${catId}/companion-box/life`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('life route: reads defaults and rejects an invalid rhythm', async () => {
  await withLifeServer(async ({ baseUrl, cat }) => {
    const initial = await (await fetch(`${baseUrl}/api/cats/${cat.id}/companion-box/life`)).json();
    assert.equal(initial.life.bedtime, '23:00');
    assert.equal(initial.life.enabled, true);

    const invalid = await patchLife(baseUrl, cat.id, { bedtime: '08:00' });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'invalid_companion_life_bedtime');

    const updated = await (await patchLife(baseUrl, cat.id, {
      bedtime: '00:30',
      sleepUntil: '2099-01-01T00:00:00.000Z',
    })).json();
    assert.equal(updated.life.bedtime, '00:30');
    assert.equal(updated.life.sleepUntil, null, 'sleepUntil is not owner-editable');
  });
});

test('owner sleep on the companion lane holds until the next wake; waking clears it', async () => {
  await withLifeServer(async ({ post, lane, cat, now, companionStore, companionActivityStore }) => {
    assert.equal((await post(`/api/channels/${lane.id}/activations`)).status, 200);
    assert.equal((await post(`/api/channels/${lane.id}/deactivate`)).status, 200);

    const slept = await companionStore.getLifeProfile(cat.id);
    assert.ok(slept.sleepUntil && Date.parse(slept.sleepUntil) > now.getTime());
    const presenceEvents = async () =>
      (await companionActivityStore.list(cat.id)).map((event) => event.metadata);
    assert.deepEqual(await presenceEvents(), [
      { presence: 'awake', reason: 'owner' },
      { presence: 'sleeping', reason: 'owner' },
    ]);

    assert.equal((await post(`/api/channels/${lane.id}/activations`)).status, 200);
    assert.equal((await companionStore.getLifeProfile(cat.id)).sleepUntil, null);
    assert.deepEqual((await presenceEvents()).at(-1), { presence: 'awake', reason: 'owner' });
  });
});

test('life loop revives a companion session the runtime closed, through the REST wake path', async () => {
  await withLifeServer(async ({
    baseUrl, post, lane, cat, now, config, runtimeClient, chatStore, companionStore, companionActivityStore,
  }) => {
    // Awake around the clock so the test does not depend on the host time zone.
    assert.equal((await patchLife(baseUrl, cat.id, {
      wakeWindowStart: '00:00',
      wakeWindowEnd: '00:00',
      bedtime: '23:59',
    })).status, 200);
    assert.equal((await post(`/api/channels/${lane.id}/activations`)).status, 200);
    const readLease = async () => resolveLeadParticipantLease(
      (await chatStore.read()).channels.find((channel) => channel.id === lane.id),
    );
    const before = await readLease();
    assert.equal(before.status, 'ready');

    const dependencies = { chatStore, runtimeClient, companionStore, config, now: () => now };
    const loop = createCompanionLifeLoop({
      readChatState: () => chatStore.read(),
      readCompanionSnapshot: () => companionStore.readSnapshot(),
      runtimeClient,
      activityStore: companionActivityStore,
      activateLane: async (channelId) => (await activateChannelLocked(dependencies, channelId)).results,
      deactivateLane: (channelId) => deactivateChannelLocked(dependencies, channelId),
      now: () => now,
    });

    assert.equal((await loop.tick())[0].outcome, 'awake');

    runtimeClient.deadSessionIds.add(before.sessionId);
    const [entry] = await loop.tick();
    assert.equal(entry.outcome, 'woke');
    assert.equal(entry.reason, 'keep_alive');
    const after = await readLease();
    assert.equal(after.status, 'ready');
    assert.equal(after.sessionId, before.sessionId, 'the same conversation is resumed, not replaced');
    assert.equal(runtimeClient.deadSessionIds.has(after.sessionId), false);
    assert.equal((await loop.tick())[0].outcome, 'awake');
  });
});
