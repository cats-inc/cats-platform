import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_LIVE_INDICATOR,
  resolveLiveIndicatorSpeakerLabel,
  shouldConnectLiveIndicatorStream,
} from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
} from '../src/shared/liveIndicator.ts';

test('EMPTY_LIVE_INDICATOR starts with no active cat ids', () => {
  assert.deepEqual(EMPTY_LIVE_INDICATOR.activeCatIds, []);
  assert.equal(EMPTY_LIVE_INDICATOR.previewText, '');
});

test('shouldConnectLiveIndicatorStream skips optimistic draft channels', () => {
  assert.equal(shouldConnectLiveIndicatorStream('draft-123', 'message:send'), false);
});

test('shouldConnectLiveIndicatorStream requires an active send on a real channel', () => {
  const channelId = '12345678-1234-4234-8234-123456789abc';
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, 'message:prepare'),
    false,
  );
  assert.equal(shouldConnectLiveIndicatorStream(channelId, ''), false);
  assert.equal(shouldConnectLiveIndicatorStream(null, 'message:send'), false);
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, `message:send:${channelId}`),
    true,
  );
});

test('shouldConnectLiveIndicatorStream ignores parallel relay busy state on the source channel', () => {
  assert.equal(
    shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', 'concurrent:relay'),
    false,
  );
});

test('resolveLiveIndicatorSpeakerLabel uses the solo execution target label', () => {
  const label = resolveLiveIndicatorSpeakerLabel({
    composerMode: 'solo',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    pendingModel: 'gemini-3.1-pro',
    roomRouting: {
      leadParticipantId: null,
    },
  } as never);

  assert.equal(label, 'Gemini-CLI');
});

test('resolveLiveIndicatorSpeakerLabel stays silent for cat-led chats', () => {
  assert.equal(resolveLiveIndicatorSpeakerLabel({
    composerMode: 'cat_led',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    pendingModel: 'gemini-3.1-pro',
    roomRouting: {
      leadParticipantId: null,
    },
  } as never), null);

  assert.equal(resolveLiveIndicatorSpeakerLabel({
    composerMode: 'solo',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    pendingModel: 'gemini-3.1-pro',
    roomRouting: {
      leadParticipantId: 'cat-1',
    },
  } as never), null);
});

test('live indicator accumulates streamed preview text and keeps active cat ids', () => {
  let state = createWaitingLiveIndicatorState({
    catId: 'cat-1',
    speakerLabel: null,
  });

  assert.deepEqual(state.activeCatIds, ['cat-1']);

  state = applyLiveIndicatorEvent(state, 'text', {
    text: 'Hello',
  });
  state = applyLiveIndicatorEvent(state, 'text', {
    text: ' world',
  });

  assert.equal(state.previewText, 'Hello world');
  assert.equal(state.progressText, '');
  assert.equal(state.progressKind, null);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.eventType, 'text');
  assert.equal(state.events[0]?.text, 'Hello world');
});

test('live indicator accumulates a bounded event tape and pending tools', () => {
  let state = createWaitingLiveIndicatorState({
    catId: 'cat-1',
    speakerLabel: null,
  });

  state = applyLiveIndicatorEvent(state, 'progress', {
    text: 'Planning next step',
    metadata: { kind: 'plan' },
  });
  state = applyLiveIndicatorEvent(state, 'tool_use', {
    toolName: 'read_file',
    toolId: 'tool-1',
  });
  state = applyLiveIndicatorEvent(state, 'tool_result', {
    toolId: 'tool-1',
    text: '{"ok":true}',
  });

  assert.equal(state.phase, 'streaming');
  assert.equal(state.progressText, 'Planning next step');
  assert.equal(state.progressKind, 'plan');
  assert.deepEqual(state.tools, [
    {
      toolId: 'tool-1',
      toolName: 'read_file',
      done: true,
    },
  ]);
  assert.deepEqual(
    state.events.map((event) => [event.eventType, event.label, event.text]),
    [
      ['progress', 'Plan', 'Planning next step'],
      ['tool_use', 'Tool', 'Started read_file'],
      ['tool_result', 'Tool', 'Completed read_file: {"ok":true}'],
    ],
  );
});

test('live indicator merges consecutive text chunks into one tape entry', () => {
  let state = createWaitingLiveIndicatorState({
    catId: null,
    speakerLabel: 'Gemini-CLI',
  });

  state = applyLiveIndicatorEvent(state, 'text', {
    text: 'First chunk',
  });
  state = applyLiveIndicatorEvent(state, 'text', {
    text: ' Second chunk',
  });

  assert.equal(state.previewText, 'First chunk Second chunk');
  assert.equal(state.progressKind, null);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.eventType, 'text');
  assert.equal(state.events[0]?.text, 'First chunk Second chunk');
});

test('live indicator keeps only the latest bounded tape entries', () => {
  let state = createWaitingLiveIndicatorState({
    catId: null,
    speakerLabel: 'Codex',
  });

  for (let index = 0; index < 12; index += 1) {
    state = applyLiveIndicatorEvent(state, 'progress', {
      text: `step-${index}`,
      metadata: { kind: 'status' },
    });
  }

  assert.equal(state.events.length, 8);
  assert.deepEqual(
    state.events.map((event) => event.text),
    ['step-4', 'step-5', 'step-6', 'step-7', 'step-8', 'step-9', 'step-10', 'step-11'],
  );
});

test('live indicator tracks content blocks by id and updates them in place', () => {
  let state = createWaitingLiveIndicatorState({
    catId: 'cat-1',
    speakerLabel: null,
  });

  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'streaming',
      text: 'alpha',
    },
  });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'complete',
      text: 'alpha beta',
    },
  });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: {
      id: 'tool:1',
      index: 1,
      kind: 'tool',
      status: 'complete',
      title: 'read_file',
      toolName: 'read_file',
      toolId: 'tool-1',
      text: 'done',
    },
  });

  assert.deepEqual(state.contentBlocks, [
    {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'complete',
      title: null,
      text: 'alpha beta',
      toolName: null,
      toolId: null,
      metadata: null,
    },
    {
      id: 'tool:1',
      index: 1,
      kind: 'tool',
      status: 'complete',
      title: 'read_file',
      text: 'done',
      toolName: 'read_file',
      toolId: 'tool-1',
      metadata: null,
    },
  ]);
});
