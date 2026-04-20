import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CROSS_SURFACE_NAVIGATION_HANDOFF_TTL_MS,
  buildCrossSurfaceNavigationMatchPath,
  clearCrossSurfaceNavigationHandoff,
  consumeCrossSurfaceNavigationHandoff,
  isImplementedCrossSurfaceNavigationHandoffKind,
  matchesCrossSurfaceNavigationHandoff,
  peekLatestStagedCrossSurfaceNavigationHandoff,
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
        path: '/work/chats/channel-2?b=2&a=1',
      },
    },
    createdAt: '2026-04-20T10:00:01.000Z',
  });

  const staged = peekLatestStagedCrossSurfaceNavigationHandoff();
  assert.ok(staged);
  assert.equal(staged.destination.entityId, 'channel-2');
  assert.equal(
    matchesCrossSurfaceNavigationHandoff(staged, {
      surface: 'work',
      path: '/work/chats/channel-2?a=1&b=2',
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
  assert.equal(peekLatestStagedCrossSurfaceNavigationHandoff(), null);
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
  assert.equal(peekLatestStagedCrossSurfaceNavigationHandoff(), null);
});

test('peek helpers stay side-effect free when another staged target does not match', () => {
  clearCrossSurfaceNavigationHandoff();
  const warnings = [];
  const originalWarn = console.warn;

  try {
    console.warn = (...args) => warnings.push(args);
    stageCrossSurfaceNavigationHandoff({
      kind: 'draft-create-channel',
      sourceSurface: 'chat',
      targetSurface: 'code',
      destination: {
        entityKind: 'channel',
        entityId: 'channel-99',
        route: {
          surface: 'code',
          path: '/code/chats/channel-99',
        },
      },
      createdAt: '2026-04-20T10:06:00.000Z',
    });

    assert.equal(
      peekCrossSurfaceNavigationHandoffForMatch({
        surface: 'work',
        path: '/work/chats/channel-99',
      }),
      null,
    );
    assert.equal(warnings.length, 0);
  } finally {
    console.warn = originalWarn;
    clearCrossSurfaceNavigationHandoff();
  }
});

test('stale handoff bundles expire instead of warming an unrelated future mount', () => {
  clearCrossSurfaceNavigationHandoff();
  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-stale',
      route: {
        surface: 'code',
        path: '/code/chats/channel-stale',
      },
    },
    createdAt: new Date(Date.now() - CROSS_SURFACE_NAVIGATION_HANDOFF_TTL_MS - 1_000).toISOString(),
  });

  assert.equal(peekLatestStagedCrossSurfaceNavigationHandoff(), null);
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-stale',
      }),
      null,
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('trailing slash stays part of the normalized route identity', () => {
  clearCrossSurfaceNavigationHandoff();
  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-slash',
      route: {
        surface: 'code',
        path: '/code/chats/channel-slash/',
      },
    },
    createdAt: '2026-04-20T10:07:00.000Z',
  });

  assert.equal(
    peekCrossSurfaceNavigationHandoffForMatch({
      surface: 'code',
      path: '/code/chats/channel-slash',
    }),
    null,
  );
  assert.ok(
    peekCrossSurfaceNavigationHandoffForMatch({
      surface: 'code',
      path: '/code/chats/channel-slash/',
    }),
  );
});

test('mismatched staged bundle metadata is rejected even when the keyed route hits', () => {
  clearCrossSurfaceNavigationHandoff();
  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'work',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-invalid',
      route: {
        surface: 'code',
        path: '/code/chats/channel-invalid',
      },
    },
    createdAt: '2026-04-20T10:08:00.000Z',
  });

  assert.equal(
    peekCrossSurfaceNavigationHandoffForMatch({
      surface: 'code',
      path: '/code/chats/channel-invalid',
    }),
    null,
  );
  assert.equal(peekLatestStagedCrossSurfaceNavigationHandoff(), null);
});

test('handoff store warns once per staged miss fingerprint in development', () => {
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
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-8',
      }),
      null,
    );
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /no staged warm navigation handoff matched/u);
  } finally {
    console.warn = originalWarn;
    clearCrossSurfaceNavigationHandoff();
  }
});
