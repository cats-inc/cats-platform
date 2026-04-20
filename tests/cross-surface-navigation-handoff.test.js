import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CROSS_SURFACE_NAVIGATION_HANDOFF_TTL_MS,
  buildCrossSurfaceNavigationMatchPath,
  clearCrossSurfaceNavigationHandoff,
  consumeCrossSurfaceNavigationHandoff,
  inspectCrossSurfaceNavigationHandoffTelemetry,
  inspectLatestStagedCrossSurfaceNavigationHandoff,
  isImplementedCrossSurfaceNavigationHandoffKind,
  matchesCrossSurfaceNavigationHandoff,
  peekCrossSurfaceNavigationHandoffForMatch,
  peekCrossSurfaceNavigationSnapshot,
  resetCrossSurfaceNavigationHandoffTelemetry,
  setCrossSurfaceNavigationHandoffObserver,
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
    createdAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
  });

  const staged = inspectLatestStagedCrossSurfaceNavigationHandoff();
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
  assert.equal(inspectLatestStagedCrossSurfaceNavigationHandoff(), null);
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
    createdAt: new Date().toISOString(),
    snapshot: {
      appShellPayload: snapshotPayload,
    },
  });

  assert.deepEqual(peekCrossSurfaceNavigationHandoffForMatch(match)?.snapshot?.appShellPayload, snapshotPayload);
  assert.deepEqual(peekCrossSurfaceNavigationSnapshot(match), snapshotPayload);
  assert.ok(consumeCrossSurfaceNavigationHandoff(match));
  assert.equal(inspectLatestStagedCrossSurfaceNavigationHandoff(), null);
});

test('conversation-shaped handoff bundles round-trip through the generic warm-navigation store', () => {
  clearCrossSurfaceNavigationHandoff();
  const snapshotPayload = {
    chat: {
      selectedChannelId: 'conversation-99',
    },
  };
  const match = {
    surface: 'work',
    path: buildCrossSurfaceNavigationMatchPath('/work/chats/conversation-99'),
  };

  stageCrossSurfaceNavigationHandoff({
    kind: 'navigate-conversation',
    sourceSurface: 'code',
    targetSurface: 'work',
    destination: {
      entityKind: 'conversation',
      entityId: 'conversation-99',
      route: match,
    },
    createdAt: new Date().toISOString(),
    snapshot: {
      appShellPayload: snapshotPayload,
    },
  });

  assert.deepEqual(peekCrossSurfaceNavigationSnapshot(match), snapshotPayload);
  const consumed = consumeCrossSurfaceNavigationHandoff(match);
  assert.ok(consumed);
  assert.equal(consumed.kind, 'navigate-conversation');
  assert.equal(consumed.sourceSurface, 'code');
  assert.equal(consumed.targetSurface, 'work');
  assert.equal(consumed.destination.entityKind, 'conversation');
  assert.equal(consumed.destination.entityId, 'conversation-99');
  assert.deepEqual(consumed.snapshot?.appShellPayload, snapshotPayload);
});

test('targeted clear evicts only the matching staged route and keeps unrelated handoffs intact', () => {
  clearCrossSurfaceNavigationHandoff();

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-clear-a',
      route: {
        surface: 'code',
        path: '/code/chats/channel-clear-a',
      },
    },
    createdAt: new Date().toISOString(),
  });
  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-clear-b',
      route: {
        surface: 'code',
        path: '/code/chats/channel-clear-b',
      },
    },
    createdAt: new Date().toISOString(),
  });

  clearCrossSurfaceNavigationHandoff({
    surface: 'code',
    path: '/code/chats/channel-clear-a',
  });

  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-clear-a',
      }),
      null,
    );
  } finally {
    console.warn = originalWarn;
  }

  const remaining = consumeCrossSurfaceNavigationHandoff({
    surface: 'code',
    path: '/code/chats/channel-clear-b',
  });
  assert.ok(remaining);
  assert.equal(remaining.destination.entityId, 'channel-clear-b');
});

test('targeted clear updates active staged telemetry targets without resetting counters', () => {
  clearCrossSurfaceNavigationHandoff();
  resetCrossSurfaceNavigationHandoffTelemetry();

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'work',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-telemetry-a',
      route: {
        surface: 'work',
        path: '/work/chats/channel-telemetry-a',
      },
    },
    createdAt: new Date().toISOString(),
  });
  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'work',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-telemetry-b',
      route: {
        surface: 'work',
        path: '/work/chats/channel-telemetry-b',
      },
    },
    createdAt: new Date().toISOString(),
  });

  clearCrossSurfaceNavigationHandoff({
    surface: 'work',
    path: '/work/chats/channel-telemetry-a',
  });

  const telemetry = inspectCrossSurfaceNavigationHandoffTelemetry();
  assert.equal(telemetry.counters.stage, 2);
  assert.deepEqual(
    telemetry.activeStagedTargets.map((target) => target.entityId),
    ['channel-telemetry-b'],
  );
});

test('peek does not evict invalid or stale staged bundles; only consume does', () => {
  clearCrossSurfaceNavigationHandoff();
  const events = [];
  setCrossSurfaceNavigationHandoffObserver((event) => events.push(event));

  try {
    // Stage an invalid bundle: keyed under /code/... but targetSurface='work'.
    // The key-lookup hits, but matches*() returns false.
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
      createdAt: new Date().toISOString(),
    });

    // Pure peek: returns null, emits no events, does not evict the bundle.
    assert.equal(
      peekCrossSurfaceNavigationHandoffForMatch({
        surface: 'code',
        path: '/code/chats/channel-invalid',
      }),
      null,
    );

    // If peek had evicted, the subsequent consume would see 'missing'. It
    // should instead still detect the invalid bundle and emit 'miss:invalid'.
    const originalWarn = console.warn;
    try {
      console.warn = () => {};
      assert.equal(
        consumeCrossSurfaceNavigationHandoff({
          surface: 'code',
          path: '/code/chats/channel-invalid',
        }),
        null,
      );
    } finally {
      console.warn = originalWarn;
    }

    // Observer trace: one stage event + one miss:invalid (NOT miss:missing).
    const observedTrace = events.map((event) =>
      event.kind === 'miss' ? `${event.kind}:${event.reason}` : event.kind,
    );
    assert.deepEqual(observedTrace, ['stage', 'miss:invalid']);
  } finally {
    setCrossSurfaceNavigationHandoffObserver(null);
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

  assert.equal(inspectLatestStagedCrossSurfaceNavigationHandoff(), null);
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

test('malformed createdAt is treated as stale rather than lingering in the store', () => {
  clearCrossSurfaceNavigationHandoff();
  const events = [];
  setCrossSurfaceNavigationHandoffObserver((event) => events.push(event));

  try {
    stageCrossSurfaceNavigationHandoff({
      kind: 'draft-create-channel',
      sourceSurface: 'chat',
      targetSurface: 'code',
      destination: {
        entityKind: 'channel',
        entityId: 'channel-nan',
        route: {
          surface: 'code',
          path: '/code/chats/channel-nan',
        },
      },
      createdAt: 'not-a-real-timestamp',
    });

    const originalWarn = console.warn;
    try {
      console.warn = () => {};
      assert.equal(
        consumeCrossSurfaceNavigationHandoff({
          surface: 'code',
          path: '/code/chats/channel-nan',
        }),
        null,
      );
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(inspectLatestStagedCrossSurfaceNavigationHandoff(), null);
    const observedTrace = events.map((event) =>
      event.kind === 'miss' ? `${event.kind}:${event.reason}` : event.kind,
    );
    assert.deepEqual(observedTrace, ['stage', 'miss:stale']);
  } finally {
    setCrossSurfaceNavigationHandoffObserver(null);
    clearCrossSurfaceNavigationHandoff();
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
    createdAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
  });

  assert.equal(
    peekCrossSurfaceNavigationHandoffForMatch({
      surface: 'code',
      path: '/code/chats/channel-invalid',
    }),
    null,
  );
  // inspectLatest iterates + opportunistically GCs invalid entries, so the
  // store ends empty once a dev/test caller looks at it.
  assert.equal(inspectLatestStagedCrossSurfaceNavigationHandoff(), null);
});

test('non-chat source surfaces survive a stage -> consume round trip intact', () => {
  clearCrossSurfaceNavigationHandoff();
  const snapshotPayload = {
    chat: {
      selectedChannelId: 'channel-cross',
    },
  };
  const match = {
    surface: 'code',
    path: buildCrossSurfaceNavigationMatchPath('/code/chats/channel-cross'),
  };

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'work',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-cross',
      route: match,
    },
    createdAt: new Date().toISOString(),
    snapshot: {
      appShellPayload: snapshotPayload,
    },
  });

  const consumed = consumeCrossSurfaceNavigationHandoff(match);
  assert.ok(consumed);
  assert.equal(consumed.sourceSurface, 'work');
  assert.equal(consumed.targetSurface, 'code');
  assert.equal(consumed.destination.route.surface, 'code');
  assert.deepEqual(consumed.snapshot?.appShellPayload, snapshotPayload);
});

test('observer seam emits stage, hit, and miss-reason events for consume flows', () => {
  clearCrossSurfaceNavigationHandoff();
  const events = [];
  setCrossSurfaceNavigationHandoffObserver((event) => events.push(event));

  try {
    stageCrossSurfaceNavigationHandoff({
      kind: 'draft-create-channel',
      sourceSurface: 'chat',
      targetSurface: 'code',
      destination: {
        entityKind: 'channel',
        entityId: 'channel-observer',
        route: {
          surface: 'code',
          path: '/code/chats/channel-observer',
        },
      },
      createdAt: new Date().toISOString(),
    });

    // Pure peek should not emit.
    peekCrossSurfaceNavigationHandoffForMatch({
      surface: 'code',
      path: '/code/chats/channel-observer',
    });

    // A consume against an unrelated route while the store still holds the
    // staged bundle is a legitimate miss (user navigated away from the
    // intended target), so it emits 'miss:missing'.
    const originalWarn = console.warn;
    try {
      console.warn = () => {};
      assert.equal(
        consumeCrossSurfaceNavigationHandoff({
          surface: 'code',
          path: '/code/chats/channel-elsewhere',
        }),
        null,
      );
    } finally {
      console.warn = originalWarn;
    }

    // Successful consume emits 'hit'.
    assert.ok(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-observer',
      }),
    );

    const observedTrace = events.map((event) =>
      event.kind === 'miss' ? `${event.kind}:${event.reason}` : event.kind,
    );
    assert.deepEqual(observedTrace, ['stage', 'miss:missing', 'hit']);
  } finally {
    setCrossSurfaceNavigationHandoffObserver(null);
    clearCrossSurfaceNavigationHandoff();
  }
});

test('telemetry snapshot records stage, missing miss, and hit counters with latest route metadata', () => {
  clearCrossSurfaceNavigationHandoff();
  resetCrossSurfaceNavigationHandoffTelemetry();

  const match = {
    surface: 'code',
    path: '/code/chats/channel-telemetry?b=2&a=1',
  };

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-telemetry',
      route: match,
    },
    createdAt: new Date().toISOString(),
  });

  let telemetry = inspectCrossSurfaceNavigationHandoffTelemetry();
  assert.equal(telemetry.counters.stage, 1);
  assert.equal(telemetry.counters.hit, 0);
  assert.deepEqual(telemetry.counters.miss, { missing: 0, stale: 0, invalid: 0 });
  assert.deepEqual(telemetry.latestStage, {
    sourceSurface: 'chat',
    targetSurface: 'code',
    entityKind: 'channel',
    entityId: 'channel-telemetry',
    route: {
      surface: 'code',
      path: '/code/chats/channel-telemetry?a=1&b=2',
    },
  });
  assert.deepEqual(telemetry.activeStagedTargets, [telemetry.latestStage]);

  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-elsewhere',
      }),
      null,
    );
  } finally {
    console.warn = originalWarn;
  }

  telemetry = inspectCrossSurfaceNavigationHandoffTelemetry();
  assert.deepEqual(telemetry.counters.miss, { missing: 1, stale: 0, invalid: 0 });
  assert.deepEqual(telemetry.latestMiss, {
    match: {
      surface: 'code',
      path: '/code/chats/channel-elsewhere',
    },
    reason: 'missing',
  });
  assert.equal(telemetry.activeStagedTargets.length, 1);

  const consumed = consumeCrossSurfaceNavigationHandoff({
    surface: 'code',
    path: '/code/chats/channel-telemetry?a=1&b=2',
  });
  assert.ok(consumed);

  telemetry = inspectCrossSurfaceNavigationHandoffTelemetry();
  assert.equal(telemetry.counters.hit, 1);
  assert.deepEqual(telemetry.latestHit, {
    sourceSurface: 'chat',
    targetSurface: 'code',
    entityKind: 'channel',
    entityId: 'channel-telemetry',
    route: {
      surface: 'code',
      path: '/code/chats/channel-telemetry?a=1&b=2',
    },
    match: {
      surface: 'code',
      path: '/code/chats/channel-telemetry?a=1&b=2',
    },
  });
  assert.deepEqual(telemetry.activeStagedTargets, []);
});

test('telemetry stays cold on empty-store consume and tracks stale misses separately', () => {
  clearCrossSurfaceNavigationHandoff();
  resetCrossSurfaceNavigationHandoffTelemetry();

  assert.equal(
    consumeCrossSurfaceNavigationHandoff({
      surface: 'chat',
      path: '/chat/chats/channel-cold-start',
    }),
    null,
  );
  let telemetry = inspectCrossSurfaceNavigationHandoffTelemetry();
  assert.equal(telemetry.counters.stage, 0);
  assert.equal(telemetry.counters.hit, 0);
  assert.deepEqual(telemetry.counters.miss, { missing: 0, stale: 0, invalid: 0 });
  assert.equal(telemetry.latestMiss, null);

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-stale-telemetry',
      route: {
        surface: 'code',
        path: '/code/chats/channel-stale-telemetry',
      },
    },
    createdAt: new Date(Date.now() - CROSS_SURFACE_NAVIGATION_HANDOFF_TTL_MS - 1_000).toISOString(),
  });

  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-stale-telemetry',
      }),
      null,
    );
  } finally {
    console.warn = originalWarn;
  }

  telemetry = inspectCrossSurfaceNavigationHandoffTelemetry();
  assert.equal(telemetry.counters.stage, 1);
  assert.equal(telemetry.counters.hit, 0);
  assert.deepEqual(telemetry.counters.miss, { missing: 0, stale: 1, invalid: 0 });
  assert.deepEqual(telemetry.latestMiss, {
    match: {
      surface: 'code',
      path: '/code/chats/channel-stale-telemetry',
    },
    reason: 'stale',
  });
  assert.deepEqual(telemetry.activeStagedTargets, []);
});

test('browser debug global mirrors the latest warm navigation telemetry snapshot', () => {
  clearCrossSurfaceNavigationHandoff();
  resetCrossSurfaceNavigationHandoffTelemetry();

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-browser-debug',
      route: {
        surface: 'code',
        path: '/code/chats/channel-browser-debug',
      },
    },
    createdAt: new Date().toISOString(),
  });

  const browserTelemetry = globalThis.__catsCrossSurfaceNavigationHandoffTelemetry;
  assert.ok(browserTelemetry && typeof browserTelemetry === 'object');
  assert.equal(browserTelemetry.counters.stage, 1);
  assert.equal(browserTelemetry.latestStage?.entityId, 'channel-browser-debug');

  resetCrossSurfaceNavigationHandoffTelemetry();
  const resetTelemetry = globalThis.__catsCrossSurfaceNavigationHandoffTelemetry;
  assert.equal(resetTelemetry.counters.stage, 0);
  assert.equal(resetTelemetry.latestStage, null);
});

test('cold boot consume on an empty store is silent and does not pollute telemetry', () => {
  clearCrossSurfaceNavigationHandoff();
  const events = [];
  const warnings = [];
  const originalWarn = console.warn;

  try {
    console.warn = (...args) => warnings.push(args);
    setCrossSurfaceNavigationHandoffObserver((event) => events.push(event));

    // Emulate a normal app launch: no warm handoff was ever staged, and the
    // product mount hook still calls consume on first render.
    assert.equal(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'chat',
        path: '/chat/chats/channel-cold-boot',
      }),
      null,
    );

    assert.deepEqual(events, []);
    assert.equal(warnings.length, 0);
  } finally {
    setCrossSurfaceNavigationHandoffObserver(null);
    console.warn = originalWarn;
    clearCrossSurfaceNavigationHandoff();
  }
});

test('observer receives defensive clones; mutating an event does not corrupt the store', () => {
  clearCrossSurfaceNavigationHandoff();
  setCrossSurfaceNavigationHandoffObserver((event) => {
    if (event.kind === 'stage' || event.kind === 'hit') {
      // A misbehaving observer tries to tamper with the live bundle.
      event.bundle.destination.route.path = '/tampered';
      event.bundle.destination.entityId = 'tampered';
      if (event.bundle.snapshot?.appShellPayload) {
        event.bundle.snapshot.appShellPayload = {};
      }
    }
  });

  try {
    const snapshotPayload = {
      chat: {
        selectedChannelId: 'channel-clone',
      },
    };
    const originalRoute = {
      surface: 'code',
      path: '/code/chats/channel-clone',
    };
    stageCrossSurfaceNavigationHandoff({
      kind: 'draft-create-channel',
      sourceSurface: 'chat',
      targetSurface: 'code',
      destination: {
        entityKind: 'channel',
        entityId: 'channel-clone',
        route: originalRoute,
      },
      createdAt: new Date().toISOString(),
      snapshot: {
        appShellPayload: snapshotPayload,
      },
    });

    // Observer mutation of the stage-event bundle must not reach the store:
    // consume with the original route still hits.
    const consumed = consumeCrossSurfaceNavigationHandoff(originalRoute);
    assert.ok(consumed);
    assert.equal(consumed.destination.entityId, 'channel-clone');
    assert.equal(consumed.destination.route.path, '/code/chats/channel-clone');
    assert.deepEqual(consumed.snapshot?.appShellPayload, snapshotPayload);
  } finally {
    setCrossSurfaceNavigationHandoffObserver(null);
    clearCrossSurfaceNavigationHandoff();
  }
});

test('emit is zero-cost when no observer is registered (no eager structuredClone)', () => {
  clearCrossSurfaceNavigationHandoff();
  setCrossSurfaceNavigationHandoffObserver(null);

  // A bare function is one of the payload shapes `structuredClone` cannot
  // handle: it would throw `DataCloneError` the moment clone runs. If the
  // emit path cloned eagerly at the call site, this stage would blow up
  // during the call even though nobody is listening. With the lazy-clone
  // fix, stage and consume skip the clone entirely while no observer is
  // registered, and both succeed.
  const nonCloneableAppShell = {
    chat: { selectedChannelId: 'channel-zero-cost' },
    extra: () => 'structuredClone cannot serialize this',
  };
  const match = {
    surface: 'code',
    path: '/code/chats/channel-zero-cost',
  };

  stageCrossSurfaceNavigationHandoff({
    kind: 'draft-create-channel',
    sourceSurface: 'chat',
    targetSurface: 'code',
    destination: {
      entityKind: 'channel',
      entityId: 'channel-zero-cost',
      route: match,
    },
    createdAt: new Date().toISOString(),
    snapshot: {
      appShellPayload: nonCloneableAppShell,
    },
  });

  const consumed = consumeCrossSurfaceNavigationHandoff(match);
  assert.ok(consumed);
  assert.equal(consumed.snapshot?.appShellPayload, nonCloneableAppShell);
  clearCrossSurfaceNavigationHandoff();
});

test('observer clone failures are contained and do not break stage or consume', () => {
  clearCrossSurfaceNavigationHandoff();
  const events = [];
  setCrossSurfaceNavigationHandoffObserver((event) => events.push(event));

  try {
    const nonCloneableAppShell = {
      chat: { selectedChannelId: 'channel-clone-fail' },
      extra: () => 'boom',
    };
    const match = {
      surface: 'code',
      path: '/code/chats/channel-clone-fail',
    };

    // Stage should still succeed even though structuredClone will throw
    // inside the emit path — the try/catch inside emit must swallow it.
    stageCrossSurfaceNavigationHandoff({
      kind: 'draft-create-channel',
      sourceSurface: 'chat',
      targetSurface: 'code',
      destination: {
        entityKind: 'channel',
        entityId: 'channel-clone-fail',
        route: match,
      },
      createdAt: new Date().toISOString(),
      snapshot: {
        appShellPayload: nonCloneableAppShell,
      },
    });

    // Consume-hit should also tolerate the clone failure at emit time.
    const consumed = consumeCrossSurfaceNavigationHandoff(match);
    assert.ok(consumed);

    // Because clone failed inside the try/catch before the observer was
    // ever called, no stage or hit events reached the observer.
    assert.equal(events.length, 0);
  } finally {
    setCrossSurfaceNavigationHandoffObserver(null);
    clearCrossSurfaceNavigationHandoff();
  }
});

test('observer errors do not break the handoff seam', () => {
  clearCrossSurfaceNavigationHandoff();
  setCrossSurfaceNavigationHandoffObserver(() => {
    throw new Error('observer blew up');
  });

  try {
    // Stage + consume should still succeed even though the observer throws.
    stageCrossSurfaceNavigationHandoff({
      kind: 'draft-create-channel',
      sourceSurface: 'chat',
      targetSurface: 'code',
      destination: {
        entityKind: 'channel',
        entityId: 'channel-resilient',
        route: {
          surface: 'code',
          path: '/code/chats/channel-resilient',
        },
      },
      createdAt: new Date().toISOString(),
    });
    assert.ok(
      consumeCrossSurfaceNavigationHandoff({
        surface: 'code',
        path: '/code/chats/channel-resilient',
      }),
    );
  } finally {
    setCrossSurfaceNavigationHandoffObserver(null);
    clearCrossSurfaceNavigationHandoff();
  }
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
      createdAt: new Date().toISOString(),
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
