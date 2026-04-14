import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION,
  buildRuntimeDeliveryContentBlocksFromResultPayload,
  buildNormalizedRuntimeDeliveryEvent,
  buildNormalizedRuntimeDeliveryEventsFromStreamEvent,
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

test('buildNormalizedRuntimeDeliveryEvent normalizes raw text stream events into content blocks', () => {
  const normalized = buildNormalizedRuntimeDeliveryEvent({
    conversationId: 'conversation-2b',
    turnId: 'turn-2b',
    laneId: 'lane-2b',
    sessionId: 'session-2b',
    eventIndex: 2,
    emittedAt: '2026-04-14T20:07:00.000Z',
    event: {
      event: 'text',
      data: {
        segmentIndex: 4,
        text: 'Streaming text chunk',
      },
    },
  });

  assert.equal(normalized.kind, 'content_block');
  assert.equal(normalized.contentBlock?.kind, 'text');
  assert.equal(normalized.contentBlock?.text, 'Streaming text chunk');
  assert.equal(normalized.contentBlock?.id, 'stream-text-4');
  assert.equal(normalized.sequence.segmentIndex, 4);
});

test('buildNormalizedRuntimeDeliveryEvent normalizes raw tool_use stream events into tool content blocks', () => {
  const normalized = buildNormalizedRuntimeDeliveryEvent({
    conversationId: 'conversation-2c',
    turnId: 'turn-2c',
    laneId: 'lane-2c',
    sessionId: 'session-2c',
    eventIndex: 3,
    emittedAt: '2026-04-14T20:08:00.000Z',
    event: {
      event: 'tool_use',
      data: {
        segmentIndex: 5,
        toolName: 'search_repo',
        toolId: 'tool-5',
      },
    },
  });

  assert.equal(normalized.kind, 'content_block');
  assert.equal(normalized.contentBlock?.kind, 'tool');
  assert.equal(normalized.contentBlock?.toolName, 'search_repo');
  assert.equal(normalized.contentBlock?.toolId, 'tool-5');
  assert.equal(normalized.sequence.segmentIndex, 5);
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

test('buildNormalizedRuntimeDeliveryEventsFromStreamEvent expands coarse result-only text into a content block plus result', () => {
  const normalized = buildNormalizedRuntimeDeliveryEventsFromStreamEvent({
    conversationId: 'conversation-3b',
    turnId: 'turn-3b',
    laneId: 'lane-3b',
    sessionId: null,
    eventIndex: 4,
    emittedAt: '2026-04-14T20:11:00.000Z',
    event: {
      event: 'result',
      data: {
        text: 'Done',
      },
    },
  });

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]?.kind, 'content_block');
  assert.equal(normalized[0]?.contentBlock?.kind, 'text');
  assert.equal(normalized[0]?.contentBlock?.text, 'Done');
  assert.equal(normalized[0]?.payload.synthesizedFromResult, true);
  assert.equal(normalized[1]?.kind, 'result');
  assert.equal(normalized[1]?.contentBlock, null);
  assert.equal(normalized[1]?.sequence.segmentIndex, 1);
});

test('buildNormalizedRuntimeDeliveryEventsFromStreamEvent expands final result segments into canonical content blocks before the result', () => {
  const normalized = buildNormalizedRuntimeDeliveryEventsFromStreamEvent({
    conversationId: 'conversation-3c',
    turnId: 'turn-3c',
    laneId: 'lane-3c',
    sessionId: 'session-3c',
    eventIndex: 5,
    emittedAt: '2026-04-14T20:12:00.000Z',
    event: {
      event: 'result',
      data: {
        result: [
          { kind: 'tool_use', toolName: 'search_repo', toolId: 'tool-1' },
          { kind: 'text', text: 'Done after tool.' },
        ],
      },
    },
  });

  assert.equal(normalized.length, 3);
  assert.equal(normalized[0]?.kind, 'content_block');
  assert.equal(normalized[0]?.contentBlock?.kind, 'tool');
  assert.equal(normalized[0]?.contentBlock?.toolName, 'search_repo');
  assert.equal(normalized[1]?.kind, 'content_block');
  assert.equal(normalized[1]?.contentBlock?.kind, 'text');
  assert.equal(normalized[1]?.contentBlock?.text, 'Done after tool.');
  assert.equal(normalized[2]?.kind, 'result');
  assert.equal(normalized[2]?.sequence.segmentIndex, 2);
});

test('buildRuntimeDeliveryContentBlocksFromResultPayload synthesizes a text block for coarse final-only payloads', () => {
  const blocks = buildRuntimeDeliveryContentBlocksFromResultPayload({
    text: 'Coarse final reply',
  });

  assert.deepEqual(blocks, [
    {
      id: 'result-block-0',
      index: 0,
      kind: 'text',
      status: 'complete',
      title: null,
      text: 'Coarse final reply',
      toolName: null,
      toolId: null,
      metadata: {
        source: 'runtime_result',
        segmentKind: 'text',
      },
    },
  ]);
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
