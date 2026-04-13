import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  awaitNextStreamTarget,
  notifyStreamTargetChanged,
  readStreamTargetSignalVersion,
} from '../build/server/products/chat/api/resources/streamTargetSignal.js';

test('awaitNextStreamTarget resolves immediately when the channel signal already advanced', async () => {
  const channelId = `signal-${randomUUID()}`;
  const observedVersion = readStreamTargetSignalVersion(channelId);

  notifyStreamTargetChanged(channelId);

  await awaitNextStreamTarget(channelId, observedVersion, new AbortController().signal);
});

test('awaitNextStreamTarget waits for a later channel signal from the same baseline', async () => {
  const channelId = `signal-${randomUUID()}`;
  const observedVersion = readStreamTargetSignalVersion(channelId);
  const abortController = new AbortController();
  let resolved = false;

  const wait = awaitNextStreamTarget(channelId, observedVersion, abortController.signal).then(() => {
    resolved = true;
  });

  await Promise.resolve();
  assert.equal(resolved, false);

  notifyStreamTargetChanged(channelId);
  await wait;

  assert.equal(resolved, true);
});
