import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveChannelStreamSessionId,
  resolveChannelStreamTarget,
} from '../build/server/products/chat/api/resources/channelStreamSupport.js';

function buildParticipantAssignment(
  participantId,
  sessionId,
  status = 'ready',
  name = participantId,
) {
  return {
    participantId,
    sourceKind: 'participant',
    sourceRefId: participantId,
    name,
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
              id: 'target-1',
              status: 'completed',
              participant: { participantId: 'participant-1' },
            },
            {
              id: 'target-2',
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
              id: 'target-1',
              status: 'completed',
              participant: { participantId: 'participant-1' },
            },
            {
              id: 'target-2',
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

test('resolveChannelStreamTarget keeps the next sequential speaker label available before the lease is ready', () => {
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
              id: 'target-1',
              status: 'completed',
              participant: { participantId: 'participant-1', participantName: 'Claude-CLI' },
            },
            {
              id: 'target-2',
              status: 'pending',
              participant: { participantId: 'participant-2', participantName: 'Codex-CLI' },
            },
          ],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [
      buildParticipantAssignment('participant-1', 'session-1', 'ready', 'Claude-CLI'),
      buildParticipantAssignment('participant-2', null, 'initializing', 'Codex-CLI'),
    ],
  };

  assert.deepEqual(resolveChannelStreamTarget(channel), {
    sessionId: null,
    participantId: 'participant-2',
    catId: null,
    speakerLabel: 'Codex-CLI',
    sessionStartedAt: null,
    requiresSessionStartConfirmation: false,
    targetStateId: 'target-2',
  });
});

test('resolveChannelStreamTarget does not fall back to an arbitrary ready participant before a multi-target workflow target materializes', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: null,
      lastOutcome: {
        turnId: 'turn-1',
        resolvedTargets: [
          { participantId: 'participant-1' },
          { participantId: 'participant-2' },
        ],
      },
      workflow: {
        activeTurn: {
          id: 'turn-1',
          status: 'running',
          targetStatuses: [],
          events: [],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [
      buildParticipantAssignment('participant-1', 'session-1', 'ready', 'Claude-CLI'),
      buildParticipantAssignment('participant-2', 'session-2', 'ready', 'Codex-CLI'),
    ],
  };

  assert.equal(resolveChannelStreamSessionId(channel), null);
  assert.equal(resolveChannelStreamTarget(channel), null);
});

test('resolveChannelStreamTarget falls back to the default recipient while a single-target workflow turn is still materializing', () => {
  const channel = {
    roomMode: 'direct_cat_chat',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: 'participant-1',
      lastOutcome: {
        turnId: 'turn-1',
        resolvedTargets: [
          { participantId: 'participant-1' },
        ],
      },
      workflow: {
        activeTurn: {
          id: 'turn-1',
          status: 'running',
          targetStatuses: [],
          events: [],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [
      buildParticipantAssignment('participant-1', 'session-1', 'ready', 'Claude-CLI'),
    ],
  };

  assert.equal(resolveChannelStreamSessionId(channel), 'session-1');
  assert.deepEqual(resolveChannelStreamTarget(channel), {
    sessionId: 'session-1',
    participantId: 'participant-1',
    catId: null,
    speakerLabel: 'Claude-CLI',
    sessionStartedAt: null,
    requiresSessionStartConfirmation: false,
    targetStateId: null,
  });
});

test('resolveChannelStreamTarget does not leak the internal Chat placeholder for solo orchestrator turns', () => {
  const channel = {
    composerMode: 'solo',
    pendingProvider: 'claude',
    pendingInstance: 'cli/native',
    orchestratorLease: {
      status: 'ready',
      sessionId: 'session-orchestrator',
      provider: 'claude',
      model: 'claude-sonnet',
    },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          status: 'running',
          targetStatuses: [
            {
              id: 'target-orchestrator',
              status: 'running',
              participant: {
                participantKind: 'orchestrator',
                participantId: 'orchestrator',
                participantName: 'Chat',
              },
            },
          ],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [],
  };

  assert.deepEqual(resolveChannelStreamTarget(channel), {
    sessionId: 'session-orchestrator',
    participantId: 'orchestrator',
    catId: null,
    speakerLabel: 'Claude-CLI',
    sessionStartedAt: null,
    requiresSessionStartConfirmation: false,
    targetStateId: 'target-orchestrator',
  });
});

test('resolveChannelStreamTarget does not leak the internal Orchestrator placeholder for solo orchestrator turns', () => {
  const channel = {
    composerMode: 'solo',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    orchestratorLease: {
      status: 'ready',
      sessionId: 'session-orchestrator',
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
    },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          status: 'running',
          targetStatuses: [
            {
              id: 'target-orchestrator',
              status: 'running',
              participant: {
                participantKind: 'orchestrator',
                participantId: 'orchestrator',
                participantName: 'Orchestrator',
              },
            },
          ],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [],
  };

  assert.deepEqual(resolveChannelStreamTarget(channel), {
    sessionId: 'session-orchestrator',
    participantId: 'orchestrator',
    catId: null,
    speakerLabel: 'Gemini-CLI',
    sessionStartedAt: null,
    requiresSessionStartConfirmation: false,
    targetStateId: 'target-orchestrator',
  });
});
