import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveChannelReadyStreamTargets,
  resolveChannelStreamSessionId,
  resolveChannelStreamTargets,
  resolveChannelStreamTarget,
} from '../build/server/products/chat/api/resources/channelStreamSupport.js';

function buildParticipantAssignment(
  participantId,
  sessionId,
  status = 'ready',
  name = participantId,
  startedAt = null,
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
        startedAt,
        lastUsedAt: startedAt ?? '2026-04-11T00:00:00.000Z',
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
          id: 'turn-running-target',
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

test('resolveChannelStreamTargets lists all concurrent workflow targets in stable target order', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          id: 'turn-running-target',
          status: 'running',
          targetStatuses: [
            {
              id: 'target-1',
              status: 'running',
              participant: { participantId: 'participant-1', participantName: 'Claude-CLI' },
            },
            {
              id: 'target-2',
              status: 'running',
              participant: { participantId: 'participant-2', participantName: 'Codex-CLI' },
            },
          ],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [
      buildParticipantAssignment('participant-1', 'session-1', 'ready', 'Claude-CLI'),
      buildParticipantAssignment('participant-2', 'session-2', 'ready', 'Codex-CLI'),
    ],
  };

  assert.deepEqual(resolveChannelStreamTargets(channel), [
    {
      sessionId: 'session-1',
      laneId: 'lane-turn-running-target-target-1',
      participantId: 'participant-1',
      catId: null,
      speakerLabel: 'Claude-CLI',
      sessionStartedAt: null,
      requiresSessionStartConfirmation: false,
      targetStateId: 'target-1',
    },
    {
      sessionId: 'session-2',
      laneId: 'lane-turn-running-target-target-2',
      participantId: 'participant-2',
      catId: null,
      speakerLabel: 'Codex-CLI',
      sessionStartedAt: null,
      requiresSessionStartConfirmation: false,
      targetStateId: 'target-2',
    },
  ]);
});

test('resolveChannelReadyStreamTargets keeps only attachable concurrent workflow targets', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          id: 'turn-ready-targets',
          status: 'running',
          targetStatuses: [
            {
              id: 'target-1',
              status: 'running',
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

  assert.deepEqual(resolveChannelReadyStreamTargets(channel), [
    {
      sessionId: 'session-1',
      laneId: 'lane-turn-ready-targets-target-1',
      participantId: 'participant-1',
      catId: null,
      speakerLabel: 'Claude-CLI',
      sessionStartedAt: null,
      requiresSessionStartConfirmation: false,
      targetStateId: 'target-1',
    },
  ]);
});

test('resolveChannelStreamSessionId waits for the next sequential target instead of falling back to a completed target session', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          id: 'turn-sequential-gap',
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
          id: 'turn-sequential-gap',
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
    laneId: 'lane-turn-sequential-gap-target-2',
    participantId: 'participant-2',
    catId: null,
    speakerLabel: 'Codex-CLI',
    sessionStartedAt: null,
    requiresSessionStartConfirmation: false,
    targetStateId: 'target-2',
  });
});

test('resolveChannelStreamTarget uses target-local queue time for workflow session-start confirmation', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          id: 'turn-target-local-floor',
          status: 'running',
          startedAt: '2026-04-14T12:00:01.000Z',
          targetStatuses: [
            {
              id: 'target-gemini',
              status: 'running',
              queuedAt: '2026-04-14T12:05:00.000Z',
              startedAt: null,
              participant: {
                participantId: 'participant-gemini',
                participantName: 'Gemini-CLI',
              },
            },
          ],
        },
      },
    },
    catAssignments: [],
    participantAssignments: [
      buildParticipantAssignment(
        'participant-gemini',
        'session-gemini',
        'ready',
        'Gemini-CLI',
        '2026-04-14T12:03:00.000Z',
      ),
    ],
  };

  assert.deepEqual(resolveChannelStreamTarget(channel), {
    sessionId: 'session-gemini',
    laneId: 'lane-turn-target-local-floor-target-gemini',
    participantId: 'participant-gemini',
    catId: null,
    speakerLabel: 'Gemini-CLI',
    sessionStartedAt: '2026-04-14T12:03:00.000Z',
    requiresSessionStartConfirmation: false,
    targetStateId: 'target-gemini',
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

test('resolveChannelStreamTarget does not fall back to the room default recipient while a multi-participant workflow target is still materializing', () => {
  const channel = {
    roomMode: 'group',
    orchestratorLease: { status: 'idle', sessionId: null },
    roomRouting: {
      defaultRecipientId: 'participant-1',
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
    laneId: null,
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
          id: 'turn-solo-orchestrator',
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
    laneId: 'lane-turn-solo-orchestrator-target-orchestrator',
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
          id: 'turn-solo-orchestrator',
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
    laneId: 'lane-turn-solo-orchestrator-target-orchestrator',
    participantId: 'orchestrator',
    catId: null,
    speakerLabel: 'Gemini-CLI',
    sessionStartedAt: null,
    requiresSessionStartConfirmation: false,
    targetStateId: 'target-orchestrator',
  });
});
