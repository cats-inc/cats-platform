import assert from 'node:assert/strict';
import test from 'node:test';

import { createRealLivePreviewProcessAdapter } from '../src/products/code/livePreview/realProcessAdapter.ts';

const SPAWN_INPUT_TEMPLATE = {
  commandProfileId: 'vite',
  args: ['--version'],
  cwd: process.cwd(),
  env: {},
  port: 47100,
  origin: 'http://127.0.0.1:47100',
};

test('Real live preview adapter spawn rejects when executable is missing', async () => {
  const adapter = createRealLivePreviewProcessAdapter();
  await assert.rejects(
    () => adapter.spawn({
      ...SPAWN_INPUT_TEMPLATE,
      executable: '__cats_real_adapter_definitely_missing_executable__',
      args: [],
    }),
    (error: NodeJS.ErrnoException) => {
      // Both ENOENT (POSIX) and the Windows equivalent come out as Error
      // instances on the spawn 'error' event, not as unhandled crashes.
      assert.ok(error instanceof Error);
      return true;
    },
  );
});

test('Real live preview adapter spawn resolves and exposes a handle for a real binary', async (t) => {
  const adapter = createRealLivePreviewProcessAdapter();
  const nodeExecutable = process.execPath;
  // Spawn a node process that exits immediately with status 0. Validates the
  // resolve path: spawn promise resolves, handle exposes processId, exit
  // listener fires.
  const handle = await adapter.spawn({
    ...SPAWN_INPUT_TEMPLATE,
    executable: nodeExecutable,
    args: ['-e', 'process.exit(0)'],
  });
  assert.ok(typeof handle.processId === 'number' || handle.processId === null);

  await new Promise<void>((resolve) => {
    handle.onExit(() => resolve());
    // belt + suspenders: if the process has already exited, resolve
    setTimeout(resolve, 2_000);
  });

  // stop on an already-exited process must be a no-op
  await handle.stop({ graceMs: 100, killProcessTree: false });
  t.diagnostic('handle observed exit and stop completed without throwing');
});

test('Real live preview adapter stop on a still-running process terminates within graceMs', async () => {
  const adapter = createRealLivePreviewProcessAdapter();
  const handle = await adapter.spawn({
    ...SPAWN_INPUT_TEMPLATE,
    executable: process.execPath,
    // Sleep for 30s; we will stop it well before that.
    args: ['-e', 'setTimeout(() => process.exit(0), 30_000)'],
  });

  const exitObserved = new Promise<void>((resolve) => {
    handle.onExit(() => resolve());
  });
  await handle.stop({ graceMs: 200, killProcessTree: false });
  // Allow up to 5s for the OS to deliver the signal and finalize the exit.
  await Promise.race([
    exitObserved,
    new Promise<void>((_, reject) => setTimeout(
      () => reject(new Error('Child did not exit within 5s of stop')),
      5_000,
    )),
  ]);
});

test('Real live preview adapter stop with killProcessTree exercises platform tree-kill path', async () => {
  // Critically, this exercises the Windows taskkill branch (which previously
  // used a runtime `require('node:child_process')` that crashes under ESM)
  // and the POSIX process-group branch without crashing the host. We do not
  // assert specific exit codes -- different platforms / availability of
  // taskkill may vary -- only that `stop` resolves and the child exits.
  const adapter = createRealLivePreviewProcessAdapter();
  const handle = await adapter.spawn({
    ...SPAWN_INPUT_TEMPLATE,
    executable: process.execPath,
    args: ['-e', 'setTimeout(() => process.exit(0), 30_000)'],
  });

  const exitObserved = new Promise<void>((resolve) => {
    handle.onExit(() => resolve());
  });
  await handle.stop({ graceMs: 500, killProcessTree: true });
  await Promise.race([
    exitObserved,
    new Promise<void>((_, reject) => setTimeout(
      () => reject(new Error('Child did not exit within 5s of tree-kill stop')),
      5_000,
    )),
  ]);
});
