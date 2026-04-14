import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION,
  buildNormalizedRuntimeDeliveryEvent,
  buildNormalizedRuntimeDeliveryEventsFromResult,
} from '../build/server/platform/orchestration/index.js';

test('buildNormalizedRuntimeDeliveryEvent preserves canonical identities and content blocks', () => {
  const normalized = buildNormalizedRuntimeDeliveryEvent({
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    laneId: 'lane-1',
    sessionId: 'session-1',
    eventIndex: 7,
    emittedAt: '2026-04-14T20:00:00.000Z',
    event: {
      event: 'progress',
      data: {
        segmentIndex: 3,
        block: {
          id: 'block-text-3',
          index: 3,
          kind: 'text',
          status: 'streaming',
          title: null,
          text: 'Hello',
          toolName: null,
          toolId: null,
          metadata: {
            source: 'runtime',
          },
        },
      },
    },
  });

  assert.equal(normalized.version, ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION);
  assert.equal(normalized.conversationId, 'conversation-1');
  assert.equal(normalized.turnId, 'turn-1');
  assert.equal(normalized.laneId, 'lane-1');
  assert.equal(normalized.sessionId, 'session-1');
  assert.equal(normalized.kind, 'content_block');
  assert.equal(normalized.sequence.segmentIndex, 3);
  assert.equal(normalized.sequence.blockIndex, 3);
  assert.equal(normalized.sequence.eventIndex, 7);
  assert.deepEqual(normalized.contentBlock, {
    id: 'block-text-3',
    index: 3,
    kind: 'text',
    status: 'streaming',
    title: null,
    text: 'Hello',
    toolName: null,
    toolId: null,
    metadata: {
      source: 'runtime',
    },
  });
});

test('buildNormalizedRuntimeDeliveryEvent treats session_started metadata as a session status event', () => {
  const normalized = buildNormalizedRuntimeDeliveryEvent({
    conversationId: 'conversation-2',
    turnId: 'turn-2',
    laneId: 'lane-2',
    sessionId: 'session-2',
    eventIndex: 0,
    emittedAt: '2026-04-14T20:05:00.000Z',
    event: {
      event: 'progress',
      data: {
        text: '',
        metadata: {
          event: 'session_started',
          kind: 'session',
        },
      },
    },
  });

  assert.equal(normalized.kind, 'session_status');
  assert.equal(normalized.sequence.segmentIndex, 0);
  assert.equal(normalized.sequence.blockIndex, null);
});

test('buildNormalizedRuntimeDeliveryEvent preserves result events without inventing content blocks', () => {
  const normalized = buildNormalizedRuntimeDeliveryEvent({
    conversationId: 'conversation-3',
    turnId: 'turn-3',
    laneId: 'lane-3',
    sessionId: null,
    eventIndex: 4,
    emittedAt: '2026-04-14T20:10:00.000Z',
    event: {
      event: 'result',
      data: {
        text: 'Done',
      },
    },
  });

  assert.equal(normalized.kind, 'result');
  assert.equal(normalized.contentBlock, null);
  assert.equal(normalized.sequence.segmentIndex, 0);
});

test('buildNormalizedRuntimeDeliveryEventsFromResult expands final result segments into canonical content blocks', () => {
  const events = buildNormalizedRuntimeDeliveryEventsFromResult({
    conversationId: 'conversation-4',
    turnId: 'turn-4',
    laneId: 'lane-4',
    sessionId: 'session-4',
    emittedAt: '2026-04-14T20:15:00.000Z',
    result: {
      segments: [
        { kind: 'tool_use', text: '', toolName: 'search_repo', toolId: 'tool-1' },
        { kind: 'text', text: 'All done.', toolName: null, toolId: null },
      ],
      inputTokens: 5,
      outputTokens: 7,
      tokensUsed: 12,
    },
  });

  assert.equal(events.length, 3);
  assert.equal(events[0]?.kind, 'content_block');
  assert.equal(events[0]?.contentBlock?.kind, 'tool');
  assert.equal(events[0]?.contentBlock?.toolName, 'search_repo');
  assert.equal(events[0]?.sequence.segmentIndex, 0);
  assert.equal(events[1]?.kind, 'content_block');
  assert.equal(events[1]?.contentBlock?.kind, 'text');
  assert.equal(events[1]?.contentBlock?.text, 'All done.');
  assert.equal(events[1]?.sequence.segmentIndex, 1);
  assert.equal(events[2]?.kind, 'result');
  assert.deepEqual(events[2]?.payload, {
    inputTokens: 5,
    outputTokens: 7,
    tokensUsed: 12,
    segmentCount: 2,
  });
  assert.equal(events[2]?.sequence.segmentIndex, 2);
});
