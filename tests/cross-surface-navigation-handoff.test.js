import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrossSurfaceNavigationMatchPath,
  clearCrossSurfaceNavigationHandoff,
  consumeCrossSurfaceNavigationHandoff,
  isImplementedCrossSurfaceNavigationHandoffKind,
  matchesCrossSurfaceNavigationHandoff,
  peekCrossSurfaceNavigationHandoff,
  peekCrossSurfaceNavigationHandoffForMatch,
  peekCrossSurfaceNavigationSnapshot,
  stageCrossSurfaceNavigationHandoff,
} from '../src/products/shared/renderer/crossSurfaceNavigationHandoff.ts';

test('handoff kind guard keeps the first slice navigation-shaped', () => {
  assert.equal(isImplementedCrossSurfaceNavigationHandoffKind('draft-create-channel'), true);
  assert.equal(
    isImplementedCrossSurfaceNavigationHandoffKind('draft-create-parallel-group'),
    true,
  );
  assert.equal(isImplementedCrossSurfaceNavigationHandoffKind('navigate-artifact'), false);
});

test('cross-surface handoff store only consumes a matching target surface route', () => {
  clearCrossSurfaceNavigationHandoff();
  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-1',
      route: {
        surface: 'code',
        path: ' /code/chats/channel-1 ',
      },
    },
    createdAt: '2026-04-20T10:00:00.000Z',
  });
  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'work',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-2',
      route: {
        surface: 'work',
        path: '/work/chats/channel-2/?b=2&a=1',
      },
    },
    createdAt: '2026-04-20T10:00:01.000Z',
  });

  const staged = peekCrossSurfaceNavigationHandoff();
  assert.ok(staged);
  assert.equal(staged.destination.entityId, 'channel-2');
  assert.equal(
    matchesCrossSurfaceNavigationHandoff(staged, {
      surface: 'work',
      path: '/work/chats/channel-2/?a=1&b=2',
    }),
    true,
  );
  assert.equal(
    (() => {
      const originalWarn = console.warn;
      try {
        console.warn = () => {};
        return consumeCrossSurfaceNavigationHandoff({
          surface: 'chat',
          path: '/chat/chats/channel-1',
        });
      } finally {
        console.warn = originalWarn;
      }
    })(),
    null,
  );
  assert.ok(
    consumeCrossSurfaceNavigationHandoff({
      surface: 'code',
      path: '/code/chats/channel-1',
    }),
  );
  assert.ok(
    consumeCrossSurfaceNavigationHandoff({
      surface: 'work',
      path: '/work/chats/channel-2?a=1&b=2',
    }),
  );
  assert.equal(peekCrossSurfaceNavigationHandoff(), null);
});

test('warm bootstrap can peek a matching snapshot before the mount-time consume', () => {
  clearCrossSurfaceNavigationHandoff();
  const snapshotPayload = {
    chat: {
      selectedChannelId: 'channel-42',
    },
  };
  const match = {
    surface: 'work',
    path: buildCrossSurfaceNavigationMatchPath('/work/chats/channel-42'),
  };

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'work',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-42',
      route: match,
    },
    createdAt: '2026-04-20T10:05:00.000Z',
    snapshot: {
      appShellPayload: snapshotPayload,
    },
  });

  assert.deepEqual(peekCrossSurfaceNavigationHandoffForMatch(match)?.snapshot?.appShellPayload, snapshotPayload);
  assert.deepEqual(peekCrossSurfaceNavigationSnapshot(match), snapshotPayload);
  assert.ok(consumeCrossSurfaceNavigationHandoff(match));
  assert.equal(peekCrossSurfaceNavigationHandoff(), null);
});

test('handoff store warns in development when a staged bundle misses the requested route', () => {
  clearCrossSurfaceNavigationHandoff();
  const originalWarn = console.warn;
  const warnings = [];

  try {
    console.warn = (...args) => warnings.push(args);
    stageCrossSurfaceNavigationHandoff({
      kind: 'draft-create-channel',
      sourceSurface: 'chat',
      targetSurface: 'code',
      destination: {
        entityKind: 'channel',
        entityId: 'channel-7',
        route: {
          surface: 'code',
          path: '/code/chats/channel-7',
        },
      },
      createdAt: '2026-04-20T10:10:00.000Z',
    });

    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-8',
      }),
      null,
    );
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /warm navigation handoff miss/u);
  } finally {
    console.warn = originalWarn;
    clearCrossSurfaceNavigationHandoff();
  }
});
