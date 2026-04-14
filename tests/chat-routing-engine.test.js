import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assignCatToChannel,
  buildChannelView,
  createChannel,
  createCat,
  removeCatFromChannel,
  setChannelCatLease,
} from '../build/server/products/chat/state/model/index.js';
import { routeChannelMessage } from '../build/server/products/chat/state/runtimeActions.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { patchTaskPlanningMetadata } from '../build/server/shared/taskPlanning.js';
import { buildChatWorkItemId } from '../build/server/shared/chatCoreIds.js';

function createRuntimeStub(responder) {
  let nextSession = 1;
  return {
    createdSessions: [],
    closedSessions: [],
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
      return responder({ sessionId, content, input, sentMessages: this.sentMessages });
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async observeSession(sessionId) {
      return {
        session: {
          id: sessionId,
          inspection: {
            state: 'idle',
          },
        },
        observePath: `/sessions/${sessionId}/observe`,
        stream: {
          path: `/sessions/${sessionId}/stream`,
          available: false,
        },
      };
    },
    async streamSession() {},
  };
}

function usage(content) {
  return {
    segments: [{ kind: 'text', text: content, toolName: null, toolId: null }],
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

class TrackingChatStore extends MemoryChatStore {
  writeCount = 0;

  async write(state) {
    this.writeCount += 1;
    return super.write(state);
  }
}

class CountingCoreChatStore extends MemoryChatStore {
  readCoreCount = 0;

  async readCore() {
    this.readCoreCount += 1;
    return super.readCore();
  }
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

  return { state, channelId, agent1Id, agent2Id };
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
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'concurrent');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.stageId, 'turn_completed');
  assert.deepEqual(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.map((target) => target.status),
    ['completed', 'completed'],
  );
  assert.deepEqual(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.map((target) => target.branchStrategy),
    ['fresh_no_parent', 'fresh_no_parent'],
  );
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'fan_out'),
  );
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'outcome'),
  );
});

test('current-turn draft audience metadata routes multi-target turns sequentially in audience order', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const firstReply = createDeferred();
  const secondRequested = createDeferred();
  let secondHasStarted = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-1')) {
      secondHasStarted = true;
      secondRequested.resolve();
      return usage('Agent-1 handled the second step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Kick off the shared room.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );

  await Promise.resolve();
  assert.equal(secondHasStarted, false);
  firstReply.resolve(usage('Agent-2 handled the first step.'));
  await secondRequested.promise;

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.deepEqual(
    runtimeClient.sentMessages.map((message) =>
      message.content.includes('You are Agent-2') ? 'Agent-2' : 'Agent-1'),
    ['Agent-2', 'Agent-1'],
  );
  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-2', 'Agent-1'],
  );
  assert.match(
    runtimeClient.sentMessages[1]?.content ?? '',
    /\[agent:Agent-2\] Agent-2 handled the first step\./u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.content ?? '',
    /Latest routed handoff:\nAgent-2 handled the first step\./u,
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
  assert.equal(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'fan_out'),
    false,
  );
});

test('sequential room audience does not redispatch queued targets when replies mention the remaining audience', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const now = new Date('2026-03-21T00:00:00.000Z');
  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );

  const firstReply = createDeferred();
  const secondReply = createDeferred();
  const secondRequested = createDeferred();
  const thirdRequested = createDeferred();
  let secondHasStarted = false;
  let thirdHasStarted = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-2')) {
      secondHasStarted = true;
      secondRequested.resolve();
      return secondReply.promise;
    }
    if (content.includes('You are Agent-3')) {
      thirdHasStarted = true;
      thirdRequested.resolve();
      return usage('Agent-3 closed out the room.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Handle this in order.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id, agent3Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    now,
  );

  await Promise.resolve();
  assert.equal(secondHasStarted, false);
  assert.equal(thirdHasStarted, false);

  firstReply.resolve(usage('@Agent-2 @Agent-3 take the next steps in order.'));
  await secondRequested.promise;
  assert.equal(thirdHasStarted, false);

  secondReply.resolve(usage('@Agent-3 finish the room.'));
  await thirdRequested.promise;

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => {
      if (message.content.includes('You are Agent-1')) {
        return 'Agent-1';
      }
      if (message.content.includes('You are Agent-2')) {
        return 'Agent-2';
      }
      if (message.content.includes('You are Agent-3')) {
        return 'Agent-3';
      }
      return 'unknown';
    }),
    ['Agent-1', 'Agent-2', 'Agent-3'],
  );
  assert.equal(runtimeClient.createdSessions.length, 3);
  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2', 'Agent-3'],
  );
  assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 3);
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
  assert.equal(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'fan_out'),
    false,
  );
});

test('concurrent room audience does not redispatch completed peer targets from a later branch handoff', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const now = new Date('2026-03-21T00:00:00.000Z');
  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );

  const firstReply = createDeferred();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 handled the concurrent branch.');
    }
    if (content.includes('You are Agent-3')) {
      return usage('Agent-3 handled the concurrent branch.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Handle this together.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id, agent3Id],
        workflowShape: 'concurrent',
      },
    },
    runtimeClient,
    now,
  );

  await Promise.resolve();
  firstReply.resolve(usage('@Agent-2 @Agent-3 summarize your branches.'));

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');
  const dispatches = channel.roomRouting?.lastOutcome?.dispatches ?? [];
  const dispatchesByTarget = new Map();
  const repliesBySender = new Map();
  for (const dispatch of dispatches) {
    dispatchesByTarget.set(
      dispatch.target.participantName,
      (dispatchesByTarget.get(dispatch.target.participantName) ?? 0) + 1,
    );
  }
  for (const reply of replies) {
    repliesBySender.set(
      reply.senderName,
      (repliesBySender.get(reply.senderName) ?? 0) + 1,
    );
  }

  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => {
      if (message.content.includes('You are Agent-1')) {
        return 'Agent-1';
      }
      if (message.content.includes('You are Agent-2')) {
        return 'Agent-2';
      }
      if (message.content.includes('You are Agent-3')) {
        return 'Agent-3';
      }
      return 'unknown';
    }).sort(),
    ['Agent-1', 'Agent-2', 'Agent-3'],
  );
  assert.equal(runtimeClient.createdSessions.length, 3);
  assert.equal(replies.length, 3);
  assert.equal(dispatches.length, 3);
  assert.equal(dispatchesByTarget.get('Agent-1') ?? 0, 1);
  assert.equal(dispatchesByTarget.get('Agent-2') ?? 0, 1);
  assert.equal(dispatchesByTarget.get('Agent-3') ?? 0, 1);
  assert.equal(repliesBySender.get('Agent-1') ?? 0, 1);
  assert.equal(repliesBySender.get('Agent-2') ?? 0, 1);
  assert.equal(repliesBySender.get('Agent-3') ?? 0, 1);
  assert.equal(
    dispatches.some((dispatch) => dispatch.trigger === 'continuation_mention'),
    false,
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'concurrent');
});

test('current-turn draft audience metadata respects the configured audience cap', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
  state.capabilities.maxAudienceParticipants = 1;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 handled the capped audience turn.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Kick off the capped shared room.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages[0]?.content.includes('You are Agent-2'), true);
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Agent-1')), false);
  assert.deepEqual(replies.map((message) => message.senderName), ['Agent-2']);
});

test('explicit mentions stay authoritative over current-turn draft audience metadata', async () => {
  const { state, channelId, agent2Id } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 handled the explicit mention.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: '@Agent-1 take the first pass.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages[0]?.content.includes('You are Agent-1'), true);
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Agent-2')), false);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'explicit_mentions');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
});

test('multi-target converge metadata does not force the turn down the sequential path', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
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
    {
      body: 'Kick off the shared room.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id],
        workflowShape: 'converge',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );

  await bothRequested.promise;
  agent2Reply.resolve(usage('Agent-2 handled the second branch.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 handled the first branch.'));

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.workflowShape,
    'concurrent',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.events.some(
      (event) => event.kind === 'fan_out',
    ),
    true,
  );
});

test('routeChannelMessage persists in-flight workflow snapshots before the full route completes', async () => {
  const { state, channelId } = await createChannelState();
  const store = new TrackingChatStore(state);
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
    { chatStore: store },
  );
  await bothRequested.promise;

  const persistedState = await store.read();
  const persistedChannel = buildChannelView(persistedState, channelId);
  const persistedCore = await store.readCore();
  const persistedRun = persistedCore.runs.find((candidate) =>
    candidate.conversationId === `conversation-channel-${channelId}`,
  );

  assert.ok(store.writeCount >= 2);
  assert.equal(persistedChannel.roomRouting?.workflow.activeTurn?.status, 'running');
  assert.equal(persistedChannel.roomRouting?.workflow.turnHistory.length, 0);
  assert.equal(
    persistedChannel.roomRouting?.workflow.activeTurn?.targetStatuses.length,
    2,
  );
  assert.ok(
    persistedChannel.roomRouting?.workflow.activeTurn?.targetStatuses.every(
      (target) => target.status === 'pending' || target.status === 'running',
    ),
  );
  assert.ok(persistedRun);
  assert.equal(persistedRun?.status, 'running');

  agent2Reply.resolve(usage('Agent-2 finished the review.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 finished the review.'));
  const dispatched = await dispatchedPromise;
  const finalChannel = buildChannelView(dispatched.state, channelId);

  assert.equal(finalChannel.roomRouting?.workflow.activeTurn, null);
  assert.equal(finalChannel.roomRouting?.workflow.turnHistory.length, 1);
});

test('routeChannelMessage auto-checks out an approved channel task for the assigned cat session', async () => {
  const { state, channelId } = await createChannelState();
  const store = new CountingCoreChatStore();
  const now = new Date('2026-03-24T03:00:00.000Z');
  await store.write(state);

  const taskId = `task-channel-${channelId}`;
  const approvedCore = await store.readCore();
  await store.writeCore({
    ...approvedCore,
    tasks: approvedCore.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: 'approved',
            approval: {
              ...task.approval,
              status: 'approved',
              decidedAt: now.toISOString(),
              decidedByActorId: 'actor-owner',
            },
          }
        : task),
  });
  store.readCoreCount = 0;

  const watcherGate = createDeferred();
  let runCompleted = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    runCompleted = true;
    watcherGate.resolve();
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 finished the review.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });
  runtimeClient.observeSession = async (sessionId) => ({
    session: {
      id: sessionId,
      inspection: runCompleted
        ? {
            state: 'idle',
            lastRun: {
              id: `runtime-run-${sessionId}`,
              status: 'succeeded',
              startedAt: now.toISOString(),
              endedAt: '2026-03-24T03:01:00.000Z',
              resultSummary: 'Agent-1 finished the review.',
            },
          }
        : {
            state: 'running',
            currentRun: {
              id: `runtime-run-${sessionId}`,
              status: 'running',
              startedAt: now.toISOString(),
            },
          },
    },
    observePath: `/sessions/${sessionId}/observe`,
    stream: {
      path: `/sessions/${sessionId}/stream`,
      available: true,
    },
  });
  runtimeClient.streamSession = async () => {
    await watcherGate.promise;
  };

  const dispatched = await routeChannelMessage(
    await store.read(),
    channelId,
    { body: '@Agent-1 review this change.' },
    runtimeClient,
    now,
    { chatStore: store },
  );
  await store.write(dispatched.state);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const routeReadCoreCount = store.readCoreCount;

  const core = await store.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId);
  const run = core.runs.find((candidate) =>
    candidate.taskId === taskId && candidate.metadata?.source === 'task-lifecycle');

  assert.ok(task);
  assert.ok(run);
  // One read primes the task-aware session request, then the watcher performs
  // its initial and terminal reconciliation reads.
  assert.equal(routeReadCoreCount, 3);
  assert.equal(runtimeClient.createdSessions[0]?.requestedStrategy, 'react');
  assert.deepEqual(runtimeClient.createdSessions[0]?.correlation, {
    taskId,
    conversationId: `conversation-channel-${channelId}`,
    workItemId: buildChatWorkItemId(channelId),
    product: 'chat',
  });
  assert.equal(run?.status, 'completed');
  assert.equal(run?.metadata.sessionId, 'session-1');
  assert.equal(task?.status, 'completed');
  assert.equal(task?.metadata?.taskLifecycle?.runId, run?.id);
  assert.ok(
    core.activities.some((activity) => activity.runId === run?.id && /started/i.test(activity.message)),
  );
  assert.ok(
    core.activities.some((activity) => activity.runId === run?.id && /completed/i.test(activity.message)),
  );
});

test('routeChannelMessage forwards planning metadata into chat session creation for approved tasks', async () => {
  const { state, channelId } = await createChannelState();
  const store = new MemoryChatStore();
  const now = new Date('2026-03-24T04:00:00.000Z');
  await store.write(state);

  const taskId = `task-channel-${channelId}`;
  const approvedCore = await store.readCore();
  await store.writeCore({
    ...approvedCore,
    tasks: approvedCore.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: 'approved',
            approval: {
              ...task.approval,
              status: 'approved',
              decidedAt: now.toISOString(),
              decidedByActorId: 'actor-owner',
            },
            metadata: patchTaskPlanningMetadata(task.metadata, {
              strategyHint: 'tree_of_thoughts',
              acceptanceCriteria: 'Summarize the review and flag any blockers.',
              strategyContext: {
                reviewMode: 'strict',
              },
            }),
          }
        : task),
  });

  const runtimeClient = createRuntimeStub(async () => usage('Agent-1 completed the turn.'));

  await routeChannelMessage(
    await store.read(),
    channelId,
    { body: '@Agent-1 review the latest diff.' },
    runtimeClient,
    now,
    { chatStore: store },
  );

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.createdSessions[0].requestedStrategy, 'tree_of_thoughts');
  assert.equal(
    runtimeClient.createdSessions[0].acceptanceCriteria,
    'Summarize the review and flag any blockers.',
  );
  assert.deepEqual(runtimeClient.createdSessions[0].strategyContext, {
    reviewMode: 'strict',
  });
  assert.deepEqual(runtimeClient.createdSessions[0].correlation, {
    taskId,
    conversationId: `conversation-channel-${channelId}`,
    workItemId: buildChatWorkItemId(channelId),
    product: 'chat',
  });
});

test('solo composer mode restarts orchestrator sessions when the pending model changes and records provenance', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Solo Thread',
      topic: 'Switch between providers per turn.',
      skipBossCatGreeting: true,
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First turn',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  const secondDispatch = await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Second turn',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );
  const channel = buildChannelView(secondDispatch.state, channelId);
  const soloReplies = channel.messages.filter(
    (message) => message.metadata?.targetKind === 'orchestrator' && message.senderName === 'Orchestrator',
  );

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(runtimeClient.createdSessions[0].provider, 'claude');
  assert.equal(runtimeClient.createdSessions[1].provider, 'gemini');
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(channel.pendingProvider, 'gemini');
  assert.equal(channel.pendingModel, 'gemini-default');
  assert.equal(soloReplies[0]?.senderKind, 'agent');
  assert.equal(soloReplies[0]?.executionProvider, 'claude');
  assert.equal(soloReplies[0]?.executionModel, 'claude-default');
  assert.equal(soloReplies[1]?.senderKind, 'agent');
  assert.equal(soloReplies[1]?.executionProvider, 'gemini');
  assert.equal(soloReplies[1]?.executionModel, 'gemini-default');
  assert.equal(runtimeClient.sentMessages[0]?.content, 'First turn');
  assert.equal(runtimeClient.sentMessages[0]?.input?.instructions, undefined);
  assert.equal(runtimeClient.sentMessages[1]?.content, 'Second turn');
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /Earlier chat context:/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] First turn/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[agent:Orchestrator\] response from session-1/u,
  );
});

test('solo composer mode sends raw user text without default instructions on a stable session', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Solo Thread',
      topic: 'Keep the runtime message raw.',
      skipBossCatGreeting: true,
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Hi',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Follow-up',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  assert.equal(runtimeClient.sentMessages.length, 2);
  assert.equal(runtimeClient.sentMessages[0]?.content, 'Hi');
  assert.equal(runtimeClient.sentMessages[0]?.input?.instructions, undefined);
  assert.equal(runtimeClient.sentMessages[1]?.content, 'Follow-up');
  assert.equal(runtimeClient.sentMessages[1]?.input?.instructions, undefined);
});

test('solo composer mode honors pending runtime memory flush hooks before restarting the session', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Solo thread',
      topic: 'Restart the solo session after switching models.',
      skipBossCatGreeting: true,
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) => usage(`response from ${sessionId}`));
  runtimeClient.observeSession = async () => ({
    session: {
      context: {
        metadata: {
          channelId,
        },
      },
      inspection: {
        maintenance: {
          hooks: {
            preReset: {
              pending: [
                {
                  id: 'memory_flush',
                  status: 'pending',
                },
              ],
            },
            preCompaction: {
              pending: [],
            },
          },
        },
      },
    },
  });
  const flushedChannels = [];
  const memoryService = {
    async flushChannel(input) {
      flushedChannels.push({ ...input });
      return {
        scope: 'channel',
        subjectId: input.channelId,
        reason: input.reason ?? 'manual',
        generatedAt: (input.now ?? now).toISOString(),
        persistedCount: 1,
        persistedRecordIds: ['cats-memory-1'],
        removedRecordIds: [],
        payload: {
          version: 1,
          reason: input.reason ?? 'manual',
          generatedAt: (input.now ?? now).toISOString(),
          subject: {
            kind: 'channel',
            id: input.channelId,
          },
          replacementMode: 'subject_projection_replace',
          sourceScopeKeys: ['channel:working-memory'],
          persistedRecords: [
            {
              recordId: 'cats-memory-1',
              category: 'fact',
              originKind: 'channel_working_memory',
              promotionRule: 'channel_fact',
              visibility: 'channel_private',
              sourceRefs: [],
              sourceScopeKeys: ['channel:working-memory'],
              replacementGroup: `channel:${input.channelId}:fact:0`,
            },
          ],
          removedRecordIds: [],
        },
      };
    },
  };
  await store.write(state);

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First turn',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
    { memoryService, chatStore: store },
  );
  await store.write(firstDispatch.state);
  await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Second turn',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
    { memoryService, chatStore: store },
  );

  assert.deepEqual(flushedChannels, [
    {
      channelId,
      reason: 'pre_reset',
      now: new Date('2026-03-23T00:01:00.000Z'),
    },
  ]);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  const core = await store.readCore();
  assert.ok(
    core.activities.some((activity) =>
      activity.metadata?.category === 'memory_maintenance'
      && activity.metadata?.trigger === 'runtime_hook'
      && activity.metadata?.status === 'executed'
      && activity.metadata?.phase === 'pre_reset'
      && activity.metadata?.channelId === channelId),
  );
});

test('cat-led room routing continues across agent mentions and auto-wakes targeted participants', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
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
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 2);
  assert.equal(channel.roomRouting?.lastOutcome?.continuationCount, 1);
  assert.equal(channel.roomRouting?.lastOutcome?.guard, null);
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.reason),
    ['workflow_continuation', 'room_default'],
  );
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.status),
    ['completed', 'completed'],
  );
  assert.equal(
    channel.roomRouting?.lastOutcome?.resolution.defaultTargetReason,
    'cat_led_recipient',
  );
  assert.ok(
    channel.roomRouting?.lastOutcome?.checkpoints.some(
      (checkpoint) => checkpoint.kind === 'continuation',
    ),
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.dispatchCount, 2);
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.continuationCount, 1);
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.stageId, 'turn_completed');
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
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.some(
      (target) =>
        target.handoffReason === 'workflow_continuation'
        && target.branchStrategy === 'transplant_context',
    ),
  );
});

test('structured workflow recommendations drive continuation when no explicit @mention is present', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage([
        'Passing implementation to the next specialist.',
        '```json',
        JSON.stringify({
          workflowRecommendation: {
            workflowShape: 'sequential',
            candidateTargetNames: ['Agent-2'],
            branchStrategy: 'transplant_context',
            rationale: 'Agent-2 should implement the change.',
          },
        }),
        '```',
      ].join('\n'));
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
  const continuationEvent = channel.roomRouting?.workflow.turnHistory[0]?.events.find(
    (event) => event.kind === 'checkpoint' && event.metadata.checkpointKind === 'continuation',
  );

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(replies[0]?.body, 'Passing implementation to the next specialist.');
  assert.equal(
    replies[0]?.metadata.workflowRecommendation?.workflowShape,
    'sequential',
  );
  assert.equal(channel.roomRouting?.lastOutcome?.continuationCount, 1);
  assert.equal(continuationEvent?.metadata.continuationSource, 'workflow_recommendation');
  assert.equal(
    continuationEvent?.metadata.workflowRecommendation?.candidateTargets?.[0]?.participantName,
    'Agent-2',
  );
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.some(
      (target) =>
        target.participant.participantName === 'Agent-2'
        && target.branchStrategy === 'transplant_context',
    ),
  );
});

test('segmented replies keep final-only completion semantics while workflow recommendations use the full turn', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return {
        segments: [
          {
            kind: 'text',
            text: [
              'Passing implementation to the next specialist.',
              '```json',
              JSON.stringify({
                workflowRecommendation: {
                  workflowShape: 'sequential',
                  candidateTargetNames: ['Agent-2'],
                  branchStrategy: 'transplant_context',
                  rationale: 'Agent-2 should implement the change.',
                },
              }),
              '```',
            ].join('\n'),
            toolName: null,
            toolId: null,
          },
          {
            kind: 'tool_use',
            text: '',
            toolName: 'search',
            toolId: 'tool-search',
          },
          {
            kind: 'text',
            text: 'I already gathered notes for Agent-2.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
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
  const agentOneReplies = channel.messages.filter((message) => message.senderName === 'Agent-1');

  assert.deepEqual(
    agentOneReplies.map((message) => message.body),
    [
      'Passing implementation to the next specialist.',
      'I already gathered notes for Agent-2.',
    ],
  );
  assert.equal(agentOneReplies[0]?.metadata.event, 'assistant_turn_segment');
  assert.equal(agentOneReplies[0]?.metadata.terminal, false);
  assert.equal(agentOneReplies[1]?.metadata.event, 'assistant_turn_segment');
  assert.equal(agentOneReplies[1]?.metadata.terminal, true);
  assert.equal(
    agentOneReplies[1]?.metadata.workflowRecommendation?.workflowShape,
    'sequential',
  );
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.some(
      (target) =>
        target.participant.participantName === 'Agent-2'
        && target.branchStrategy === 'transplant_context',
    ),
  );
});

test('explicit @mentions stay authoritative over structured workflow recommendations', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage([
        '@Agent-2 take this next.',
        '```json',
        JSON.stringify({
          workflowRecommendation: {
            workflowShape: 'sequential',
            candidateTargetNames: ['Agent-1'],
            branchStrategy: 'fork_if_possible',
            rationale: 'Conflicting recommendation should not override the explicit handoff.',
          },
        }),
        '```',
      ].join('\n'));
    }
    if (content.includes('You are Agent-2')) {
      return usage('Handled after the explicit handoff.');
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
  const continuationEvent = channel.roomRouting?.workflow.turnHistory[0]?.events.find(
    (event) => event.kind === 'checkpoint' && event.metadata.checkpointKind === 'continuation',
  );
  const agent2Target = channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
    (target) => target.participant.participantName === 'Agent-2',
  );

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(replies[0]?.body, '@Agent-2 take this next.');
  assert.equal(continuationEvent?.metadata.continuationSource, 'explicit_mentions');
  assert.equal(
    continuationEvent?.targets[0]?.participantName,
    'Agent-2',
  );
  assert.equal(agent2Target?.branchStrategy, 'transplant_context');
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
      defaultRecipientId: companionId,
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
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.defaultTargetReason, 'direct_chat_recipient');
  assert.equal(channel.roomRouting?.wakeHistory[0]?.reason, 'room_default');
  assert.equal(channel.roomRouting?.wakeHistory[0]?.participant.participantId, companionId);
  assert.equal(channel.messages.at(-1)?.senderName, 'Companion');
  assert.equal(channel.status, 'active');
});

test('direct cat chat treats lead-cat mentions as plain text and stays on the lane', async () => {
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
      topic: 'Treat lead-cat mentions as plain text inside the lane.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage('Companion stayed on the direct lane.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Companion 我想你' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'default_target');
  assert.deepEqual(channel.roomRouting?.lastOutcome?.unresolvedMentions, []);
  assert.equal(
    channel.messages.some((message) => /Unresolved mentions:|No valid room targets matched/i.test(message.body)),
    false,
  );
  assert.equal(channel.messages.at(-1)?.senderName, 'Companion');
});

test('direct cat chat blocks explicit Boss Cat mentions instead of routing out of lane', async () => {
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
      topic: 'Stay on the direct lane even when Boss Cat is mentioned.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Smelly please take this over.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(runtimeClient.sentMessages.length, 0);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'blocked');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.blockedReason, 'no_valid_targets');
  assert.deepEqual(channel.roomRouting?.lastOutcome?.unresolvedMentions, ['Smelly']);
  assert.match(channel.messages.at(-2)?.body ?? '', /Unresolved mentions: @Smelly/u);
  assert.match(channel.messages.at(-1)?.body ?? '', /No valid room targets matched the explicit mentions/i);
});

test('direct cat chat ignores workflow recommendations that target Boss Cat', async () => {
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
      topic: 'Structured handoffs must not escape the direct lane.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage([
        'I think Boss Cat should take a look.',
        '```json',
        JSON.stringify({
          workflowRecommendation: {
            workflowShape: 'sequential',
            candidateTargetNames: ['Smelly'],
            branchStrategy: 'transplant_context',
            rationale: 'Escalate to Boss Cat.',
          },
        }),
        '```',
      ].join('\n'));
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this and keep the lane direct.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const noTargetCheckpoint = channel.roomRouting?.workflow.turnHistory[0]?.events.find(
    (event) => event.kind === 'checkpoint' && event.metadata.checkpointKind === 'no_targets',
  );

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Smelly')), false);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.roomRouting?.lastOutcome?.continuationCount, 0);
  assert.equal(noTargetCheckpoint?.metadata.continuationSource, 'workflow_recommendation');
  assert.deepEqual(noTargetCheckpoint?.metadata.unresolvedTargets, ['Smelly']);
  assert.match(channel.messages.at(-1)?.body ?? '', /I think Boss Cat should take a look\./u);
});

test('direct cat chat recreates a stale lead-cat session once when runtime reports session not found', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-24T00:00:00.000Z');

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
      topic: 'Recover stale direct session leases.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-stale',
      status: 'ready',
      lastError: null,
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  const runtimeClient = createRuntimeStub(async ({ sessionId, content }) => {
    if (!content.includes('You are Companion')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    if (sessionId === 'session-stale') {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (sessionId === 'session-1') {
      return usage('Companion recovered the direct lane.');
    }
    throw new Error(`Unexpected session: ${sessionId}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Recover the lane and answer.' },
    runtimeClient,
    now,
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 1,
      },
    },
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.sentMessages.length, 2);
  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => message.sessionId),
    ['session-stale', 'session-1'],
  );
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.deepEqual(runtimeClient.closedSessions, ['session-stale']);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, 'session-1');
  assert.equal(channel.assignedCats[0]?.execution.lease.status, 'ready');
  assert.equal(channel.assignedCats[0]?.execution.lease.lastError, null);
  assert.match(channel.messages.at(-1)?.body ?? '', /recovered the direct lane/i);
});

test('direct cat chat recreates a closed lead-cat session once when runtime demands resume first', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-24T00:00:00.000Z');

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
      topic: 'Recover closed direct session leases.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-closed',
      status: 'error',
      lastError: 'Session is closed. Resume it first.',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  const runtimeClient = createRuntimeStub(async ({ sessionId, content }) => {
    if (!content.includes('You are Companion')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    if (sessionId === 'session-closed') {
      throw new Error('Session is closed. Resume it first.');
    }
    if (sessionId === 'session-1') {
      return usage('Companion reopened the direct lane.');
    }
    throw new Error(`Unexpected session: ${sessionId}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Resume the lane and answer.' },
    runtimeClient,
    now,
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 1,
      },
    },
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.sentMessages.length, 2);
  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => message.sessionId),
    ['session-closed', 'session-1'],
  );
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.deepEqual(runtimeClient.closedSessions, ['session-closed']);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, 'session-1');
  assert.equal(channel.assignedCats[0]?.execution.lease.status, 'ready');
  assert.equal(channel.assignedCats[0]?.execution.lease.lastError, null);
  assert.match(channel.messages.at(-1)?.body ?? '', /reopened the direct lane/i);
});

test('session-full errors stop immediately and clear the direct lane lease instead of retrying', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-24T00:00:00.000Z');

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
      topic: 'Stop when the runtime session is full.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-full',
      status: 'ready',
      lastError: null,
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  const runtimeClient = createRuntimeStub(async ({ sessionId, content }) => {
    if (!content.includes('You are Companion')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    if (sessionId === 'session-full') {
      throw new Error('Session full: hard limit reached for this conversation.');
    }
    throw new Error(`Unexpected session: ${sessionId}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Do not retry this forever.' },
    runtimeClient,
    now,
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 5,
      },
    },
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, null);
  assert.equal(channel.assignedCats[0]?.execution.lease.status, 'error');
  assert.match(channel.assignedCats[0]?.execution.lease.lastError ?? '', /session full|hard limit/i);
  assert.match(channel.messages.at(-1)?.body ?? '', /Failed to route the message to Companion/i);
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
      defaultRecipientId: companionId,
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
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.blockedReason, 'missing_direct_chat_recipient');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.defaultTarget?.participantId, companionId);
  assert.equal(channel.roomRouting?.wakeHistory.length, 0);
  assert.match(channel.messages.at(-1)?.body ?? '', /no longer has an active lead Cat/i);
});

test('already-awake route targets record skipped wake requests without a completion timestamp', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-23T00:00:00.000Z');

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
      topic: 'Keep skipped wake requests machine-readable.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage('Companion stayed on the direct lane.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const firstTurn = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this directly.' },
    runtimeClient,
    now,
  );
  const secondTurn = await routeChannelMessage(
    firstTurn.state,
    channelId,
    { body: 'Handle the follow-up directly too.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(secondTurn.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.status),
    ['skipped', 'completed'],
  );
  assert.equal(channel.roomRouting?.lastWakeRequest?.status, 'skipped');
  assert.equal(channel.roomRouting?.lastWakeRequest?.completedAt, null);
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

  assert.equal(promptsByTarget.Smelly.length, 1);
  assert.equal(promptsByTarget['Agent-1'].length, 2);
  assert.ok(promptsByTarget['Agent-1'][1].includes('@Smelly please review.'));
  assert.ok(promptsByTarget['Agent-1'][1].includes('@Agent-1 take first pass.'));
  assert.equal(promptsByTarget['Agent-1'][1].includes('[user:User] Start the routing loop.'), false);
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
