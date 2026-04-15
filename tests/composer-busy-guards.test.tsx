import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DRAFT_COMPOSER_BUSY_SCOPE,
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
  normalizeComposerBusy,
} from '../src/shared/composer.ts';

test('composer busy helpers treat missing busy state as idle instead of throwing', () => {
  assert.equal(normalizeComposerBusy(undefined), '');
  assert.equal(isComposerBusy(undefined), false);
  assert.equal(isComposerBusy(''), false);
  assert.equal(isComposerAckBusy(undefined), false);
  assert.equal(isComposerDispatchBusy(undefined), false);
  assert.equal(isComposerStopBusy(undefined), false);
  assert.equal(isComposerSelectionBlocked(undefined), false);
  assert.equal(getComposerBusyScope(undefined), null);
  assert.equal(getComposerBusyChannelId(undefined), null);
  assert.equal(getComposerDispatchChannelId(undefined), null);
});

test('composer busy helpers still recognize active ACK, dispatch, and stop states', () => {
  assert.equal(isComposerBusy('message:ack:channel-1'), true);
  assert.equal(isComposerBusy('parallelChat:ack'), true);
  assert.equal(isComposerBusy('parallelChat:dispatch'), true);
  assert.equal(isComposerBusy('parallelChat:relay'), true);
  assert.equal(isComposerAckBusy('message:ack:channel-1'), true);
  assert.equal(isComposerDispatchBusy('message:send:channel-1'), true);
  assert.equal(isComposerStopBusy('message:stop:channel-1'), true);
  assert.equal(isComposerSelectionBlocked('parallelChat:stop'), true);
  assert.equal(getComposerBusyScope('message:send:channel-1'), 'channel-1');
  assert.equal(getComposerBusyChannelId('message:send:channel-1'), 'channel-1');
  assert.equal(getComposerDispatchChannelId('message:send:channel-1'), 'channel-1');
});

test('composer busy helpers keep relay semantics distinct from dispatch and selection blocking', () => {
  assert.equal(isComposerBusy('parallelChat:relay'), true);
  assert.equal(isComposerAckBusy('parallelChat:relay'), false);
  assert.equal(isComposerDispatchBusy('parallelChat:relay'), false);
  assert.equal(isComposerSelectionBlocked('parallelChat:relay'), false);
  assert.equal(isComposerStopBusy('parallelChat:relay'), false);
  assert.equal(getComposerBusyChannelId('parallelChat:relay'), null);
  assert.equal(getComposerDispatchChannelId('parallelChat:relay'), null);
});

test('composer busy helpers scope ACK, dispatch, and stop states to the active channel', () => {
  assert.equal(isComposerAckBusyForChannel('message:prepare:channel-1', 'channel-1'), true);
  assert.equal(isComposerAckBusyForChannel('message:prepare:channel-1', 'channel-2'), false);
  assert.equal(isComposerAckBusyForChannel('message:ack:channel-1', 'channel-1'), true);
  assert.equal(isComposerBusyForChannel('message:send:channel-1', 'channel-1'), true);
  assert.equal(isComposerBusyForChannel('message:send:channel-1', 'channel-2'), false);
  assert.equal(isComposerDispatchBusyForChannel('message:send:channel-1', 'channel-1'), true);
  assert.equal(isComposerDispatchBusyForChannel('message:send:channel-1', 'channel-2'), false);
  assert.equal(isComposerStopBusyForChannel('message:stop:channel-1', 'channel-1'), true);
  assert.equal(isComposerStopBusyForChannel('message:stop:channel-1', 'channel-2'), false);
});

test('composer busy helpers keep draft ACK states local to draft surfaces', () => {
  const draftBusy = `message:prepare:${DRAFT_COMPOSER_BUSY_SCOPE}`;
  assert.equal(isComposerAckBusyForDraft(draftBusy), true);
  assert.equal(isComposerBusyForDraft(`message:ack:${DRAFT_COMPOSER_BUSY_SCOPE}`), true);
  assert.equal(isComposerBusyForChannel(`message:ack:${DRAFT_COMPOSER_BUSY_SCOPE}`, 'channel-1'), false);
  assert.equal(getComposerBusyScope(draftBusy), DRAFT_COMPOSER_BUSY_SCOPE);
  assert.equal(getComposerBusyChannelId(draftBusy), null);
});

test('composer route blocking only applies to the busy channel instead of all rooms', () => {
  assert.equal(doesComposerSelectionBlockChannelRoute('message:ack:channel-1', 'channel-1'), true);
  assert.equal(doesComposerSelectionBlockChannelRoute('message:ack:channel-1', 'channel-2'), false);
  assert.equal(doesComposerSelectionBlockChannelRoute('parallelChat:ack', 'channel-2'), false);
  assert.equal(
    doesComposerSelectionBlockChannelRoute(`message:prepare:${DRAFT_COMPOSER_BUSY_SCOPE}`, 'channel-1'),
    false,
  );
});
