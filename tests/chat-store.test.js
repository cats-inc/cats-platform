import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendMessage,
  assignCatToChannel,
  createChannel,
  createCat,
  deleteChannel,
  exportChannel,
  removeCatFromChannel,
  updateGlobalOrchestrator,
} from '../dist-server/chat/model.js';
import { routeChannelMessage } from '../dist-server/chat/runtimeActions.js';
import { createSharedCoreFixtureBundle } from '../dist-server/shared/core.js';
import { UUID_PATTERN } from '../dist-server/shared/channelPaths.js';
import { FileChatStore } from '../dist-server/chat/store.js';

test('FileChatStore persists configured channels, cats, assignments, and messages to disk', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);

  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Ops Radar',
      topic: 'Track runtime regressions before shipping the desktop shell.',
      cats: [
        {
          name: 'Agent-1',
          provider: 'claude',
          roles: ['coder'],
        },
      ],
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );

  const channelId = state.selectedChannelId;
  state = createCat(
    state,
    {
      name: 'Agent-2',
      provider: 'gemini',
      roles: ['reviewer'],
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );

  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: state.cats[0].id,
      provider: 'gemini',
      roles: ['reviewer'],
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Please review this change with @Agent-1',
    },
    new Date('2026-03-11T00:00:00.000Z'),
  ).state;

  await store.write(state);

  const rawState = await readFile(statePath, 'utf-8');
  const parsedState = JSON.parse(rawState);
  const createdChannel = parsedState.chat.channels.find((channel) => channel.id === channelId);

  assert.equal(parsedState.version, 5);
  assert.match(parsedState.chat.selectedChannelId, UUID_PATTERN);
  assert.equal(parsedState.chat.selectedChannelId, channelId);
  assert.equal(parsedState.chat.cats.length, 2);
  assert.ok(parsedState.ownerProfile);
  assert.ok(Array.isArray(parsedState.actors));
  assert.ok(Array.isArray(parsedState.conversations));
  assert.ok(Array.isArray(parsedState.tasks));
  assert.ok(createdChannel);
  assert.equal(createdChannel.catAssignments.length, 2);
  assert.equal(createdChannel.catAssignments[0].execution.target.provider, 'claude');
  assert.equal(createdChannel.messages.at(-1).mentions[0], 'Agent-1');
});

test('assigning the first cat upgrades a solo chat into cat-led mode and removing the last cat returns it to solo', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Milo',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const catId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Solo Thread',
      topic: 'Starts without visible cats.',
      skipBossCatGreeting: true,
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );
  const channelId = state.selectedChannelId;

  state = assignCatToChannel(
    state,
    channelId,
    {
      catId,
      provider: 'claude',
      model: 'claude-default',
    },
    now,
  );
  assert.equal(state.channels[0].composerMode, 'cat_led');
  assert.equal(state.channels[0].roomRouting?.leadParticipantId, catId);

  state = removeCatFromChannel(
    state,
    channelId,
    catId,
    new Date('2026-03-23T00:05:00.000Z'),
  );
  assert.equal(state.channels[0].composerMode, 'solo');
  assert.equal(state.channels[0].roomRouting?.leadParticipantId, null);
});

test('FileChatStore round-trips per-message execution provenance', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-23T00:10:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Execution Provenance',
      topic: 'Remember which provider answered.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: 'Orchestrator',
      body: 'Here is the answer.',
    },
    now,
    {
      execution: {
        provider: 'gemini',
        model: 'gemini-default',
        instance: 'default',
      },
    },
  ).state;

  await store.write(state);
  const reloaded = await store.read();
  const lastMessage = reloaded.channels[0]?.messages.at(-1);

  assert.equal(lastMessage?.executionProvider, 'gemini');
  assert.equal(lastMessage?.executionModel, 'gemini-default');
  assert.equal(lastMessage?.executionInstance, 'default');
});

test('FileChatStore preserves first-class choices, embedded-json extraction, and choice responses', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-24T09:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Choice Contract',
      topic: 'Persist structured choices in transcript history.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Designer Cat',
      body: [
        'Pick a style:',
        '```json',
        '{"choices":[{"question":"Which style?","options":[{"id":"minimal","label":"Minimal"},{"id":"bold","label":"Bold"}],"allowSkip":true}]}',
        '```',
      ].join('\n'),
    },
    now,
  ).state;
  const sourceMessageId = state.channels[0].messages.at(-1)?.id;
  assert.ok(sourceMessageId);

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Q: Which style?\nA: Minimal',
    },
    new Date('2026-03-24T09:01:00.000Z'),
    {
      choiceResponse: {
        sourceMessageId,
        status: 'submitted',
        submittedAt: '2026-03-24T09:01:00.000Z',
        answers: [
          {
            question: 'Which style?',
            selectedOptionIds: ['minimal'],
          },
        ],
      },
    },
  ).state;

  await store.write(state);
  const reloaded = await store.read();
  const sourceMessage = reloaded.channels[0]?.messages.find((message) => message.id === sourceMessageId);
  const responseMessage = reloaded.channels[0]?.messages.at(-1);

  assert.equal(sourceMessage?.body, 'Pick a style:');
  assert.equal(sourceMessage?.choices?.length, 1);
  assert.equal(sourceMessage?.choices?.[0]?.options[0]?.label, 'Minimal');
  assert.equal(responseMessage?.choiceResponse?.sourceMessageId, sourceMessageId);
  assert.equal(responseMessage?.choiceResponse?.answers[0]?.selectedOptionIds[0], 'minimal');
});

test('exportChannel returns assigned cats with the selected transcript', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  const initialState = await store.read();
  const state = createChannel(
    initialState,
    {
      title: 'Ops Radar',
      topic: 'Track runtime regressions before shipping the desktop shell.',
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );
  const payload = exportChannel(state, state.selectedChannelId);

  assert.equal(payload.channel.id, state.selectedChannelId);
  assert.equal(payload.orchestrator.mode, 'global');
  assert.ok(Array.isArray(payload.assignedCats));
  assert.ok(Array.isArray(payload.channel.messages));
});

test('ChatStore exposes a derived Cats Core view that stays in sync with chat state', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();

  state = createChannel(
    state,
    {
      title: 'Owner Loop',
      topic: 'Validate owner approvals before dispatch.',
      cats: [
        {
          name: 'Planner',
          provider: 'claude',
          roles: ['planner'],
        },
      ],
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );

  await store.write(state);
  const core = await store.readCore();
  const chatState = await store.read();
  const channelId = state.selectedChannelId;

  assert.equal(chatState.selectedChannelId, channelId);
  assert.equal(core.ownerProfile.actorId, 'actor-owner');
  assert.ok(core.actors.some((actor) => actor.kind === 'owner'));
  assert.ok(core.actors.some((actor) => actor.kind === 'orchestrator'));
  assert.ok(core.actors.some((actor) => actor.name === 'Planner'));
  assert.ok(core.conversations.some((conversation) => conversation.sourceChannelId === channelId));
  assert.ok(core.tasks.some((task) => task.conversationId === `conversation-channel-${channelId}`));
});

test('ChatStore projects room workflow runs, traces, checkpoints, and outcomes into core records', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-22T00:00:00.000Z');

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
      name: 'Agent-1',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const agentId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Workflow Projection',
      topic: 'Project system workflow into core.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agentId,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );

  const runtimeClient = {
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
    sessionCount: 0,
    async createSession(input) {
      this.sessionCount += 1;
      return {
        id: `session-${this.sessionCount}`,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? '/tmp/cats-chat-store',
      };
    },
    async sendMessage(_sessionId, content) {
      if (content.includes('You are Smelly')) {
        return {
          content: '@Agent-1 take first pass.',
          inputTokens: 11,
          outputTokens: 7,
          tokensUsed: 18,
        };
      }
      if (content.includes('You are Agent-1')) {
        return {
          content: 'Done.',
          inputTokens: 10,
          outputTokens: 6,
          tokensUsed: 16,
        };
      }
      throw new Error(`Unexpected prompt:\n${content}`);
    },
    async closeSession() {},
  };

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Smelly Start the room workflow.' },
    runtimeClient,
    now,
  );
  await store.write(dispatched.state);
  const reloadedState = await store.read();
  const reloadedChannel = reloadedState.channels.find((channel) => channel.id === channelId);
  const core = await store.readCore();

  assert.equal(reloadedChannel?.roomRouting?.lastOutcome?.resolution.selectionKind, 'explicit_mentions');
  assert.equal(
    reloadedChannel?.roomRouting?.lastOutcome?.resolution.defaultTargetReason,
    'cat_led_lead',
  );
  assert.deepEqual(
    reloadedChannel?.roomRouting?.wakeHistory.map((wake) => wake.reason),
    ['workflow_continuation', 'explicit_mention'],
  );
  assert.ok(core.runs.some((run) => run.id.startsWith(`run-room-routing-${channelId}-`)));
  assert.ok(
    core.runs.some(
      (run) =>
        run.id.startsWith(`run-room-routing-${channelId}-`)
        && run.metadata.workflowShape === 'sequential'
        && Array.isArray(run.metadata.branchStates),
    ),
  );
  assert.ok(core.traces.some((trace) => trace.id.startsWith('trace-room-routing-')));
  assert.ok(
    core.checkpoints.some(
      (checkpoint) => checkpoint.id.startsWith('checkpoint-room-routing-')
        && checkpoint.metadata.checkpointKind === 'continuation',
    ),
  );
  assert.ok(
    core.outcomes.some(
      (outcome) => outcome.id.startsWith('outcome-room-routing-')
        && outcome.metadata.channelId === channelId,
    ),
  );
  assert.ok(
    core.activities.some(
      (activity) => activity.id.startsWith('activity-room-routing-')
        && activity.conversationId === `conversation-channel-${channelId}`,
    ),
  );
  const projectedTask = core.tasks.find((task) => task.id === `task-channel-${channelId}`);
  const projectedRun = core.runs.find((run) => run.id.startsWith(`run-room-routing-${channelId}-`));
  const projectedCheckpoint = core.checkpoints.find(
    (checkpoint) => checkpoint.id.startsWith('checkpoint-room-routing-')
      && checkpoint.metadata.checkpointKind === 'continuation',
  );
  const projectedOutcome = core.outcomes.find(
    (outcome) => outcome.id.startsWith('outcome-room-routing-')
      && outcome.metadata.channelId === channelId,
  );

  assert.ok(projectedTask);
  assert.equal(projectedTask.metadata.effectiveDeliveryMode, 'artifact_only');
  assert.equal(projectedTask.metadata.effectiveBudgetAlertLevel, 'normal');
  assert.deepEqual(
    projectedTask.metadata.runtimeDeliveryManifest?.requestedActions,
    ['prepare_artifact'],
  );
  assert.equal(projectedTask.metadata.governanceSummary?.approval.pending, false);
  assert.equal(projectedTask.metadata.workflowSummary?.shape, 'sequential');
  assert.ok(projectedRun);
  assert.equal(projectedRun.metadata.workflowSummary?.shape, 'sequential');
  assert.equal(projectedRun.metadata.workflowSummary?.dispatchCount, 2);
  assert.equal(projectedRun.metadata.workflowSummary?.branchStatusCounts.completed, 2);
  assert.ok(projectedCheckpoint);
  assert.equal(projectedCheckpoint.metadata.workflowSummary?.stageId, 'continuation_handoff');
  assert.ok(projectedOutcome);
  assert.equal(projectedOutcome.metadata.workflowSummary?.runStatus, 'completed');
});

test('routeChannelMessage sends choice responses back to the originating cat session without mentions', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-24T10:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Designer Cat',
      provider: 'claude',
      roles: ['designer'],
    },
    now,
  );
  const catId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Choice Routing',
      topic: 'Route structured answers back to the originating cat.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId,
      provider: 'claude',
      roles: ['designer'],
    },
    now,
  );

  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  channel.orchestratorLease = {
    ...channel.orchestratorLease,
    sessionId: 'session-orchestrator',
    status: 'ready',
  };
  channel.catAssignments[0].execution.lease = {
    ...channel.catAssignments[0].execution.lease,
    sessionId: 'session-designer',
    status: 'ready',
  };

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Designer Cat',
      body: 'Which style do you want?',
    },
    now,
    {
      choices: [
        {
          question: 'Which style?',
          options: [
            { id: 'minimal', label: 'Minimal' },
            { id: 'bold', label: 'Bold' },
          ],
          allowSkip: true,
        },
      ],
      metadata: {
        event: 'runtime_response',
        targetKind: 'cat',
        targetId: catId,
        sessionId: 'session-designer',
      },
    },
  ).state;
  const sourceMessageId = state.channels[0].messages.at(-1)?.id;
  assert.ok(sourceMessageId);

  const sentSessionIds = [];
  const runtimeClient = {
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
    async createSession() {
      throw new Error('routeChannelMessage should reuse the existing target session');
    },
    async sendMessage(sessionId) {
      sentSessionIds.push(sessionId);
      return {
        content: 'Thanks, proceeding with Minimal.',
        inputTokens: 8,
        outputTokens: 5,
        tokensUsed: 13,
      };
    },
    async closeSession() {},
  };

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Q: Which style?\nA: Minimal',
      choiceResponse: {
        sourceMessageId,
        status: 'submitted',
        submittedAt: '2026-03-24T10:01:00.000Z',
        answers: [
          {
            question: 'Which style?',
            selectedOptionIds: ['minimal'],
          },
        ],
      },
    },
    runtimeClient,
    new Date('2026-03-24T10:01:00.000Z'),
  );

  assert.deepEqual(sentSessionIds, ['session-designer']);
  assert.equal(dispatched.results[0]?.targetKind, 'cat');
  assert.equal(dispatched.results[0]?.sessionId, 'session-designer');
});

test('FileChatStore preserves null room route targets when reloading persisted routing outcomes', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);
  let state = await store.read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Blocked room',
      topic: 'Keep blocked route targets nullable on reload.',
      skipBossCatGreeting: true,
    },
    now,
  );
  await store.write(state);

  const rawSnapshot = JSON.parse(await readFile(statePath, 'utf-8'));
  const channelRecord = rawSnapshot.chat.channels.find(
    (channel) => channel.id === state.selectedChannelId,
  );
  assert.ok(channelRecord);
  channelRecord.roomRouting.lastOutcome = {
    turnId: 'turn-blocked-room',
    mode: 'boss_chat',
    sourceMessageId: 'message-blocked-room',
    sourceSenderKind: 'user',
    sourceSenderName: 'User',
    status: 'blocked',
    resolution: {
      routingMode: 'room_default',
      selectionKind: 'blocked',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: 'no_valid_targets',
      note: 'No valid targets are available.',
    },
    resolvedTargets: [],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
  };
  await writeFile(statePath, JSON.stringify(rawSnapshot, null, 2));

  const reloadedState = await store.read();
  const reloadedChannel = reloadedState.channels.find(
    (channel) => channel.id === state.selectedChannelId,
  );

  assert.equal(reloadedChannel?.roomRouting?.lastOutcome?.resolution.defaultTarget, null);
  assert.equal(reloadedChannel?.roomRouting?.lastOutcome?.resolution.fallbackTarget, null);
});

test('ChatStore syncs Telegram bot bindings to the current Boss Cat actor', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['planner'],
    },
    new Date('2026-03-19T00:00:00.000Z'),
  );
  state.bossCatId = state.cats[0].id;
  state = updateGlobalOrchestrator(
    state,
    {
      provider: 'claude',
      telegramBotName: 'smelly_bot',
    },
    new Date('2026-03-19T00:01:00.000Z'),
  );

  await store.write(state);
  const core = await store.readCore();
  const telegramBinding = core.botBindings.find((binding) => binding.platform === 'telegram');
  const bossCatActor = core.actors.find((actor) => actor.sourceId === state.bossCatId);

  assert.ok(telegramBinding);
  assert.equal(telegramBinding.botName, 'smelly_bot');
  assert.equal(telegramBinding.bossCatActorId, `actor-cat-${state.bossCatId}`);
  assert.ok(bossCatActor);
  assert.ok(bossCatActor.roles.includes('boss_cat'));
});

test('FileChatStore preserves core-owned shared records across reloads and chat projection sync', async () => {
  const fixtures = createSharedCoreFixtureBundle();
  const statePath = path.join(
    await mkdtemp(path.join(os.tmpdir(), 'cats-store-core-')),
    'chat-state.json',
  );
  const store = new FileChatStore(statePath);
  const initialCore = await store.readCore();

  await store.writeCore({
    ...initialCore,
    ownerProfile: {
      ...initialCore.ownerProfile,
      displayName: 'Boss Owner',
      updatedAt: '2026-03-21T01:00:00.000Z',
    },
    actors: [
      ...initialCore.actors,
      {
        id: 'actor-stakeholder-1',
        name: 'Stakeholder',
        kind: 'stakeholder',
        status: 'active',
        roles: ['observer'],
        skillProfile: null,
        mcpProfile: null,
        defaultExecutionTarget: null,
        memory: { summary: null, facts: [], openLoops: [], updatedAt: null },
        source: 'core_record',
        sourceId: 'stakeholder-1',
        createdAt: '2026-03-21T01:00:00.000Z',
        updatedAt: '2026-03-21T01:00:00.000Z',
        archivedAt: null,
      },
    ],
    conversations: [
      {
        id: 'conversation-system-1',
        title: 'System Thread',
        kind: 'work_thread',
        status: 'active',
        participantActorIds: ['actor-owner', 'actor-stakeholder-1'],
        sourceChannelId: null,
        repoPath: 'C:/repo/one-man-digital-company',
        responseLanguage: 'en',
        createdAt: '2026-03-21T01:00:00.000Z',
        updatedAt: '2026-03-21T01:00:00.000Z',
        lastMessageAt: null,
      },
    ],
    projects: [fixtures.project],
    workItems: [fixtures.workItem],
    tasks: [
      ...initialCore.tasks,
      {
        id: 'task-system-1',
        title: 'Review system checkpoint',
        status: 'pending_approval',
        conversationId: 'conversation-system-1',
        ownerActorId: 'actor-owner',
        orchestratorActorId: 'actor-orchestrator-global',
        assignedActorIds: [],
        summary: 'Persistent system-owned task.',
        approval: {
          status: 'pending',
          requestedAt: '2026-03-21T01:01:00.000Z',
          decidedAt: null,
          decidedByActorId: null,
          notes: 'Persist me across reloads.',
        },
        createdAt: '2026-03-21T01:00:00.000Z',
        updatedAt: '2026-03-21T01:01:00.000Z',
      },
    ],
    runs: [
      {
        id: 'run-system-1',
        title: 'System run',
        status: 'running',
        conversationId: 'conversation-system-1',
        taskId: 'task-system-1',
        parentRunId: null,
        orchestratorActorId: 'actor-orchestrator-global',
        traceId: 'trace-system-1',
        summary: 'Running core-owned orchestration.',
        createdAt: '2026-03-21T01:02:00.000Z',
        startedAt: '2026-03-21T01:02:00.000Z',
        completedAt: null,
        updatedAt: '2026-03-21T01:02:00.000Z',
        metadata: { source: 'team-3' },
      },
    ],
    traces: [
      {
        id: 'trace-record-1',
        traceId: 'trace-system-1',
        kind: 'dispatch',
        conversationId: 'conversation-system-1',
        runId: 'run-system-1',
        taskId: 'task-system-1',
        actorId: 'actor-orchestrator-global',
        message: 'Dispatch recorded in core store.',
        createdAt: '2026-03-21T01:03:00.000Z',
        metadata: { step: 'dispatch' },
      },
    ],
    checkpoints: [
      {
        id: 'checkpoint-system-1',
        label: 'owner-gate',
        status: 'open',
        conversationId: 'conversation-system-1',
        runId: 'run-system-1',
        taskId: 'task-system-1',
        sourceTraceId: 'trace-record-1',
        summary: 'Awaiting owner approval.',
        createdAt: '2026-03-21T01:04:00.000Z',
        completedAt: null,
        updatedAt: '2026-03-21T01:04:00.000Z',
        metadata: { gate: true },
      },
    ],
    outcomes: [
      {
        id: 'outcome-system-1',
        title: 'Blocked for owner',
        status: 'blocked',
        conversationId: 'conversation-system-1',
        runId: 'run-system-1',
        taskId: 'task-system-1',
        summary: 'Waiting for decision.',
        recordedAt: '2026-03-21T01:05:00.000Z',
        updatedAt: '2026-03-21T01:05:00.000Z',
        metadata: { severity: 'info' },
      },
    ],
    artifacts: [fixtures.artifact],
    activities: [fixtures.activity],
    approvalBindings: [fixtures.approvalBinding],
  });

  const reloadedStore = new FileChatStore(statePath);
  let chatState = await reloadedStore.read();
  chatState = createChannel(
    chatState,
    {
      title: 'Chat Channel',
      topic: 'Ensure chat writes preserve core-owned records.',
    },
    new Date('2026-03-21T01:06:00.000Z'),
  );
  await reloadedStore.write(chatState);

  const reloadedCore = await reloadedStore.readCore();

  assert.equal(reloadedCore.version, 5);
  assert.equal(reloadedCore.ownerProfile.displayName, 'Boss Owner');
  assert.ok(reloadedCore.actors.some((actor) => actor.id === 'actor-stakeholder-1'));
  assert.ok(
    reloadedCore.conversations.some(
      (conversation) => conversation.id === 'conversation-system-1',
    ),
  );
  assert.ok(reloadedCore.projects.some((project) => project.id === fixtures.project.id));
  assert.ok(
    reloadedCore.workItems.some((workItem) => workItem.id === fixtures.workItem.id),
  );
  assert.ok(reloadedCore.tasks.some((task) => task.id === 'task-system-1'));
  assert.ok(reloadedCore.tasks.some((task) => task.id.startsWith('task-channel-')));
  assert.equal(reloadedCore.runs[0].id, 'run-system-1');
  assert.equal(reloadedCore.traces[0].id, 'trace-record-1');
  assert.equal(reloadedCore.checkpoints[0].id, 'checkpoint-system-1');
  assert.equal(reloadedCore.outcomes[0].id, 'outcome-system-1');
  assert.equal(reloadedCore.artifacts[0].id, fixtures.artifact.id);
  assert.equal(reloadedCore.activities[0].id, fixtures.activity.id);
  assert.equal(reloadedCore.approvalBindings[0].id, fixtures.approvalBinding.id);
});

test('updateGlobalOrchestrator preserves the existing model when model is omitted', async () => {
  const store = new FileChatStore(
    path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'),
  );
  let state = await store.read();

  state = updateGlobalOrchestrator(
    state,
    {
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
    },
    new Date('2026-03-19T00:00:00.000Z'),
  );

  state = updateGlobalOrchestrator(
    state,
    {
      provider: 'claude',
      telegramBotName: 'smelly_bot',
    },
    new Date('2026-03-19T00:01:00.000Z'),
  );

  assert.equal(state.globalOrchestrator.executionTarget.instance, 'native');
  assert.equal(state.globalOrchestrator.executionTarget.model, 'claude-opus-4-6');
  assert.equal(state.globalOrchestrator.telegramBotName, 'smelly_bot');
});

test('ChatStore rebinds Telegram bot bindings when the Boss Cat changes', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['planner'],
    },
    new Date('2026-03-19T00:00:00.000Z'),
  );
  const firstBossCatId = state.cats[0].id;
  state.bossCatId = firstBossCatId;
  state = updateGlobalOrchestrator(
    state,
    {
      provider: 'claude',
      telegramBotName: 'smelly_bot',
    },
    new Date('2026-03-19T00:01:00.000Z'),
  );
  state = createCat(
    state,
    {
      name: 'Bossy',
      provider: 'gemini',
      roles: ['reviewer'],
    },
    new Date('2026-03-19T00:02:00.000Z'),
  );
  const secondBossCatId = state.cats.find((cat) => cat.id !== firstBossCatId)?.id;
  assert.ok(secondBossCatId);

  state.bossCatId = secondBossCatId;
  await store.write(state);

  const core = await store.readCore();
  const telegramBinding = core.botBindings.find((binding) => binding.platform === 'telegram');
  const firstBossCatActor = core.actors.find((actor) => actor.sourceId === firstBossCatId);
  const secondBossCatActor = core.actors.find((actor) => actor.sourceId === secondBossCatId);

  assert.ok(telegramBinding);
  assert.equal(telegramBinding.bossCatActorId, `actor-cat-${secondBossCatId}`);
  assert.ok(firstBossCatActor);
  assert.ok(secondBossCatActor);
  assert.equal(firstBossCatActor.roles.includes('boss_cat'), false);
  assert.ok(secondBossCatActor.roles.includes('boss_cat'));
});

test('deleteChannel removes the selected chat and falls back to the next recent chat', async () => {
  let state = createChannel(
    await new FileChatStore(
      path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'),
    ).read(),
    {
      title: 'First Chat',
      topic: 'Keep this one after deleting the second.',
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );

  state = createChannel(
    state,
    {
      title: 'Second Chat',
      topic: 'Delete this one from recents.',
    },
    new Date('2026-03-11T00:05:00.000Z'),
  );

  const secondChatId = state.selectedChannelId;
  const firstChatId = state.channels.find((channel) => channel.title === 'First Chat')?.id;

  assert.ok(firstChatId);
  assert.match(secondChatId, UUID_PATTERN);

  const nextState = deleteChannel(state, secondChatId);

  assert.equal(nextState.channels.length, 1);
  assert.equal(nextState.channels[0].id, firstChatId);
  assert.equal(nextState.selectedChannelId, firstChatId);
});

test('createChannel defaults empty draft fields to a neutral new-chat label', async () => {
  const initialState = await new FileChatStore(
    path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'),
  ).read();

  const state = createChannel(
    initialState,
    {
      title: '',
      topic: '',
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );

  assert.equal(state.channels[0].title, 'New chat');
  assert.equal(state.channels[0].topic, '');
  assert.match(state.channels[0].id, UUID_PATTERN);
});

