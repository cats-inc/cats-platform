import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveChatComposerViewState,
  resolveLatestUserTurnPresentationState,
} from '../src/products/chat/renderer/components/chat-view/chatViewSupport.ts';
import { EMPTY_LIVE_INDICATOR } from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';

test('resolveChatComposerViewState treats pre-ACK prepare as a cancelable composer busy state', () => {
  const result = resolveChatComposerViewState({
    activeRoomParticipants: [],
    directLaneCat: null,
    busy: 'message:prepare',
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
    busy: 'message:ack:channel-1',
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
    busy: 'message:ack:channel-1',
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
