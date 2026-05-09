import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LIVE_PREVIEW_CONFIG } from '../src/products/code/livePreview/contracts.ts';
import {
  createInertLivePreviewProcessAdapter,
  selectLivePreviewProcessAdapter,
} from '../src/products/code/livePreview/processAdapterFactory.ts';
import { validateLivePreviewConfig } from '../src/products/code/livePreview/profileValidation.ts';

const SPAWN_INPUT = {
  commandProfileId: 'vite',
  executable: 'npx',
  args: ['vite'],
  cwd: 'C:/temp',
  env: {},
  port: 47100,
  origin: 'http://127.0.0.1:47100',
};

test('Inert live preview process adapter refuses to spawn', async () => {
  const adapter = createInertLivePreviewProcessAdapter();
  await assert.rejects(
    () => adapter.spawn(SPAWN_INPUT),
    /Live preview process spawning is disabled/u,
  );
});

test('selectLivePreviewProcessAdapter returns inert adapter when feature is disabled', async () => {
  const adapter = selectLivePreviewProcessAdapter(DEFAULT_LIVE_PREVIEW_CONFIG);
  await assert.rejects(
    () => adapter.spawn(SPAWN_INPUT),
    /Live preview process spawning is disabled/u,
  );
});

test('selectLivePreviewProcessAdapter returns inert adapter when only enabled is true', async () => {
  const adapter = selectLivePreviewProcessAdapter({
    enabled: true,
    useRealProcessAdapter: false,
  });
  await assert.rejects(
    () => adapter.spawn(SPAWN_INPUT),
    /Live preview process spawning is disabled/u,
  );
});

test('selectLivePreviewProcessAdapter returns real adapter only when both flags are true', () => {
  const adapter = selectLivePreviewProcessAdapter({
    enabled: true,
    useRealProcessAdapter: true,
  });
  // Real adapter cannot be assert.rejects-ed without actually spawning, so
  // verify it is not the same object as the inert adapter and has a spawn
  // method.
  assert.notEqual(adapter, createInertLivePreviewProcessAdapter());
  assert.equal(typeof adapter.spawn, 'function');
});

test('validateLivePreviewConfig accepts useRealProcessAdapter as a boolean', () => {
  assert.doesNotThrow(() =>
    validateLivePreviewConfig({
      ...DEFAULT_LIVE_PREVIEW_CONFIG,
      useRealProcessAdapter: true,
    }));
  assert.doesNotThrow(() =>
    validateLivePreviewConfig({
      ...DEFAULT_LIVE_PREVIEW_CONFIG,
      useRealProcessAdapter: false,
    }));
});

test('validateLivePreviewConfig rejects non-boolean useRealProcessAdapter', () => {
  assert.throws(
    () =>
      validateLivePreviewConfig({
        ...DEFAULT_LIVE_PREVIEW_CONFIG,
        useRealProcessAdapter: 'yes' as unknown as boolean,
      }),
    /useRealProcessAdapter must be a boolean/u,
  );
});
