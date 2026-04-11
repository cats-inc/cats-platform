import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEventDrivenAppShellRefresher,
  shouldApplyRefreshedAppShell,
  type EventDrivenAppShellRefresherState,
} from '../src/products/chat/renderer/hooks/useChatAppShellRefresh.js';

async function waitForCondition(
  predicate: () => boolean,
  attempts = 20,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for condition.');
}

test('shouldApplyRefreshedAppShell ignores stale event refresh payloads', () => {
  assert.equal(
    shouldApplyRefreshedAppShell(
      '2026-04-12T08:00:05.000Z',
      '2026-04-12T08:00:04.000Z',
    ),
    false,
  );
});

test('shouldApplyRefreshedAppShell accepts newer and equal payload timestamps', () => {
  assert.equal(
    shouldApplyRefreshedAppShell(
      '2026-04-12T08:00:05.000Z',
      '2026-04-12T08:00:05.000Z',
    ),
    true,
  );
  assert.equal(
    shouldApplyRefreshedAppShell(
      '2026-04-12T08:00:05.000Z',
      '2026-04-12T08:00:06.000Z',
    ),
    true,
  );
});

test('shouldApplyRefreshedAppShell stays permissive when either timestamp is missing', () => {
  assert.equal(shouldApplyRefreshedAppShell(null, '2026-04-12T08:00:06.000Z'), true);
  assert.equal(shouldApplyRefreshedAppShell('2026-04-12T08:00:05.000Z', null), true);
});

test('createEventDrivenAppShellRefresher coalesces burst refresh requests instead of aborting them', {
  concurrency: false,
}, async () => {
  const refreshState: EventDrivenAppShellRefresherState = {
    controller: null,
    inFlight: false,
    queued: false,
    disposed: false,
  };
  const starts: string[] = [];
  const applied: string[] = [];
  const pendingResolvers = new Map<string, (payload: { metadata: { generatedAt: string } }) => void>();
  let notifyNextApply: (() => void) | null = null;
  const waitForApply = () => new Promise<void>((resolve) => {
    notifyNextApply = resolve;
  });

  const requestRefresh = createEventDrivenAppShellRefresher(
    refreshState,
    async () => {
      const label = `fetch-${starts.length + 1}`;
      starts.push(label);
      return new Promise((resolve) => {
        pendingResolvers.set(label, resolve);
      });
    },
    () => applied.at(-1) ?? null,
    (payload) => {
      applied.push(payload.metadata.generatedAt);
      notifyNextApply?.();
      notifyNextApply = null;
    },
  );

  requestRefresh();
  requestRefresh();
  requestRefresh();

  assert.deepEqual(starts, ['fetch-1']);
  assert.equal(refreshState.inFlight, true);
  assert.equal(refreshState.queued, true);

  const firstApply = waitForApply();
  pendingResolvers.get('fetch-1')?.({
    metadata: {
      generatedAt: '2026-04-12T08:00:05.000Z',
    },
  });
  await firstApply;
  await waitForCondition(() => starts.length === 2);

  assert.deepEqual(applied, ['2026-04-12T08:00:05.000Z']);
  assert.deepEqual(starts, ['fetch-1', 'fetch-2']);
  assert.equal(refreshState.inFlight, true);

  const secondApply = waitForApply();
  pendingResolvers.get('fetch-2')?.({
    metadata: {
      generatedAt: '2026-04-12T08:00:06.000Z',
    },
  });
  await secondApply;
  await waitForCondition(() => !refreshState.inFlight && refreshState.controller === null);

  assert.deepEqual(applied, [
    '2026-04-12T08:00:05.000Z',
    '2026-04-12T08:00:06.000Z',
  ]);
});

test('createEventDrivenAppShellRefresher ignores stale queued payloads', {
  concurrency: false,
}, async () => {
  const refreshState: EventDrivenAppShellRefresherState = {
    controller: null,
    inFlight: false,
    queued: false,
    disposed: false,
  };
  let currentGeneratedAt: string | null = '2026-04-12T08:00:06.000Z';
  const applied: string[] = [];
  const pendingResolvers: Array<(payload: { metadata: { generatedAt: string } }) => void> = [];
  let notifyNextApply: (() => void) | null = null;
  const waitForApply = () => new Promise<void>((resolve) => {
    notifyNextApply = resolve;
  });

  const requestRefresh = createEventDrivenAppShellRefresher(
    refreshState,
    async () => new Promise((resolve) => {
      pendingResolvers.push(resolve);
    }),
    () => currentGeneratedAt,
    (payload) => {
      currentGeneratedAt = payload.metadata.generatedAt;
      applied.push(payload.metadata.generatedAt);
      notifyNextApply?.();
      notifyNextApply = null;
    },
  );

  requestRefresh();
  requestRefresh();

  pendingResolvers[0]?.({
    metadata: {
      generatedAt: '2026-04-12T08:00:05.000Z',
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const nextApply = waitForApply();
  pendingResolvers[1]?.({
    metadata: {
      generatedAt: '2026-04-12T08:00:07.000Z',
    },
  });
  await nextApply;

  assert.deepEqual(applied, ['2026-04-12T08:00:07.000Z']);
});
