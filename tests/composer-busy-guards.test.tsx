import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getComposerBusyChannelId,
  getComposerDispatchChannelId,
  isComposerAckBusy,
  isComposerBusy,
  isComposerDispatchBusy,
  isComposerSelectionBlocked,
  isComposerStopBusy,
  normalizeComposerBusy,
} from '../src/shared/composer.ts';

test('composer busy helpers treat missing busy state as idle instead of throwing', () => {
  assert.equal(normalizeComposerBusy(undefined), '');
  assert.equal(isComposerBusy(undefined), false);
  assert.equal(isComposerAckBusy(undefined), false);
  assert.equal(isComposerDispatchBusy(undefined), false);
  assert.equal(isComposerStopBusy(undefined), false);
  assert.equal(isComposerSelectionBlocked(undefined), false);
  assert.equal(getComposerBusyChannelId(undefined), null);
  assert.equal(getComposerDispatchChannelId(undefined), null);
});

test('composer busy helpers still recognize active ACK, dispatch, and stop states', () => {
  assert.equal(isComposerBusy('message:ack:channel-1'), true);
  assert.equal(isComposerAckBusy('message:ack:channel-1'), true);
  assert.equal(isComposerDispatchBusy('message:send:channel-1'), true);
  assert.equal(isComposerStopBusy('message:stop:channel-1'), true);
  assert.equal(isComposerSelectionBlocked('concurrent:stop'), true);
  assert.equal(getComposerBusyChannelId('message:send:channel-1'), 'channel-1');
  assert.equal(getComposerDispatchChannelId('message:send:channel-1'), 'channel-1');
});
