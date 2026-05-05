import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeSettingsBackgroundRefreshPayload,
  shouldApplySettingsBackgroundRefresh,
} from '../src/app/renderer/settings/SettingsShell.tsx';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';

function createPayload(overrides: Record<string, unknown> = {}): AppShellPayload {
  return {
    ownerDisplayName: 'Current Owner',
    products: [{ id: 'chat', productName: 'Cats Chat' }],
    chat: {
      selectedChannelId: 'channel-current',
      channels: [{ id: 'channel-current' }],
    },
    runtime: {
      reachable: true,
      baseUrl: 'http://127.0.0.1:3110',
      status: 'ok',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      status: 'ready',
      bootstrapRequired: false,
    },
    metadata: {
      generatedAt: '2026-04-20T10:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: 'bootstrap-current',
    ...overrides,
  } as unknown as AppShellPayload;
}

test('settings background refresh keeps settings payload while updating runtime envelope', () => {
  const currentPayload = createPayload();
  const nextPayload = createPayload({
    ownerDisplayName: 'Stale Owner Snapshot',
    products: [{ id: 'code', productName: 'Cats Code' }],
    chat: {
      selectedChannelId: 'channel-stale',
      channels: [{ id: 'channel-stale' }],
    },
    runtime: {
      reachable: false,
      baseUrl: 'http://127.0.0.1:4222',
      status: 'degraded',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      status: 'attention',
      bootstrapRequired: true,
    },
    metadata: {
      generatedAt: '2026-04-20T10:10:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: 'bootstrap-next',
  });

  assert.equal(shouldApplySettingsBackgroundRefresh(currentPayload, nextPayload), true);

  const merged = mergeSettingsBackgroundRefreshPayload(currentPayload, nextPayload);
  assert.deepEqual(merged.runtime, nextPayload.runtime);
  assert.deepEqual(merged.runtimeSetup, nextPayload.runtimeSetup);
  assert.deepEqual(merged.metadata, nextPayload.metadata);
  assert.equal(merged.bootstrapAttemptId, 'bootstrap-next');
  assert.equal(merged.ownerDisplayName, 'Current Owner');
  assert.deepEqual(merged.products, currentPayload.products);
  assert.deepEqual(merged.chat, currentPayload.chat);
});

test('settings background refresh rejects stale envelopes', () => {
  const currentPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:10:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
  });
  const stalePayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T10:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
  });

  assert.equal(shouldApplySettingsBackgroundRefresh(currentPayload, stalePayload), false);
});
