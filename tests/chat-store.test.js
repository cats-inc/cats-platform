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
  updateGlobalOrchestrator,
} from '../dist-server/chat/model.js';
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

  assert.equal(parsedState.version, 2);
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

test('FileChatStore preserves core-owned task, run, trace, checkpoint, and outcome records', async () => {
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

  assert.equal(reloadedCore.version, 2);
  assert.equal(reloadedCore.ownerProfile.displayName, 'Boss Owner');
  assert.ok(reloadedCore.tasks.some((task) => task.id === 'task-system-1'));
  assert.ok(reloadedCore.tasks.some((task) => task.id.startsWith('task-channel-')));
  assert.equal(reloadedCore.runs[0].id, 'run-system-1');
  assert.equal(reloadedCore.traces[0].id, 'trace-record-1');
  assert.equal(reloadedCore.checkpoints[0].id, 'checkpoint-system-1');
  assert.equal(reloadedCore.outcomes[0].id, 'outcome-system-1');
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


