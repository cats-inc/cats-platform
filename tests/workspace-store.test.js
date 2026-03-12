import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createChannel, appendMessage, addMemberToChannel, exportChannel } from '../dist-server/workspace/model.js';
import { FileWorkspaceStore } from '../dist-server/workspace/store.js';

test('FileWorkspaceStore persists configured channels, members, and messages to disk', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-inc-store-'));
  const statePath = path.join(tempDir, 'workspace-state.json');
  const store = new FileWorkspaceStore(statePath);

  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Ops Radar',
      topic: 'Track runtime regressions before shipping the desktop shell.',
      members: [
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
  state = addMemberToChannel(
    state,
    channelId,
    {
      name: 'Agent-2',
      provider: 'claude',
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
  const createdChannel = parsedState.channels.find((channel) => channel.id === channelId);

  assert.equal(parsedState.selectedChannelId, 'ops-radar');
  assert.ok(createdChannel);
  assert.equal(createdChannel.members.length, 2);
  assert.equal(createdChannel.members[0].execution.target.provider, 'claude');
  assert.equal(createdChannel.messages.at(-1).mentions[0], 'Agent-1');
});

test('exportChannel returns orchestrator context with the selected transcript', async () => {
  const store = new FileWorkspaceStore(path.join(await mkdtemp(path.join(os.tmpdir(), 'cats-inc-store-')), 'workspace-state.json'));
  const state = await store.read();
  const payload = exportChannel(state, state.selectedChannelId);

  assert.equal(payload.channel.id, state.selectedChannelId);
  assert.equal(payload.orchestrator.mode, 'global');
  assert.ok(Array.isArray(payload.channel.messages));
});

test('FileWorkspaceStore migrates legacy provider-bound records into execution-aware state', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-inc-store-'));
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
          repoPath: 'C:/repo/cats-inc',
          workspaceCwd: 'C:/repo/cats-inc',
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
            cwd: 'C:/repo/cats-inc',
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
                cwd: 'C:/repo/cats-inc',
                lastError: null,
              },
            },
          ],
          messages: [],
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

  assert.equal(state.globalOrchestrator.executionTarget.provider, 'claude');
  assert.equal(state.globalOrchestrator.executionTarget.model, 'claude-opus-4-6');
  assert.equal(state.channels[0].orchestratorLease.sessionId, 'orch-1');
  assert.equal(state.channels[0].members[0].execution.target.provider, 'claude');
  assert.equal(state.channels[0].members[0].execution.target.model, 'claude-sonnet');
  assert.equal(state.channels[0].members[0].execution.lease.sessionId, 'pal-session-1');
});
