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
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
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
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'parallel');
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

test('routeChannelMessage auto-checks out an approved channel task for the assigned cat session', async () => {
  const { state, channelId } = await createChannelState();
  const store = new MemoryChatStore();
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

  const core = await store.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId);
  const run = core.runs.find((candidate) =>
    candidate.taskId === taskId && candidate.metadata?.source === 'task-lifecycle');

  assert.ok(task);
  assert.ok(run);
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
  const orchestratorReplies = channel.messages.filter((message) => message.senderKind === 'orchestrator');

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(runtimeClient.createdSessions[0].provider, 'claude');
  assert.equal(runtimeClient.createdSessions[1].provider, 'gemini');
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(channel.pendingProvider, 'gemini');
  assert.equal(channel.pendingModel, 'gemini-default');
  assert.equal(orchestratorReplies[0]?.executionProvider, 'claude');
  assert.equal(orchestratorReplies[0]?.executionModel, 'claude-default');
  assert.equal(orchestratorReplies[1]?.executionProvider, 'gemini');
  assert.equal(orchestratorReplies[1]?.executionModel, 'gemini-default');
});

test('solo composer mode honors pending runtime memory flush hooks before restarting the session', async () => {
  let state = await new MemoryChatStore().read();
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
      };
    },
  };

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
    { memoryService },
  );
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
    { memoryService },
  );

  assert.deepEqual(flushedChannels, [
    {
      channelId,
      reason: 'pre_reset',
      now: new Date('2026-03-23T00:01:00.000Z'),
    },
  ]);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
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
    'cat_led_lead',
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
      leadParticipantId: companionId,
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
