import assert from 'node:assert/strict';
import test from 'node:test';

import { resetDesktopHostWindowPlacement } from '../src/app/renderer/setup/desktopHostBridge.ts';

async function withWindow(value: object | undefined, run: () => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: value ?? {} });
  try {
    await run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('Reset Platform data asks the Desktop host to restore the default window placement', async () => {
  let calls = 0;
  await withWindow({ catsDesktopHost: { resetWindowPlacement: async () => { calls += 1; } } }, async () => {
    await resetDesktopHostWindowPlacement();
  });
  assert.equal(calls, 1);
});

test('window placement reset is a no-op outside Desktop and never fails the data reset', async () => {
  await withWindow(undefined, async () => {
    await resetDesktopHostWindowPlacement();
  });
  await withWindow({ catsDesktopHost: {} }, async () => {
    await resetDesktopHostWindowPlacement();
  });
  await withWindow({
    catsDesktopHost: { resetWindowPlacement: async () => { throw new Error('not the main window'); } },
  }, async () => {
    await assert.doesNotReject(resetDesktopHostWindowPlacement());
  });
});
