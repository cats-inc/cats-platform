import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldWakeRouteChannelOnEntry,
} from '../dist-server/products/chat/shared/channelEntry.js';

test('renderer route entry wakes when a persisted room route is not yet the hydrated selected view', () => {
  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: null,
      entryLifecycleState: null,
    }),
    true,
  );
});

test('renderer route entry wakes a sleeping selected room but not an awake one', () => {
  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'sleeping',
    }),
    true,
  );

  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-1',
      routeChannelExists: true,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'awake',
    }),
    false,
  );
});

test('renderer route entry does not wake when the route channel is missing', () => {
  assert.equal(
    shouldWakeRouteChannelOnEntry({
      routeChannelId: 'channel-404',
      routeChannelExists: false,
      selectedChannelId: 'channel-1',
      selectedChannelViewId: 'channel-1',
      entryLifecycleState: 'sleeping',
    }),
    false,
  );
});
