import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearServerLiveTrace,
  isBrowserLiveTraceEnabled,
  pushServerLiveTrace,
  readServerLiveTrace,
  setBrowserLiveTraceEnabled,
  pushBrowserLiveTrace,
  readBrowserLiveTrace,
} from '../build/server/shared/liveTrace.js';

test('server live trace keeps a bounded deduplicated buffer', () => {
  clearServerLiveTrace();

  pushServerLiveTrace({
    event: 'stream_target_ready',
    channelId: 'channel-1',
    conversationId: 'conversation-channel-1',
    turnId: 'turn-1',
    laneId: 'lane-1',
    sourceMessageId: 'message-1',
    targetStateId: 'target-1',
    reason: 'active_workflow_running_target',
    signature: 'duplicate-entry',
  });
  pushServerLiveTrace({
    event: 'stream_target_ready',
    channelId: 'channel-1',
    conversationId: 'conversation-channel-1',
    turnId: 'turn-1',
    laneId: 'lane-1',
    sourceMessageId: 'message-1',
    targetStateId: 'target-1',
    reason: 'active_workflow_running_target',
    signature: 'duplicate-entry',
  });

  for (let index = 0; index < 205; index += 1) {
    pushServerLiveTrace({
      event: 'stream_event',
      channelId: 'channel-1',
      reason: `event-${index}`,
      signature: `event-${index}`,
    });
  }

  const entries = readServerLiveTrace();
  assert.equal(entries.length, 200);
  assert.equal(entries[0]?.reason, 'event-5');
  assert.equal(entries.at(-1)?.reason, 'event-204');
});

test('browser live trace respects the enabled flag and records entries once enabled', () => {
  setBrowserLiveTraceEnabled(false);
  assert.equal(isBrowserLiveTraceEnabled(), false);
  const before = readBrowserLiveTrace().length;

  pushBrowserLiveTrace({
    event: 'stream_connect',
    channelId: 'channel-disabled',
    signature: 'disabled',
  });

  assert.equal(readBrowserLiveTrace().length, before);

  setBrowserLiveTraceEnabled(true);
  assert.equal(isBrowserLiveTraceEnabled(), true);
  pushBrowserLiveTrace({
    event: 'stream_connect',
    channelId: 'channel-enabled',
    conversationId: 'conversation-channel-enabled',
    turnId: 'turn-enabled',
    laneId: 'lane-enabled',
    sourceMessageId: 'message-enabled',
    targetStateId: 'target-enabled',
    reason: 'open_source',
    signature: 'enabled-entry',
  });

  const entries = readBrowserLiveTrace();
  assert.equal(entries.at(-1)?.channelId, 'channel-enabled');
  assert.equal(entries.at(-1)?.conversationId, 'conversation-channel-enabled');
  assert.equal(entries.at(-1)?.turnId, 'turn-enabled');
  assert.equal(entries.at(-1)?.laneId, 'lane-enabled');
  assert.equal(entries.at(-1)?.sourceMessageId, 'message-enabled');
  assert.equal(entries.at(-1)?.targetStateId, 'target-enabled');
  assert.equal(entries.at(-1)?.reason, 'open_source');
});
