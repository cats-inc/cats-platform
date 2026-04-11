import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EMPTY_LIVE_INDICATOR,
  resolveLiveIndicatorSpeakerLabel,
  shouldRetryLiveIndicatorSessionClose,
  shouldConnectLiveIndicatorStream,
} from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
  resolveTranscriptFollowState,
  resolveLiveIndicatorSpeakerState,
  resolveVisibleLiveIndicator,
} from '../src/shared/liveIndicator.ts';
import {
  resolveChatViewTopBarPresenceState,
} from '../src/products/chat/renderer/components/chat-view/chatViewSupport.ts';

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
    shouldConnectLiveIndicatorStream('12345678-1234-4234-8234-123456789abc', 'parallelChat:relay'),
    false,
  );
});

test('shouldConnectLiveIndicatorStream only follows concurrent dispatch for running member channels', () => {
  const channelId = '12345678-1234-4234-8234-123456789abc';
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, 'parallelChat:dispatch'),
    false,
  );
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, 'parallelChat:dispatch', 'idle'),
    false,
  );
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, 'parallelChat:dispatch', 'running'),
    true,
  );
});

test('shouldRetryLiveIndicatorSessionClose reconnects when a streamed session closes during an active send', () => {
  assert.equal(
    shouldRetryLiveIndicatorSessionClose({
      eventType: 'session_closed',
      channelId: '12345678-1234-4234-8234-123456789abc',
      busy: 'message:send:12345678-1234-4234-8234-123456789abc',
      routingStatus: 'running',
    }),
    true,
  );
});

test('shouldRetryLiveIndicatorSessionClose stays off once the channel is no longer dispatching', () => {
  assert.equal(
    shouldRetryLiveIndicatorSessionClose({
      eventType: 'session_closed',
      channelId: '12345678-1234-4234-8234-123456789abc',
      busy: '',
      routingStatus: null,
    }),
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
      defaultRecipientId: null,
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
      defaultRecipientId: null,
    },
  } as never), null);

  assert.equal(resolveLiveIndicatorSpeakerLabel({
    composerMode: 'solo',
    pendingProvider: 'gemini',
    pendingInstance: 'cli/native',
    pendingModel: 'gemini-3.1-pro',
    roomRouting: {
      defaultRecipientId: 'cat-1',
    },
  } as never), null);
});

test('resolveVisibleLiveIndicator hides stale progress once a reply newer than the active turn is visible', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        senderKind: 'user',
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        senderKind: 'agent',
        createdAt: '2026-04-09T12:00:03.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, null);
});

test('resolveVisibleLiveIndicator keeps active progress while only the user turn is visible', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        senderKind: 'user',
        createdAt: '2026-04-09T12:00:00.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveTranscriptFollowState derives scroll keys from transcript content instead of channel timestamps', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    previewText: 'Thinking',
  };

  const followState = resolveTranscriptFollowState(
    liveIndicator,
    [
      {
        id: 'msg-1',
        senderKind: 'user',
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'msg-2',
        senderKind: 'agent',
        createdAt: '2026-04-09T12:00:01.000Z',
      },
    ],
    '2026-04-09T12:00:03.000Z',
  );

  assert.equal(followState.visibleLiveIndicator, liveIndicator);
  assert.match(followState.transcriptScrollKey, /^2::msg-2::2026-04-09T12:00:01.000Z::/u);
});

test('shared live indicator effect depends on stable derived fields instead of selected channel identity', async () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const source = await readFile(
    path.join(
      testDirectory,
      '..',
      '..',
      'src/products/shared/renderer/hooks/useLiveIndicator.ts',
    ),
    'utf8',
  );

  assert.match(source, /const speakerLabel = defaultRecipientCatId/u);
  assert.match(source, /\[\s*busy,\s*channelId,\s*defaultRecipientCatId,\s*routingStatus,\s*speakerLabel,/u);
  assert.doesNotMatch(source, /\[\s*busy,\s*channelId,\s*defaultRecipientCatId,\s*resolveRoutingStatus,/u);
  assert.doesNotMatch(source, /\[\s*busy,\s*channelId,\s*defaultRecipientCatId,\s*routingStatus,\s*selectedChannel,/u);
  assert.doesNotMatch(source, /source\.onerror = \(\) =>/u);
});

test('live indicator accumulates streamed preview text and keeps active cat ids', () => {
  let state = createWaitingLiveIndicatorState({
    catId: 'cat-1',
    speakerLabel: null,
  });

  assert.equal(state.catId, null);
  assert.deepEqual(state.activeCatIds, []);
  assert.equal(state.speakerLabel, null);

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

test('live indicator speaker metadata can switch from a cat-backed turn to an inline participant', () => {
  const nextSpeaker = resolveLiveIndicatorSpeakerState(
    createWaitingLiveIndicatorState({
      catId: 'cat-1',
      speakerLabel: null,
    }),
    {
      catId: null,
      speakerLabel: 'Codex-CLI',
    },
  );

  assert.equal(nextSpeaker.catId, null);
  assert.deepEqual(nextSpeaker.activeCatIds, []);
  assert.equal(nextSpeaker.speakerLabel, 'Codex-CLI');
});

test('live indicator event payload updates the active speaker metadata even without preview text', () => {
  const nextState = applyLiveIndicatorEvent(
    createWaitingLiveIndicatorState({
      catId: 'cat-1',
      speakerLabel: null,
    }),
    'progress',
    {
      text: '',
      catId: null,
      speakerLabel: 'Gemini-CLI',
      metadata: {
        kind: 'session',
      },
    },
  );

  assert.equal(nextState.phase, 'streaming');
  assert.equal(nextState.catId, null);
  assert.deepEqual(nextState.activeCatIds, []);
  assert.equal(nextState.speakerLabel, 'Gemini-CLI');
});

test('chat top-bar presence stays anonymous while the live indicator is still waiting for session startup', () => {
  const presence = resolveChatViewTopBarPresenceState({
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'waiting',
    },
    selectedChannel: {
      roomRouting: {
        defaultRecipientId: 'participant-1',
        workflow: {
          activeTurn: {
            targetStatuses: [
              {
                participant: {
                  participantId: 'participant-1',
                },
                status: 'running',
              },
            ],
          },
        },
      },
    },
    activeRoomParticipants: [
      {
        participantId: 'participant-1',
        name: 'Claude-CLI',
      },
    ],
  } as never);

  assert.deepEqual(presence.activeTopBarCatIds, []);
  assert.deepEqual(presence.activeTopBarParticipantIds, []);
  assert.equal(presence.liveSpeakerParticipant, null);
});

test('chat top-bar presence does not pin live speaker to the default recipient once stream metadata names someone else', () => {
  const presence = resolveChatViewTopBarPresenceState({
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'streaming',
      speakerLabel: 'Codex-CLI',
    },
    selectedChannel: {
      roomRouting: {
        defaultRecipientId: 'participant-1',
        workflow: {
          activeTurn: {
            targetStatuses: [],
          },
        },
      },
    },
    activeRoomParticipants: [
      {
        participantId: 'participant-1',
        name: 'Claude-CLI',
      },
    ],
  } as never);

  assert.deepEqual(presence.activeTopBarParticipantIds, []);
  assert.equal(presence.liveSpeakerParticipant, null);
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
