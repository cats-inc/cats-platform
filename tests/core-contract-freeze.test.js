import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CORE_CANONICAL_ID_KEYS,
  CORE_CANONICAL_RECORD_FAMILIES,
} from '../build/server/core/types.js';

test('core contract freeze exports the canonical ID keys', () => {
  assert.deepEqual(CORE_CANONICAL_ID_KEYS, [
    'agentId',
    'participantId',
    'containerId',
    'conversationId',
    'turnId',
    'laneId',
    'sessionId',
    'transportBindingId',
    'managedWorkId',
    'missionId',
    'runId',
  ]);
});

test('core contract freeze exports the canonical record families', () => {
  assert.deepEqual(CORE_CANONICAL_RECORD_FAMILIES, [
    'AgentRecord',
    'ParticipantRecord',
    'ContainerRecord',
    'ConversationRecord',
    'TurnRecord',
    'LaneRecord',
    'SegmentRecord',
    'SessionRecord',
    'TransportBindingRecord',
    'ManagedWorkRecord',
    'MissionRecord',
    'RunRecord',
  ]);
});
