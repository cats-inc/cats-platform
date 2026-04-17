import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  archiveCat,
  appendMessage,
  assignCatToChannel,
  buildChannelView,
  createChannel,
  createCat,
  deleteCat,
  deleteChannel,
  exportChannel,
  removeCatFromChannel,
  resetSoloChannelContinuity,
  toChannelSummary,
  unarchiveCat,
  updateGlobalOrchestrator,
} from '../build/server/products/chat/state/model/index.js';
import { routeChannelMessage } from '../build/server/products/chat/state/runtimeActions.js';
import { createSharedCoreFixtureBundle } from '../build/server/shared/coreFixtures.js';
import { UUID_PATTERN } from '../build/server/products/chat/shared/channelPaths.js';
import { buildChatWorkItemId, CHAT_ROOT_CONTAINER_ID } from '../build/server/shared/chatCoreIds.js';
import { FileChatStore } from '../build/server/products/chat/state/store.js';

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

test('FileChatStore round-trips explicit solo continuity reset boundaries', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);
  const now = new Date('2026-04-17T00:00:00.000Z');

  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Solo Thread',
      topic: 'Persist explicit continuity resets.',
      skipBossCatGreeting: true,
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = resetSoloChannelContinuity(
    state,
    channelId,
    new Date('2026-04-17T00:00:30.000Z'),
  );

  await store.write(state);

  const reloadedState = await store.read();
  const reloadedChannel = reloadedState.channels.find((channel) => channel.id === channelId);

  assert.equal(reloadedChannel?.continuityResetAt, '2026-04-17T00:00:30.000Z');
  assert.equal(reloadedChannel?.orchestratorLease.sessionId, null);
  assert.equal(reloadedChannel?.messages.at(-1)?.metadata?.event, 'continuity_reset');
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
  assert.equal(state.channels[0].roomRouting?.defaultRecipientId, catId);

  state = removeCatFromChannel(
    state,
    channelId,
    catId,
    new Date('2026-03-23T00:05:00.000Z'),
  );
  assert.equal(state.channels[0].composerMode, 'solo');
  assert.equal(state.channels[0].roomRouting?.defaultRecipientId, null);
});

test('channel topology infers direct lanes and multi-cat rooms independently from routing mode', () => {
  const now = new Date('2026-03-28T00:00:00.000Z');
  let state = createDefaultChatState();

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
      topic: 'Direct lanes expose their own channel kind.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );
  assert.equal(state.channels[0].channelKind, 'direct_lane');
  assert.equal(buildChannelView(state, state.selectedChannelId)?.channelKind, 'direct_lane');

  state = createCat(
    state,
    {
      name: 'Reviewer',
      provider: 'gemini',
      roles: ['reviewer'],
    },
    now,
  );
  const reviewerId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Team room',
      topic: 'Multi-cat rooms are distinguished from boss threads.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const roomId = state.selectedChannelId;
  state = assignCatToChannel(state, roomId, { catId: companionId, provider: 'claude' }, now);
  state = assignCatToChannel(state, roomId, { catId: reviewerId, provider: 'gemini' }, now);

  assert.equal(state.channels[0].channelKind, 'multi_cat_room');
  assert.equal(toChannelSummary(state.channels[0]).channelKind, 'multi_cat_room');
});

test('FileChatStore repairs legacy active snapshots that are missing setupCompleteAt', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);
  const now = new Date('2026-03-26T00:00:00.000Z');

  let state = await store.read();
  state = createCat(
    state,
    {
      name: 'Boss Cat',
      provider: 'claude',
      makeBoss: true,
    },
    now,
  );
  await store.write(state);

  const brokenSnapshot = JSON.parse(await readFile(statePath, 'utf-8'));
  brokenSnapshot.setupCompleteAt = null;
  await writeFile(statePath, `${JSON.stringify(brokenSnapshot, null, 2)}\n`, 'utf-8');

  const reloaded = new FileChatStore(statePath);
  const repairedCore = await reloaded.readCore();
  const repairedSnapshot = JSON.parse(await readFile(statePath, 'utf-8'));

  assert.ok(repairedCore.setupCompleteAt, 'setupCompleteAt should be recovered');
  assert.equal(repairedSnapshot.setupCompleteAt, repairedCore.setupCompleteAt);
});

test('FileChatStore keeps the last known snapshot when the on-disk file is temporarily malformed', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);
  const now = '2026-03-26T12:00:00.000Z';

  let state = await store.read();
  state = createCat(
    state,
    {
      name: 'Boss Cat',
      provider: 'claude',
      makeBoss: true,
    },
    new Date(now),
  );

  const baseCore = createDefaultCoreState();
  const core = {
    ...baseCore,
    setupCompleteAt: now,
    ownerProfile: {
      ...baseCore.ownerProfile,
      displayName: 'Kenneth',
      updatedAt: now,
    },
  };
  await store.writeSnapshot(state, core);

  await writeFile(statePath, '{\n', 'utf-8');

  const recoveredCore = await store.readCore();
  assert.equal(recoveredCore.ownerProfile.displayName, 'Kenneth');
  assert.equal(recoveredCore.setupCompleteAt, now);
});

test('FileChatStore cold-start recovers from backup when the primary snapshot is malformed', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const backupPath = `${statePath}.bak`;
  const store = new FileChatStore(statePath);
  const now = '2026-03-27T00:00:00.000Z';

  let state = await store.read();
  state = createCat(
    state,
    {
      name: 'Boss Cat',
      provider: 'claude',
      makeBoss: true,
    },
    new Date(now),
  );

  const baseCore = createDefaultCoreState();
  await store.writeSnapshot(state, {
    ...baseCore,
    setupCompleteAt: now,
    ownerProfile: {
      ...baseCore.ownerProfile,
      displayName: 'Kenneth',
      updatedAt: now,
    },
  });

  await writeFile(backupPath, await readFile(statePath, 'utf-8'), 'utf-8');
  await writeFile(statePath, '{\n', 'utf-8');

  const recoveredStore = new FileChatStore(statePath);
  const recoveredCore = await recoveredStore.readCore();
  const repairedSnapshot = JSON.parse(await readFile(statePath, 'utf-8'));

  assert.equal(recoveredCore.ownerProfile.displayName, 'Kenneth');
  assert.equal(recoveredCore.setupCompleteAt, now);
  assert.equal(repairedSnapshot.ownerProfile.displayName, 'Kenneth');
});

test('FileChatStore recreates a default snapshot when the primary file is empty and no backup exists', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');

  await writeFile(statePath, '', 'utf-8');

  const recoveredStore = new FileChatStore(statePath);
  const recoveredState = await recoveredStore.read();
  const repairedSnapshot = JSON.parse(await readFile(statePath, 'utf-8'));

  assert.deepEqual(recoveredState.channels, []);
  assert.equal(repairedSnapshot.chat.channels.length, 0);
  assert.ok(repairedSnapshot.ownerProfile);
});

test('archiving a direct-lane cat preserves history but demotes the room back to a visible chat', () => {
  const now = new Date('2026-03-26T00:00:00.000Z');
  let state = createDefaultChatState();

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const catId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion Direct',
      topic: 'Keep this transcript visible after archiving the cat.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [catId],
      defaultRecipientId: catId,
      skipBossCatGreeting: true,
    },
    now,
  );

  state = archiveCat(state, catId);
  const archivedCat = state.cats.find((cat) => cat.id === catId);
  const channel = state.channels[0];
  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);

  assert.equal(archivedCat?.status, 'archived');
  assert.ok(assignment);
  assert.equal(assignment.status, 'removed');
  assert.ok(assignment.leftAt);
  assert.equal(assignment.execution.lease.sessionId, null);
  assert.equal(assignment.execution.lease.status, 'removed');
  assert.equal(channel.roomRouting?.mode, 'boss_chat');
  assert.equal(channel.roomRouting?.defaultRecipientId, null);
  assert.equal(channel.composerMode, 'solo');
});

test('unarchiving a cat restores its direct lane while keeping avatar metadata and sleeping lease state', () => {
  const now = new Date('2026-03-26T00:00:00.000Z');
  let state = createDefaultChatState();

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const catId = state.cats[0].id;
  state.cats[0].avatarUrl = 'data:image/png;base64,archived-avatar';

  state = createChannel(
    state,
    {
      title: 'Companion Direct',
      topic: 'Recover should not silently rebuild the lane.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [catId],
      defaultRecipientId: catId,
      skipBossCatGreeting: true,
    },
    now,
  );

  state = archiveCat(state, catId, now);
  state = unarchiveCat(state, catId, new Date('2026-03-26T01:00:00.000Z'));

  const recoveredCat = state.cats.find((cat) => cat.id === catId);
  const channel = state.channels[0];
  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);

  assert.equal(recoveredCat?.status, 'active');
  assert.equal(recoveredCat?.archivedAt, null);
  assert.equal(recoveredCat?.avatarUrl, 'data:image/png;base64,archived-avatar');
  assert.ok(assignment);
  assert.equal(assignment.status, 'active');
  assert.equal(assignment.leftAt, null);
  assert.equal(assignment.execution.lease.sessionId, null);
  assert.equal(assignment.execution.lease.status, 'not_started');
  assert.equal(channel.channelKind, 'direct_lane');
  assert.equal(channel.roomRouting?.mode, 'direct_cat_chat');
  assert.equal(channel.roomRouting?.defaultRecipientId, catId);
  assert.equal(channel.composerMode, 'cat_led');
  assert.equal(channel.recoverableDirectLaneCatId ?? null, null);
});

test('deleting a direct-lane cat clears hidden-lane routing state so the room stays reachable', () => {
  const now = new Date('2026-03-26T00:00:00.000Z');
  let state = createDefaultChatState();

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const catId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion Direct',
      topic: 'Deleting the cat should not strand the channel.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [catId],
      defaultRecipientId: catId,
      skipBossCatGreeting: true,
    },
    now,
  );

  state = deleteCat(state, catId);
  const channel = state.channels[0];

  assert.equal(state.cats.length, 0);
  assert.equal(channel.catAssignments.length, 0);
  assert.equal(channel.roomRouting?.mode, 'boss_chat');
  assert.equal(channel.roomRouting?.defaultRecipientId, null);
  assert.equal(channel.composerMode, 'solo');
});

test('direct lanes reject assigning a second cat beyond the lead', () => {
  const now = new Date('2026-03-27T00:00:00.000Z');
  let state = createDefaultChatState();

  state = createCat(
    state,
    {
      name: 'Lead Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const defaultRecipientCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Extra Companion',
      provider: 'gemini',
      roles: ['fallback'],
    },
    now,
  );
  const extraCatId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Strict direct lane',
      topic: 'Only the lead cat should remain assignable.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [defaultRecipientCatId],
      defaultRecipientId: defaultRecipientCatId,
      skipBossCatGreeting: true,
    },
    now,
  );

  assert.throws(
    () => assignCatToChannel(
      state,
      state.selectedChannelId,
      {
        catId: extraCatId,
        provider: 'gemini',
      },
      now,
    ),
    /Direct lanes can only contain their lead cat/u,
  );
});

test('FileChatStore normalizes contaminated direct lanes back to the lead cat topology', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);
  const now = new Date('2026-03-27T00:00:00.000Z');

  let state = await store.read();
  state = createCat(
    state,
    {
      name: 'Lead Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const defaultRecipientCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Legacy Extra',
      provider: 'gemini',
      roles: ['extra'],
    },
    now,
  );
  const extraCatId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Legacy Direct',
      topic: 'Normalize stale topology on read.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [defaultRecipientCatId],
      defaultRecipientId: defaultRecipientCatId,
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  await store.write(state);

  const rawSnapshot = JSON.parse(await readFile(statePath, 'utf-8'));
  const channel = rawSnapshot.chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  channel.orchestratorLease = {
    sessionId: 'session-orchestrator',
    status: 'ready',
    cwd: 'C:\\legacy\\direct-lane',
    lastError: null,
    provider: 'claude',
    model: 'claude-opus-4-6',
    startedAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
  };
  channel.catAssignments.push({
    catId: extraCatId,
    status: 'active',
    roles: ['extra'],
    joinedAt: now.toISOString(),
    leftAt: null,
    execution: {
      target: {
        provider: 'gemini',
        instance: null,
        model: 'gemini-3-flash',
      },
      lease: {
        sessionId: 'session-extra',
        status: 'ready',
        cwd: 'C:\\legacy\\extra',
        lastError: null,
        provider: 'gemini',
        model: 'gemini-3-flash',
        startedAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
      },
    },
  });
  await writeFile(statePath, `${JSON.stringify(rawSnapshot, null, 2)}\n`, 'utf-8');

  const recoveredStore = new FileChatStore(statePath);
  const recoveredState = await recoveredStore.read();
  const recoveredChannel = recoveredState.channels.find((candidate) => candidate.id === channelId);
  assert.ok(recoveredChannel);
  assert.equal(recoveredChannel.catAssignments.length, 1);
  assert.equal(recoveredChannel.catAssignments[0].catId, defaultRecipientCatId);
  assert.equal(recoveredChannel.roomRouting?.mode, 'direct_cat_chat');
  assert.equal(recoveredChannel.roomRouting?.defaultRecipientId, defaultRecipientCatId);
  assert.equal(recoveredChannel.orchestratorLease.sessionId, null);
  assert.equal(recoveredChannel.orchestratorLease.status, 'not_started');
  assert.equal(recoveredChannel.orchestratorLease.provider, null);
  assert.equal(recoveredChannel.orchestratorLease.model, null);
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
  assert.equal(lastMessage?.metadata.executionLabelSnapshot, 'Gemini-CLI');
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
  assert.ok(core.workItems.some((workItem) => workItem.id === buildChatWorkItemId(channelId)));
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
          segments: [{ kind: 'text', text: '@Agent-1 take first pass.', toolName: null, toolId: null }],
          inputTokens: 11,
          outputTokens: 7,
          tokensUsed: 18,
        };
      }
      if (content.includes('You are Agent-1')) {
        return {
          segments: [{ kind: 'text', text: 'Done.', toolName: null, toolId: null }],
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
    'cat_led_recipient',
  );
  assert.deepEqual(
    reloadedChannel?.roomRouting?.wakeHistory.map((wake) => wake.reason),
    ['workflow_continuation', 'explicit_mention'],
  );
  assert.ok(core.runs.some((run) => run.id.startsWith(`run-room-routing-${channelId}-`)));
  assert.ok(core.missions.some((mission) => mission.id.startsWith(`mission-room-routing-${channelId}-`)));
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
  assert.equal(projectedTask.metadata.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.deepEqual(
    projectedTask.metadata.runtimeDeliveryManifest?.requestedActions,
    ['prepare_artifact'],
  );
  assert.equal(
    projectedTask.metadata.runtimeDeliveryManifest?.context.containerId,
    CHAT_ROOT_CONTAINER_ID,
  );
  assert.equal(projectedTask.metadata.governanceSummary?.approval.pending, false);
  assert.equal(projectedTask.metadata.workflowSummary?.shape, 'sequential');
  assert.ok(projectedRun);
  assert.equal(projectedRun.metadata.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(projectedRun.metadata.workflowSummary?.shape, 'sequential');
  assert.equal(projectedRun.metadata.workflowSummary?.dispatchCount, 2);
  assert.equal(projectedRun.metadata.workflowSummary?.branchStatusCounts.completed, 2);
  assert.deepEqual(projectedRun.metadata.missionIds.length, 2);
  const projectedMission = core.missions.find((mission) =>
    mission.id === projectedRun.metadata.missionIds[0]);
  assert.ok(projectedMission);
  assert.equal(projectedMission.status, 'completed');
  assert.equal(projectedMission.sourceTurnId, projectedRun.metadata.turnId);
  assert.equal(projectedMission.managedWorkId, buildChatWorkItemId(channelId));
  assert.equal(projectedMission.metadata.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(projectedMission.metadata.runId, projectedRun.id);
  assert.ok(projectedCheckpoint);
  assert.equal(projectedCheckpoint.metadata.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(projectedCheckpoint.metadata.workflowSummary?.stageId, 'continuation_handoff');
  assert.ok(projectedOutcome);
  assert.equal(projectedOutcome.metadata.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(projectedOutcome.metadata.workflowSummary?.runStatus, 'completed');
});

test('ChatStore projects retryable workflow-continuation replay metadata for max-continuations blocks', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-26T10:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Inline-Agent',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const inlineAgentId = state.cats[0].id;
  state = createCat(
    state,
    {
      name: 'Followup-Agent',
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );
  const followupAgentId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Continuation Replay Projection',
      topic: 'Persist blocked continuation replay metadata into core.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: inlineAgentId,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: followupAgentId,
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );

  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  channel.roomRouting.maxContinuations = 0;

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
      if (content.includes('You are Inline-Agent')) {
        return {
          segments: [{ kind: 'text', text: '@Followup-Agent please continue with the audit.', toolName: null, toolId: null }],
          inputTokens: 11,
          outputTokens: 7,
          tokensUsed: 18,
        };
      }
      throw new Error(`Unexpected prompt:\n${content}`);
    },
    async closeSession() {},
  };

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Inline-Agent start the workflow.' },
    runtimeClient,
    now,
  );
  await store.write(dispatched.state);
  const core = await store.readCore();
  const projectedTask = core.tasks.find((task) => task.id === `task-channel-${channelId}`);
  const dispatchedChannel = dispatched.state.channels.find((candidate) => candidate.id === channelId);
  const replay = projectedTask?.metadata.workflowContinuationReplay;
  const sourceMessageId = replay?.sourceMessageId;
  const sourceMessage = typeof sourceMessageId === 'string'
    ? dispatchedChannel?.messages.find((message) => message.id === sourceMessageId)
    : null;
  const sourceLane = typeof replay?.sourceLaneId === 'string'
    ? core.lanes.find((lane) => lane.id === replay.sourceLaneId) ?? null
    : null;

  assert.ok(projectedTask);
  assert.ok(sourceMessage);
  assert.ok(sourceLane);
  assert.equal(replay?.replayState, 'ready');
  assert.equal(replay?.sourceMessageId, sourceMessage?.id);
  assert.equal(
    replay?.sourceTurnId,
    sourceMessage?.metadata?.turnId ?? null,
  );
  assert.equal(replay?.sourceTurnId, sourceLane?.turnId ?? null);
  assert.equal(replay?.sourceLaneId, sourceLane?.id ?? null);
  assert.equal(replay?.sourceAssistantTurnId, sourceLane?.metadata?.responseAssistantTurnId ?? null);
  assert.equal(
    replay?.sourceParticipant?.participantName,
    'Inline-Agent',
  );
  assert.equal(
    replay?.targets?.[0]?.participantName,
    'Followup-Agent',
  );
  assert.equal(replay?.workflowStageId, 'continuation_handoff');
  assert.equal(replay?.workflowShape, 'sequential');
});

test('ChatStore projects retryable workflow-continuation replay metadata for max-dispatch blocks', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-26T10:30:00.000Z');

  state = createCat(
    state,
    {
      name: 'Inline-Agent',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const inlineAgentId = state.cats[0].id;
  state = createCat(
    state,
    {
      name: 'Followup-Agent',
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );
  const followupAgentId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Dispatch Guard Replay Projection',
      topic: 'Persist blocked continuation replay metadata when dispatch limits stop a handoff.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: inlineAgentId,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: followupAgentId,
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );

  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  channel.roomRouting.maxDispatchesPerTurn = 1;

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
      if (content.includes('You are Inline-Agent')) {
        return {
          segments: [{ kind: 'text', text: '@Followup-Agent please continue with the audit.', toolName: null, toolId: null }],
          inputTokens: 11,
          outputTokens: 7,
          tokensUsed: 18,
        };
      }
      throw new Error(`Unexpected prompt:\n${content}`);
    },
    async closeSession() {},
  };

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Inline-Agent start the workflow.' },
    runtimeClient,
    now,
  );
  await store.write(dispatched.state);
  const core = await store.readCore();
  const projectedTask = core.tasks.find((task) => task.id === `task-channel-${channelId}`);
  const dispatchedChannel = dispatched.state.channels.find((candidate) => candidate.id === channelId);
  const replay = projectedTask?.metadata.workflowContinuationReplay;
  const sourceMessageId = replay?.sourceMessageId;
  const sourceMessage = typeof sourceMessageId === 'string'
    ? dispatchedChannel?.messages.find((message) => message.id === sourceMessageId)
    : null;
  const sourceLane = typeof replay?.sourceLaneId === 'string'
    ? core.lanes.find((lane) => lane.id === replay.sourceLaneId) ?? null
    : null;

  assert.ok(projectedTask);
  assert.ok(sourceMessage);
  assert.ok(sourceLane);
  assert.equal(replay?.replayState, 'ready');
  assert.equal(replay?.sourceMessageId, sourceMessage?.id);
  assert.equal(
    replay?.sourceTurnId,
    sourceMessage?.metadata?.turnId ?? null,
  );
  assert.equal(replay?.sourceTurnId, sourceLane?.turnId ?? null);
  assert.equal(replay?.sourceLaneId, sourceLane?.id ?? null);
  assert.equal(replay?.sourceAssistantTurnId, sourceLane?.metadata?.responseAssistantTurnId ?? null);
  assert.equal(
    replay?.sourceParticipant?.participantName,
    'Inline-Agent',
  );
  assert.equal(
    replay?.targets?.[0]?.participantName,
    'Followup-Agent',
  );
  assert.equal(replay?.workflowStageId, 'continuation_handoff');
  assert.equal(replay?.workflowShape, 'sequential');
});

test('ChatStore projects retryable workflow-continuation replay metadata for anti-ping-pong blocks', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-26T11:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Inline-Agent',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const inlineAgentId = state.cats[0].id;
  state = createCat(
    state,
    {
      name: 'Followup-Agent',
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );
  const followupAgentId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Anti Ping Pong Replay Projection',
      topic: 'Persist blocked continuation replay metadata when anti-ping-pong stops a loop.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: inlineAgentId,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: followupAgentId,
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );

  let inlinePromptCount = 0;
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
      if (content.includes('You are Inline-Agent')) {
        inlinePromptCount += 1;
        return {
          segments: [{
            kind: 'text',
            text: inlinePromptCount === 1
              ? '@Followup-Agent take first pass.'
              : '@Followup-Agent one more tweak.',
            toolName: null,
            toolId: null,
          }],
          inputTokens: 11,
          outputTokens: 7,
          tokensUsed: 18,
        };
      }
      if (content.includes('You are Followup-Agent')) {
        return {
          segments: [{
            kind: 'text',
            text: '@Inline-Agent please review.',
            toolName: null,
            toolId: null,
          }],
          inputTokens: 9,
          outputTokens: 6,
          tokensUsed: 15,
        };
      }
      throw new Error(`Unexpected prompt:\n${content}`);
    },
    async closeSession() {},
  };

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Inline-Agent start the routing loop.' },
    runtimeClient,
    now,
  );
  const channelView = buildChannelView(dispatched.state, channelId);
  assert.equal(channelView.roomRouting?.lastOutcome?.guard, 'anti_ping_pong');

  await store.write(dispatched.state);
  const core = await store.readCore();
  const projectedTask = core.tasks.find((task) => task.id === `task-channel-${channelId}`);
  const dispatchedChannel = dispatched.state.channels.find((candidate) => candidate.id === channelId);
  const replay = projectedTask?.metadata.workflowContinuationReplay;
  const sourceMessageId = replay?.sourceMessageId;
  const sourceMessage = typeof sourceMessageId === 'string'
    ? dispatchedChannel?.messages.find((message) => message.id === sourceMessageId)
    : null;
  const sourceLane = typeof replay?.sourceLaneId === 'string'
    ? core.lanes.find((lane) => lane.id === replay.sourceLaneId) ?? null
    : null;

  assert.ok(projectedTask);
  assert.ok(sourceMessage);
  assert.ok(sourceLane);
  assert.equal(replay?.replayState, 'ready');
  assert.equal(replay?.blockedReason, 'anti_ping_pong');
  assert.equal(replay?.sourceMessageId, sourceMessage?.id);
  assert.equal(replay?.sourceTurnId, sourceMessage?.metadata?.turnId ?? null);
  assert.equal(replay?.sourceTurnId, sourceLane?.turnId ?? null);
  assert.equal(replay?.sourceLaneId, sourceLane?.id ?? null);
  assert.equal(replay?.sourceAssistantTurnId, sourceLane?.metadata?.responseAssistantTurnId ?? null);
  assert.equal(replay?.sourceParticipant?.participantName, sourceMessage?.senderName ?? null);
  assert.equal(replay?.workflowStageId, 'continuation_handoff');
  assert.equal(replay?.workflowShape, 'sequential');
  assert.equal(replay?.targets?.length, 1);
});

test('ChatStore projects retryable workflow-continuation replay metadata for max-target-visit blocks', async () => {
  const store = new FileChatStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'chat-state.json'));
  let state = await store.read();
  const now = new Date('2026-03-26T11:30:00.000Z');

  state = createCat(
    state,
    {
      name: 'Inline-Agent',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const inlineAgentId = state.cats[0].id;
  state = createCat(
    state,
    {
      name: 'Followup-Agent',
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );
  const followupAgentId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Target Visit Replay Projection',
      topic: 'Persist blocked continuation replay metadata when revisit limits stop a handoff.',
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: inlineAgentId,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: followupAgentId,
      provider: 'gemini',
      roles: ['auditor'],
    },
    now,
  );

  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  channel.roomRouting.maxTargetVisitsPerTurn = 1;

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
      if (content.includes('You are Inline-Agent')) {
        return {
          segments: [{
            kind: 'text',
            text: '@Followup-Agent take first pass.',
            toolName: null,
            toolId: null,
          }],
          inputTokens: 11,
          outputTokens: 7,
          tokensUsed: 18,
        };
      }
      if (content.includes('You are Followup-Agent')) {
        return {
          segments: [{
            kind: 'text',
            text: '@Inline-Agent please review.',
            toolName: null,
            toolId: null,
          }],
          inputTokens: 9,
          outputTokens: 6,
          tokensUsed: 15,
        };
      }
      throw new Error(`Unexpected prompt:\n${content}`);
    },
    async closeSession() {},
  };

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Inline-Agent start the routing loop.' },
    runtimeClient,
    now,
  );
  const channelView = buildChannelView(dispatched.state, channelId);
  assert.equal(channelView.roomRouting?.lastOutcome?.guard, 'max_target_visits');

  await store.write(dispatched.state);
  const core = await store.readCore();
  const projectedTask = core.tasks.find((task) => task.id === `task-channel-${channelId}`);
  const dispatchedChannel = dispatched.state.channels.find((candidate) => candidate.id === channelId);
  const replay = projectedTask?.metadata.workflowContinuationReplay;
  const sourceMessageId = replay?.sourceMessageId;
  const sourceMessage = typeof sourceMessageId === 'string'
    ? dispatchedChannel?.messages.find((message) => message.id === sourceMessageId)
    : null;
  const sourceLane = typeof replay?.sourceLaneId === 'string'
    ? core.lanes.find((lane) => lane.id === replay.sourceLaneId) ?? null
    : null;

  assert.ok(projectedTask);
  assert.ok(sourceMessage);
  assert.ok(sourceLane);
  assert.equal(replay?.replayState, 'ready');
  assert.equal(replay?.blockedReason, 'max_target_visits');
  assert.equal(replay?.sourceMessageId, sourceMessage?.id);
  assert.equal(replay?.sourceTurnId, sourceMessage?.metadata?.turnId ?? null);
  assert.equal(replay?.sourceTurnId, sourceLane?.turnId ?? null);
  assert.equal(replay?.sourceLaneId, sourceLane?.id ?? null);
  assert.equal(replay?.sourceAssistantTurnId, sourceLane?.metadata?.responseAssistantTurnId ?? null);
  assert.equal(replay?.sourceParticipant?.participantName, sourceMessage?.senderName ?? null);
  assert.equal(replay?.workflowStageId, 'continuation_handoff');
  assert.equal(replay?.workflowShape, 'sequential');
  assert.equal(replay?.targets?.length, 1);
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
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-designer',
        terminal: true,
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
        segments: [{ kind: 'text', text: 'Thanks, proceeding with Minimal.', toolName: null, toolId: null }],
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

test('FileChatStore drops malformed assistant turn deliveries when reloading persisted routing state', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);
  let state = await store.read();
  const now = new Date('2026-04-12T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Malformed segment delivery',
      topic: 'Reject incomplete persisted assistant turn delivery records.',
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
    turnId: 'turn-malformed-response',
    mode: 'boss_chat',
    sourceMessageId: 'message-user-malformed',
    sourceSenderKind: 'user',
    sourceSenderName: 'User',
    status: 'completed',
    resolution: {
      routingMode: 'room_default',
      selectionKind: 'default_target',
      defaultTarget: {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: 'Chat',
      },
      defaultTargetReason: 'boss_chat_default',
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: [
      {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: 'Chat',
      },
    ],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-malformed-response',
        sourceMessageId: 'message-user-malformed',
        source: null,
        target: {
          participantKind: 'orchestrator',
          participantId: 'orchestrator',
          participantName: 'Chat',
        },
        trigger: 'room_default',
        status: 'completed',
        mentionNames: [],
        response: {
          messageIds: ['message-agent-malformed'],
          fullText: 'Malformed persisted reply',
          segmentCount: 1,
        },
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 1,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
  };
  await writeFile(statePath, JSON.stringify(rawSnapshot, null, 2));

  const reloadedState = await store.read();
  const reloadedChannel = reloadedState.channels.find(
    (channel) => channel.id === state.selectedChannelId,
  );

  assert.equal(reloadedChannel?.roomRouting?.lastOutcome?.dispatches[0]?.response, null);
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
    guideCat: {
      id: 'guide-cat-primary',
      name: 'Guide Cat',
      status: 'dismissed',
      executionTarget: {
        provider: 'claude',
        instance: 'native',
        model: 'claude-sonnet',
      },
      modelSelection: {
        entryMode: 'auto',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
      createdAt: '2026-03-21T01:00:00.000Z',
      updatedAt: '2026-03-21T01:00:00.000Z',
    },
    assistantPresets: [
      {
        id: 'assistant-preset-reviewer',
        name: 'Pair Reviewer',
        executionTarget: {
          provider: 'codex',
          instance: null,
          model: 'gpt-5.4',
        },
        modelSelection: null,
        roleHint: 'Checks task payloads before dispatch.',
        createdAt: '2026-03-21T01:00:00.000Z',
        updatedAt: '2026-03-21T01:00:00.000Z',
      },
    ],
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
        sourceChannelId: 'channel-system-1',
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
    archives: [
      {
        id: 'archive-system-1',
        sourceConversationId: 'conversation-system-1',
        sourceChannelId: 'channel-system-1',
        exportFormat: 'chat-channel-json',
        status: 'ready_for_archive',
        lastExportedAt: null,
        updatedAt: '2026-03-21T01:05:00.000Z',
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
  assert.equal(reloadedCore.guideCat?.name, 'Guide Cat');
  assert.equal(reloadedCore.guideCat?.status, 'dismissed');
  assert.equal(reloadedCore.guideCat?.executionTarget.model, 'claude-sonnet');
  assert.equal(reloadedCore.assistantPresets[0]?.name, 'Pair Reviewer');
  assert.equal(reloadedCore.assistantPresets[0]?.executionTarget.model, 'gpt-5.4');
  assert.ok(reloadedCore.actors.some((actor) => actor.id === 'actor-stakeholder-1'));
  assert.ok(
    reloadedCore.conversations.some(
      (conversation) => conversation.id === 'conversation-system-1',
    ),
  );
  assert.equal(
    reloadedCore.conversations.find((conversation) => conversation.id === 'conversation-system-1')
      ?.sourceChannelId,
    'channel-system-1',
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
  assert.ok(reloadedCore.archives.some((archive) => archive.id === 'archive-system-1'));
  assert.equal(
    reloadedCore.archives.find((archive) => archive.id === 'archive-system-1')?.sourceChannelId,
    'channel-system-1',
  );
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
