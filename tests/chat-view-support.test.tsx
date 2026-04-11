import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChatComposerViewState } from '../src/products/chat/renderer/components/chat-view/chatViewSupport.ts';

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
