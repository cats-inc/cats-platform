import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FileWorkspaceStore } from '../dist-server/workspace/store.js';

test('FileWorkspaceStore writes selected channel updates to disk', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-inc-store-'));
  const statePath = path.join(tempDir, 'workspace-state.json');
  const store = new FileWorkspaceStore(statePath);

  const initialState = await store.read();
  assert.equal(initialState.selectedChannelId, 'launchpad');

  const updatedState = await store.updateSelectedChannel('strategy-room');
  assert.equal(updatedState.selectedChannelId, 'strategy-room');

  const rawState = await readFile(statePath, 'utf-8');
  const parsedState = JSON.parse(rawState);
  assert.equal(parsedState.selectedChannelId, 'strategy-room');
});

test('FileWorkspaceStore writes created channels to disk', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-inc-store-'));
  const statePath = path.join(tempDir, 'workspace-state.json');
  const store = new FileWorkspaceStore(statePath);

  const updatedState = await store.createChannel({
    title: 'Ops Radar',
    topic: 'Track runtime regressions before the desktop host arrives.',
  });

  assert.equal(updatedState.selectedChannelId, 'ops-radar');
  assert.equal(updatedState.channels.length, 4);

  const rawState = await readFile(statePath, 'utf-8');
  const parsedState = JSON.parse(rawState);
  assert.equal(parsedState.selectedChannelId, 'ops-radar');
  assert.equal(parsedState.channels.length, 4);
  assert.equal(parsedState.channels[3].id, 'ops-radar');
});
