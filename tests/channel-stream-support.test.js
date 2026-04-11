import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChannelStreamSessionId } from '../build/server/products/chat/api/resources/channelStreamSupport.js';

function buildParticipantAssignment(participantId, sessionId, status = 'ready') {
  return {
    participantId,
    sourceKind: 'participant',
    sourceRefId: participantId,
    name: participantId,
    status: 'active',
    roles: [],
    roleHint: null,
    joinedAt: '2026-04-11T00:00:00.000Z',
    leftAt: null,
    execution: {
      provider: 'claude',
      instance: 'cli',
      model: 'claude-sonnet',
      modelSelection: null,
      lease: {
        status,
        sessionId,
        cwd: null,
        lastUsedAt: '2026-04-11T00:00:00.000Z',
      },
    },
  };
}

test('resolveChannelStreamSessionId follows the currently running workflow target before older ready sessions', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          status: 'running',
          targetStatuses: [
            {
              status: 'completed',
              participant: { participantId: 'participant-1' },
            },
            {
              status: 'running',
              participant: { participantId: 'participant-2' },
            },
          ],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [
      buildParticipantAssignment('participant-1', 'session-1'),
      buildParticipantAssignment('participant-2', 'session-2'),
    ],
  };

  assert.equal(resolveChannelStreamSessionId(channel), 'session-2');
});

test('resolveChannelStreamSessionId waits for the next sequential target instead of falling back to a completed target session', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          status: 'running',
          targetStatuses: [
            {
              status: 'completed',
              participant: { participantId: 'participant-1' },
            },
            {
              status: 'pending',
              participant: { participantId: 'participant-2' },
            },
          ],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [
      buildParticipantAssignment('participant-1', 'session-1'),
      buildParticipantAssignment('participant-2', null, 'initializing'),
    ],
  };

  assert.equal(resolveChannelStreamSessionId(channel), null);
});
