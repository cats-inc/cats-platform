import assert from 'node:assert/strict';
import test from 'node:test';

import { canResetDesktopRuntimeData, prepareDesktopDataReset, completeDesktopDataReset,
  resetDesktopHostWindowPlacement } from '../src/app/renderer/setup/desktopHostBridge.ts';

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

test('Runtime reset requires both Desktop stages and forwards no arbitrary paths or commands', async () => {
  await withWindow(undefined, async () => {
    assert.equal(canResetDesktopRuntimeData(), false);
    await assert.rejects(prepareDesktopDataReset(), /requires Cats Desktop/);
    await assert.rejects(completeDesktopDataReset(), /requires Cats Desktop/);
  });
  const calls: string[] = [];
  await withWindow({ catsDesktopHost: {
    prepareDataReset: async (...args: unknown[]) => { assert.deepEqual(args, []); calls.push('prepare'); },
    completeDataReset: async (...args: unknown[]) => { assert.deepEqual(args, []); calls.push('complete'); },
  } }, async () => {
    assert.equal(canResetDesktopRuntimeData(), true);
    await prepareDesktopDataReset(); await completeDesktopDataReset();
  });
  assert.deepEqual(calls, ['prepare', 'complete']);
});
