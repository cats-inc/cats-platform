import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendMessage,
  assignPalToChannel,
  createChannel,
  createWorkspacePal,
  deleteChannel,
  exportChannel,
  updateGlobalOrchestrator,
} from '../dist-server/workspace/model.js';
import { UUID_PATTERN } from '../dist-server/shared/channelPaths.js';
import { FileWorkspaceStore } from '../dist-server/workspace/store.js';

test('FileWorkspaceStore persists configured channels, pals, assignments, and messages to disk', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'workspace-state.json');
  const store = new FileWorkspaceStore(statePath);

  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Ops Radar',
      topic: 'Track runtime regressions before shipping the desktop shell.',
      pals: [
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
  state = createWorkspacePal(
    state,
    {
      name: 'Agent-2',
      provider: 'gemini',
      roles: ['reviewer'],
    },
    new Date('2026-03-11T00:00:00.000Z'),
  );

  state = assignPalToChannel(
    state,
    channelId,
    {
      palId: state.pals[0].id,
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
  const createdChannel = parsedState.workspace.channels.find((channel) => channel.id === channelId);

  assert.equal(parsedState.version, 1);
  assert.match(parsedState.workspace.selectedChannelId, UUID_PATTERN);
  assert.equal(parsedState.workspace.selectedChannelId, channelId);
  assert.equal(parsedState.workspace.pals.length, 2);
  assert.ok(parsedState.ownerProfile);
  assert.ok(Array.isArray(parsedState.actors));
  assert.ok(Array.isArray(parsedState.conversations));
  assert.ok(Array.isArray(parsedState.tasks));
  assert.ok(createdChannel);
  assert.equal(createdChannel.palAssignments.length, 2);
  assert.equal(createdChannel.palAssignments[0].execution.target.provider, 'claude');
  assert.equal(createdChannel.messages.at(-1).mentions[0], 'Agent-1');
});

test('exportChannel returns assigned pals with the selected transcript', async () => {
  const store = new FileWorkspaceStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'workspace-state.json'));
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
  assert.ok(Array.isArray(payload.assignedPals));
  assert.ok(Array.isArray(payload.channel.messages));
});

test('FileWorkspaceStore migrates legacy provider-bound records into global pals plus assignments', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-store-'));
  const statePath = path.join(tempDir, 'workspace-state.json');
  await writeFile(
    statePath,
    `${JSON.stringify({
      id: 'default',
      name: 'Chat',
      selectedChannelId: 'legacy-room',
      channels: [
        {
          id: 'legacy-room',
          title: 'Legacy Room',
          topic: 'Migrate the old local state shape.',
          status: 'configured',
          unreadCount: 0,
          repoPath: 'C:/repo/cats',
          workspaceCwd: 'C:/repo/cats',
          language: 'TypeScript',
          responseLanguage: 'en',
          formationMode: 'manual',
          skillProfile: 'workspace-default',
          mcpProfile: 'workspace-memory',
          orchestratorRoles: ['coder'],
          createdAt: '2026-03-11T00:00:00.000Z',
          updatedAt: '2026-03-11T00:00:00.000Z',
          lastMessageAt: '2026-03-11T00:00:00.000Z',
          lastActivatedAt: null,
          orchestratorSession: {
            sessionId: 'orch-1',
            status: 'ready',
            cwd: 'C:/repo/cats',
            lastError: null,
          },
          members: [
            {
              id: 'pal-1',
              name: 'Agent-1',
              provider: 'claude',
              model: 'claude-sonnet',
              roles: ['coder'],
              skillProfile: null,
              mcpProfile: null,
              status: 'active',
              joinedAt: '2026-03-11T00:00:00.000Z',
              leftAt: null,
              session: {
                sessionId: 'pal-session-1',
                status: 'ready',
                cwd: 'C:/repo/cats',
                lastError: null,
              },
            },
          ],
          messages: [
            {
              id: 'message-1',
              channelId: 'legacy-room',
              senderKind: 'user',
              senderName: 'Owner',
              body: 'Please migrate this chat id.',
              mentions: [],
              metadata: {},
              usage: null,
              createdAt: '2026-03-11T00:00:00.000Z',
            },
          ],
        },
      ],
      globalOrchestrator: {
        mode: 'global',
        status: 'ready',
        nextFocus: 'Keep the migration stable.',
        entrypoints: ['web'],
        referenceProjects: ['cats-runtime'],
        notes: ['Legacy test fixture'],
        provider: 'claude',
        model: 'claude-opus-4-6',
        systemPrompt: 'Coordinate the migration.',
        skillProfile: 'aaif-a2a-default',
        mcpProfile: 'workspace-memory',
        telegramBotName: null,
        updatedAt: '2026-03-11T00:00:00.000Z',
      },
      capabilities: {
        multiChannel: true,
        persistence: 'file-backed',
        mentions: 'basic',
        splitView: 'planned',
        transcriptExport: true,
        participantManagement: 'basic',
        runtimeSessions: true,
      },
    }, null, 2)}\n`,
    'utf-8',
  );

  const store = new FileWorkspaceStore(statePath);
  const state = await store.read();
  const migratedChannelId = state.channels[0].id;

  assert.equal(state.pals.length, 1);
  assert.match(migratedChannelId, UUID_PATTERN);
  assert.notEqual(migratedChannelId, 'legacy-room');
  assert.equal(state.selectedChannelId, migratedChannelId);
  assert.equal(state.globalOrchestrator.executionTarget.provider, 'claude');
  assert.equal(state.globalOrchestrator.executionTarget.model, 'claude-opus-4-6');
  assert.equal(state.channels[0].orchestratorLease.sessionId, 'orch-1');
  assert.equal(state.channels[0].messages[0].channelId, migratedChannelId);
  assert.equal(state.channels[0].palAssignments[0].palId, 'pal-1');
  assert.equal(state.channels[0].palAssignments[0].execution.target.provider, 'claude');
  assert.equal(state.channels[0].palAssignments[0].execution.target.model, 'claude-sonnet');
  assert.equal(state.channels[0].palAssignments[0].execution.lease.sessionId, 'pal-session-1');
});

test('WorkspaceStore exposes a derived Cats Core view that stays in sync with workspace state', async () => {
  const store = new FileWorkspaceStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'workspace-state.json'));
  let state = await store.read();

  state = createChannel(
    state,
    {
      title: 'Owner Loop',
      topic: 'Validate owner approvals before dispatch.',
      pals: [
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
  const channelId = state.selectedChannelId;

  assert.equal(core.workspace.selectedChannelId, channelId);
  assert.equal(core.ownerProfile.actorId, 'actor-owner');
  assert.ok(core.actors.some((actor) => actor.kind === 'owner'));
  assert.ok(core.actors.some((actor) => actor.kind === 'orchestrator'));
  assert.ok(core.actors.some((actor) => actor.name === 'Planner'));
  assert.ok(core.conversations.some((conversation) => conversation.sourceChannelId === channelId));
  assert.ok(core.tasks.some((task) => task.conversationId === `conversation-channel-${channelId}`));
});

test('WorkspaceStore syncs Telegram bot bindings to the current Boss Cat actor', async () => {
  const store = new FileWorkspaceStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'workspace-state.json'));
  let state = await store.read();

  state = createWorkspacePal(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['planner'],
    },
    new Date('2026-03-19T00:00:00.000Z'),
  );
  state.bossCatId = state.pals[0].id;
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
  assert.equal(telegramBinding.bossCatActorId, `actor-pal-${state.bossCatId}`);
  assert.ok(bossCatActor);
  assert.ok(bossCatActor.roles.includes('boss_cat'));
});

test('updateGlobalOrchestrator preserves the existing model when model is omitted', async () => {
  const store = new FileWorkspaceStore(
    path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'workspace-state.json'),
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

test('WorkspaceStore rebinds Telegram bot bindings when the Boss Cat changes', async () => {
  const store = new FileWorkspaceStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'workspace-state.json'));
  let state = await store.read();

  state = createWorkspacePal(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['planner'],
    },
    new Date('2026-03-19T00:00:00.000Z'),
  );
  const firstBossCatId = state.pals[0].id;
  state.bossCatId = firstBossCatId;
  state = updateGlobalOrchestrator(
    state,
    {
      provider: 'claude',
      telegramBotName: 'smelly_bot',
    },
    new Date('2026-03-19T00:01:00.000Z'),
  );
  state = createWorkspacePal(
    state,
    {
      name: 'Bossy',
      provider: 'gemini',
      roles: ['reviewer'],
    },
    new Date('2026-03-19T00:02:00.000Z'),
  );
  const secondBossCatId = state.pals.find((pal) => pal.id !== firstBossCatId)?.id;
  assert.ok(secondBossCatId);

  state.bossCatId = secondBossCatId;
  await store.write(state);

  const core = await store.readCore();
  const telegramBinding = core.botBindings.find((binding) => binding.platform === 'telegram');
  const firstBossCatActor = core.actors.find((actor) => actor.sourceId === firstBossCatId);
  const secondBossCatActor = core.actors.find((actor) => actor.sourceId === secondBossCatId);

  assert.ok(telegramBinding);
  assert.equal(telegramBinding.bossCatActorId, `actor-pal-${secondBossCatId}`);
  assert.ok(firstBossCatActor);
  assert.ok(secondBossCatActor);
  assert.equal(firstBossCatActor.roles.includes('boss_cat'), false);
  assert.ok(secondBossCatActor.roles.includes('boss_cat'));
});

test('deleteChannel removes the selected chat and falls back to the next recent chat', async () => {
  let state = createChannel(
    await new FileWorkspaceStore(
      path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'workspace-state.json'),
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
  const initialState = await new FileWorkspaceStore(
    path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-store-')), 'workspace-state.json'),
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
