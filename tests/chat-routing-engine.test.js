import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignCatToChannel,
  buildChannelView,
  createChannel,
  createCat,
  removeCatFromChannel,
} from '../dist-server/chat/model.js';
import { routeChannelMessage } from '../dist-server/chat/runtimeActions.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

function createRuntimeStub(responder) {
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
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return responder({ sessionId, content, sentMessages: this.sentMessages });
    },
    async closeSession() {},
  };
}

function usage(content) {
  return {
    content,
    inputTokens: 11,
    outputTokens: 7,
    tokensUsed: 18,
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function createChannelState() {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  const bossCatId = state.cats[0].id;
  state = { ...state, bossCatId };

  state = createCat(
    state,
    {
      name: 'Agent-1',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const agent1Id = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Agent-2',
      provider: 'gemini',
      roles: ['implementer'],
    },
    now,
  );
  const agent2Id = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Routing Engine',
      topic: 'Exercise continuation routing.',
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent1Id,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent2Id,
      provider: 'gemini',
      roles: ['implementer'],
    },
    now,
  );

  return { state, channelId };
}

test('explicit multi-target mentions fan out in parallel and persist replies in completion order', async () => {
  const { state, channelId } = await createChannelState();
  const agent1Reply = createDeferred();
  const agent2Reply = createDeferred();
  const bothRequested = createDeferred();
  let agent1Requested = false;
  let agent2Requested = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      agent1Requested = true;
      if (agent2Requested) {
        bothRequested.resolve();
      }
      return agent1Reply.promise;
    }
    if (content.includes('You are Agent-2')) {
      agent2Requested = true;
      if (agent1Requested) {
        bothRequested.resolve();
      }
      return agent2Reply.promise;
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 @Agent-2 review this change.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  await bothRequested.promise;
  agent2Reply.resolve(usage('Agent-2 finished the review.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 finished the review.'));
  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-2', 'Agent-1'],
  );
  assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 2);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.routingMode, 'explicit_multi');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'explicit_mentions');
  assert.deepEqual(
    channel.roomRouting?.lastOutcome?.dispatches.map((dispatch) => dispatch.target.participantName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(dispatched.results[0].targetName, 'Agent-2');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.status, 'completed');
  assert.deepEqual(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.map((target) => target.status),
    ['completed', 'completed'],
  );
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'fan_out'),
  );
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'outcome'),
  );
});

test('room routing continues across agent mentions and auto-wakes targeted participants', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Smelly')) {
      return usage('@Agent-1 Please assess the problem.');
    }
    if (content.includes('You are Agent-1')) {
      return usage('I need @Agent-2 to implement the change.');
    }
    if (content.includes('You are Agent-2')) {
      return usage('I implemented the change.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Kick off the work.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter(
    (message) => message.senderKind === 'orchestrator' || message.senderKind === 'agent',
  );

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Smelly', 'Agent-1', 'Agent-2'],
  );
  assert.equal(runtimeClient.createdSessions.length, 3);
  assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 3);
  assert.equal(channel.roomRouting?.lastOutcome?.continuationCount, 2);
  assert.equal(channel.roomRouting?.lastOutcome?.guard, null);
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.reason),
    ['workflow_continuation', 'workflow_continuation', 'room_default'],
  );
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.status),
    ['completed', 'completed', 'completed'],
  );
  assert.ok(
    channel.roomRouting?.lastOutcome?.checkpoints.some(
      (checkpoint) => checkpoint.kind === 'continuation',
    ),
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.dispatchCount, 3);
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.continuationCount, 2);
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.events.some(
      (event) => event.kind === 'target_running',
    ),
  );
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.events.some(
      (event) => event.kind === 'checkpoint'
        && event.metadata.checkpointKind === 'continuation',
    ),
  );
});

test('direct cat chat routes unmentioned turns to the lead cat without waking Boss Cat first', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  state.bossCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Talk directly to Companion.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      leadParticipantId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage('Companion is already on it.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this directly.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Smelly')), false);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, 'session-1');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'default_target');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.defaultTargetReason, 'direct_chat_lead');
  assert.equal(channel.roomRouting?.wakeHistory[0]?.reason, 'room_default');
  assert.equal(channel.roomRouting?.wakeHistory[0]?.participant.participantId, companionId);
  assert.equal(channel.messages.at(-1)?.senderName, 'Companion');
  assert.equal(channel.status, 'active');
});

test('direct cat chat blocks unmentioned turns when the lead cat is no longer assigned instead of falling back to Boss Cat', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  state.bossCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Talk directly to Companion.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      leadParticipantId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = removeCatFromChannel(state, channelId, companionId, now);

  const runtimeClient = createRuntimeStub(async ({ content }) => {
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this directly.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(runtimeClient.sentMessages.length, 0);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'blocked');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.blockedReason, 'missing_direct_chat_lead');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.defaultTarget?.participantId, companionId);
  assert.equal(channel.roomRouting?.wakeHistory.length, 0);
  assert.match(channel.messages.at(-1)?.body ?? '', /no longer has an active lead Cat/i);
});

test('anti-ping-pong blocks repeated back-and-forth and prompts only include per-target recent context', async () => {
  const { state, channelId } = await createChannelState();
  const promptsByTarget = {
    Smelly: [],
    'Agent-1': [],
  };
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Smelly')) {
      promptsByTarget.Smelly.push(content);
      if (promptsByTarget.Smelly.length === 1) {
        return usage('@Agent-1 take first pass.');
      }
      return usage('@Agent-1 one more tweak.');
    }
    if (content.includes('You are Agent-1')) {
      promptsByTarget['Agent-1'].push(content);
      return usage('@Smelly please review.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Start the routing loop.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(promptsByTarget.Smelly.length, 2);
  assert.equal(promptsByTarget['Agent-1'].length, 1);
  assert.ok(promptsByTarget.Smelly[1].includes('@Smelly please review.'));
  assert.equal(promptsByTarget.Smelly[1].includes('@Agent-1 take first pass.'), false);
  assert.equal(channel.roomRouting?.lastOutcome?.guard, 'anti_ping_pong');
  assert.ok(
    channel.roomRouting?.lastOutcome?.checkpoints.some(
      (checkpoint) => checkpoint.kind === 'anti_ping_pong',
    ),
  );
  assert.equal(
    channel.roomRouting?.lastOutcome?.dispatches.filter(
      (dispatch) => dispatch.target.participantName === 'Agent-1',
    ).length,
    2,
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.guard, 'anti_ping_pong');
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some(
      (event) => event.kind === 'guard_blocked',
    ),
  );
});
