import { spawn, type ChildProcess } from 'node:child_process';

import type {
  LivePreviewProcessAdapter,
  LivePreviewProcessExit,
  LivePreviewProcessHandle,
  LivePreviewProcessSpawnInput,
  LivePreviewProcessStopOptions,
} from './processAdapter.js';

type SpawnProcess = typeof spawn;

export interface RealLivePreviewProcessAdapterOptions {
  /**
   * Test seam only. Production callers should use the default node
   * child_process.spawn implementation.
   */
  spawnProcess?: SpawnProcess;
  /**
   * Test seam for exercising Windows tree-kill behavior on non-Windows CI.
   */
  platform?: NodeJS.Platform;
}

interface RealLivePreviewProcessRuntime {
  spawnProcess: SpawnProcess;
  platform: NodeJS.Platform;
}

/**
 * Real subprocess adapter for Cats Code live previews (PLAN-097 Task 5.3).
 *
 * SECURITY POSTURE
 * - The adapter is **only** instantiated by the supervisor when the operator
 *   has flipped `livePreview.enabled = true` AND
 *   `livePreview.useRealProcessAdapter = true` AND has registered an
 *   approved command profile (start with `VITE_LIVE_PREVIEW_PROFILE`).
 * - Profile validation (`validateLivePreviewCommandProfile`) has already
 *   rejected raw shell strings, unsupported placeholders, and shell
 *   metacharacters before any input reaches this module.
 * - The adapter never invokes a shell. `child_process.spawn` is called
 *   with `shell: false` and a fixed executable plus argv array.
 * - Stdout/stderr capture is line-bounded by the supervisor; this adapter
 *   only forwards chunks. The supervisor enforces `logMaxBytes`.
 * - On stop, SIGTERM is sent first; if the process has not exited within
 *   `graceMs`, SIGKILL is escalated. `killProcessTree` triggers a graceful
 *   `taskkill /T` on Windows or a process-group SIGTERM on POSIX first, then
 *   `taskkill /T /F` or process-group SIGKILL on escalation.
 *
 * Operators enabling the real adapter must complete PLAN-097 Task 5.1
 * security review and Task 5.4 end-to-end validation in an isolated temp
 * workspace before pointing this at user dev state.
 */
export function createRealLivePreviewProcessAdapter(
  options: RealLivePreviewProcessAdapterOptions = {},
): LivePreviewProcessAdapter {
  const runtime: RealLivePreviewProcessRuntime = {
    spawnProcess: options.spawnProcess ?? spawn,
    platform: options.platform ?? process.platform,
  };
  return {
    spawn(input: LivePreviewProcessSpawnInput): Promise<LivePreviewProcessHandle> {
      const child = runtime.spawnProcess(input.executable, input.args, {
        cwd: input.cwd,
        env: { ...process.env, ...input.env, PORT: String(input.port) },
        shell: false,
        windowsHide: true,
        detached: runtime.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return waitForSpawn(child, runtime);
    },
  };
}

function waitForSpawn(
  child: ChildProcess,
  runtime: RealLivePreviewProcessRuntime,
): Promise<LivePreviewProcessHandle> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.removeListener('spawn', onSpawn);
      reject(error);
    };
    const onSpawn = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.removeListener('error', onError);
      resolve(wrapChildProcess(child, runtime));
    };

    child.once('error', onError);
    child.once('spawn', onSpawn);
  });
}

function wrapChildProcess(
  child: ChildProcess,
  runtime: RealLivePreviewProcessRuntime,
): LivePreviewProcessHandle {
  const stdoutListeners = new Set<(chunk: string) => void>();
  const stderrListeners = new Set<(chunk: string) => void>();
  const exitListeners = new Set<(exit: LivePreviewProcessExit) => void>();
  let exited = false;
  let lastExit: LivePreviewProcessExit | null = null;

  const recordExit = (exit: LivePreviewProcessExit): void => {
    if (exited) {
      return;
    }
    exited = true;
    lastExit = exit;
    for (const listener of exitListeners) {
      listener(exit);
    }
    exitListeners.clear();
  };

  child.stdout?.setEncoding('utf-8');
  child.stderr?.setEncoding('utf-8');

  child.stdout?.on('data', (chunk: string) => {
    for (const listener of stdoutListeners) {
      listener(chunk);
    }
  });
  child.stderr?.on('data', (chunk: string) => {
    for (const listener of stderrListeners) {
      listener(chunk);
    }
  });
  child.on('exit', (code, signal) => {
    recordExit({ code, signal });
  });
  // Once spawn has succeeded, runtime errors from the child process should
  // not crash the host. Surface them as an exit if the child has not already
  // emitted one.
  child.on('error', (error) => {
    void error;
    recordExit({ code: null, signal: null });
  });

  return {
    processId: child.pid ?? null,
    onStdout(listener) {
      stdoutListeners.add(listener);
    },
    onStderr(listener) {
      stderrListeners.add(listener);
    },
    onExit(listener) {
      // Late subscribers (registered after the child has already exited)
      // must still observe the terminal event. Without this the supervisor
      // could miss the `process_exited` signal for short-lived processes
      // that exit between spawn-promise resolve and `onExit` registration,
      // and would only later notice via readiness timeout.
      if (exited && lastExit) {
        listener(lastExit);
        return;
      }
      exitListeners.add(listener);
    },
    async stop(options: LivePreviewProcessStopOptions): Promise<void> {
      if (exited) {
        return;
      }
      await terminateChildProcess(child, options, runtime);
    },
  };
}

async function terminateChildProcess(
  child: ChildProcess,
  options: LivePreviewProcessStopOptions,
  runtime: RealLivePreviewProcessRuntime,
): Promise<void> {
  trySendSignal(child, 'SIGTERM', options.killProcessTree, /* force */ false, runtime);
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      trySendSignal(child, 'SIGKILL', options.killProcessTree, /* force */ true, runtime);
      resolve();
    }, Math.max(0, options.graceMs));
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function trySendSignal(
  child: ChildProcess,
  signal: NodeJS.Signals,
  killProcessTree: boolean,
  force: boolean,
  runtime: RealLivePreviewProcessRuntime,
): void {
  try {
    if (!killProcessTree || child.pid === undefined) {
      child.kill(signal);
      return;
    }
    if (runtime.platform === 'win32') {
      tryTaskkill(child, signal, force, runtime);
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  } catch {
    // child has already exited; nothing to signal
  }
}

function tryTaskkill(
  child: ChildProcess,
  fallbackSignal: NodeJS.Signals,
  force: boolean,
  runtime: RealLivePreviewProcessRuntime,
): void {
  if (child.pid === undefined) {
    child.kill(fallbackSignal);
    return;
  }
  // Honour the documented stop contract: graceful first (taskkill /T sends
  // WM_CLOSE / Ctrl+Break-style termination to the tree without /F so
  // children can run their shutdown handlers), then escalate to /F on
  // SIGKILL when the grace period expires.
  const args = force
    ? ['/pid', String(child.pid), '/T', '/F']
    : ['/pid', String(child.pid), '/T'];
  try {
    const tree = runtime.spawnProcess('taskkill', args, {
      windowsHide: true,
      stdio: 'ignore',
    });
    // Swallow taskkill's own error events so a missing taskkill (extremely
    // unlikely on Windows) does not crash the host. Direct kill fallback only
    // runs in the force phase so graceful failures still respect `graceMs`.
    tree.once('error', () => {
      fallbackFromTaskkillFailure(child, fallbackSignal, force);
    });
    tree.once('exit', (code) => {
      if (code !== 0) {
        fallbackFromTaskkillFailure(child, fallbackSignal, force);
      }
    });
  } catch {
    fallbackFromTaskkillFailure(child, fallbackSignal, force);
  }
}

function fallbackFromTaskkillFailure(
  child: ChildProcess,
  fallbackSignal: NodeJS.Signals,
  force: boolean,
): void {
  if (!force) {
    // Preserve the grace window. If graceful tree termination fails, the stop
    // timer will escalate and retry with `/F` before we fall back to direct
    // process kill.
    return;
  }
  try {
    child.kill(fallbackSignal);
  } catch {
    // child already gone
  }
}
