import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveActiveCompareChannelId,
  resolveCompareNeighborChannelId,
} from '../src/products/chat/renderer/components/chat-view/compareNavigation.js';

const compareMembers = [
  { channelId: 'channel-a', title: 'A' },
  { channelId: 'channel-b', title: 'B' },
  { channelId: 'channel-c', title: 'C' },
] as const;

test('compare navigation prefers the route channel while selected state is stale', () => {
  assert.equal(
    resolveActiveCompareChannelId(compareMembers, 'channel-c', 'channel-a'),
    'channel-c',
  );
});

test('compare navigation falls back to selected channel when route is outside the group', () => {
  assert.equal(
    resolveActiveCompareChannelId(compareMembers, 'channel-z', 'channel-b'),
    'channel-b',
  );
});

test('compare navigation resolves cyclic neighbors from the active route channel', () => {
  assert.equal(
    resolveCompareNeighborChannelId(compareMembers, 'channel-c', 'next'),
    'channel-a',
  );
  assert.equal(
    resolveCompareNeighborChannelId(compareMembers, 'channel-c', 'prev'),
    'channel-b',
  );
});
