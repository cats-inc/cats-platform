import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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
