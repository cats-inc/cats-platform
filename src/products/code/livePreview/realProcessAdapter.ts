import { spawn, type ChildProcess } from 'node:child_process';

import type {
  LivePreviewProcessAdapter,
  LivePreviewProcessExit,
  LivePreviewProcessHandle,
  LivePreviewProcessSpawnInput,
  LivePreviewProcessStopOptions,
} from './processAdapter.js';

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
 *   `graceMs`, SIGKILL is escalated. `killProcessTree` triggers
 *   `taskkill /T /F` on Windows or a process-group SIGTERM on POSIX.
 *
 * Operators enabling the real adapter must complete PLAN-097 Task 5.1
 * security review and Task 5.4 end-to-end validation in an isolated temp
 * workspace before pointing this at user dev state.
 */
export function createRealLivePreviewProcessAdapter(): LivePreviewProcessAdapter {
  return {
    async spawn(input: LivePreviewProcessSpawnInput): Promise<LivePreviewProcessHandle> {
      const child = spawn(input.executable, input.args, {
        cwd: input.cwd,
        env: { ...process.env, ...input.env, PORT: String(input.port) },
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return wrapChildProcess(child);
    },
  };
}

function wrapChildProcess(child: ChildProcess): LivePreviewProcessHandle {
  const stdoutListeners = new Set<(chunk: string) => void>();
  const stderrListeners = new Set<(chunk: string) => void>();
  const exitListeners = new Set<(exit: LivePreviewProcessExit) => void>();
  let exited = false;

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
    exited = true;
    const exit: LivePreviewProcessExit = { code, signal };
    for (const listener of exitListeners) {
      listener(exit);
    }
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
      if (exited) {
        return;
      }
      exitListeners.add(listener);
    },
    async stop(options: LivePreviewProcessStopOptions): Promise<void> {
      if (exited) {
        return;
      }
      await terminateChildProcess(child, options);
    },
  };
}

async function terminateChildProcess(
  child: ChildProcess,
  options: LivePreviewProcessStopOptions,
): Promise<void> {
  const signal: NodeJS.Signals = process.platform === 'win32' ? 'SIGTERM' : 'SIGTERM';
  trySendSignal(child, signal, options.killProcessTree);
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      trySendSignal(child, 'SIGKILL', options.killProcessTree);
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
): void {
  try {
    if (!killProcessTree || child.pid === undefined) {
      child.kill(signal);
      return;
    }
    if (process.platform === 'win32') {
      const { spawn: spawnSync } = require('node:child_process') as typeof import('node:child_process');
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
      });
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
