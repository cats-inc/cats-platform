import { execFile, spawn, type ChildProcess } from 'node:child_process';

import { createPlatformChildProcessEnv } from '../../shared/platformChildProcessEnv.js';

/**
 * Process-tree helpers shared by host-supervised processes (Code live
 * previews, App components; PLAN-115 P1, PLAN-116 F4).
 *
 * - `signalChildProcessTree` signals a live child and its descendants:
 *   `taskkill /T` (then `/T /F`) on Windows, the process group on POSIX.
 * - `killProcessTreeRemnants` ends what is left of a tree after its root
 *   exited, or after the host itself crashed. Windows keeps a dead parent's id
 *   in its children's `ParentProcessId`, so the tree is walked by parent; POSIX
 *   reparents orphans, so the root is spawned as its own process group and the
 *   group is used instead. Start times guard against reused process ids.
 */

export interface ProcessEntry {
  pid: number;
  ppid: number;
  /** POSIX process group; absent on Windows. */
  pgid?: number;
  /** Start time in epoch ms. `ps` reports whole seconds. */
  startMs: number;
}

/** Start times are compared with this slack (`ps` elapsed time has 1 s precision). */
export const PROCESS_START_TOLERANCE_MS = 2_000;

type SpawnProcess = typeof spawn;

export interface ProcessTreeSignalRuntime {
  platform: NodeJS.Platform;
  spawnProcess: SpawnProcess;
}

/**
 * Signal a live child. With `killProcessTree`, the whole tree: graceful
 * `taskkill /T` or a group SIGTERM first, and `force` for `taskkill /T /F` or a
 * group SIGKILL. A graceful failure leaves escalation to the caller's timer.
 */
export function signalChildProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
  options: { killProcessTree: boolean; force: boolean },
  runtime: ProcessTreeSignalRuntime = { platform: process.platform, spawnProcess: spawn },
): void {
  try {
    if (!options.killProcessTree || child.pid === undefined) {
      child.kill(signal);
      return;
    }
    if (runtime.platform === 'win32') {
      taskkillTree(child, signal, options.force, runtime);
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  } catch {
    // The child has already exited; nothing to signal.
  }
}

function taskkillTree(
  child: ChildProcess,
  fallbackSignal: NodeJS.Signals,
  force: boolean,
  runtime: ProcessTreeSignalRuntime,
): void {
  if (child.pid === undefined) {
    child.kill(fallbackSignal);
    return;
  }
  // Graceful first (taskkill /T without /F lets the tree run shutdown
  // handlers), then /F when the caller escalates.
  const args = force
    ? ['/pid', String(child.pid), '/T', '/F']
    : ['/pid', String(child.pid), '/T'];
  const fallback = () => {
    // Only the forced phase falls back to a direct kill, so a graceful
    // failure still respects the caller's grace period.
    if (!force) return;
    try {
      child.kill(fallbackSignal);
    } catch {
      // Already gone.
    }
  };
  try {
    const tree = runtime.spawnProcess('taskkill', args, {
      env: createPlatformChildProcessEnv(),
      windowsHide: true,
      stdio: 'ignore',
    });
    tree.once('error', fallback);
    tree.once('exit', (code) => {
      if (code !== 0) fallback();
    });
  } catch {
    fallback();
  }
}

/**
 * The processes left of the tree rooted at `rootPid`, which started at
 * `rootStartMs`. Leaves come first, so killing in order never leaves a parent
 * time to replace a killed child.
 * - A live process that holds `rootPid` but started at another time means the
 *   id was reused: nothing is returned.
 * - Windows follows `ppid` from the root (children keep a dead parent's id).
 * - POSIX takes the root's process group.
 * - Only processes started at or after the root count.
 */
export function findTreeRemnants(
  entries: readonly ProcessEntry[],
  rootPid: number,
  rootStartMs: number,
  platform: NodeJS.Platform = process.platform,
): ProcessEntry[] {
  const startedWithRoot = (entry: ProcessEntry) => entry.startMs >= rootStartMs - PROCESS_START_TOLERANCE_MS;
  const root = entries.find((entry) => entry.pid === rootPid);
  if (root && Math.abs(root.startMs - rootStartMs) > PROCESS_START_TOLERANCE_MS) return [];

  const found: ProcessEntry[] = [];
  if (platform === 'win32') {
    const byParent = new Map<number, ProcessEntry[]>();
    for (const entry of entries) {
      if (entry.pid === entry.ppid) continue;
      byParent.set(entry.ppid, [...(byParent.get(entry.ppid) ?? []), entry]);
    }
    const seen = new Set<number>([rootPid]);
    const queue = [rootPid];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      for (const child of byParent.get(parent) ?? []) {
        if (seen.has(child.pid) || !startedWithRoot(child)) continue;
        seen.add(child.pid);
        found.push(child);
        queue.push(child.pid);
      }
    }
  } else {
    found.push(...entries.filter((entry) =>
      entry.pgid === rootPid && entry.pid !== rootPid && startedWithRoot(entry)));
  }
  found.reverse();
  if (root) found.push(root);
  return found;
}

export interface KillRemnantsOptions {
  platform?: NodeJS.Platform;
  listProcesses?: () => Promise<ProcessEntry[]>;
  kill?: (pid: number) => void;
}

/** End what is left of a process tree; returns the process ids it signalled. */
export async function killProcessTreeRemnants(
  rootPid: number,
  rootStartMs: number,
  options: KillRemnantsOptions = {},
): Promise<number[]> {
  const platform = options.platform ?? process.platform;
  const entries = await (options.listProcesses ?? (() => listProcesses(platform)))();
  const kill = options.kill ?? ((pid: number) => process.kill(pid, 'SIGKILL'));
  const killed: number[] = [];
  for (const entry of findTreeRemnants(entries, rootPid, rootStartMs, platform)) {
    try {
      kill(entry.pid);
      killed.push(entry.pid);
    } catch {
      // Exited in the meantime.
    }
  }
  return killed;
}

/** Every process with its parent, POSIX group and start time. */
export async function listProcesses(platform: NodeJS.Platform = process.platform): Promise<ProcessEntry[]> {
  if (platform === 'win32') {
    const output = await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { '
        + '"$($_.ProcessId) $($_.ParentProcessId) $(([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds())" }',
    ]);
    return parseWindowsProcessList(output);
  }
  const output = await run('ps', ['-A', '-o', 'pid=,ppid=,pgid=,etime=']);
  return parsePosixProcessList(output, Date.now());
}

export function parseWindowsProcessList(output: string): ProcessEntry[] {
  return output.split(/\r?\n/u).flatMap((line) => {
    const [pid, ppid, startMs] = line.trim().split(/\s+/u).map(Number);
    return Number.isInteger(pid) && Number.isInteger(ppid) && Number.isFinite(startMs) && pid! > 0
      ? [{ pid: pid!, ppid: ppid!, startMs: startMs! }]
      : [];
  });
}

export function parsePosixProcessList(output: string, nowMs: number): ProcessEntry[] {
  return output.split(/\r?\n/u).flatMap((line) => {
    const [pid, ppid, pgid, elapsed] = line.trim().split(/\s+/u);
    const seconds = parseElapsed(elapsed ?? '');
    const numbers = [pid, ppid, pgid].map(Number);
    return numbers.every(Number.isInteger) && numbers[0]! > 0 && seconds !== null
      ? [{ pid: numbers[0]!, ppid: numbers[1]!, pgid: numbers[2]!, startMs: nowMs - seconds * 1000 }]
      : [];
  });
}

/** `ps` elapsed time: `[[dd-]hh:]mm:ss`. */
export function parseElapsed(value: string): number | null {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/u.exec(value.trim());
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return ((Number(days ?? 0) * 24 + Number(hours ?? 0)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 15_000 }, (error, stdout) => {
      // A failed listing kills nothing.
      resolve(error ? '' : stdout);
    });
  });
}
