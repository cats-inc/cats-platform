import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { ASSISTANT_TURN_SEGMENT_EVENT } from '../build/server/products/chat/state/assistantTurnSegments.js';
import { recordDispatchExecutionInteraction } from '../build/server/products/chat/state/runtime-dispatch/canonicalInteraction.js';
import {
  buildChatAssignedParticipantId,
  buildChatParallelGroupContainerId,
  buildDirectLaneTransportBindingId,
} from '../build/server/shared/chatCoreIds.js';

test('recordDispatchExecutionInteraction projects persisted assistant messages into canonical interaction records', () => {
  const core = createDefaultCoreState();
  const state = {
    parallelChatGroups: [
      {
        id: 'group-1',
        memberChannelIds: ['channel-1'],
      },
    ],
    channels: [
      {
        id: 'channel-1',
        channelKind: 'direct_lane',
        roomRouting: {
          defaultRecipientId: 'participant-cat-1',
        },
        catAssignments: [
          {
            participantId: 'participant-cat-1',
            catId: 'claude',
          },
        ],
        messages: [
          {
            id: 'message-user-1',
            body: 'hi',
            createdAt: '2026-04-14T21:30:00.000Z',
            metadata: {},
          },
          {
            id: 'message-agent-1',
            body: 'First part',
            createdAt: '2026-04-14T21:30:02.000Z',
            executionProvider: 'claude',
            executionModel: 'sonnet',
            executionInstance: 'cli',
            metadata: {
              event: ASSISTANT_TURN_SEGMENT_EVENT,
              assistantTurnId: 'assistant-turn-1',
              targetStateId: 'target-state-1',
              sourceMessageId: 'message-user-1',
              turnId: 'turn-1',
              segmentIndex: 0,
            },
          },
          {
            id: 'message-agent-2',
            body: 'Second part',
            createdAt: '2026-04-14T21:30:03.000Z',
            executionProvider: 'claude',
            executionModel: 'sonnet',
            executionInstance: 'cli',
            metadata: {
              event: ASSISTANT_TURN_SEGMENT_EVENT,
              assistantTurnId: 'assistant-turn-1',
              targetStateId: 'target-state-1',
              sourceMessageId: 'message-user-1',
              turnId: 'turn-1',
              segmentIndex: 1,
            },
          },
        ],
      },
    ],
  };
  const workflowTurn = {
    id: 'turn-1',
    sourceMessageId: 'message-user-1',
    sourceSenderKind: 'user',
    workflowShape: 'sequential',
    reviewRequired: false,
    startedAt: '2026-04-14T21:30:00.000Z',
    completedAt: null,
    targetStatuses: [
      {
        targetStateId: 'target-state-1',
      },
    ],
  };
  const execution = {
    targetStateId: 'target-state-1',
    sourceMessage: {
      id: 'message-user-1',
    },
    sourceParticipant: null,
    target: {
      participantKind: 'cat',
      participantId: 'participant-cat-1',
      participantName: 'Claude-CLI',
      sessionId: 'session-1',
    },
    error: null,
  };

  const nextCore = recordDispatchExecutionInteraction({
    core,
    state,
    channelId: 'channel-1',
    workflowTurn,
    execution,
    now: new Date('2026-04-14T21:30:05.000Z'),
  });

  assert.equal(nextCore.turns.length, 1);
  assert.equal(nextCore.lanes.length, 1);
  assert.equal(nextCore.sessions.length, 1);
  assert.equal(nextCore.segments.length, 2);
  assert.equal(nextCore.turns[0].id, 'turn-1');
  assert.equal(nextCore.lanes[0].id, 'lane-turn-1-target-state-1');
  assert.equal(nextCore.sessions[0].id, 'session-1');
  assert.equal(nextCore.sessions[0].laneId, 'lane-turn-1-target-state-1');
  assert.equal(
    nextCore.lanes[0].participantId,
    buildChatAssignedParticipantId('channel-1', 'participant-cat-1'),
  );
  assert.equal(
    nextCore.sessions[0].participantId,
    buildChatAssignedParticipantId('channel-1', 'participant-cat-1'),
  );
  assert.equal(
    nextCore.sessions[0].transportBindingId,
    buildDirectLaneTransportBindingId('channel-1'),
  );
  assert.equal(
    nextCore.turns[0].metadata.containerId,
    buildChatParallelGroupContainerId('group-1'),
  );
  assert.equal(
    nextCore.lanes[0].metadata.containerId,
    buildChatParallelGroupContainerId('group-1'),
  );
  assert.equal(
    nextCore.sessions[0].metadata.containerId,
    buildChatParallelGroupContainerId('group-1'),
  );
  assert.equal(nextCore.lanes[0].agentId, 'actor-cat-claude');
  assert.deepEqual(
    nextCore.segments.map((segment) => ({
      id: segment.id,
      sequence: segment.sequence,
      content: segment.content,
      laneId: segment.laneId,
      sessionId: segment.sessionId,
    })),
    [
      {
        id: 'segment-assistant-turn-1-0',
        sequence: 0,
        content: 'First part',
        laneId: 'lane-turn-1-target-state-1',
        sessionId: 'session-1',
      },
      {
        id: 'segment-assistant-turn-1-1',
        sequence: 1,
        content: 'Second part',
        laneId: 'lane-turn-1-target-state-1',
        sessionId: 'session-1',
      },
    ],
  );
  assert.deepEqual(
    nextCore.segments.map((segment) => segment.metadata.containerId),
    [
      buildChatParallelGroupContainerId('group-1'),
      buildChatParallelGroupContainerId('group-1'),
    ],
  );
});

test('recordDispatchExecutionInteraction prefers assistant segment transport bindings over session-start scans', () => {
  const core = createDefaultCoreState();
  const state = {
    channels: [
      {
        id: 'channel-transport',
        channelKind: 'multi_cat_room',
        roomRouting: {
          defaultRecipientId: null,
        },
        catAssignments: [
          {
            participantId: 'participant-cat-1',
            catId: 'claude',
          },
        ],
        messages: [
          {
            id: 'message-user-1',
            body: 'hi',
            createdAt: '2026-04-14T21:31:00.000Z',
            metadata: {},
          },
          {
            id: 'message-agent-1',
            body: 'Bound reply',
            createdAt: '2026-04-14T21:31:02.000Z',
            executionProvider: 'claude',
            executionModel: 'sonnet',
            executionInstance: 'cli',
            metadata: {
              event: ASSISTANT_TURN_SEGMENT_EVENT,
              assistantTurnId: 'assistant-turn-transport',
              targetStateId: 'target-state-transport',
              sourceMessageId: 'message-user-1',
              turnId: 'turn-transport',
              segmentIndex: 0,
              transportBindingId: 'transport-binding-custom',
            },
          },
        ],
      },
    ],
  };
  const workflowTurn = {
    id: 'turn-transport',
    sourceMessageId: 'message-user-1',
    sourceSenderKind: 'user',
    workflowShape: 'sequential',
    reviewRequired: false,
    startedAt: '2026-04-14T21:31:00.000Z',
    completedAt: null,
    targetStatuses: [
      {
        targetStateId: 'target-state-transport',
      },
    ],
  };
  const execution = {
    targetStateId: 'target-state-transport',
    sourceMessage: {
      id: 'message-user-1',
    },
    sourceParticipant: null,
    target: {
      participantKind: 'cat',
      participantId: 'participant-cat-1',
      participantName: 'Claude-CLI',
      sessionId: 'session-transport',
    },
    error: null,
  };

  const nextCore = recordDispatchExecutionInteraction({
    core,
    state,
    channelId: 'channel-transport',
    workflowTurn,
    execution,
    now: new Date('2026-04-14T21:31:05.000Z'),
  });

  assert.equal(nextCore.sessions[0]?.transportBindingId, 'transport-binding-custom');
});
