import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreMission,
} from '../build/server/core/model/index.js';
import { listMissions } from '../build/server/core/missionList.js';

test('listMissions filters missions by managed work, conversation, source, assignee, status, and run', () => {
  let core = createDefaultCoreState();

  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      managedWorkId: 'work-item-1',
      conversationId: 'conversation-1',
      sourceTurnId: 'turn-1',
      sourceLaneId: 'lane-1',
      assignedAgentId: 'actor-agent-1',
      title: 'Primary mission',
      status: 'running',
      createdAt: '2026-04-15T04:10:00.000Z',
      metadata: {
        runId: 'run-1',
      },
    },
    new Date('2026-04-15T04:10:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-2',
      managedWorkId: 'work-item-2',
      conversationId: 'conversation-2',
      sourceTurnId: 'turn-2',
      sourceLaneId: 'lane-2',
      assignedAgentId: 'actor-agent-2',
      title: 'Queued mission',
      status: 'queued',
      createdAt: '2026-04-15T04:11:00.000Z',
    },
    new Date('2026-04-15T04:11:00.000Z'),
  ).core;

  const filtered = listMissions(core, {
    managedWorkIds: ['work-item-1'],
    conversationIds: ['conversation-1'],
    sourceTurnIds: ['turn-1'],
    sourceLaneIds: ['lane-1'],
    assignedAgentIds: ['actor-agent-1'],
    statuses: ['running'],
    runIds: ['run-1'],
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'mission-1');
});
