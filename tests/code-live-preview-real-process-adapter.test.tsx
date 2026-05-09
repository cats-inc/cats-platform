import assert from 'node:assert/strict';
import { spawn as spawnChildProcess, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
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

test('Real live preview adapter spawn resolves and onExit fires for the child', async (t) => {
  const adapter = createRealLivePreviewProcessAdapter();
  const nodeExecutable = process.execPath;
  // Spawn a node process that exits immediately with status 0. Validates the
  // resolve path: spawn promise resolves, handle exposes processId, exit
  // listener fires (no timeout fallback -- listener must actually be called).
  const handle = await adapter.spawn({
    ...SPAWN_INPUT_TEMPLATE,
    executable: nodeExecutable,
    args: ['-e', 'process.exit(0)'],
  });
  assert.ok(typeof handle.processId === 'number' || handle.processId === null);

  const exit = await new Promise<{ code: number | null; signal: string | null }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('onExit listener was not called within 5s'));
      }, 5_000);
      handle.onExit((event) => {
        clearTimeout(timeout);
        resolve(event);
      });
    },
  );
  assert.equal(exit.code, 0);

  // stop on an already-exited process must be a no-op
  await handle.stop({ graceMs: 100, killProcessTree: false });
  t.diagnostic('handle observed exit and stop completed without throwing');
});

test('Real live preview adapter onExit replays terminal event for late subscribers', async () => {
  const adapter = createRealLivePreviewProcessAdapter();
  const handle = await adapter.spawn({
    ...SPAWN_INPUT_TEMPLATE,
    executable: process.execPath,
    args: ['-e', 'process.exit(0)'],
  });
  // Wait long enough for the short-lived child to definitely exit before we
  // register an onExit listener. This is the production-relevant race the
  // supervisor would otherwise mishandle as a readiness timeout.
  await new Promise<void>((resolve) => setTimeout(resolve, 200));

  const exit = await new Promise<{ code: number | null; signal: string | null }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Late onExit subscriber was not replayed within 1s'));
      }, 1_000);
      handle.onExit((event) => {
        clearTimeout(timeout);
        resolve(event);
      });
    },
  );
  assert.equal(exit.code, 0);
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

test('Real live preview adapter keeps graceful taskkill failure inside the grace window', async (t) => {
  const taskkillCalls: string[][] = [];
  const directSignals: string[] = [];
  const spawnProcess = ((
    command: string,
    args: readonly string[] = [],
    options?: object,
  ): ChildProcess => {
    if (command === 'taskkill') {
      taskkillCalls.push([...args]);
      const fakeTaskkill = new EventEmitter() as ChildProcess;
      process.nextTick(() => fakeTaskkill.emit('exit', 1, null));
      return fakeTaskkill;
    }

    const child = spawnChildProcess(command, [...args], options);
    const originalKill = child.kill.bind(child);
    const patchedKill: ChildProcess['kill'] = (signal) => {
      directSignals.push(String(signal ?? 'SIGTERM'));
      return originalKill(signal);
    };
    child.kill = patchedKill;
    return child;
  }) as typeof spawnChildProcess;

  const adapter = createRealLivePreviewProcessAdapter({
    platform: 'win32',
    spawnProcess,
  });
  const handle = await adapter.spawn({
    ...SPAWN_INPUT_TEMPLATE,
    executable: process.execPath,
    args: ['-e', 'setTimeout(() => process.exit(0), 30_000)'],
  });
  t.after(async () => {
    await handle.stop({ graceMs: 0, killProcessTree: false }).catch(() => undefined);
  });

  const exitObserved = new Promise<void>((resolve) => {
    handle.onExit(() => resolve());
  });
  const startedAt = Date.now();
  await handle.stop({ graceMs: 200, killProcessTree: true });
  await Promise.race([
    exitObserved,
    new Promise<void>((_, reject) => setTimeout(
      () => reject(new Error('Child did not exit after force taskkill fallback')),
      5_000,
    )),
  ]);

  assert.ok(
    Date.now() - startedAt >= 150,
    'graceful taskkill failure should not direct-kill before the grace window elapses',
  );
  assert.equal(taskkillCalls.length, 2);
  assert.equal(taskkillCalls[0]?.includes('/F'), false);
  assert.equal(taskkillCalls[1]?.includes('/F'), true);
  assert.deepEqual(directSignals, ['SIGKILL']);
});
