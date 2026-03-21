import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignPalToChannel,
  buildChannelView,
  createChannel,
  createWorkspacePal,
} from '../dist-server/workspace/model.js';
import { routeChannelMessage } from '../dist-server/workspace/runtimeActions.js';
import { MemoryWorkspaceStore } from '../dist-server/workspace/store.js';

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
        cwd: input.cwd ?? 'C:/workspace/runtime',
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
  const store = new MemoryWorkspaceStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createWorkspacePal(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  const bossCatId = state.pals[0].id;
  state = { ...state, bossCatId };

  state = createWorkspacePal(
    state,
    {
      name: 'Agent-1',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const agent1Id = state.pals[0].id;

  state = createWorkspacePal(
    state,
    {
      name: 'Agent-2',
      provider: 'gemini',
      roles: ['implementer'],
    },
    now,
  );
  const agent2Id = state.pals[0].id;

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
  state = assignPalToChannel(
    state,
    channelId,
    {
      palId: agent1Id,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  state = assignPalToChannel(
    state,
    channelId,
    {
      palId: agent2Id,
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
  assert.equal(
    channel.roomRouting?.lastOutcome?.dispatches[0]?.target.participantName,
    'Agent-2',
  );
  assert.equal(dispatched.results[0].targetName, 'Agent-2');
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
  assert.ok(
    channel.roomRouting?.lastOutcome?.checkpoints.some(
      (checkpoint) => checkpoint.kind === 'continuation',
    ),
  );
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
});
