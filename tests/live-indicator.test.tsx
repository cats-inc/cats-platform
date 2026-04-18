import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  advanceSequencedLiveIndicatorStreamCursor,
  EMPTY_LIVE_INDICATOR,
  resolveLiveIndicatorConversationId,
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
  mergeConcurrentWaitingIndicatorState,
  resolveConcurrentWaitingSegments,
  resolveWaitingSessionState,
} from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';
import {
  applyLiveIndicatorEvent,
  createLiveIndicatorSegmentState,
  createWaitingLiveIndicatorState,
  hasVisibleLiveIndicatorSpeakerReplyAfterMessage,
  projectLiveIndicatorStateFromSegments,
  resolveTranscriptFollowState,
  resolveLiveIndicatorSpeakerState,
  resolveVisibleLiveIndicator,
} from '../src/shared/liveIndicator.ts';
import {
  resolveChatViewTopBarPresenceState,
} from '../src/products/shared/renderer/components/chat-view/chatViewSupport.ts';
import {
  shouldRenderLiveTranscriptBlock,
  shouldShowLiveTranscriptTrailingDots,
} from '../src/products/shared/renderer/components/chat-view/liveTranscriptBlockSupport.ts';
import {
  buildChatLaneId,
} from '../src/shared/chatCoreIds.ts';
import {
  clearBusyState,
  createChannelComposerBusyScope,
  createComposerBusyState,
  createParallelChatBusyState,
} from '../src/shared/workspaceBusy.ts';

test('EMPTY_LIVE_INDICATOR starts with no active cat ids', () => {
  assert.deepEqual(EMPTY_LIVE_INDICATOR.activeCatIds, []);
  assert.deepEqual(EMPTY_LIVE_INDICATOR.contentBlocks, []);
});

test('shouldConnectLiveIndicatorStream skips optimistic draft channels', () => {
  assert.equal(
    shouldConnectLiveIndicatorStream(
      'draft-123',
      createComposerBusyState('send', createChannelComposerBusyScope('draft-123')),
    ),
    false,
  );
});

test('shouldConnectLiveIndicatorStream requires an active send on a real channel', () => {
  const channelId = '12345678-1234-4234-8234-123456789abc';
  assert.equal(
    shouldConnectLiveIndicatorStream(
      channelId,
      createComposerBusyState('prepare', createChannelComposerBusyScope(channelId)),
    ),
    false,
  );
  assert.equal(shouldConnectLiveIndicatorStream(channelId, clearBusyState()), false);
  assert.equal(
    shouldConnectLiveIndicatorStream(
      null,
      createComposerBusyState('send', createChannelComposerBusyScope(channelId)),
    ),
    false,
  );
  assert.equal(
    shouldConnectLiveIndicatorStream(
      channelId,
      createComposerBusyState('send', createChannelComposerBusyScope(channelId)),
    ),
    true,
  );
});

test('shouldConnectLiveIndicatorStream ignores parallel relay busy state on the source channel', () => {
  assert.equal(
    shouldConnectLiveIndicatorStream(
      '12345678-1234-4234-8234-123456789abc',
      createParallelChatBusyState('relay'),
    ),
    false,
  );
});

test('shouldConnectLiveIndicatorStream only follows concurrent dispatch for running member channels', () => {
  const channelId = '12345678-1234-4234-8234-123456789abc';
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, createParallelChatBusyState('dispatch')),
    false,
  );
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, createParallelChatBusyState('dispatch'), 'idle'),
    false,
  );
  assert.equal(
    shouldConnectLiveIndicatorStream(channelId, createParallelChatBusyState('dispatch'), 'running'),
    true,
  );
});

test('resolveWaitingSessionState requires session-start confirmation while a direct-lane reconnect target has no active lease yet', () => {
  const waitingSessionState = resolveWaitingSessionState(
    {
      orchestratorLease: {
        sessionId: null,
        startedAt: null,
      },
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
          },
        },
      },
      composerMode: 'solo',
      pendingProvider: 'claude',
      pendingInstance: null,
    },
    'orchestrator',
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T12:00:01.000Z',
    requiresSessionStartConfirmation: true,
  });
});

test('resolveWaitingSessionState skips session-start confirmation when the target lease predates the active turn', () => {
  const waitingSessionState = resolveWaitingSessionState(
    {
      assignedParticipants: [
        {
          participantId: 'participant-gemini',
          execution: {
            lease: {
              sessionId: 'session-gemini',
              startedAt: '2026-04-14T11:59:00.000Z',
            },
          },
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
          },
        },
      },
      composerMode: 'cat_led',
      pendingProvider: null,
      pendingInstance: null,
    },
    'participant-gemini',
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T11:59:00.000Z',
    requiresSessionStartConfirmation: false,
  });
});

test('resolveWaitingSessionState uses the active target queue time as the confirmation floor', () => {
  const waitingSessionState = resolveWaitingSessionState(
    {
      assignedParticipants: [
        {
          participantId: 'participant-gemini',
          execution: {
            lease: {
              sessionId: null,
              startedAt: null,
            },
          },
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
            targetStatuses: [
              {
                id: 'target-gemini',
                status: 'pending',
                queuedAt: '2026-04-14T12:05:00.000Z',
                startedAt: null,
                participant: {
                  participantId: 'participant-gemini',
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
    'participant-gemini',
    'target-gemini',
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T12:05:00.000Z',
    requiresSessionStartConfirmation: true,
  });
});

test('resolveWaitingSessionState matches the active target by laneId when the targetStateId drifted', () => {
  const laneId = buildChatLaneId('turn-1', 'target-gemini-canonical', 'participant-gemini');
  const waitingSessionState = resolveWaitingSessionState(
    {
      assignedParticipants: [
        {
          participantId: 'participant-gemini',
          execution: {
            lease: {
              sessionId: null,
              startedAt: null,
            },
          },
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            id: 'turn-1',
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
            targetStatuses: [
              {
                id: 'target-gemini-canonical',
                status: 'pending',
                queuedAt: '2026-04-14T12:05:00.000Z',
                startedAt: null,
                participant: {
                  participantId: 'participant-gemini',
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
    'participant-gemini',
    'target-gemini-drifted',
    laneId,
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T12:05:00.000Z',
    requiresSessionStartConfirmation: true,
  });
});

test('resolveWaitingSessionState prefers the persisted target laneId over a recomputed workflow lane id', () => {
  const laneId = 'lane-gemini-persisted';
  const waitingSessionState = resolveWaitingSessionState(
    {
      assignedParticipants: [
        {
          participantId: 'participant-gemini',
          execution: {
            lease: {
              sessionId: null,
              startedAt: null,
            },
          },
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            id: 'turn-1',
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
            targetStatuses: [
              {
                id: 'target-gemini-canonical',
                laneId,
                status: 'pending',
                queuedAt: '2026-04-14T12:05:00.000Z',
                startedAt: null,
                participant: {
                  participantId: 'participant-gemini',
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
    'participant-gemini',
    'target-gemini-drifted',
    laneId,
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T12:05:00.000Z',
    requiresSessionStartConfirmation: true,
  });
});

test('resolveWaitingSessionState does not require a new session start for a warm session that predates the active target', () => {
  const waitingSessionState = resolveWaitingSessionState(
    {
      assignedParticipants: [
        {
          participantId: 'participant-gemini',
          execution: {
            lease: {
              sessionId: 'session-gemini',
              startedAt: '2026-04-14T12:03:00.000Z',
            },
          },
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
            targetStatuses: [
              {
                id: 'target-gemini',
                status: 'pending',
                queuedAt: '2026-04-14T12:05:00.000Z',
                startedAt: null,
                participant: {
                  participantId: 'participant-gemini',
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
    'participant-gemini',
    'target-gemini',
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T12:03:00.000Z',
    requiresSessionStartConfirmation: false,
  });
});

test('resolveLiveIndicatorConversationId prefers the selected channel canonical identity', () => {
  assert.equal(
    resolveLiveIndicatorConversationId(
      {
        conversationId: 'conversation-canonical-room-1',
        roomRouting: {
          defaultRecipientId: null,
          workflow: {},
        },
        composerMode: 'solo',
        pendingProvider: null,
        pendingInstance: null,
      },
      'room-1',
    ),
    'conversation-canonical-room-1',
  );
});

test('resolveWaitingSessionState ignores a closed participant lease while a new target is pending', () => {
  const waitingSessionState = resolveWaitingSessionState(
    {
      assignedParticipants: [
        {
          participantId: 'participant-gemini',
          execution: {
            lease: {
              sessionId: 'session-gemini-old',
              status: 'closed',
              startedAt: '2026-04-14T12:03:00.000Z',
            },
          },
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
            targetStatuses: [
              {
                id: 'target-gemini',
                status: 'pending',
                queuedAt: '2026-04-14T12:05:00.000Z',
                startedAt: null,
                participant: {
                  participantId: 'participant-gemini',
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
    'participant-gemini',
    'target-gemini',
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T12:05:00.000Z',
    requiresSessionStartConfirmation: true,
  });
});

test('resolveWaitingSessionState ignores a live participant lease from a different lane while the current target is pending', () => {
  const activeLaneId = buildChatLaneId('turn-1', 'target-gemini-current', 'participant-gemini');
  const waitingSessionState = resolveWaitingSessionState(
    {
      assignedParticipants: [
        {
          participantId: 'participant-gemini',
          execution: {
            lease: {
              sessionId: 'session-gemini-old',
              laneId: 'lane-turn-older-target-gemini',
              status: 'ready',
              startedAt: '2026-04-14T12:03:00.000Z',
            },
          },
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            id: 'turn-1',
            status: 'running',
            startedAt: '2026-04-14T12:00:01.000Z',
            targetStatuses: [
              {
                id: 'target-gemini-current',
                status: 'pending',
                queuedAt: '2026-04-14T12:05:00.000Z',
                startedAt: null,
                participant: {
                  participantId: 'participant-gemini',
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
    'participant-gemini',
    'target-gemini-drifted',
    activeLaneId,
  );

  assert.deepEqual(waitingSessionState, {
    sessionStartedAt: '2026-04-14T12:05:00.000Z',
    requiresSessionStartConfirmation: true,
  });
});

test('resolveConcurrentWaitingSegments materializes every active concurrent target in target order', () => {
  const segments = resolveConcurrentWaitingSegments({
    roomRouting: {
      defaultRecipientId: null,
      workflow: {
        activeTurn: {
          id: 'turn-concurrent',
          sourceMessageId: 'message-user-concurrent',
          workflowShape: 'concurrent',
          targetStatuses: [
            {
              id: 'target-claude',
              status: 'pending',
              queuedAt: '2026-04-14T12:05:00.000Z',
              participant: {
                participantId: 'participant-claude',
                participantName: 'Claude-CLI',
              },
            },
            {
              id: 'target-codex',
              laneId: 'lane-codex-persisted',
              status: 'running',
              startedAt: '2026-04-14T12:05:01.000Z',
              participant: {
                participantId: 'participant-codex',
                participantName: 'Codex-CLI',
              },
            },
          ],
        },
      },
    },
    assignedParticipants: [
      {
        participantId: 'participant-codex',
        execution: {
          lease: {
            sessionId: 'session-codex',
            laneId: 'lane-codex-persisted',
            status: 'ready',
            startedAt: '2026-04-14T12:05:01.000Z',
          },
        },
      },
    ],
    composerMode: 'cat_led',
    pendingProvider: null,
    pendingInstance: null,
  });

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.targetStateId, 'target-claude');
  assert.equal(
    segments[0]?.laneId,
    buildChatLaneId('turn-concurrent', 'target-claude', 'participant-claude'),
  );
  assert.equal(segments[0]?.participantId, 'participant-claude');
  assert.equal(segments[0]?.speakerLabel, 'Claude-CLI');
  assert.equal(segments[0]?.phase, 'waiting');
  assert.equal(segments[1]?.targetStateId, 'target-codex');
  assert.equal(segments[1]?.laneId, 'lane-codex-persisted');
  assert.equal(segments[1]?.participantId, 'participant-codex');
  assert.equal(segments[1]?.speakerLabel, 'Codex-CLI');
  assert.equal(segments[1]?.requiresSessionStartConfirmation, true);
});

test('mergeConcurrentWaitingIndicatorState preserves the previous reference when concurrent waiting lanes are unchanged', () => {
  const previous = projectLiveIndicatorStateFromSegments([
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-1',
      laneId: 'lane-1',
      targetStateId: 'target-1',
      segmentIndex: 0,
      participantId: 'participant-1',
      identityParticipantId: 'participant-1',
      speakerLabel: 'Claude-CLI',
      sessionStartedAt: '2026-04-16T12:00:00.000Z',
      requiresSessionStartConfirmation: true,
    }),
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 0,
      participantId: 'participant-2',
      identityParticipantId: 'participant-2',
      speakerLabel: 'Codex-CLI',
      sessionStartedAt: '2026-04-16T12:00:01.000Z',
      requiresSessionStartConfirmation: true,
    }),
  ]);
  const waitingState = projectLiveIndicatorStateFromSegments([
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-1',
      laneId: 'lane-1',
      targetStateId: 'target-1',
      segmentIndex: 0,
      participantId: 'participant-1',
      identityParticipantId: 'participant-1',
      speakerLabel: 'Claude-CLI',
      sessionStartedAt: '2026-04-16T12:00:00.000Z',
      requiresSessionStartConfirmation: true,
    }),
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 0,
      participantId: 'participant-2',
      identityParticipantId: 'participant-2',
      speakerLabel: 'Codex-CLI',
      sessionStartedAt: '2026-04-16T12:00:01.000Z',
      requiresSessionStartConfirmation: true,
    }),
  ]);

  assert.equal(mergeConcurrentWaitingIndicatorState(previous, waitingState), previous);
});

test('shouldRetryLiveIndicatorSessionClose reconnects when a streamed session closes during an active send', () => {
  assert.equal(
    shouldRetryLiveIndicatorSessionClose({
      eventType: 'session_closed',
      channelId: '12345678-1234-4234-8234-123456789abc',
      busy: createComposerBusyState(
        'send',
        createChannelComposerBusyScope('12345678-1234-4234-8234-123456789abc'),
      ),
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
      busy: clearBusyState(),
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
          lastOutcome: null,
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

test('shouldReconnectLiveIndicatorAfterSessionClose stays off for the same target even after segment reindexing', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterSessionClose(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        targetStateId: 'target-state-codex',
        sourceMessageId: 'message-user',
        participantId: 'participant-codex',
        speakerLabel: 'Codex-CLI',
        segmentIndex: 1,
        segments: [
          {
            id: 'message-user:target-state-codex:segment:1',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            targetStateId: 'target-state-codex',
            segmentIndex: 1,
            participantId: 'participant-codex',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Codex-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
            events: [],
          },
        ],
      },
      createWaitingLiveIndicatorState({
        sourceMessageId: 'message-user',
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

test('shouldReconnectLiveIndicatorAfterSessionClose stays off when the waiting lane matches despite targetStateId drift', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterSessionClose(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        laneId: 'lane-claude',
        targetStateId: 'target-state-live',
        participantId: 'participant-claude',
        speakerLabel: 'Claude-CLI',
      },
      createWaitingLiveIndicatorState({
        sourceMessageId: 'message-user',
        laneId: 'lane-claude',
        targetStateId: 'target-state-canonical',
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

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays on for an earlier sequential target while later targets have not materialized yet', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        targetStateId: 'target-claude',
        participantId: 'participant-claude',
        speakerLabel: 'Claude-CLI',
        segmentIndex: 0,
        segments: [
          {
            id: 'message-user:target-claude:segment:0',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            targetStateId: 'target-claude',
            segmentIndex: 0,
            participantId: 'participant-claude',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Claude-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
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
        ],
        roomRouting: {
          defaultRecipientId: null,
          lastOutcome: null,
          workflow: {
            activeTurn: {
              id: 'turn-1',
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [],
              events: [
                {
                  kind: 'turn_started',
                  targets: [
                    {
                      participantId: 'participant-claude',
                      participantName: 'Claude-CLI',
                    },
                    {
                      participantId: 'participant-codex',
                      participantName: 'Codex-CLI',
                    },
                  ],
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

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays on when a later sequential target shares the same label', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        participantId: 'participant-claude',
        speakerLabel: 'Shared-CLI',
        segmentIndex: 0,
        segments: [
          {
            id: 'message-user:participant-claude:segment:0',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            segmentIndex: 0,
            participantId: 'participant-claude',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Shared-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
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
        ],
        roomRouting: {
          defaultRecipientId: null,
          lastOutcome: {
            turnId: 'turn-1',
            resolvedTargets: [
              {
                participantId: 'participant-codex',
                participantName: 'Shared-CLI',
              },
            ],
          },
          workflow: {
            activeTurn: {
              id: 'turn-1',
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [],
              events: [],
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

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays on for an anonymous sealed speaker when active targets share the same label', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        speakerLabel: 'Shared-CLI',
        segmentIndex: 0,
        segments: [
          {
            id: 'message-user:shared-cli:segment:0',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            segmentIndex: 0,
            participantId: null,
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Shared-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
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
        ],
        roomRouting: {
          defaultRecipientId: null,
          lastOutcome: null,
          workflow: {
            activeTurn: {
              id: 'turn-1',
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [
                {
                  id: 'target-claude',
                  status: 'completed',
                  participant: {
                    participantId: 'participant-claude',
                    participantName: 'Shared-CLI',
                  },
                },
                {
                  id: 'target-codex',
                  status: 'running',
                  participant: {
                    participantId: 'participant-codex',
                    participantName: 'Shared-CLI',
                  },
                },
              ],
              events: [],
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

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays off when the sealed lane still matches the active target despite targetStateId drift', () => {
  const laneId = buildChatLaneId('turn-1', 'target-claude-canonical', 'participant-claude');
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        laneId,
        targetStateId: 'target-claude-live',
        participantId: 'participant-claude',
        speakerLabel: 'Claude-CLI',
        segmentIndex: 0,
        segments: [
          {
            id: 'message-user:lane-claude:segment:0',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            laneId,
            targetStateId: 'target-claude-live',
            segmentIndex: 0,
            sessionId: null,
            participantId: 'participant-claude',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Claude-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
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
        ],
        roomRouting: {
          defaultRecipientId: null,
          lastOutcome: null,
          workflow: {
            activeTurn: {
              id: 'turn-1',
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [
                {
                  id: 'target-claude-canonical',
                  status: 'running',
                  participant: {
                    participantId: 'participant-claude',
                    participantName: 'Claude-CLI',
                  },
                },
              ],
              events: [],
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

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays off when the active target exposes a persisted laneId that matches the sealed lane', () => {
  const laneId = 'lane-claude-persisted';
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        laneId,
        targetStateId: 'target-claude-live',
        participantId: 'participant-claude',
        speakerLabel: 'Claude-CLI',
        segmentIndex: 0,
        segments: [
          {
            id: 'message-user:lane-claude-persisted:segment:0',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            laneId,
            targetStateId: 'target-claude-live',
            segmentIndex: 0,
            sessionId: null,
            participantId: 'participant-claude',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Claude-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
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
        ],
        roomRouting: {
          defaultRecipientId: null,
          lastOutcome: null,
          workflow: {
            activeTurn: {
              id: 'turn-1',
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [
                {
                  id: 'target-claude-canonical',
                  laneId,
                  status: 'running',
                  participant: {
                    participantId: 'participant-claude',
                    participantName: 'Claude-CLI',
                  },
                },
              ],
              events: [],
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

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays off for the last sequential target once no later targets remain materialized', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        targetStateId: 'target-codex',
        participantId: 'participant-codex',
        speakerLabel: 'Codex-CLI',
        segmentIndex: 1,
        segments: [
          {
            id: 'message-user:target-codex:segment:1',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            targetStateId: 'target-codex',
            segmentIndex: 1,
            participantId: 'participant-codex',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Codex-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
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
        ],
        roomRouting: {
          defaultRecipientId: null,
          lastOutcome: null,
          workflow: {
            activeTurn: {
              id: 'turn-1',
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [],
              events: [
                {
                  kind: 'turn_started',
                  targets: [
                    {
                      participantId: 'participant-claude',
                      participantName: 'Claude-CLI',
                    },
                    {
                      participantId: 'participant-codex',
                      participantName: 'Codex-CLI',
                    },
                  ],
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
    false,
  );
});

test('shouldReconnectLiveIndicatorAfterOngoingWorkflow stays off for the final sequential target while no later targets remain', () => {
  assert.equal(
    shouldReconnectLiveIndicatorAfterOngoingWorkflow(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        targetStateId: 'target-codex',
        participantId: 'participant-codex',
        speakerLabel: 'Codex-CLI',
        segmentIndex: 1,
        segments: [
          {
            id: 'message-user:target-codex:segment:1',
            phase: 'sealed',
            sourceMessageId: 'message-user',
            targetStateId: 'target-codex',
            segmentIndex: 1,
            participantId: 'participant-codex',
            catId: null,
            activeCatIds: [],
            catName: null,
            speakerLabel: 'Codex-CLI',
            sessionStartedAt: null,
            requiresSessionStartConfirmation: false,
            progressText: 'Finalizing...',
            progressKind: 'finalizing',
            tools: [],
            contentBlocks: [],
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
          lastOutcome: null,
          workflow: {
            activeTurn: {
              id: 'turn-1',
              status: 'running',
              sourceMessageId: 'message-user',
              workflowShape: 'sequential',
              targetStatuses: [
                {
                  id: 'target-agent-1',
                  status: 'completed',
                  participant: {
                    participantKind: 'cat',
                    participantId: 'participant-agent-1',
                    participantName: 'Agent-1',
                  },
                },
                {
                  id: 'target-codex',
                  status: 'running',
                  participant: {
                    participantKind: 'cat',
                    participantId: 'participant-codex',
                    participantName: 'Codex-CLI',
                  },
                },
              ],
              events: [
                {
                  kind: 'turn_started',
                  targets: [{ id: 'participant-agent-1' }, { id: 'participant-codex' }],
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
    false,
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

test('shouldPinLiveIndicatorUntilPersistedReply stays pinned when another lane replies before the current lane persists', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user',
    targetStateId: 'target-agent-1',
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
          senderName: 'Kenny',
          metadata: {},
          createdAt: '2026-04-15T01:00:00.000Z',
        },
        {
          id: 'message-agent-2',
          senderKind: 'agent',
          senderName: 'Agent-2',
          metadata: {
            event: 'assistant_turn_segment',
            sourceMessageId: 'message-user',
            targetKind: 'cat',
            targetId: 'participant-agent-2',
            targetStateId: 'target-agent-2',
            segmentIndex: 0,
          },
          createdAt: '2026-04-15T01:00:03.000Z',
        },
      ],
      roomRouting: {
        defaultRecipientId: null,
        workflow: {
          activeTurn: {
            status: 'running',
            sourceMessageId: 'message-user',
            workflowShape: 'concurrent',
            targetStatuses: [
              {
                id: 'target-agent-1',
                status: 'running',
                participant: {
                  participantId: 'participant-agent-1',
                  participantName: 'Agent-1',
                },
              },
              {
                id: 'target-agent-2',
                status: 'completed',
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
    }),
    true,
  );
});

test('shouldPinLiveIndicatorUntilPersistedReply releases a sealed bubble when the persisted reply keeps the session but the targetStateId drifted', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user',
    targetStateId: 'target-agent-1-live',
    sessionId: 'session-agent-1',
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
          senderName: 'Kenny',
          metadata: {},
          createdAt: '2026-04-15T01:00:00.000Z',
        },
        {
          id: 'message-agent-1',
          senderKind: 'agent',
          senderName: 'Agent-1',
          metadata: {
            event: 'assistant_turn_segment',
            sourceMessageId: 'message-user',
            targetKind: 'cat',
            targetId: 'participant-agent-1',
            targetStateId: 'target-agent-1-canonical',
            sessionId: 'session-agent-1',
            segmentIndex: 0,
          },
          createdAt: '2026-04-15T01:00:03.000Z',
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
                id: 'target-agent-1-live',
                status: 'completed',
                participant: {
                  participantId: 'participant-agent-1',
                  participantName: 'Agent-1',
                },
              },
            ],
          },
        },
      },
      composerMode: 'cat_led',
      pendingProvider: null,
      pendingInstance: null,
    }),
    false,
  );
});

test('shouldPinLiveIndicatorUntilPersistedReply keeps a lane-scoped bubble pinned even when another lane already replied', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user',
    laneId: 'lane-agent-1',
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
          senderName: 'Kenny',
          metadata: {},
          createdAt: '2026-04-15T01:00:00.000Z',
        },
        {
          id: 'message-agent-other-lane',
          senderKind: 'agent',
          senderName: 'Agent-2',
          metadata: {
            event: 'assistant_turn_segment',
            sourceMessageId: 'message-user',
            laneId: 'lane-agent-2',
            segmentIndex: 0,
          },
          createdAt: '2026-04-15T01:00:03.000Z',
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
    sourceMessageId: 'message-user',
    targetStateId: 'target-agent-1',
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
          metadata: {
            event: 'assistant_turn_segment',
            sourceMessageId: 'message-user',
            targetKind: 'cat',
            targetId: 'participant-agent-1',
            targetStateId: 'target-agent-1',
            segmentIndex: 0,
          },
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

test('resolveWaitingIndicatorStateTransition does not reopen a sealed sequential speaker as a waiting bubble', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user-current',
    targetStateId: 'target-gemini',
    participantId: 'participant-gemini',
    speakerLabel: 'Gemini-CLI',
    segments: [
      {
        id: 'message-user-current:target-gemini:segment:2',
        phase: 'sealed' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: 'target-gemini',
        segmentIndex: 2,
        participantId: 'participant-gemini',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Gemini-CLI',
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
            text: 'Gemini reply',
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
    targetStateId: 'target-gemini',
    participantId: 'participant-gemini',
    catId: null,
    speakerLabel: 'Gemini-CLI',
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
          id: 'message-gemini',
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
                id: 'target-gemini',
                status: 'running',
                participant: {
                  participantId: 'participant-gemini',
                  participantName: 'Gemini-CLI',
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

test('resolveWaitingIndicatorStateTransition increments an anonymous follow-up segment for the same hidden participant', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user-current',
    identityParticipantId: 'participant-claude',
    participantId: null,
    speakerLabel: null,
    segments: [
      {
        id: 'message-user-current:participant-claude:segment:0',
        phase: 'sealed' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: null,
        segmentIndex: 0,
        sessionId: null,
        identityParticipantId: 'participant-claude',
        participantId: null,
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: null,
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
    speakerLabel: null,
    revealIdentity: false,
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
  assert.equal(next.segments[1]?.identityParticipantId, 'participant-claude');
});

test('resolveWaitingIndicatorStateTransition does not preserve a waiting segment index for a different participant with the same label', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting' as const,
    sourceMessageId: 'message-user-current',
    participantId: 'participant-claude',
    speakerLabel: 'Shared-CLI',
    segmentIndex: 3,
    segments: [
      {
        id: 'message-user-current:participant-claude:segment:3',
        phase: 'waiting' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: null,
        segmentIndex: 3,
        participantId: 'participant-claude',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Shared-CLI',
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
    participantId: 'participant-codex',
    catId: null,
    speakerLabel: 'Shared-CLI',
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
                status: 'pending',
                participant: {
                  participantId: 'participant-codex',
                  participantName: 'Shared-CLI',
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
  assert.equal(next.participantId, 'participant-codex');
  assert.equal(next.segmentIndex, 0);
  assert.equal(next.segments.length, 1);
  assert.equal(next.segments[0]?.participantId, 'participant-codex');
  assert.equal(next.segments[0]?.segmentIndex, 0);
});

test('resolveWaitingIndicatorStateTransition does not preserve an anonymous waiting segment index for a different hidden participant', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting' as const,
    sourceMessageId: 'message-user-current',
    identityParticipantId: 'participant-claude',
    participantId: null,
    speakerLabel: null,
    segmentIndex: 3,
    segments: [
      {
        id: 'message-user-current:participant-claude:segment:3',
        phase: 'waiting' as const,
        sourceMessageId: 'message-user-current',
        targetStateId: null,
        segmentIndex: 3,
        sessionId: null,
        identityParticipantId: 'participant-claude',
        participantId: null,
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: null,
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
    participantId: 'participant-codex',
    catId: null,
    speakerLabel: null,
    revealIdentity: false,
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
  assert.equal(next.identityParticipantId, 'participant-codex');
  assert.equal(next.participantId, null);
  assert.equal(next.segmentIndex, 0);
  assert.equal(next.segments.length, 1);
  assert.equal(next.segments[0]?.identityParticipantId, 'participant-codex');
  assert.equal(next.segments[0]?.segmentIndex, 0);
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

test('hasVisibleLiveIndicatorSpeakerReplyAfterMessage requires lane identity when the live bubble already has a targetStateId', () => {
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
        targetStateId: 'target-agent-1',
        participantId: 'participant-agent-1',
        speakerLabel: 'Agent-1',
      },
    ),
    false,
  );
});

test('hasVisibleLiveIndicatorSpeakerReplyAfterMessage matches a lane-scoped reply when the targetStateId drifted', () => {
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
            event: 'assistant_turn_segment',
            sourceMessageId: 'message-agent-0',
            targetKind: 'cat',
            targetId: 'participant-agent-1',
            targetStateId: 'target-agent-1-canonical',
            laneId: 'lane-agent-1',
          },
          createdAt: '2026-04-13T12:00:03.000Z',
        },
      ],
      'message-user',
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'streaming',
        sourceMessageId: 'message-user',
        laneId: 'lane-agent-1',
        targetStateId: 'target-agent-1-live',
        participantId: 'participant-agent-1',
        speakerLabel: 'Agent-1',
      },
    ),
    true,
  );
});

test('hasVisibleLiveIndicatorSpeakerReplyAfterMessage ignores label-only replies when a participant identity is active', () => {
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
          id: 'message-agent-other',
          senderKind: 'agent',
          senderName: 'Shared-CLI',
          metadata: {
            executionLabelSnapshot: 'Shared-CLI',
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
        speakerLabel: 'Shared-CLI',
      },
    ),
    false,
  );
});

test('resolveWaitingIndicatorStateTransition keeps the same waiting segment when the lane stays fixed but the source drifts', () => {
  const previous = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting' as const,
    sourceMessageId: 'message-user-current',
    laneId: 'lane-gemini',
    targetStateId: 'target-gemini',
    participantId: 'participant-gemini',
    speakerLabel: 'Gemini-CLI',
    segmentIndex: 3,
    segments: [
      {
        id: 'message-user-current:target-gemini:segment:3',
        phase: 'waiting' as const,
        sourceMessageId: 'message-user-current',
        laneId: 'lane-gemini',
        targetStateId: 'target-gemini',
        segmentIndex: 3,
        participantId: 'participant-gemini',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Gemini-CLI',
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
    sourceMessageId: 'message-codex-reply',
    laneId: 'lane-gemini',
    targetStateId: 'target-gemini',
    participantId: 'participant-gemini',
    catId: null,
    speakerLabel: 'Gemini-CLI',
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
          id: 'message-codex-reply',
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
                id: 'target-gemini',
                status: 'pending',
                participant: {
                  participantId: 'participant-gemini',
                  participantName: 'Gemini-CLI',
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
  assert.equal(next.segments.length, 1);
  assert.equal(next.segments[0]?.segmentIndex, 3);
  assert.equal(next.segments[0]?.id, 'message-user-current:target-gemini:segment:3');
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
              event: 'assistant_turn_segment',
              sourceMessageId: 'message-user',
              targetKind: 'cat',
              targetId: 'participant-agent-1',
              targetStateId: 'target-agent-1',
              segmentIndex: 0,
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

test('shouldPromoteSealedBubbleToWaitingSpeaker waits for the current lane reply instead of another lane reply', () => {
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
            id: 'message-agent-2',
            senderKind: 'agent',
            senderName: 'Agent-2',
            metadata: {
              event: 'assistant_turn_segment',
              sourceMessageId: 'message-user',
              targetKind: 'cat',
              targetId: 'participant-agent-2',
              targetStateId: 'target-agent-2',
              segmentIndex: 0,
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
    false,
  );
});

test('shouldPromoteSealedBubbleToWaitingSpeaker stays off for the same logical speaker in a sequential room', () => {
  const waitingState = createWaitingLiveIndicatorState({
    sourceMessageId: 'message-user',
    targetStateId: 'target-gemini',
    participantId: 'participant-gemini',
    catId: null,
    speakerLabel: 'Gemini-CLI',
    revealIdentity: true,
  });

  assert.equal(
    shouldPromoteSealedBubbleToWaitingSpeaker(
      {
        ...EMPTY_LIVE_INDICATOR,
        active: true,
        phase: 'sealed',
        sourceMessageId: 'message-user',
        targetStateId: 'target-gemini',
        participantId: 'participant-gemini',
        speakerLabel: 'Gemini-CLI',
        segmentIndex: 2,
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text',
            status: 'complete',
            title: null,
            text: 'Gemini reply.',
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
            id: 'message-gemini',
            senderKind: 'agent',
            senderName: 'Gemini-CLI',
            metadata: {
              event: 'assistant_turn_segment',
              sourceMessageId: 'message-user',
              targetStateId: 'target-gemini',
              targetId: 'participant-gemini',
              segmentIndex: 2,
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
                  id: 'target-gemini',
                  status: 'running',
                  participant: {
                    participantId: 'participant-gemini',
                    participantName: 'Gemini-CLI',
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

test('resolveVisibleLiveIndicator keeps a lane-scoped bubble visible even when another lane already replied', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    sourceMessageId: 'message-user',
    laneId: 'lane-agent-1',
    progressText: 'Thinking...',
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
        id: 'message-agent-other-lane',
        senderKind: 'agent',
        senderName: 'Agent-2',
        metadata: {
          event: 'assistant_turn_segment',
          sourceMessageId: 'message-user',
          laneId: 'lane-agent-2',
          segmentIndex: 0,
        },
        createdAt: '2026-04-09T12:00:04.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
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

test('resolveVisibleLiveIndicator hides a sealed targeted segment when the persisted reply keeps the session but the targetStateId drifted', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user',
    targetStateId: 'target-state-live',
    sessionId: 'session-agent-1',
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
          sourceMessageId: 'message-user',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
          targetStateId: 'target-state-canonical',
          sessionId: 'session-agent-1',
          segmentIndex: 0,
        },
        createdAt: '2026-04-09T12:00:03.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, null);
});

test('resolveVisibleLiveIndicator hides a sealed targeted segment when the persisted reply keeps the lane but the targetStateId drifted', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    sourceMessageId: 'message-user',
    laneId: 'lane-agent-1',
    targetStateId: 'target-state-live',
    sessionId: 'session-agent-new',
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
          sourceMessageId: 'message-user',
          laneId: 'lane-agent-1',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
          targetStateId: 'target-state-canonical',
          sessionId: 'session-agent-old',
          segmentIndex: 0,
        },
        createdAt: '2026-04-09T12:00:03.000Z',
      },
    ],
    '2026-04-09T12:00:02.000Z',
  );

  assert.equal(visible, null);
});

test('resolveVisibleLiveIndicator drops a persisted sealed sequential speaker before the next waiting target', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting' as const,
    segments: [
      createLiveIndicatorSegmentState({
        phase: 'sealed',
        sourceMessageId: 'message-user-sequential',
        laneId: 'lane-codex',
        targetStateId: 'target-state-codex',
        segmentIndex: 0,
        sessionId: 'session-codex',
        participantId: 'participant-codex',
        speakerLabel: 'Codex-CLI',
        contentBlocks: [
          {
            id: 'status:0',
            index: 0,
            kind: 'status' as const,
            status: 'complete' as const,
            title: 'Session',
            text: '',
            toolName: null,
            toolId: null,
            metadata: null,
          },
          {
            id: 'status:1',
            index: 1,
            kind: 'status' as const,
            status: 'complete' as const,
            title: 'Session',
            text: '',
            toolName: null,
            toolId: null,
            metadata: null,
          },
          {
            id: 'text:2',
            index: 2,
            kind: 'text' as const,
            status: 'complete' as const,
            title: null,
            text: 'Codex completed the first pass.',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
      }),
      createLiveIndicatorSegmentState({
        phase: 'sealed',
        sourceMessageId: 'message-user-sequential',
        laneId: 'lane-codex',
        targetStateId: 'target-state-codex',
        segmentIndex: 1,
        sessionId: 'session-codex',
        participantId: 'participant-codex',
        speakerLabel: 'Codex-CLI',
        contentBlocks: [
          {
            id: 'status:3',
            index: 3,
            kind: 'status' as const,
            status: 'complete' as const,
            title: 'Session',
            text: '',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
      }),
      createLiveIndicatorSegmentState({
        phase: 'waiting',
        sourceMessageId: 'message-user-sequential',
        laneId: 'lane-gemini',
        targetStateId: 'target-state-gemini',
        segmentIndex: 2,
        sessionId: 'session-gemini',
        participantId: 'participant-gemini',
        speakerLabel: 'Gemini-CLI',
      }),
    ],
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-user-sequential',
        senderKind: 'user',
        senderName: 'Kenny',
        metadata: {},
        createdAt: '2026-04-15T12:00:00.000Z',
      },
      {
        id: 'message-agent-codex',
        senderKind: 'agent',
        senderName: 'Codex-CLI',
        metadata: {
          event: 'assistant_turn_segment',
          sourceMessageId: 'message-claude-reply',
          laneId: 'lane-codex',
          targetKind: 'cat',
          targetId: 'participant-codex',
          targetStateId: 'target-state-codex',
          segmentIndex: 0,
        },
        createdAt: '2026-04-15T12:00:03.000Z',
      },
    ],
    '2026-04-15T12:00:04.000Z',
  );

  assert.ok(visible);
  assert.equal(visible.segments.length, 1);
  assert.equal(visible.segments[0]?.phase, 'waiting');
  assert.equal(visible.segments[0]?.targetStateId, 'target-state-gemini');
  assert.equal(visible.segments[0]?.speakerLabel, 'Gemini-CLI');
});

test('resolveVisibleLiveIndicator downgrades pre-session assistant progress into an anonymous waiting bubble', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    activeCatIds: [],
    tools: [],
    contentBlocks: [],
    events: [],
    segments: [],
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

  assert.ok(visible);
  assert.equal(visible.phase, 'waiting');
  assert.equal(visible.participantId, null);
  assert.equal(visible.speakerLabel, null);
  assert.equal(visible.contentBlocks.length, 0);
});

test('resolveVisibleLiveIndicator keeps a pre-session waiting speaker visible as an anonymous bubble', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting',
    activeCatIds: [],
    tools: [],
    contentBlocks: [],
    events: [],
    segments: [],
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    sessionStartedAt: '2026-04-09T12:00:02.500Z',
    requiresSessionStartConfirmation: true,
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

  assert.ok(visible);
  assert.equal(visible.phase, 'waiting');
  assert.equal(visible.participantId, null);
  assert.equal(visible.speakerLabel, null);
});

test('resolveVisibleLiveIndicator shows assistant progress once the matching session_started message is visible even if the turn timestamp moved later', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    sessionId: 'session-agent-1',
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
          sessionId: 'session-agent-1',
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

test('resolveVisibleLiveIndicator accepts a matching targetStateId for session startup confirmation even when the sessionId changed', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    targetStateId: 'target-state-agent-1',
    sessionId: 'session-agent-new',
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
          sessionId: 'session-agent-old',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
          targetStateId: 'target-state-agent-1',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
    ],
    '2026-04-09T12:00:05.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator accepts a matching sessionId for session startup confirmation even when the targetStateId drifted', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    targetStateId: 'target-state-agent-live',
    sessionId: 'session-agent-1',
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
          sessionId: 'session-agent-1',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
          targetStateId: 'target-state-agent-canonical',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
    ],
    '2026-04-09T12:00:05.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator accepts a matching laneId for session startup confirmation even when the targetStateId drifted', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    laneId: 'lane-agent-1',
    targetStateId: 'target-state-agent-live',
    sessionId: 'session-agent-new',
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
          sessionId: 'session-agent-old',
          laneId: 'lane-agent-1',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
          targetStateId: 'target-state-agent-canonical',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
    ],
    '2026-04-09T12:00:05.000Z',
  );

  assert.equal(visible, liveIndicator);
});

test('resolveVisibleLiveIndicator keeps a targeted bubble anonymous when session startup omits the active targetStateId', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    targetStateId: 'target-state-agent-1',
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

  assert.ok(visible);
  assert.equal(visible.phase, 'waiting');
  assert.equal(visible.participantId, null);
  assert.equal(visible.speakerLabel, null);
});

test('resolveVisibleLiveIndicator accepts orchestrator session_started messages that only declare targetKind', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    sessionId: 'session-orchestrator',
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
          sessionId: 'session-orchestrator',
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
    sessionId: 'session-agent-1',
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

test('resolveVisibleLiveIndicator does not unlock a reconnect bubble from an older same-speaker session_started message', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming',
    sessionId: 'session-agent-new',
    participantId: 'participant-agent-1',
    speakerLabel: 'Agent-1',
    sessionStartedAt: '2026-04-09T12:00:05.000Z',
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
        id: 'message-session-agent-old',
        senderKind: 'system',
        senderName: 'Runtime',
        metadata: {
          event: 'session_started',
          sessionId: 'session-agent-old',
          targetKind: 'cat',
          targetId: 'participant-agent-1',
        },
        createdAt: '2026-04-09T12:00:02.500Z',
      },
    ],
    '2026-04-09T12:00:05.500Z',
  );

  assert.ok(visible);
  assert.equal(visible.phase, 'waiting');
  assert.equal(visible.participantId, null);
  assert.equal(visible.speakerLabel, null);
  assert.equal(visible.sessionId, 'session-agent-new');
  assert.equal(visible.requiresSessionStartConfirmation, true);
});

test('createLiveIndicatorSegmentState gives reconnect sessions distinct ids even for the same speaker and segment index', () => {
  const firstSegment = createLiveIndicatorSegmentState({
    phase: 'sealed',
    sourceMessageId: 'message-user',
    participantId: 'participant-grandma',
    speakerLabel: '奶奶',
    sessionId: 'session-old',
    segmentIndex: 0,
  });
  const secondSegment = createLiveIndicatorSegmentState({
    phase: 'streaming',
    sourceMessageId: 'message-user',
    participantId: 'participant-grandma',
    speakerLabel: '奶奶',
    sessionId: 'session-new',
    segmentIndex: 0,
  });

  assert.notEqual(firstSegment.id, secondSegment.id);
});

test('createLiveIndicatorSegmentState prefers laneId over drifted targetStateId when building segment ids', () => {
  const firstSegment = createLiveIndicatorSegmentState({
    phase: 'sealed',
    sourceMessageId: 'message-user',
    laneId: 'lane-1',
    targetStateId: 'target-live',
    sessionId: 'session-1',
    segmentIndex: 0,
  });
  const secondSegment = createLiveIndicatorSegmentState({
    phase: 'streaming',
    sourceMessageId: 'message-user',
    laneId: 'lane-1',
    targetStateId: 'target-canonical',
    sessionId: 'session-1',
    segmentIndex: 0,
  });

  assert.equal(firstSegment.id, secondSegment.id);
});

test('projectLiveIndicatorStateFromSegments drops duplicate segment ids and keeps the last copy', () => {
  const duplicateId = 'message-user:lane-claude:segment:0';
  const state = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'waiting' as const,
    segments: [
      createLiveIndicatorSegmentState({
        id: duplicateId,
        phase: 'waiting',
        sourceMessageId: 'message-user',
        laneId: 'lane-claude',
        targetStateId: 'target-claude',
        participantId: 'participant-claude',
        speakerLabel: 'Claude-CLI',
      }),
      createLiveIndicatorSegmentState({
        id: duplicateId,
        phase: 'streaming',
        sourceMessageId: 'message-user',
        laneId: 'lane-claude',
        targetStateId: 'target-claude',
        participantId: 'participant-claude',
        speakerLabel: 'Claude-CLI',
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text',
            status: 'streaming',
            title: null,
            text: 'Latest Claude chunk',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
      }),
    ],
  };

  const segments = resolveVisibleLiveIndicator(state, [], null)?.segments ?? [];
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.phase, 'streaming');
  assert.equal(segments[0]?.contentBlocks[0]?.text, 'Latest Claude chunk');
});

test('applyLiveIndicatorEvent updates a matching concurrent lane in place instead of appending a duplicate segment', () => {
  let state = projectLiveIndicatorStateFromSegments([
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-user',
      laneId: 'lane-codex',
      targetStateId: 'target-codex',
      participantId: 'participant-codex',
      speakerLabel: 'Codex-CLI',
    }),
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-user',
      laneId: 'lane-claude',
      targetStateId: 'target-claude',
      participantId: 'participant-claude',
      speakerLabel: 'Claude-CLI',
    }),
  ]);

  state = applyLiveIndicatorEvent(state, 'progress', {
    sourceMessageId: 'message-user',
    laneId: 'lane-codex',
    targetStateId: 'target-codex',
    participantId: 'participant-codex',
    speakerLabel: 'Codex-CLI',
    metadata: {
      kind: 'session',
    },
    text: 'Codex session ready',
  });

  assert.equal(state.segments.length, 2);
  assert.equal(state.segments[0]?.laneId, 'lane-codex');
  assert.equal(state.segments[0]?.phase, 'streaming');
  assert.equal(state.segments[0]?.events.at(-1)?.text, 'Codex session ready');
  assert.equal(state.segments[1]?.laneId, 'lane-claude');
  assert.equal(state.segments[1]?.phase, 'waiting');
  assert.equal(new Set(state.segments.map((segment) => segment.id)).size, 2);
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
  assert.match(source, /participantId:\s*current\.participantId,/u);
  assert.match(source, /activeTurn/u);
  assert.match(source, /selectedChannel\?\.messages/u);
  assert.match(source, /function updateIndicatorState\(/u);
  assert.doesNotMatch(source, /startTransition\(/u);
  assert.doesNotMatch(source, /participantId:\s*current\.revealIdentity\s*\?\s*current\.participantId\s*:\s*null,/u);
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

test('resolveLiveIndicatorSpeakerState preserves laneId when stream event carries explicit null', () => {
  const previous = createWaitingLiveIndicatorState({
    laneId: 'lane-abc',
    targetStateId: 'target-state-abc',
    catId: null,
    speakerLabel: 'Claude-CLI',
  });

  const nextSpeaker = resolveLiveIndicatorSpeakerState(previous, {
    participantId: 'orchestrator',
    catId: null,
    speakerLabel: 'Claude-CLI',
    laneId: null,
  });

  assert.equal(nextSpeaker.laneId, 'lane-abc');
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

test('resolveLiveIndicatorSpeakerState updates laneId when stream event carries a non-null value', () => {
  const previous = createWaitingLiveIndicatorState({
    laneId: 'lane-abc',
    targetStateId: 'target-state-abc',
    catId: null,
    speakerLabel: 'Claude-CLI',
  });

  const nextSpeaker = resolveLiveIndicatorSpeakerState(previous, {
    participantId: 'participant-2',
    catId: null,
    speakerLabel: 'Codex-CLI',
    laneId: 'lane-def',
  });

  assert.equal(nextSpeaker.laneId, 'lane-def');
});

test('resolveLiveIndicatorSpeakerState accepts hidden participant identity without forcing visible speaker identity', () => {
  const previous = createWaitingLiveIndicatorState({
    targetStateId: 'target-state-hidden',
    participantId: 'participant-before',
    catId: null,
    speakerLabel: null,
    revealIdentity: false,
  });

  const nextSpeaker = resolveLiveIndicatorSpeakerState(previous, {
    identityParticipantId: 'participant-hidden',
    speakerLabel: null,
  });

  assert.equal(nextSpeaker.identityParticipantId, 'participant-hidden');
  assert.equal(nextSpeaker.participantId, null);
  assert.equal(nextSpeaker.targetStateId, 'target-state-hidden');
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

test('live indicator normalizes nested tool_result content arrays into tool completion text', () => {
  let state = createWaitingLiveIndicatorState({
    catId: 'cat-1',
    speakerLabel: null,
  });

  state = applyLiveIndicatorEvent(state, 'tool_use', {
    toolName: 'read_file',
    toolId: 'tool-2',
  });
  state = applyLiveIndicatorEvent(state, 'tool_result', {
    toolId: 'tool-2',
    content: [{ type: 'output_text', text: 'nested output payload' }],
  });

  assert.deepEqual(state.tools, [
    {
      toolId: 'tool-2',
      toolName: 'read_file',
      done: true,
    },
  ]);
  assert.equal(state.events.at(-1)?.eventType, 'tool_result');
  assert.equal(state.events.at(-1)?.text, 'Completed read_file: nested output payload');
});

test('live indicator normalizes tool_use alias fields into pending tool entries', () => {
  let state = createWaitingLiveIndicatorState({
    catId: 'cat-1',
    speakerLabel: null,
  });

  state = applyLiveIndicatorEvent(state, 'tool_use', {
    id: 'tool-alias-1',
    name: 'search_repo',
  });

  assert.deepEqual(state.tools, [
    {
      toolId: 'tool-alias-1',
      toolName: 'search_repo',
      done: false,
    },
  ]);
  assert.equal(state.events.at(-1)?.eventType, 'tool_use');
  assert.equal(state.events.at(-1)?.text, 'Started search_repo');
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
    laneId: 'lane-1',
    targetStateId: 'target-1',
    sourceMessageId: 'message-1',
    streamSeq: 4,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, true);
  cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    laneId: 'lane-1',
    targetStateId: 'target-1',
    sourceMessageId: 'message-1',
    streamSeq: 4,
    streamSeqIndex: 1,
  });
  assert.equal(decision.accept, true);
  cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    laneId: 'lane-1',
    targetStateId: 'target-1',
    sourceMessageId: 'message-1',
    streamSeq: 4,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, false);

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    laneId: 'lane-1',
    targetStateId: 'target-1',
    sourceMessageId: 'message-1',
    streamSeq: 3,
    streamSeqIndex: 9,
  });
  assert.equal(decision.accept, false);

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    laneId: 'lane-2',
    targetStateId: 'target-2',
    sourceMessageId: 'message-1',
    streamSeq: 1,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, true);
  cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-1',
    laneId: null,
    targetStateId: null,
    sourceMessageId: 'message-2',
    streamSeq: 1,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, true);
  cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-2',
    laneId: null,
    targetStateId: null,
    sourceMessageId: 'message-2',
    streamSeq: 1,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, true);
});

test('advanceSequencedLiveIndicatorStreamCursor rejects stale replays by lane when targetStateId drifts on a reused session', () => {
  let decision = advanceSequencedLiveIndicatorStreamCursor(null, {
    sessionId: 'session-reused',
    laneId: 'lane-reused-1',
    targetStateId: 'target-live',
    sourceMessageId: 'message-user',
    streamSeq: 2,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, true);

  let cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-reused',
    laneId: 'lane-reused-1',
    targetStateId: 'target-canonical',
    sourceMessageId: 'message-user',
    streamSeq: 2,
    streamSeqIndex: 1,
  });
  assert.equal(decision.accept, true);
  cursor = decision.cursor;

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-reused',
    laneId: 'lane-reused-1',
    targetStateId: 'target-live',
    sourceMessageId: 'message-user',
    streamSeq: 2,
    streamSeqIndex: 0,
  });
  assert.equal(decision.accept, false);

  decision = advanceSequencedLiveIndicatorStreamCursor(cursor, {
    sessionId: 'session-reused',
    laneId: 'lane-reused-2',
    targetStateId: null,
    sourceMessageId: 'message-user',
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

test('resolveVisibleLiveIndicator hides a later targeted speaker bubble using target-local segment ordinals', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'sealed' as const,
    segments: [
      {
        id: 'segment-codex',
        phase: 'sealed' as const,
        sourceMessageId: 'message-user-3',
        targetStateId: 'target-state-codex',
        segmentIndex: 2,
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
        contentBlocks: [
          {
            id: 'text:0',
            index: 0,
            kind: 'text' as const,
            status: 'complete' as const,
            title: null,
            text: 'Codex reply',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
        events: [],
      },
      {
        id: 'segment-gemini',
        phase: 'sealed' as const,
        sourceMessageId: 'message-user-3',
        targetStateId: 'target-state-gemini',
        segmentIndex: 3,
        participantId: 'participant-gemini',
        catId: null,
        activeCatIds: [],
        catName: null,
        speakerLabel: 'Gemini-CLI',
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
            text: 'Gemini reply',
            toolName: null,
            toolId: null,
            metadata: null,
          },
        ],
        events: [],
      },
    ],
  };

  const visible = resolveVisibleLiveIndicator(
    liveIndicator,
    [
      {
        id: 'message-agent-gemini',
        senderKind: 'agent',
        senderName: 'Gemini-CLI',
        metadata: {
          event: 'assistant_turn_segment',
          sourceMessageId: 'message-user-3',
          targetStateId: 'target-state-gemini',
          segmentIndex: 0,
          targetKind: 'participant',
          targetId: 'participant-gemini',
        },
        createdAt: '2026-04-14T12:00:03.000Z',
      },
    ],
    null,
  );

  assert.ok(visible);
  assert.equal(visible.segments.length, 1);
  assert.equal(visible.segments[0]?.targetStateId, 'target-state-codex');
  assert.equal(visible.segments[0]?.segmentIndex, 2);
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

test('resolveVisibleLiveIndicator does not hide a targeted live bubble because the same speaker already replied on another target state', () => {
  const liveIndicator = {
    ...EMPTY_LIVE_INDICATOR,
    active: true,
    phase: 'streaming' as const,
    targetStateId: 'target-state-codex',
    participantId: 'participant-claude',
    speakerLabel: 'Claude-CLI',
  };

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
        id: 'message-agent-claude-other-target',
        senderKind: 'agent',
        senderName: 'Claude-CLI',
        metadata: {
          event: 'assistant_turn_segment',
          targetKind: 'participant',
          targetId: 'participant-claude',
          targetStateId: 'target-state-claude',
          segmentIndex: 0,
        },
        createdAt: '2026-04-13T12:00:03.000Z',
      },
    ],
    '2026-04-13T12:00:02.000Z',
  );

  assert.equal(visible, liveIndicator);
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
