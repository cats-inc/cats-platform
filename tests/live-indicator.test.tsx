import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveLiveIndicatorSpeakerLabel,
  shouldConnectLiveIndicatorStream,
} from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
} from '../src/shared/liveIndicator.ts';

test('shouldConnectLiveIndicatorStream skips optimistic draft channels', () => {
  assert.equal(shouldConnectLiveIndicatorStream('draft-123', 'message:send'), false);
});

test('shouldConnectLiveIndicatorStream requires an active send on a real channel', () => {
  assert.equal(
    shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', 'message:prepare'),
    false,
  );
  assert.equal(shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', ''), false);
  assert.equal(shouldConnectLiveIndicatorStream(null, 'message:send'), false);
  assert.equal(
    shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', 'message:send'),
    true,
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
    text: 'Second chunk',
  });

  assert.equal(state.progressKind, 'text');
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
