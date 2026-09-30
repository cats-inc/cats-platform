import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentRunnerUrl } from '#cats-app-package';
import { killProcessTreeRemnants, listProcesses, signalChildProcessTree, type ProcessEntry } from '../process/processTree.js';
import type { ProcessRecordRegistry } from '../process/processRegistry.js';

export interface AppProcessContext {
  appId: string;
  componentId: string;
  dataDir: string;
  services: Record<string, { url: string; headers: Record<string, string> }>;
  fromSchemaVersion?: number;
  toSchemaVersion?: number;
  ingress?: { authtoken: string; target: string; url?: string };
}

export interface AppProcess {
  child: ChildProcess;
  url?: string;
  key: string;
  publicUrl?: string;
  stop(): Promise<void>;
}

/**
 * What a component's process tree leaves behind (PLAN-115 P1):
 * - POSIX reparents a dead component's subprocesses, so each component runs
 *   as its own process group and the group is ended once the component exits.
 * - On Windows, Node puts non-detached subprocesses in a kill-on-close job, so
 *   they end with the component; detached ones survive and are found by parent
 *   id in the background, because listing processes there takes seconds.
 * - Running components are recorded so the next host start can clean up after
 *   a crash (`sweepAppComponentProcesses`).
 * A subprocess that leaves the process group itself (`setsid`) is outside
 * this cover.
 */
const pendingCleanups = new Set<Promise<unknown>>();

/**
 * Windows remnant cleanups are batched: components stopped together (an App,
 * or host shutdown) share one process listing, which is taken after all of
 * them exited, so it still sees every remnant.
 */
let windowsBatch: { roots: { pid: number; startedAt: number; done: () => void }[] } | null = null;
function cleanUpWindowsRemnants(pid: number, startedAt: number): Promise<void> {
  return new Promise((resolve) => {
    if (!windowsBatch) {
      const batch = { roots: [] as { pid: number; startedAt: number; done: () => void }[] };
      windowsBatch = batch;
      setTimeout(() => {
        windowsBatch = null;
        const entries: Promise<ProcessEntry[]> = listProcesses('win32').catch(() => []);
        void Promise.all(batch.roots.map((root) =>
          killProcessTreeRemnants(root.pid, root.startedAt, { platform: 'win32', listProcesses: () => entries })
            .catch(() => [])
            .finally(root.done)));
      }, 250).unref();
    }
    windowsBatch.roots.push({ pid, startedAt, done: resolve });
  });
}

/** Wait for background tree cleanups, e.g. before the host exits. */
export async function settleAppProcessCleanups(timeoutMs = 10_000): Promise<void> {
  await Promise.race([
    Promise.allSettled([...pendingCleanups]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ]);
}

export async function startAppProcess(options: {
  entrypoint: string; kind: 'service' | 'worker' | 'migration' | 'ingress'; context: AppProcessContext;
  timeoutMs?: number; onExit?: () => void; registry?: ProcessRecordRegistry;
}): Promise<AppProcess> {
  const key = randomBytes(32).toString('hex');
  // Explicit environment: Apps do not inherit provider credentials, host auth or NODE_OPTIONS.
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  env.CATS_APP_COMPONENT = JSON.stringify({ entrypoint: options.entrypoint, kind: options.kind,
    key, context: options.context });
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  const startedAt = Date.now();
  const child = spawn(process.execPath, ['--max-old-space-size=192', fileURLToPath(componentRunnerUrl)], {
    cwd: path.dirname(options.entrypoint), env, windowsHide: true,
    // Its own process group on POSIX, so its whole tree can be ended. It then
    // leaves the host's terminal group (a Ctrl-C to a dev host no longer
    // reaches it); it stops on IPC 'stop' or 'disconnect', which also fires when
    // the host dies.
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout?.resume(); child.stderr?.resume();
  const recordId = `${options.context.appId}/${options.context.componentId}/${key.slice(0, 12)}`;
  if (child.pid) options.registry?.record({ id: recordId, processId: child.pid, startedAt });
  let stopping = false;
  // A failed spawn has no pid and may never emit 'exit'.
  const exited = child.pid
    ? new Promise<void>(resolve => child.once('exit', () => resolve()))
    : Promise.resolve();
  // A subprocess that inherited the component's pipes can hold 'close' open.
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  let cleaned: Promise<void> | null = null;
  const cleanup = () => cleaned ??= (async () => {
    await exited;
    const pid = child.pid;
    if (!pid) return;
    if (process.platform !== 'win32') {
      // The group is this component's: its id is the component's pid, and a
      // restarted component runs as a new group with a new pid.
      try { process.kill(-pid, 'SIGKILL'); } catch { /* the group is already gone */ }
      options.registry?.forget(recordId);
      return;
    }
    const background = cleanUpWindowsRemnants(pid, startedAt)
      .then(() => options.registry?.forget(recordId));
    pendingCleanups.add(background);
    void background.finally(() => pendingCleanups.delete(background));
  })();
  if (child.pid) {
    void exited.then(() => {
      // A component that exits on its own still leaves nothing behind.
      void cleanup();
      if (!stopping) options.onExit?.();
    });
  }
  const stop = async () => {
    if (!stopping) {
      stopping = true;
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        if (child.connected) child.send({ type: 'stop' }, () => {});
        const timer = setTimeout(() => {
          signalChildProcessTree(child, 'SIGKILL', { killProcessTree: true, force: true });
        }, 3500);
        try { await exited; } finally { clearTimeout(timer); }
      }
    }
    await exited;
    await cleanup();
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 2000).unref())]);
  };
  try {
    const ready = await new Promise<{ port?: number; publicUrl?: string }>((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('App component readiness timed out.')), options.timeoutMs ?? 15_000);
      const error = () => done(new Error('App component failed to start.'));
      const message = (value: unknown) => {
        const data = value as { type?: string; port?: number; publicUrl?: string };
        if (data?.type === 'failed') return error();
        if (data?.type === (options.kind === 'migration' ? 'migrated' : 'ready')) {
          if (options.kind === 'service' && (!Number.isInteger(data.port) || data.port! < 1 || data.port! > 65535)) return error();
          done(undefined, data);
        }
      };
      const done = (failure?: Error, data: { port?: number; publicUrl?: string } = {}) => {
        clearTimeout(timer); child.off('error', error); child.off('exit', error); child.off('message', message);
        failure ? reject(failure) : resolve(data);
      };
      child.once('error', error); child.once('exit', error); child.on('message', message);
    });
    return { child, key, ...(ready.port ? { url: `http://127.0.0.1:${ready.port}` } : {}), publicUrl: ready.publicUrl, stop };
  } catch (error) { await stop(); throw error; }
}
