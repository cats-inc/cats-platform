import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  advanceSequencedLiveIndicatorStreamCursor,
  EMPTY_LIVE_INDICATOR,
  resolveWaitingIndicatorStateTransition,
  resolveLiveIndicatorSpeakerLabel,
  shouldPromoteStreamingBubbleToWaitingSpeaker,
  shouldPromoteSealedBubbleToWaitingSpeaker,
  shouldIgnoreSealedSessionClose,
  shouldPinLiveIndicatorUntilPersistedReply,
  shouldRetryLiveIndicatorSessionClose,
  shouldConnectLiveIndicatorStream,
  shouldReconnectLiveIndicatorAfterOngoingWorkflow,
  shouldReconnectLiveIndicatorAfterSessionClose,
  shouldReconnectLiveIndicatorAfterSourceError,
} from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
  hasVisibleLiveIndicatorSpeakerReplyAfterMessage,
  resolveTranscriptFollowState,
  resolveLiveIndicatorSpeakerState,
  resolveVisibleLiveIndicator,
} from '../src/shared/liveIndicator.ts';
import {
  resolveChatViewTopBarPresenceState,
} from '../src/products/chat/renderer/components/chat-view/chatViewSupport.ts';
import {
  shouldRenderLiveTranscriptBlock,
  shouldShowLiveTranscriptTrailingDots,
} from '../src/products/shared/renderer/components/chat-view/liveTranscriptBlockSupport.ts';

test('EMPTY_LIVE_INDICATOR starts with no active cat ids', () => {
  assert.deepEqual(EMPTY_LIVE_INDICATOR.activeCatIds, []);
  assert.deepEqual(EMPTY_LIVE_INDICATOR.contentBlocks, []);
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

test('shouldReconnectLiveIndicatorAfterSourceError stays off once the current segment is sealed', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterSourceError(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
      },
      null,
    ),
    false,
  );
});

test('shouldReconnectLiveIndicatorAfterSourceError stays off while waiting for the persisted reply commit', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterSourceError(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'streaming',
        participantId: 'participant-agent-1',
        speakerLabel: 'Agent-1',
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text' as const,
            status: 'streaming' as const,
            title: null,
            text: 'First answer',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
      },
      {
        messages: [
          {
            id: 'message-user',
            senderKind: 'user',
          },
        ],
        roomRouting: {
          defaultRecipientId: null,
          workflow: {
            activeTurn: {
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [],
            },
          },
        },
        composerMode: 'cat_led',
        pendingProvider: null,
        pendingInstance: null,
      },
    ),
    false,
  );
});

test('shouldReconnectLiveIndicatorAfterSessionClose stays off when no distinct follow-up target exists', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterSessionClose(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        targetStateId: 'target-state-claude',
        segmentIndex: 0,
      },
      createWaitingLiveIndicatorState({
        targetStateId: 'target-state-claude',
        participantId: 'participant-claude',
        catId: null,
        speakerLabel: 'Claude-CLI',
        revealIdentity: true,
        segmentIndex: 0,
      }),
    ),
    false,
  );
});

test('shouldReconnectLiveIndicatorAfterSessionClose stays on when a distinct follow-up target exists', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterSessionClose(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        targetStateId: 'target-state-claude',
        segmentIndex: 0,
      },
      createWaitingLiveIndicatorState({
        targetStateId: 'target-state-codex',
        participantId: 'participant-codex',
        catId: null,
        speakerLabel: 'Codex-CLI',
        revealIdentity: true,
        segmentIndex: 0,
      }),
    ),
    true,
  );
});

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays on for a sealed speaker while the same turn keeps running', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        participantId: 'participant-agent-1',
        speakerLabel: 'Agent-1',
        segments: [
          {
            id: 'segment-0',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            targetStateId: 'target-agent-1',
            segmentIndex: 0,
            participantId: 'participant-agent-1',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Agent-1',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: '',
            progressKind: null,
            tools: [],
            contentBlocks: [
              {
                id: 'text:0',
                index: 0,
                kind: 'text',
                status: 'complete',
                title: null,
                text: 'First answer',
                toolName: null,
                toolId: null,
                metadata: null,
              },
            ],
            events: [],
          },
        ],
      },
      {
        messages: [
          {
            id: 'message-user',
            senderKind: 'user',
          },
          {
            id: 'message-agent-1',
            senderKind: 'agent',
          },
        ],
        roomRouting: {
          defaultRecipientId: null,
          workflow: {
            activeTurn: {
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [],
            },
          },
        },
        composerMode: 'cat_led',
        pendingProvider: null,
        pendingInstance: null,
      },
    ),
    true,
  );
});

test('shouldIgnoreSealedSessionClose stays off when a distinct follow-up target exists', () => {
  assert.equal(
    shouldIgnoreSealedSessionClose(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        targetStateId: 'target-state-claude',
        segmentIndex: 0,
      },
      createWaitingLiveIndicatorState({
        targetStateId: 'target-state-codex',
        participantId: 'participant-codex',
        catId: null,
        speakerLabel: 'Codex-CLI',
        revealIdentity: true,
        segmentIndex: 0,
      }),
    ),
    false,
  );
});

test('shouldIgnoreSealedSessionClose stays on when no distinct follow-up target exists', () => {
  assert.equal(
    shouldIgnoreSealedSessionClose(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        targetStateId: 'target-state-claude',
        segmentIndex: 0,
      },
      createWaitingLiveIndicatorState({
        targetStateId: 'target-state-claude',
        participantId: 'participant-claude',
        catId: null,
        speakerLabel: 'Claude-CLI',
        revealIdentity: true,
        segmentIndex: 0,
      }),
    ),
    true,
  );
});

test('shouldPinLiveIndicatorUntilPersistedReply keeps a completed streaming bubble visible until the reply is durable', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'streaming' as const,
        title: null,
        text: 'First answer',
        toolName: null,
        toolId: null,
        metadata: null,
      },
    ],
  };

  assert.equal(
    shouldPinLiveIndicatorUntilPersistedReply(previous, {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            sourceMessageId: 'message-user',
            workflowShape: 'sequential',
            targetStatuses: [],
          },
        },
      },
      composerMode: 'cat_led',
      pendingProvider: null,
      pendingInstance: null,
    }),
    true,
  );
});

test('shouldPinLiveIndicatorUntilPersistedReply keeps a sealed bubble visible until the reply is durable', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'complete' as const,
        title: null,
        text: 'First answer',
        toolName: null,
        toolId: null,
        metadata: null,
      },
    ],
  };

  assert.equal(
    shouldPinLiveIndicatorUntilPersistedReply(previous, {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            sourceMessageId: 'message-user',
            workflowShape: 'sequential',
            targetStatuses: [],
          },
        },
      },
      composerMode: 'cat_led',
      pendingProvider: null,
      pendingInstance: null,
    }),
    true,
  );
});

test('resolveWaitingIndicatorStateTransition keeps the current speaker bubble pinned until the persisted reply lands', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'streaming' as const,
        title: null,
        text: 'First answer',
        toolName: null,
        toolId: null,
        metadata: null,
      },
    ],
  };
  const waitingState = createWaitingLiveIndicatorState({
    participantId: 'participant-agent-2',
    catId: null,
    speakerLabel: 'Agent-2',
    revealIdentity: true,
  });

  const next = resolveWaitingIndicatorStateTransition({
    previous,
    waitingState,
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            sourceMessageId: 'message-user',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                status: 'running',
                participant: {
                  participantId: 'participant-agent-2',
                  participantName: 'Agent-2',
                },
              },
            ],
          },
        },
      },
      composerMode: 'cat_led',
      pendingProvider: null,
      pendingInstance: null,
    },
    previousChannelId: 'channel-1',
    channelId: 'channel-1',
  });

  assert.equal(next, previous);
});

test('resolveWaitingIndicatorStateTransition hands off once the persisted assistant reply is visible', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'streaming' as const,
        title: null,
        text: 'First answer',
        toolName: null,
        toolId: null,
        metadata: null,
      },
    ],
  };
  const waitingState = createWaitingLiveIndicatorState({
    participantId: 'participant-agent-2',
    catId: null,
    speakerLabel: 'Agent-2',
    revealIdentity: true,
  });

  const next = resolveWaitingIndicatorStateTransition({
    previous,
    waitingState,
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
        },
        {
          id: 'message-agent-1',
          senderKind: 'agent',
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            sourceMessageId: 'message-user',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                status: 'running',
                participant: {
                  participantId: 'participant-agent-2',
                  participantName: 'Agent-2',
                },
              },
            ],
          },
        },
      },
      composerMode: 'cat_led',
      pendingProvider: null,
      pendingInstance: null,
    },
    previousChannelId: 'channel-1',
    channelId: 'channel-1',
  });

  assert.equal(next.phase, 'waiting');
  assert.equal(next.participantId, 'participant-agent-2');
  assert.equal(next.speakerLabel, 'Agent-2');
  assert.equal(next.segments.length, 2);
  assert.equal(next.segments[0]?.phase, 'sealed');
  assert.equal(next.segments[0]?.participantId, 'participant-agent-1');
  assert.equal(next.segments[0]?.contentBlocks[0]?.text, 'First answer');
  assert.equal(next.segments[1]?.phase, 'waiting');
  assert.equal(next.segments[1]?.participantId, 'participant-agent-2');
});

test('resolveWaitingIndicatorStateTransition increments the segment index for same-speaker follow-up bubbles', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    segments: [
      {
        id: 'message-user-current:participant-claude:segment:0',
        phase: 'sealed' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: null,
        segmentIndex: 0,
        participantId: 'participant-claude',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Claude-CLI',
        sessionStartedAt: null,
        requiresSessionStartConfirmation: false,
        progressText: '',
        progressKind: null,
        tools: [],
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text' as const,
            status: 'complete' as const,
            title: null,
            text: 'First segment',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
        events: [],
      },
    ],
  };
  const waitingState = createWaitingLiveIndicatorState({
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    catId: null,
    speakerLabel: 'Claude-CLI',
    revealIdentity: true,
  });

  const next = resolveWaitingIndicatorStateTransition({
    previous,
    waitingState,
    selectedChannel: {
      messages: [
        {
          id: 'message-user-current',
          senderKind: 'user',
        },
        {
          id: 'message-agent-current-0',
          senderKind: 'agent',
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            sourceMessageId: 'message-user-current',
            workflowShape: 'solo',
            targetStatuses: [],
          },
        },
      },
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingInstance: 'native',
    },
    previousChannelId: 'channel-1',
    channelId: 'channel-1',
  });

  assert.equal(next.segments.length, 2);
  assert.equal(next.segments[0]?.segmentIndex, 0);
  assert.equal(next.segments[1]?.segmentIndex, 1);
  assert.notEqual(next.segments[0]?.id, next.segments[1]?.id);
});

test('resolveWaitingIndicatorStateTransition preserves an existing waiting segment index for the same logical follow-up speaker', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting' as const,
    sourceMessageId: 'message-user-current',
    targetStateId: 'target-codex',
    participantId: 'participant-codex',
    speakerLabel: 'Codex-CLI',
    segmentIndex: 3,
    segments: [
      {
        id: 'message-user-current:participant-claude:segment:0',
        phase: 'sealed' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: 'target-claude',
        segmentIndex: 0,
        participantId: 'participant-claude',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Claude-CLI',
        sessionStartedAt: null,
        requiresSessionStartConfirmation: false,
        progressText: '',
        progressKind: null,
        tools: [],
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text' as const,
            status: 'complete' as const,
            title: null,
            text: 'First segment',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
        events: [],
      },
      {
        id: 'message-user-current:participant-codex:segment:3',
        phase: 'waiting' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: 'target-codex',
        segmentIndex: 3,
        participantId: 'participant-codex',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Codex-CLI',
        sessionStartedAt: null,
        requiresSessionStartConfirmation: false,
        progressText: '',
        progressKind: null,
        tools: [],
        contentBlocks: [],
        events: [],
      },
    ],
  };
  const waitingState = createWaitingLiveIndicatorState({
    sourceMessageId: 'message-user-current',
    targetStateId: 'target-codex',
    participantId: 'participant-codex',
    catId: null,
    speakerLabel: 'Codex-CLI',
    revealIdentity: true,
  });

  const next = resolveWaitingIndicatorStateTransition({
    previous,
    waitingState,
    selectedChannel: {
      messages: [
        {
          id: 'message-user-current',
          senderKind: 'user',
        },
        {
          id: 'message-agent-current-0',
          senderKind: 'agent',
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            sourceMessageId: 'message-user-current',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                id: 'target-codex',
                status: 'pending',
                participant: {
                  participantId: 'participant-codex',
                  participantName: 'Codex-CLI',
                },
              },
            ],
          },
        },
      },
      composerMode: 'cat_led',
      pendingProvider: null,
      pendingInstance: null,
    },
    previousChannelId: 'channel-1',
    channelId: 'channel-1',
  });

  assert.equal(next.phase, 'waiting');
  assert.equal(next.segments.length, 2);
  assert.equal(next.segments[1]?.segmentIndex, 3);
  assert.equal(next.segments[1]?.id, 'message-user-current:participant-codex:segment:3');
});

test('hasVisibleLiveIndicatorSpeakerReplyAfterMessage only matches the current streaming speaker', () => {
  assert.equal(
    hasVisibleLiveIndicatorSpeakerReplyAfterMessage(
      [
        {
          id: 'message-user',
          senderKind: 'user',
          senderName: 'Kenny',
          metadata: {},
          createdAt: '2026-04-13T12:00:00.000Z',
        },
        {
          id: 'message-agent-1',
          senderKind: 'agent',
          senderName: 'Agent-1',
          metadata: {
            targetKind: 'cat',
            targetId: 'participant-agent-1',
          },
          createdAt: '2026-04-13T12:00:03.000Z',
        },
      ],
      'message-user',
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'streaming',
        participantId: 'participant-agent-2',
        speakerLabel: 'Agent-2',
      },
    ),
    false,
  );

  assert.equal(
    hasVisibleLiveIndicatorSpeakerReplyAfterMessage(
      [
        {
          id: 'message-user',
          senderKind: 'user',
          senderName: 'Kenny',
          metadata: {},
          createdAt: '2026-04-13T12:00:00.000Z',
        },
        {
          id: 'message-agent-1',
          senderKind: 'agent',
          senderName: 'Agent-1',
          metadata: {
            targetKind: 'cat',
            targetId: 'participant-agent-1',
          },
          createdAt: '2026-04-13T12:00:03.000Z',
        },
      ],
      'message-user',
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'streaming',
        participantId: 'participant-agent-1',
        speakerLabel: 'Agent-1',
      },
    ),
    true,
  );
});

test('shouldPromoteStreamingBubbleToWaitingSpeaker hands off to a named follow-up speaker after the prior reply persists', () => {
  const waitingState = createWaitingLiveIndicatorState({
    participantId: 'participant-agent-2',
    catId: null,
    speakerLabel: 'Agent-2',
    revealIdentity: true,
  });

  assert.equal(
    shouldPromoteStreamingBubbleToWaitingSpeaker(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'streaming',
        participantId: 'participant-agent-1',
        speakerLabel: 'Agent-1',
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text',
            status: 'streaming',
            title: null,
            text: 'Done.',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
      },
      waitingState,
      {
        messages: [
          {
            id: 'message-user',
            senderKind: 'user',
            senderName: 'Kenny',
            metadata: {},
            createdAt: '2026-04-13T12:00:00.000Z',
          },
          {
            id: 'message-agent-1',
            senderKind: 'agent',
            senderName: 'Agent-1',
            metadata: {
              targetKind: 'cat',
              targetId: 'participant-agent-1',
            },
            createdAt: '2026-04-13T12:00:03.000Z',
          },
          {
            id: 'message-session-agent-2',
            senderKind: 'system',
            senderName: 'Runtime',
            metadata: {
              event: 'session_started',
              targetKind: 'cat',
              targetId: 'participant-agent-2',
            },
            createdAt: '2026-04-13T12:00:03.500Z',
          },
        ],
        roomRouting: {
          defaultRecipientId: null,
          workflow: {
            activeTurn: {
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [
                {
                  status: 'completed',
                  participant: {
                    participantId: 'participant-agent-1',
                    participantName: 'Agent-1',
                  },
                },
                {
                  status: 'running',
                  participant: {
                    participantId: 'participant-agent-2',
                    participantName: 'Agent-2',
                  },
                },
              ],
            },
          },
        },
        composerMode: 'cat_led',
        pendingProvider: null,
        pendingInstance: null,
      },
    ),
    true,
  );
});

test('shouldPromoteSealedBubbleToWaitingSpeaker hands off once the first speaker reply is durable', () => {
  const waitingState = createWaitingLiveIndicatorState({
    sourceMessageId: 'message-user',
    targetStateId: 'target-agent-2',
    participantId: 'participant-agent-2',
    catId: null,
    speakerLabel: 'Agent-2',
    revealIdentity: true,
  });

  assert.equal(
    shouldPromoteSealedBubbleToWaitingSpeaker(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        targetStateId: 'target-agent-1',
        participantId: 'participant-agent-1',
        speakerLabel: 'Agent-1',
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text',
            status: 'complete',
            title: null,
            text: 'First reply.',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
      },
      waitingState,
      {
        messages: [
          {
            id: 'message-user',
            senderKind: 'user',
            senderName: 'Kenny',
            metadata: {},
            createdAt: '2026-04-14T01:00:00.000Z',
          },
          {
            id: 'message-agent-1',
            senderKind: 'agent',
            senderName: 'Agent-1',
            metadata: {
              targetKind: 'cat',
              targetId: 'participant-agent-1',
            },
            createdAt: '2026-04-14T01:00:03.000Z',
          },
        ],
        roomRouting: {
          defaultRecipientId: null,
          workflow: {
            activeTurn: {
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [
                {
                  id: 'target-agent-2',
                  status: 'pending',
                  participant: {
                    participantId: 'participant-agent-2',
                    participantName: 'Agent-2',
                  },
                },
              ],
            },
          },
        },
        composerMode: 'cat_led',
        pendingProvider: null,
        pendingInstance: null,
      },
    ),
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

test('collapsed live transcript keeps error blocks visible and only shows dots for streaming non-text blocks', () => {
  assert.equal(
    shouldRenderLiveTranscriptBlock(
      {
        id: 'status:error',
        index: 1,
        kind: 'status',
        status: 'error',
        title: null,
        text: 'Search failed',
        toolName: null,
        toolId: null,
        metadata: null,
      },
      false,
    ),
    true,
  );
  assert.equal(
    shouldShowLiveTranscriptTrailingDots('streaming', {
      id: 'tool:complete',
      index: 1,
      kind: 'tool',
      status: 'complete',
      title: 'search',
      text: 'Done',
      toolName: 'search',
      toolId: 'tool-search',
      metadata: null,
    }),
    false,
  );
  assert.equal(
    shouldShowLiveTranscriptTrailingDots('streaming', {
      id: 'tool:streaming',
      index: 2,
      kind: 'tool',
      status: 'streaming',
      title: 'search',
      text: '',
      toolName: 'search',
      toolId: 'tool-search',
      metadata: null,
    }),
    true,
  );
});

test('resolveVisibleLiveIndicator keeps a sequential follow-up speaker visible after an earlier reply', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    participantId: 'participant-agent-2',
    speakerLabel: 'Agent-2',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'message-session-agent-2',
        senderKind: 'system',
        senderName: 'Runtime',
        metadata: {
          event: 'session_started',
          targetKind: 'cat',
          targetId: 'participant-agent-2',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
      {
        id: 'message-agent-1',
        senderKind: 'agent',
        senderName: 'Agent-1',
        metadata: {
          targetKind: 'cat',
          targetId: 'participant-agent-1',
        },
        createdAt: '2026-04-09T12:00:03.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator keeps a named waiting follow-up speaker visible after an earlier reply', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting',
    participantId: 'participant-agent-2',
    speakerLabel: 'Agent-2',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'message-agent-1',
        senderKind: 'agent',
        senderName: 'Agent-1',
        metadata: {
          targetKind: 'cat',
          targetId: 'participant-agent-1',
        },
        createdAt: '2026-04-09T12:00:03.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator keeps a named concurrent waiting speaker visible before the first reply lands', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting',
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator hides stale streaming progress once the same speaker reply is visible', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'message-session-agent-1',
        senderKind: 'system',
        senderName: 'Runtime',
        metadata: {
          event: 'session_started',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
      {
        id: 'message-agent-1',
        senderKind: 'agent',
        senderName: 'Agent-1',
        metadata: {
          targetKind: 'cat',
          targetId: 'participant-agent-1',
        },
        createdAt: '2026-04-09T12:00:03.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, null);
});

test('resolveVisibleLiveIndicator hides a sealed targeted segment once the same speaker persisted reply is visible', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    targetStateId: 'target-state-1',
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'complete' as const,
        title: null,
        text: 'Done.',
        toolName: null,
        toolId: null,
        metadata: null,
      },
    ],
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'message-agent-1',
        senderKind: 'agent',
        senderName: 'Agent-1',
        metadata: {
          event: 'assistant_turn_segment',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
          targetStateId: 'target-state-1',
          segmentIndex: 0,
        },
        createdAt: '2026-04-09T12:00:03.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, null);
});

test('resolveVisibleLiveIndicator keeps the assistant bubble hidden until session startup is persisted', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    sessionStartedAt: '2026-04-09T12:00:02.500Z',
    requiresSessionStartConfirmation: true,
    progressKind: 'session',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, null);
});

test('resolveVisibleLiveIndicator shows assistant progress once the matching session_started message is visible even if the turn timestamp moved later', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    sessionStartedAt: '2026-04-09T12:00:02.500Z',
    requiresSessionStartConfirmation: true,
    progressKind: 'session',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'message-session-agent-1',
        senderKind: 'system',
        senderName: 'Runtime',
        metadata: {
          event: 'session_started',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
    ],
    '2026-04-09T12:00:05.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator accepts orchestrator session_started messages that only declare targetKind', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    participantId: 'orchestrator',
    speakerLabel: 'Orchestrator',
    sessionStartedAt: '2026-04-09T12:00:02.500Z',
    requiresSessionStartConfirmation: true,
    progressKind: 'session',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'message-session-orchestrator',
        senderKind: 'system',
        senderName: 'Runtime',
        metadata: {
          event: 'session_started',
          targetKind: 'orchestrator',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator does not wait for a new session_started message when the stream reuses an older session', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    sessionStartedAt: '2026-04-09T11:59:00.000Z',
    requiresSessionStartConfirmation: false,
    progressKind: 'session',
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-09T12:00:00.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('applyLiveIndicatorEvent synthesizes text content blocks from text events', () => {
  let state = { ...EMPTY_LIVE_INDICATOR, active: true, phase: 'streaming' as const };
  state = applyLiveIndicatorEvent(state, 'text', { text: 'Hello' });
  assert.equal(state.contentBlocks.length, 1);
  assert.equal(state.contentBlocks[0].kind, 'text');
  assert.equal(state.contentBlocks[0].text, 'Hello');

  state = applyLiveIndicatorEvent(state, 'text', { text: ' world' });
  assert.equal(state.contentBlocks.length, 1);
  assert.equal(state.contentBlocks[0].text, 'Hello world');
});

test('applyLiveIndicatorEvent creates a new text block after tool_use via structured content blocks', () => {
  let state = { ...EMPTY_LIVE_INDICATOR, active: true, phase: 'streaming' as const };
  state = applyLiveIndicatorEvent(state, 'text', { text: 'First' });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: { id: 'tool:1', index: 1, kind: 'tool', status: 'streaming', text: '', toolName: 'search' },
  });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: { id: 'text:2', index: 2, kind: 'text', status: 'streaming', text: 'Second' },
  });
  assert.equal(state.segments.length, 2);
  assert.equal(state.segments[0]?.phase, 'sealed');
  assert.equal(state.segments[0]?.contentBlocks.length, 1);
  assert.equal(state.segments[0]?.contentBlocks[0]?.kind, 'text');
  assert.equal(state.segments[0]?.contentBlocks[0]?.text, 'First');
  assert.equal(state.contentBlocks.length, 2);
  assert.equal(state.contentBlocks[0]?.kind, 'tool');
  assert.equal(state.contentBlocks[1]?.kind, 'text');
  assert.equal(state.contentBlocks[1]?.text, 'Second');
});

test('resolveTranscriptFollowState derives scroll keys from transcript content instead of channel timestamps', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    participantId: 'participant-inline',
    contentBlocks: [{ id: 'text:0', index: 0, kind: 'text', status: 'streaming', title: null, text: 'Thinking', toolName: null, toolId: null, metadata: null }],
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
    [
      {
        id: 'msg-1',
        senderKind: 'user',
        createdAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'msg-session',
        senderKind: 'system',
        senderName: 'Runtime',
        metadata: {
          event: 'session_started',
          targetKind: 'cat',
          targetId: 'participant-inline',
        },
        createdAt: '2026-04-09T12:00:03.500Z',
      },
      {
        id: 'msg-2',
        senderKind: 'agent',
        createdAt: '2026-04-09T12:00:01.000Z',
      },
    ],
  );

  assert.equal(followState.visibleLiveIndicator, liveIndicator);
  assert.match(followState.transcriptScrollKey, /^2::msg-2::2026-04-09T12:00:01.000Z::/u);
});

test('shared live indicator effect reconnects on EventSource termination without tearing down on speaker handoff', async () => {
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
  const waitingResetIndex = source.indexOf('if (!shouldShowWaiting) {');
  const channelChangeResetIndex = source.indexOf('if (previousChannelId !== channelId) {');
  assert.ok(waitingResetIndex >= 0);
  assert.ok(channelChangeResetIndex > waitingResetIndex);
  const waitingResetSection = source.slice(waitingResetIndex, channelChangeResetIndex);

  assert.match(source, /const waitingSpeakerState = useMemo\(\s*\(\) => resolveWaitingSpeakerState\(selectedChannel\)/u);
  assert.match(source, /const waitingIndicatorInputs = useMemo<WaitingIndicatorInputs>\(/u);
  assert.match(source, /const selectedChannelRef = useRef/u);
  assert.match(source, /const shouldRetrySessionClose = eventType === 'session_closed'/u);
  assert.match(source, /const shouldReconnectFollowupTarget = shouldRetrySessionClose/u);
  assert.match(source, /const shouldReconnectOngoingWorkflow = shouldRetrySessionClose/u);
  assert.match(source, /const shouldIgnoreSealedBoundary = shouldRetrySessionClose/u);
  assert.match(source, /shouldIgnoreSealedSessionClose\(stateRef\.current, waitingState\)/u);
  assert.match(source, /shouldReconnectLiveIndicatorAfterOngoingWorkflow\(/u);
  assert.match(source, /traceBrowser\('stream_session_close_ignored'/u);
  assert.match(source, /shouldReconnectLiveIndicatorAfterSessionClose\(/u);
  assert.match(source, /traceBrowser\('stream_session_close_no_followup'/u);
  assert.match(source, /shouldReconnectLiveIndicatorAfterSourceError\(/u);
  assert.match(source, /eventsource_terminated_followup_handoff/u);
  assert.match(source, /eventsource_terminated_running_workflow/u);
  assert.match(source, /traceBrowser\('stream_source_error_ignored'/u);
  assert.match(source, /traceBrowser\('indicator_pin_pending_reply'/u);
  assert.match(source, /activeTurn/u);
  assert.match(source, /selectedChannel\?\.messages/u);
  assert.match(source, /function updateIndicatorState\(/u);
  assert.doesNotMatch(source, /startTransition\(/u);
  assert.doesNotMatch(waitingResetSection, /streamCursorRef\.current = null;/u);
  assert.match(source, /if \(previousChannelId !== channelId\)\s*\{\s*streamCursorRef\.current = null;\s*\}/u);
  assert.match(source, /\[\s*busy,\s*channelId,\s*debugTraceEnabled,\s*routingStatus,\s*shouldConnectStream,\s*shouldShowWaitingIndicator,\s*\]/u);
  assert.match(
    source,
    /\[\s*busy,\s*channelId,\s*routingStatus,\s*selectedChannel,\s*shouldShowWaitingIndicator,\s*waitingIndicatorInputs,\s*\]/u,
  );
  assert.match(source, /source\.onerror = \(\) =>/u);
  assert.match(source, /traceBrowser\('stream_source_error'/u);
  assert.match(source, /scheduleReconnect\(\);/u);
  assert.doesNotMatch(source, /\[\s*busy,\s*channelId,\s*defaultRecipientCatId,\s*resolveRoutingStatus,/u);
  assert.doesNotMatch(source, /\[\s*busy,\s*channelId,\s*defaultRecipientCatId,\s*routingStatus,\s*selectedChannel,/u);
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

  assert.equal(state.contentBlocks.length, 1);
  assert.equal(state.contentBlocks[0]?.text, 'Hello world');
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
      participantId: 'participant-gemini',
      catId: null,
      speakerLabel: 'Gemini-CLI',
      sessionStartedAt: '2026-04-09T12:00:02.500Z',
      requiresSessionStartConfirmation: true,
      metadata: {
        kind: 'session',
      },
    },
  );

  assert.equal(nextState.phase, 'streaming');
  assert.equal(nextState.participantId, 'participant-gemini');
  assert.equal(nextState.catId, null);
  assert.deepEqual(nextState.activeCatIds, []);
  assert.equal(nextState.speakerLabel, 'Gemini-CLI');
  assert.equal(nextState.sessionStartedAt, '2026-04-09T12:00:02.500Z');
  assert.equal(nextState.requiresSessionStartConfirmation, true);
});

test('live indicator upgrades an anonymous waiting bubble in place when the first named progress event arrives', () => {
  const nextState = applyLiveIndicatorEvent(
    createWaitingLiveIndicatorState({
      targetStateId: 'target-state-claude',
      catId: null,
      speakerLabel: null,
      revealIdentity: false,
    }),
    'progress',
    {
      text: '',
      participantId: 'participant-claude',
      speakerLabel: 'Claude-CLI',
      metadata: {
        kind: 'session',
      },
    },
  );

  assert.equal(nextState.segments.length, 1);
  assert.equal(nextState.phase, 'streaming');
  assert.equal(nextState.targetStateId, 'target-state-claude');
  assert.equal(nextState.participantId, 'participant-claude');
  assert.equal(nextState.speakerLabel, 'Claude-CLI');
});

test('resolveVisibleLiveIndicator retires a previously anonymous live segment once the matching persisted segment is visible', () => {
  let liveIndicator = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-claude',
    catId: null,
    speakerLabel: null,
    revealIdentity: false,
  });

  liveIndicator = applyLiveIndicatorEvent(liveIndicator, 'progress', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    metadata: {
      kind: 'session',
    },
  });
  liveIndicator = applyLiveIndicatorEvent(liveIndicator, 'text', {
    text: 'Hi! How can I help you today?',
  });
  liveIndicator = applyLiveIndicatorEvent(liveIndicator, 'result', {});

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-13T12:00:00.000Z',
      },
      {
        id: 'message-agent-1',
        senderKind: 'agent',
        senderName: 'Claude-CLI',
        metadata: {
          event: 'assistant_turn_segment',
          targetStateId: 'target-state-claude',
          segmentIndex: 0,
          targetKind: 'participant',
          targetId: 'participant-claude',
        },
        createdAt: '2026-04-13T12:00:03.000Z',
      },
    ],
    '2026-04-13T12:00:04.000Z',
  );

  assert.equal(visible, null);
});

test('resolveLiveIndicatorSpeakerState preserves targetStateId when stream event carries explicit null', () => {
  const previous = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-abc',
    catId: null,
    speakerLabel: 'Claude-CLI',
  });

  const nextSpeaker = resolveLiveIndicatorSpeakerState(previous, {
    participantId: 'orchestrator',
    catId: null,
    speakerLabel: 'Claude-CLI',
    targetStateId: null,
  });

  assert.equal(nextSpeaker.targetStateId, 'target-state-abc');
});

test('resolveLiveIndicatorSpeakerState updates targetStateId when stream event carries a non-null value', () => {
  const previous = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-abc',
    catId: null,
    speakerLabel: 'Claude-CLI',
  });

  const nextSpeaker = resolveLiveIndicatorSpeakerState(previous, {
    participantId: 'participant-2',
    catId: null,
    speakerLabel: 'Codex-CLI',
    targetStateId: 'target-state-def',
  });

  assert.equal(nextSpeaker.targetStateId, 'target-state-def');
});

test('resolveVisibleLiveIndicator hides sealed segments with null targetStateId via participantId fallback', () => {
  let liveIndicator = createWaitingLiveIndicatorState({
    targetStateId: null,
    catId: null,
    speakerLabel: null,
    revealIdentity: false,
  });

  liveIndicator = applyLiveIndicatorEvent(liveIndicator, 'progress', {
    participantId: 'orchestrator',
    speakerLabel: 'Claude-CLI',
    metadata: { kind: 'session' },
  });
  liveIndicator = applyLiveIndicatorEvent(liveIndicator, 'text', {
    text: 'Hello!',
  });
  liveIndicator = applyLiveIndicatorEvent(liveIndicator, 'result', {});

  assert.equal(liveIndicator.targetStateId, null);
  assert.equal(liveIndicator.participantId, 'orchestrator');

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-13T14:00:00.000Z',
      },
      {
        id: 'message-agent-1',
        senderKind: 'agent',
        senderName: 'Claude-CLI',
        metadata: {
          event: 'assistant_turn_segment',
          targetStateId: 'target-state-real',
          segmentIndex: 0,
          targetKind: 'orchestrator',
          targetId: 'orchestrator',
        },
        createdAt: '2026-04-13T14:00:03.000Z',
      },
    ],
    '2026-04-13T14:00:04.000Z',
  );

  assert.equal(visible, null);
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

  assert.equal(state.contentBlocks.length, 1);
  assert.equal(state.contentBlocks[0]?.text, 'First chunk Second chunk');
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

  assert.equal(state.segments.length, 2);
  assert.deepEqual(state.segments[0]?.contentBlocks, [
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
  ]);
  assert.deepEqual(state.contentBlocks, [
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

test('advanceSequencedLiveIndicatorStreamCursor accepts monotonic replay keys and rejects stale replays', () => {
  let cursor = null;

  let decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    streamSeq: 4,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, true);
  cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    streamSeq: 4,
    streamSeqIndex: 1,
  });
  assert.equal(decision.accept, true);
  cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    streamSeq: 4,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, false);

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    streamSeq: 3,
    streamSeqIndex: 9,
  });
  assert.equal(decision.accept, false);

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-2',
    streamSeq: 1,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, true);
});

test('applyLiveIndicatorEvent ignores raw text fallback once structured content blocks are active', () => {
  let state = createWaitingLiveIndicatorState({
    catId: null,
    speakerLabel: 'Claude-CLI',
  });

  state = applyLiveIndicatorEvent(state, 'text', {
    text: 'Hello',
  });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'streaming',
      text: 'Hello',
    },
  });
  state = applyLiveIndicatorEvent(state, 'text', {
    text: 'Hello',
  });

  assert.equal(state.contentBlocks.length, 1);
  assert.equal(state.contentBlocks[0]?.text, 'Hello');
  assert.equal(state.contentBlocks[0]?.metadata, null);
});

test('resolveVisibleLiveIndicator keeps the first assistant bubble visible after empty session progress', () => {
  let state = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-claude',
    participantId: 'participant-claude',
    catId: null,
    speakerLabel: 'Claude-CLI',
    revealIdentity: true,
  });

  state = applyLiveIndicatorEvent(state, 'progress', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    text: '',
    metadata: {
      kind: 'session',
    },
  });

  const visible = resolveVisibleLiveIndicator(state, [], null);

  assert.ok(visible);
  assert.equal(visible.phase, 'streaming');
  assert.equal(visible.segments.length, 1);
  assert.equal(visible.segments[0]?.progressKind, 'session');
});

test('resolveVisibleLiveIndicator keeps a follow-up raw tool-use segment visible before tool blocks arrive', () => {
  let state = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-claude',
    participantId: 'participant-claude',
    catId: null,
    speakerLabel: 'Claude-CLI',
    revealIdentity: true,
  });

  state = applyLiveIndicatorEvent(state, 'text', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    text: 'First segment',
  });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    block: {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'complete',
      text: 'First segment',
    },
  });
  state = applyLiveIndicatorEvent(state, 'tool_use', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    toolName: 'WebSearch',
    toolId: 'tool-1',
  });

  const visible = resolveVisibleLiveIndicator(state, [], null);

  assert.ok(visible);
  assert.equal(visible.segments.length, 2);
  assert.equal(visible.segments[0]?.phase, 'sealed');
  assert.equal(visible.segments[1]?.phase, 'streaming');
  assert.equal(visible.segments[1]?.contentBlocks.length, 0);
  assert.deepEqual(visible.segments[1]?.events.map((event) => event.eventType), ['tool_use']);
  assert.deepEqual(
    visible.segments[1]?.tools.map((tool) => [tool.toolName, tool.done]),
    [['WebSearch', false]],
  );
});

test('structured text content blocks upgrade synthetic text fallback without starting a new segment', () => {
  let state = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-claude',
    catId: null,
    speakerLabel: 'Claude-CLI',
  });

  state = applyLiveIndicatorEvent(state, 'text', {
    text: 'Hi! How can I help you today?',
  });

  assert.equal(state.segments.length, 1);
  assert.equal(state.contentBlocks.length, 1);
  assert.equal(state.contentBlocks[0]?.id, 'text:0');

  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: {
      id: 'runtime-text:0',
      index: 0,
      kind: 'text',
      status: 'streaming',
      text: 'Hi! How can I help you today?',
    },
  });

  assert.equal(state.segments.length, 1);
  assert.equal(state.phase, 'streaming');
  assert.deepEqual(state.contentBlocks, [
    {
      id: 'runtime-text:0',
      index: 0,
      kind: 'text',
      status: 'streaming',
      title: null,
      text: 'Hi! How can I help you today?',
      toolName: null,
      toolId: null,
      metadata: null,
    },
  ]);
});

test('final text block completion after result updates the sealed segment in place', () => {
  let state = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-claude',
    catId: null,
    speakerLabel: 'Claude-CLI',
  });

  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'streaming',
      text: 'Hi! How can I help you today?',
    },
  });

  state = applyLiveIndicatorEvent(state, 'result', {});

  state = applyLiveIndicatorEvent(state, 'content_block', {
    block: {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'complete',
      text: 'Hi! How can I help you today?',
    },
  });

  assert.equal(state.segments.length, 1);
  assert.equal(state.phase, 'sealed');
  assert.deepEqual(state.contentBlocks, [
    {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'complete',
      title: null,
      text: 'Hi! How can I help you today?',
      toolName: null,
      toolId: null,
      metadata: null,
    },
  ]);
});

test('text block completion after a follow-up tool phase updates the original text segment instead of the tool segment', () => {
  let state = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-claude',
    participantId: 'participant-claude',
    catId: null,
    speakerLabel: 'Claude-CLI',
    revealIdentity: true,
  });

  state = applyLiveIndicatorEvent(state, 'text', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    text: 'First segment',
  });
  state = applyLiveIndicatorEvent(state, 'tool_use', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    toolName: 'WebSearch',
    toolId: 'tool-search',
  });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    block: {
      id: 'text:0',
      index: 0,
      kind: 'text',
      status: 'complete',
      text: 'First segment',
    },
  });
  state = applyLiveIndicatorEvent(state, 'content_block', {
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    targetStateId: 'target-state-claude',
    block: {
      id: 'tool:1',
      index: 1,
      kind: 'tool',
      status: 'streaming',
      title: 'WebSearch',
      text: 'Searching',
      toolName: 'WebSearch',
      toolId: 'tool-search',
    },
  });

  const visible = resolveVisibleLiveIndicator(state, [], null);

  assert.ok(visible);
  assert.equal(visible.segments.length, 2);
  assert.deepEqual(
    visible.segments[0]?.contentBlocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      status: block.status,
      text: block.text,
    })),
    [
      {
        id: 'text:0',
        kind: 'text',
        status: 'complete',
        text: 'First segment',
      },
    ],
  );
  assert.deepEqual(
    visible.segments[1]?.contentBlocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      status: block.status,
      text: block.text,
    })),
    [
      {
        id: 'tool:1',
        kind: 'tool',
        status: 'streaming',
        text: 'Searching',
      },
    ],
  );
});

test('resolveVisibleLiveIndicator projects a single raw segment into text-segment bubbles', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    targetStateId: 'target-state-claude',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'complete' as const,
        title: null,
        text: 'First segment',
        toolName: null,
        toolId: null,
        metadata: null,
      },
      {
        id: 'status:1',
        index: 1,
        kind: 'status' as const,
        status: 'complete' as const,
        title: 'Tool',
        text: 'Searching...',
        toolName: null,
        toolId: null,
        metadata: null,
      },
      {
        id: 'text:2',
        index: 2,
        kind: 'text' as const,
        status: 'streaming' as const,
        title: null,
        text: 'Second segment',
        toolName: null,
        toolId: null,
        metadata: null,
      },
    ],
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [],
    null,
  );

  assert.ok(visible);
  assert.equal(visible.segments.length, 2);
  assert.equal(visible.segments[0]?.segmentIndex, 0);
  assert.equal(visible.segments[0]?.phase, 'sealed');
  assert.deepEqual(
    visible.segments[0]?.contentBlocks.map((block) => block.id),
    ['text:0'],
  );
  assert.equal(visible.segments[1]?.segmentIndex, 1);
  assert.equal(visible.segments[1]?.phase, 'streaming');
  assert.deepEqual(
    visible.segments[1]?.contentBlocks.map((block) => block.id),
    ['status:1', 'text:2'],
  );
});

test('resolveVisibleLiveIndicator splits a follow-up non-text phase into its own live bubble before later text arrives', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    targetStateId: 'target-state-claude',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'complete' as const,
        title: null,
        text: 'First segment',
        toolName: null,
        toolId: null,
        metadata: null,
      },
      {
        id: 'tool:1',
        index: 1,
        kind: 'tool' as const,
        status: 'complete' as const,
        title: 'WebSearch',
        text: 'Search complete',
        toolName: 'WebSearch',
        toolId: 'tool-search',
        metadata: null,
      },
    ],
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [],
    null,
  );

  assert.ok(visible);
  assert.equal(visible.segments.length, 2);
  assert.equal(visible.segments[0]?.segmentIndex, 0);
  assert.equal(visible.segments[0]?.phase, 'sealed');
  assert.deepEqual(
    visible.segments[0]?.contentBlocks.map((block) => block.id),
    ['text:0'],
  );
  assert.equal(visible.segments[1]?.segmentIndex, 1);
  assert.equal(visible.segments[1]?.phase, 'streaming');
  assert.deepEqual(
    visible.segments[1]?.contentBlocks.map((block) => block.id),
    ['tool:1'],
  );
});

test('resolveVisibleLiveIndicator keeps a later live text segment visible after the first persisted segment lands', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    sourceMessageId: 'message-user-2',
    targetStateId: 'target-state-claude',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    contentBlocks: [
      {
        id: 'text:0',
        index: 0,
        kind: 'text' as const,
        status: 'complete' as const,
        title: null,
        text: 'First segment',
        toolName: null,
        toolId: null,
        metadata: null,
      },
      {
        id: 'status:1',
        index: 1,
        kind: 'status' as const,
        status: 'complete' as const,
        title: 'Tool',
        text: 'Searching...',
        toolName: null,
        toolId: null,
        metadata: null,
      },
      {
        id: 'text:2',
        index: 2,
        kind: 'text' as const,
        status: 'streaming' as const,
        title: null,
        text: 'Second segment',
        toolName: null,
        toolId: null,
        metadata: null,
      },
    ],
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-agent-1',
        senderKind: 'agent',
        senderName: 'Claude-CLI',
        metadata: {
          event: 'assistant_turn_segment',
          sourceMessageId: 'message-user-2',
          targetStateId: 'target-state-claude',
          segmentIndex: 0,
          targetKind: 'participant',
          targetId: 'participant-claude',
        },
        createdAt: '2026-04-13T12:00:03.000Z',
      },
    ],
    null,
  );

  assert.ok(visible);
  assert.equal(visible.segments.length, 1);
  assert.equal(visible.segments[0]?.segmentIndex, 1);
  assert.deepEqual(
    visible.segments[0]?.contentBlocks.map((block) => block.id),
    ['status:1', 'text:2'],
  );
});

test('resolveVisibleLiveIndicator does not hide a new solo segment because an older turn by the same speaker already has segment 0', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    segments: [
      {
        id: 'segment-current-0',
        phase: 'sealed' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: null,
        segmentIndex: 0,
        participantId: 'participant-claude',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Claude-CLI',
        sessionStartedAt: null,
        requiresSessionStartConfirmation: false,
        progressText: '',
        progressKind: null,
        tools: [],
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text' as const,
            status: 'complete' as const,
            title: null,
            text: 'Current first segment',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
        events: [],
      },
      {
        id: 'segment-current-1',
        phase: 'streaming' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: null,
        segmentIndex: 1,
        participantId: 'participant-claude',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Claude-CLI',
        sessionStartedAt: null,
        requiresSessionStartConfirmation: false,
        progressText: '',
        progressKind: null,
        tools: [
          {
            toolName: 'WebSearch',
            toolId: 'tool-search',
            done: false,
          },
        ],
        contentBlocks: [],
        events: [
          {
            eventType: 'tool_use',
            label: 'Tool',
            text: 'Started WebSearch',
            tone: 'active',
            kind: 'tool',
            toolName: 'WebSearch',
            toolId: 'tool-search',
          },
        ],
      },
    ],
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-agent-old',
        senderKind: 'agent',
        senderName: 'Claude-CLI',
        metadata: {
          event: 'assistant_turn_segment',
          sourceMessageId: 'message-user-old',
          targetId: 'participant-claude',
          segmentIndex: 0,
        },
        createdAt: '2026-04-13T12:00:03.000Z',
      },
    ],
    null,
  );

  assert.ok(visible);
  assert.equal(visible.segments.length, 2);
  assert.equal(visible.segments[0]?.segmentIndex, 0);
  assert.equal(visible.segments[1]?.segmentIndex, 1);
});

test('applyLiveIndicatorEvent increments the segment index for same-speaker solo follow-up phases', () => {
  let state = createWaitingLiveIndicatorState({
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    catId: null,
    speakerLabel: 'Claude-CLI',
    revealIdentity: true,
  });

  state = applyLiveIndicatorEvent(state, 'progress', {
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    progressKind: 'session',
  });
  state = applyLiveIndicatorEvent(state, 'text', {
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    text: 'First segment',
  });
  state = applyLiveIndicatorEvent(state, 'result', {
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
  });
  state = applyLiveIndicatorEvent(state, 'progress', {
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
    progressKind: 'session',
  });

  assert.equal(state.segments.length, 2);
  assert.equal(state.segments[0]?.segmentIndex, 0);
  assert.equal(state.segments[1]?.segmentIndex, 1);
  assert.notEqual(state.segments[0]?.id, state.segments[1]?.id);
});
