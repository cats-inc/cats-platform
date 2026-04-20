import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrossSurfaceChannelPath,
  buildCrossSurfaceNavigationPath,
  resolveCrossSurfaceNavigationPrefetchSurface,
  resolveCrossSurfaceNavigationRouteTarget,
} from '../src/products/shared/renderer/crossSurfaceNavigationRegistry.js';

test('cross-surface navigation registry builds channel routes per surface', () => {
  assert.equal(buildCrossSurfaceChannelPath('chat', 'channel-1'), '/chat/chats/channel-1');
  assert.equal(buildCrossSurfaceChannelPath('code', 'channel-1'), '/code/chats/channel-1');
  assert.equal(buildCrossSurfaceChannelPath('work', 'channel-1'), '/work/chats/channel-1');
});

test('parallel group handoff routes through the active member channel', () => {
  assert.equal(
    buildCrossSurfaceNavigationPath({
      surface: 'code',
      entityKind: 'parallel-group',
      entityId: 'group-1',
      activeChannelId: 'channel-2',
    }),
    '/code/chats/channel-2',
  );
  assert.deepEqual(
    resolveCrossSurfaceNavigationRouteTarget({
      surface: 'work',
      entityKind: 'channel',
      entityId: 'channel-9',
    }),
    { surface: 'work', path: '/work/chats/channel-9' },
  );
  assert.deepEqual(
    resolveCrossSurfaceNavigationRouteTarget({
      surface: 'code',
      entityKind: 'conversation',
      entityId: 'conversation-7',
    }),
    { surface: 'code', path: '/code/chats/conversation-7' },
  );
});

test('parallel group handoff rejects missing active member routes', () => {
  assert.throws(
    () => buildCrossSurfaceNavigationPath({
      surface: 'code',
      entityKind: 'parallel-group',
      entityId: 'group-1',
    }),
    /requires an active channel route target/u,
  );
});

test('registry keeps reserved entity kinds on the explicit throw path until they ship', () => {
  assert.throws(
    () => buildCrossSurfaceNavigationPath({
      surface: 'work',
      entityKind: 'artifact',
      entityId: 'artifact-1',
    }),
    /No cross-surface navigation path builder is registered for artifact/u,
  );
});

test('prefetch surface resolution accepts either a raw surface or a navigation target shape', () => {
  assert.equal(resolveCrossSurfaceNavigationPrefetchSurface('chat'), 'chat');
  assert.equal(
    resolveCrossSurfaceNavigationPrefetchSurface({
      surface: 'code',
    }),
    'code',
  );
  assert.equal(
    resolveCrossSurfaceNavigationPrefetchSurface({
      surface: 'work',
    }),
    'work',
  );
});
