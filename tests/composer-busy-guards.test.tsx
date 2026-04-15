import assert from 'node:assert/strict';
import test from 'node:test';

import {
  doesComposerSelectionBlockChannelRoute,
  getComposerBusyScope,
  getComposerBusyChannelId,
  getComposerDispatchChannelId,
  isComposerAckBusy,
  isComposerAckBusyForChannel,
  isComposerAckBusyForDraft,
  isComposerBusy,
  isComposerBusyForChannel,
  isComposerBusyForDraft,
  isComposerDispatchBusy,
  isComposerDispatchBusyForChannel,
  isComposerSelectionBlocked,
  isComposerStopBusy,
  isComposerStopBusyForChannel,
} from '../src/shared/composer.ts';
import {
  clearBusyState,
  createChannelComposerBusyScope,
  createComposerBusyState,
  createDraftComposerBusyScope,
  createParallelChatBusyState,
} from '../src/shared/workspaceBusy.ts';

test('composer busy helpers treat missing busy state as idle instead of throwing', () => {
  assert.equal(isComposerBusy(undefined), false);
  assert.equal(isComposerBusy(clearBusyState()), false);
  assert.equal(isComposerAckBusy(undefined), false);
  assert.equal(isComposerDispatchBusy(undefined), false);
  assert.equal(isComposerStopBusy(undefined), false);
  assert.equal(isComposerSelectionBlocked(undefined), false);
  assert.equal(getComposerBusyScope(undefined), null);
  assert.equal(getComposerBusyChannelId(undefined), null);
  assert.equal(getComposerDispatchChannelId(undefined), null);
});

test('composer busy helpers still recognize active ACK, dispatch, and stop states', () => {
  const channelScope = createChannelComposerBusyScope('channel-1');

  assert.equal(isComposerBusy(createComposerBusyState('ack', channelScope)), true);
  assert.equal(isComposerBusy(createParallelChatBusyState('ack')), true);
  assert.equal(isComposerBusy(createParallelChatBusyState('dispatch')), true);
  assert.equal(isComposerBusy(createParallelChatBusyState('relay')), true);
  assert.equal(isComposerAckBusy(createComposerBusyState('ack', channelScope)), true);
  assert.equal(isComposerDispatchBusy(createComposerBusyState('send', channelScope)), true);
  assert.equal(isComposerStopBusy(createComposerBusyState('stop', channelScope)), true);
  assert.equal(isComposerSelectionBlocked(createParallelChatBusyState('stop')), true);
  assert.deepEqual(getComposerBusyScope(createComposerBusyState('send', channelScope)), channelScope);
  assert.equal(getComposerBusyChannelId(createComposerBusyState('send', channelScope)), 'channel-1');
  assert.equal(getComposerDispatchChannelId(createComposerBusyState('send', channelScope)), 'channel-1');
});

test('composer busy helpers keep relay semantics distinct from dispatch and selection blocking', () => {
  const relayBusy = createParallelChatBusyState('relay');

  assert.equal(isComposerBusy(relayBusy), true);
  assert.equal(isComposerAckBusy(relayBusy), false);
  assert.equal(isComposerDispatchBusy(relayBusy), false);
  assert.equal(isComposerSelectionBlocked(relayBusy), false);
  assert.equal(isComposerStopBusy(relayBusy), false);
  assert.equal(getComposerBusyChannelId(relayBusy), null);
  assert.equal(getComposerDispatchChannelId(relayBusy), null);
});

test('composer busy helpers scope ACK, dispatch, and stop states to the active channel', () => {
  const channel1Scope = createChannelComposerBusyScope('channel-1');

  assert.equal(isComposerAckBusyForChannel(createComposerBusyState('prepare', channel1Scope), 'channel-1'), true);
  assert.equal(isComposerAckBusyForChannel(createComposerBusyState('prepare', channel1Scope), 'channel-2'), false);
  assert.equal(isComposerAckBusyForChannel(clearBusyState(), 'channel-1'), false);
  assert.equal(isComposerAckBusyForChannel(createComposerBusyState('ack', channel1Scope), 'channel-1'), true);
  assert.equal(isComposerBusyForChannel(createComposerBusyState('send', channel1Scope), 'channel-1'), true);
  assert.equal(isComposerBusyForChannel(createComposerBusyState('send', channel1Scope), 'channel-2'), false);
  assert.equal(isComposerDispatchBusyForChannel(createComposerBusyState('send', channel1Scope), 'channel-1'), true);
  assert.equal(isComposerDispatchBusyForChannel(createComposerBusyState('send', channel1Scope), 'channel-2'), false);
  assert.equal(isComposerStopBusyForChannel(createComposerBusyState('stop', channel1Scope), 'channel-1'), true);
  assert.equal(isComposerStopBusyForChannel(createComposerBusyState('stop', channel1Scope), 'channel-2'), false);
});

test('composer busy helpers keep draft ACK states local to draft surfaces', () => {
  const draftScope = createDraftComposerBusyScope();
  const draftPrepareBusy = createComposerBusyState('prepare', draftScope);

  assert.equal(isComposerAckBusyForDraft(draftPrepareBusy), true);
  assert.equal(isComposerBusyForDraft(createComposerBusyState('ack', draftScope)), true);
  assert.equal(isComposerBusyForChannel(createComposerBusyState('ack', draftScope), 'channel-1'), false);
  assert.deepEqual(getComposerBusyScope(draftPrepareBusy), draftScope);
  assert.equal(getComposerBusyChannelId(draftPrepareBusy), null);
});

test('composer route blocking only applies to the busy channel instead of all rooms', () => {
  const channel1Scope = createChannelComposerBusyScope('channel-1');

  assert.equal(
    doesComposerSelectionBlockChannelRoute(createComposerBusyState('ack', channel1Scope), 'channel-1'),
    true,
  );
  assert.equal(
    doesComposerSelectionBlockChannelRoute(createComposerBusyState('ack', channel1Scope), 'channel-2'),
    false,
  );
  assert.equal(doesComposerSelectionBlockChannelRoute(clearBusyState(), 'channel-1'), false);
  assert.equal(
    doesComposerSelectionBlockChannelRoute(createParallelChatBusyState('ack'), 'channel-2'),
    false,
  );
  assert.equal(
    doesComposerSelectionBlockChannelRoute(
      createComposerBusyState('prepare', createDraftComposerBusyScope()),
      'channel-1',
    ),
    false,
  );
});
