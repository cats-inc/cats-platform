import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWorkspaceBackgroundRefresh,
  mergeWorkspaceBackgroundRefreshPayload,
  resolveInitialWorkspaceWarmNavigationPayload,
  runWorkspaceInitialAppShellLoad,
  shouldApplyWorkspaceBackgroundRefresh,
} from '../src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts';

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    runtime: {
      reachable: true,
      baseUrl: 'http://127.0.0.1:3110',
      status: 'ok',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      required: false,
      guideCat: null,
    },
    metadata: {
      generatedAt: '2026-04-20T10:00:00.000Z',
      requestId: 'request-current',
      version: 'test',
    },
    bootstrapAttemptId: 'bootstrap-current',
    chat: {
      channels: [{ id: 'channel-current', roomMode: 'boss_chat', channelKind: 'boss_thread' }],
      cats: [{ id: 'cat-current', status: 'active' }],
      selectedChannelId: 'channel-current',
    },
    ...overrides,
  };
}

test('resolveInitialWorkspaceWarmNavigationPayload skips consume when the route already mounted ready', () => {
  let calls = 0;
  const warmPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:05:00.000Z',
      requestId: 'request-warm',
      version: 'test',
    },
  });
  const consumeWarmPayload = (match: { surface: string; path: string }) => {
    calls += 1;
    assert.deepEqual(match, {
      surface: 'code',
      path: '/code/chats/channel-ready',
    });
    return warmPayload;
  };

  assert.equal(
    resolveInitialWorkspaceWarmNavigationPayload({
      initialHadReadyState: true,
      match: {
        surface: 'code',
        path: '/code/chats/channel-ready',
      },
      consumeWarmPayload,
    }),
    null,
  );
  assert.equal(calls, 0);

  assert.equal(
    resolveInitialWorkspaceWarmNavigationPayload({
      initialHadReadyState: false,
      match: {
        surface: 'code',
        path: '/code/chats/channel-ready',
      },
      consumeWarmPayload,
    }),
    warmPayload,
  );
  assert.equal(calls, 1);
});

test('workspace background refresh keeps chat state while updating runtime envelope fields', () => {
  const currentPayload = createPayload();
  const nextPayload = createPayload({
    runtime: {
      reachable: false,
      baseUrl: 'http://127.0.0.1:4222',
      status: 'degraded',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      required: true,
      guideCat: { id: 'guide-1' },
    },
    metadata: {
      generatedAt: '2026-04-20T10:10:00.000Z',
      requestId: 'request-next',
      version: 'test',
    },
    bootstrapAttemptId: 'bootstrap-next',
    chat: {
      channels: [{ id: 'channel-overwrite', roomMode: 'direct_cat_chat', channelKind: 'direct_lane' }],
      cats: [],
      selectedChannelId: 'channel-overwrite',
    },
  });

  assert.equal(shouldApplyWorkspaceBackgroundRefresh(currentPayload, nextPayload), true);

  const merged = mergeWorkspaceBackgroundRefreshPayload(currentPayload, nextPayload);
  assert.deepEqual(merged.runtime, nextPayload.runtime);
  assert.deepEqual(merged.runtimeSetup, nextPayload.runtimeSetup);
  assert.deepEqual(merged.metadata, nextPayload.metadata);
  assert.equal(merged.bootstrapAttemptId, 'bootstrap-next');
  assert.deepEqual(merged.chat, currentPayload.chat);

  const nextState = applyWorkspaceBackgroundRefresh(
    { status: 'ready', payload: currentPayload },
    nextPayload,
  );
  assert.deepEqual(nextState, {
    status: 'ready',
    payload: merged,
  });
});

test('workspace background refresh ignores stale envelopes and non-ready states', () => {
  const currentPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:10:00.000Z',
      requestId: 'request-current',
      version: 'test',
    },
  });
  const stalePayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:00:00.000Z',
      requestId: 'request-stale',
      version: 'test',
    },
  });

  assert.equal(shouldApplyWorkspaceBackgroundRefresh(currentPayload, stalePayload), false);
  assert.deepEqual(
    applyWorkspaceBackgroundRefresh(
      { status: 'ready', payload: currentPayload },
      stalePayload,
    ),
    { status: 'ready', payload: currentPayload },
  );
  assert.deepEqual(
    applyWorkspaceBackgroundRefresh(
      { status: 'loading' },
      stalePayload,
    ),
    { status: 'loading' },
  );
});

test('runWorkspaceInitialAppShellLoad publishes warm payload first and then the fetched payload', async () => {
  const readyPayloads: Array<ReturnType<typeof createPayload>> = [];
  const errors: string[] = [];
  const warmPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:05:00.000Z',
      requestId: 'request-warm',
      version: 'test',
    },
  });
  const fetchedPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:10:00.000Z',
      requestId: 'request-fetched',
      version: 'test',
    },
  });
  const controller = new AbortController();

  await runWorkspaceInitialAppShellLoad({
    initialHadReadyState: false,
    match: {
      surface: 'code',
      path: '/code/chats/channel-ready',
    },
    signal: controller.signal,
    consumeWarmPayload: () => warmPayload,
    fetchAppShell: async () => fetchedPayload,
    onReady: (payload) => {
      readyPayloads.push(payload);
    },
    onError: (message) => {
      errors.push(message);
    },
  });

  assert.deepEqual(readyPayloads, [warmPayload, fetchedPayload]);
  assert.deepEqual(errors, []);
});

test('runWorkspaceInitialAppShellLoad suppresses fetch errors after a warm payload hydrated the route', async () => {
  const readyPayloads: Array<ReturnType<typeof createPayload>> = [];
  const errors: string[] = [];
  const warmPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:05:00.000Z',
      requestId: 'request-warm',
      version: 'test',
    },
  });
  const controller = new AbortController();

  await runWorkspaceInitialAppShellLoad({
    initialHadReadyState: false,
    match: {
      surface: 'code',
      path: '/code/chats/channel-ready',
    },
    signal: controller.signal,
    consumeWarmPayload: () => warmPayload,
    fetchAppShell: async () => {
      throw new Error('network timeout');
    },
    onReady: (payload) => {
      readyPayloads.push(payload);
    },
    onError: (message) => {
      errors.push(message);
    },
  });

  assert.deepEqual(readyPayloads, [warmPayload]);
  assert.deepEqual(errors, []);
});

test('runWorkspaceInitialAppShellLoad reports fetch failures only when the route did not already hydrate', async () => {
  const controller = new AbortController();
  const readyPayloads: Array<ReturnType<typeof createPayload>> = [];
  const errors: string[] = [];

  await runWorkspaceInitialAppShellLoad({
    initialHadReadyState: false,
    match: {
      surface: 'work',
      path: '/work/chats/channel-ready',
    },
    signal: controller.signal,
    fetchAppShell: async () => {
      throw new Error('backend unavailable');
    },
    onReady: (payload) => {
      readyPayloads.push(payload);
    },
    onError: (message) => {
      errors.push(message);
    },
  });

  assert.deepEqual(readyPayloads, []);
  assert.deepEqual(errors, ['backend unavailable']);
});

test('runWorkspaceInitialAppShellLoad ignores aborted fetch completions and failures', async () => {
  const controller = new AbortController();
  const readyPayloads: Array<ReturnType<typeof createPayload>> = [];
  const errors: string[] = [];
  const deferred = Promise.withResolvers<ReturnType<typeof createPayload>>();
  const loadPromise = runWorkspaceInitialAppShellLoad({
    initialHadReadyState: false,
    match: {
      surface: 'work',
      path: '/work/chats/channel-ready',
    },
    signal: controller.signal,
    fetchAppShell: async () => deferred.promise,
    onReady: (payload) => {
      readyPayloads.push(payload);
    },
    onError: (message) => {
      errors.push(message);
    },
  });

  controller.abort();
  deferred.resolve(createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:15:00.000Z',
      requestId: 'request-late',
      version: 'test',
    },
  }));
  await loadPromise;

  await runWorkspaceInitialAppShellLoad({
    initialHadReadyState: false,
    match: {
      surface: 'work',
      path: '/work/chats/channel-ready',
    },
    signal: AbortSignal.abort(),
    fetchAppShell: async () => {
      throw new Error('aborted late');
    },
    onReady: (payload) => {
      readyPayloads.push(payload);
    },
    onError: (message) => {
      errors.push(message);
    },
  });

  assert.deepEqual(readyPayloads, []);
  assert.deepEqual(errors, []);
});
