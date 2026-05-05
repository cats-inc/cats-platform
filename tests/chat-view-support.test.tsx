import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatComposerRecipients,
  resolveChatComposerViewState,
  resolveLatestUserTurnPresentationState,
} from '../src/products/shared/renderer/components/chat-view/chatViewSupport.ts';
import { EMPTY_LIVE_INDICATOR } from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';
import { buildChatLaneId } from '../src/shared/chatCoreIds.ts';
import {
  createChannelComposerBusyScope,
  createComposerBusyState,
} from '../src/shared/workspaceBusy.ts';

test('resolveChatComposerViewState treats pre-ACK prepare as a cancelable composer busy state', () => {
  const result = resolveChatComposerViewState({
    activeRoomParticipants: [],
    directLaneCat: null,
    busy: createComposerBusyState('prepare', createChannelComposerBusyScope('channel-1')),
    isCompareGroup: false,
    selectedChannelId: 'channel-1',
    onCancelPendingSend: () => {},
    onStopMessage: () => {},
    repoPath: null,
    chatCwd: null,
  });

  assert.equal(result.composerAckBusy, true);
  assert.equal(result.composerBusy, true);
  assert.equal(result.showCancelComposerAction, true);
  assert.equal(result.showStopComposerAction, false);
});

test('resolveChatComposerViewState surfaces cancel-send for ACK on the active channel', () => {
  const result = resolveChatComposerViewState({
    activeRoomParticipants: [],
    directLaneCat: null,
    busy: createComposerBusyState('ack', createChannelComposerBusyScope('channel-1')),
    isCompareGroup: false,
    selectedChannelId: 'channel-1',
    onCancelPendingSend: () => {},
    onStopMessage: () => {},
    repoPath: null,
    chatCwd: null,
  });

  assert.equal(result.composerAckBusy, true);
  assert.equal(result.composerBusy, true);
  assert.equal(result.showCancelComposerAction, true);
  assert.equal(result.showStopComposerAction, false);
});

test('resolveChatComposerViewState does not leak ACK cancel state into other channels', () => {
  const result = resolveChatComposerViewState({
    activeRoomParticipants: [],
    directLaneCat: null,
    busy: createComposerBusyState('ack', createChannelComposerBusyScope('channel-1')),
    isCompareGroup: false,
    selectedChannelId: 'channel-2',
    onCancelPendingSend: () => {},
    onStopMessage: () => {},
    repoPath: null,
    chatCwd: null,
  });

  assert.equal(result.composerAckBusy, false);
  assert.equal(result.showCancelComposerAction, false);
});

test('resolveChatComposerViewState scopes prepare busy to the active channel', () => {
  const result = resolveChatComposerViewState({
    activeRoomParticipants: [],
    directLaneCat: null,
    busy: createComposerBusyState('prepare', createChannelComposerBusyScope('channel-1')),
    isCompareGroup: false,
    selectedChannelId: 'channel-2',
    onCancelPendingSend: () => {},
    onStopMessage: () => {},
    repoPath: null,
    chatCwd: null,
  });

  assert.equal(result.composerAckBusy, false);
  assert.equal(result.composerBusy, false);
  assert.equal(result.showCancelComposerAction, false);
});

test('resolveChatComposerViewState does not leak dispatch busy into other channels', () => {
  const result = resolveChatComposerViewState({
    activeRoomParticipants: [],
    directLaneCat: null,
    busy: createComposerBusyState('send', createChannelComposerBusyScope('channel-1')),
    isCompareGroup: false,
    selectedChannelId: 'channel-2',
    onCancelPendingSend: () => {},
    onStopMessage: () => {},
    repoPath: null,
    chatCwd: null,
  });

  assert.equal(result.composerBusy, false);
  assert.equal(result.showStopComposerAction, false);
});

test('buildChatComposerRecipients preserves default execution-target controls for active chats', () => {
  const recipients = buildChatComposerRecipients({
    isDirectLane: false,
    directLaneCat: null,
    isDefaultChatComposer: true,
    selectedExecutionTarget: {
      provider: 'claude',
      instance: 'cli',
      model: 'opus',
      modelSelection: {
        entryMode: 'explicit',
        controls: {
          'claude.reasoning_effort': 'max',
        },
      },
    },
    defaultRecipientParticipant: null,
    bossCatId: null,
    resolveParticipantCatRecord: () => null,
    resolveParticipantDisplayName: () => 'Claude',
  });

  assert.equal(recipients.length, 1);
  assert.equal(recipients[0]?.kind, 'implicit');
  assert.equal(recipients[0]?.modelSelection?.controls?.['claude.reasoning_effort'], 'max');
  assert.match(recipients[0]?.name ?? '', /Max/u);
});

test('resolveLatestUserTurnPresentationState shows processing only before the first assistant identity bubble', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'waiting',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'processing',
  });
});

test('resolveLatestUserTurnPresentationState stops user-bubble processing once an assistant bubble is identity-ready', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'streaming',
      speakerLabel: 'Codex-CLI',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState stops user-bubble processing once a waiting assistant placeholder is identity-ready', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'waiting',
      participantId: 'participant-codex',
      speakerLabel: 'Codex-CLI',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState keeps the user bubble idle once concurrent targets are already dispatched', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
            workflowShape: 'concurrent',
            targetStatuses: [
              {
                status: 'running',
                participant: {
                  participantId: 'participant-codex',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'waiting',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState keeps the user bubble idle during sequential handoff after a visible assistant reply', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-agent-1',
          senderKind: 'agent',
          createdAt: '2026-04-11T00:00:03.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'waiting',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState keeps the user bubble idle during sequential handoff once a prior target has completed', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                status: 'completed',
                participant: {
                  participantId: 'participant-claude',
                },
              },
              {
                status: 'running',
                participant: {
                  participantId: 'participant-codex',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'waiting',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState keeps the user bubble idle once session startup is already visible', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-session',
          senderKind: 'system',
          metadata: {
            event: 'session_started',
            targetId: 'participant-claude',
            targetStateId: 'target-state-claude',
          },
          createdAt: '2026-04-11T00:00:01.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                id: 'target-state-claude',
                status: 'running',
                participant: {
                  participantId: 'participant-claude',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: null,
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState ignores unrelated session startup from another active target', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-session-other-target',
          senderKind: 'system',
          metadata: {
            event: 'session_started',
            targetId: 'participant-codex',
            targetStateId: 'target-state-codex',
          },
          createdAt: '2026-04-11T00:00:01.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                id: 'target-state-claude',
                status: 'running',
                participant: {
                  participantId: 'participant-claude',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: null,
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'processing',
  });
});

test('resolveLatestUserTurnPresentationState keeps processing when session startup omits the active targetStateId', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-session-same-participant',
          senderKind: 'system',
          metadata: {
            event: 'session_started',
            targetId: 'participant-claude',
          },
          createdAt: '2026-04-11T00:00:01.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                id: 'target-state-claude',
                status: 'running',
                participant: {
                  participantId: 'participant-claude',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: null,
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'processing',
  });
});

test('resolveLatestUserTurnPresentationState stops processing when session startup matches the active laneId even if the targetStateId drifted', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-session-same-lane',
          senderKind: 'system',
          metadata: {
            event: 'session_started',
            laneId: buildChatLaneId(
              'turn-1',
              'target-state-claude-canonical',
              'participant-claude',
            ),
            targetId: 'participant-claude',
            targetStateId: 'target-state-claude-drifted',
          },
          createdAt: '2026-04-11T00:00:01.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            id: 'turn-1',
            sourceMessageId: 'message-user',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                id: 'target-state-claude-canonical',
                status: 'running',
                participant: {
                  participantId: 'participant-claude',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: null,
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState stops processing when session startup matches a persisted target laneId', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-session-same-persisted-lane',
          senderKind: 'system',
          metadata: {
            event: 'session_started',
            laneId: 'lane-persisted-canonical',
            targetId: 'participant-claude',
            targetStateId: 'target-state-claude-drifted',
          },
          createdAt: '2026-04-11T00:00:01.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            id: 'turn-1',
            sourceMessageId: 'message-user',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                id: 'target-state-claude-canonical',
                laneId: 'lane-persisted-canonical',
                status: 'running',
                participant: {
                  participantId: 'participant-claude',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: null,
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'idle',
  });
});

test('resolveLatestUserTurnPresentationState keeps the latest queued user bubble processing while a prior turn is still streaming', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-agent-1',
          senderKind: 'agent',
          createdAt: '2026-04-11T00:00:02.000Z',
        },
        {
          id: 'message-user-2',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:03.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user-1',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                status: 'running',
                participant: {
                  participantId: 'participant-codex',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'streaming',
      sourceMessageId: 'message-user-1',
      participantId: 'participant-codex',
      speakerLabel: 'Codex-CLI',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user-2',
    status: 'processing',
  });
});

test('resolveLatestUserTurnPresentationState keeps the latest queued user bubble processing even when the prior turn starts and replies afterward', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-user-2',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:03.000Z',
        },
        {
          id: 'message-session-1',
          senderKind: 'system',
          metadata: {
            event: 'session_started',
            targetId: 'participant-claude',
            targetStateId: 'target-state-claude',
          },
          createdAt: '2026-04-11T00:00:04.000Z',
        },
        {
          id: 'message-agent-1',
          senderKind: 'agent',
          metadata: {
            event: 'assistant_turn_segment',
            sourceMessageId: 'message-user-1',
            targetId: 'participant-claude',
            targetStateId: 'target-state-claude',
            segmentIndex: 0,
          },
          createdAt: '2026-04-11T00:00:05.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: null,
        workflow: {
          activeTurn: {
            sourceMessageId: 'message-user-1',
            status: 'running',
            workflowShape: 'sequential',
            targetStatuses: [
              {
                id: 'target-state-claude',
                status: 'completed',
                participant: {
                  participantId: 'participant-claude',
                },
              },
              {
                id: 'target-state-codex',
                status: 'pending',
                participant: {
                  participantId: 'participant-codex',
                },
              },
            ],
          },
        },
      },
    } as never,
    visibleLiveIndicator: {
      ...EMPTY_LIVE_INDICATOR,
      active: true,
      phase: 'streaming',
      sourceMessageId: 'message-user-1',
      participantId: 'participant-codex',
      speakerLabel: 'Codex-CLI',
    },
  });

  assert.deepEqual(result, {
    messageId: 'message-user-2',
    status: 'processing',
  });
});

test('resolveLatestUserTurnPresentationState marks the latest failed acknowledged user turn as retryable', () => {
  const result = resolveLatestUserTurnPresentationState({
    selectedChannel: {
      messages: [
        {
          id: 'message-user',
          senderKind: 'user',
          createdAt: '2026-04-11T00:00:00.000Z',
        },
        {
          id: 'message-error',
          senderKind: 'system',
          createdAt: '2026-04-11T00:00:02.000Z',
        },
      ],
      roomRouting: {
        lastOutcome: {
          sourceMessageId: 'message-user',
          status: 'error',
        },
        workflow: {
          activeTurn: null,
        },
      },
    } as never,
    visibleLiveIndicator: null,
  });

  assert.deepEqual(result, {
    messageId: 'message-user',
    status: 'failed',
  });
});
