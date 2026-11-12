import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type StateMaintenanceJob = { kind: 'check'; file: string }
  | { kind: 'snapshot'; file: string; target: string }
  | { kind: 'product'; file: string; payload: unknown };
export interface StateMaintenanceOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Private test/packaging seam; never selected by a request payload. */
  worker?: URL;
  /** Private native-progress/test seam. Never selected from a request payload. */
  onProgress?(value: unknown): void | Promise<void>;
}
export class StateMaintenanceError extends Error {
  constructor(readonly code: 'timeout' | 'cancelled' | 'worker_failed' | 'integrity_check_failed', readonly productCode?: string) {
    super(code === 'timeout' ? 'State maintenance exceeded its deadline.'
      : code === 'cancelled' ? 'State maintenance was cancelled.'
        : code === 'integrity_check_failed' ? 'The state database did not pass its integrity check.'
          : 'The state maintenance worker could not complete.');
  }
}
const active = new Map<ChildProcess, { file: string; cancel(): void; done: Promise<void> }>();
let exitHookInstalled = false;
const identity = (file: string) => process.platform === 'win32' ? resolve(file).toLowerCase() : resolve(file);

/** Native SQLite checks/VACUUM run in a killable process, never an event-loop-blocking
 * worker thread. Cancellation settles only after the child has actually closed.
 */
export function runStateMaintenance(job: StateMaintenanceJob, options: StateMaintenanceOptions = {}): Promise<void> {
  const timeout = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 10 * 60_000) throw new RangeError('Invalid state maintenance deadline');
  if (options.signal?.aborted) return Promise.reject(new StateMaintenanceError('cancelled'));
  if (job.kind === 'product' && !options.worker) throw new TypeError('Product maintenance requires its fixed worker entrypoint');
  const request: StateMaintenanceJob = job.kind === 'product'
    ? { kind: 'product', file: resolve(job.file), payload: job.payload }
    : job.kind === 'snapshot'
    ? { kind: 'snapshot', file: resolve(job.file), target: resolve(job.target) }
    : { kind: 'check', file: resolve(job.file) };
  // fork forwards native spawn options; the pinned Node 20 typings omit windowsHide.
  const forkOptions: ForkOptions & { windowsHide: true } = {
    execPath: process.execPath, execArgv: [], windowsHide: true,
    env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  };
  const child = fork(fileURLToPath(new URL('./stateMaintenanceWorker.js', import.meta.url)), [], forkOptions);
  let failure: StateMaintenanceError | undefined;
  let success = false;
  const cancel = (code: 'timeout' | 'cancelled' | 'worker_failed') => {
    failure ??= new StateMaintenanceError(code);
    // Let the nonblocking reaper kill/reap its native child before exiting.
    if (child.connected) {
      try { child.send({ type: 'cancel' }, () => {}); } catch { /* disconnect also cancels it */ }
    }
  };
  const abort = () => cancel('cancelled');
  const done = new Promise<void>((resolveTask, reject) => {
    const timer = setTimeout(() => cancel('timeout'), timeout);
    child.on('message', (message: unknown) => {
      const response = message as { ok?: unknown; code?: unknown; productCode?: unknown } | null;
      if (job.kind === 'product' && message && typeof message === 'object' && Object.hasOwn(message, 'progress')) {
        void Promise.resolve().then(() => options.onProgress?.((message as { progress: unknown }).progress)).then(() => {
          if (child.connected && !failure) child.send({ type: 'continue' }, error => { if (error) cancel('worker_failed'); });
        }, () => cancel('worker_failed'));
        return;
      }
      if (response?.ok === true) success = true;
      else failure ??= new StateMaintenanceError(['integrity_check_failed', 'timeout', 'cancelled'].includes(String(response?.code))
        ? response!.code as 'integrity_check_failed' | 'timeout' | 'cancelled' : 'worker_failed',
      job.kind === 'product' && typeof response?.productCode === 'string' && /^[a-z_]{1,64}$/u.test(response.productCode)
        ? response.productCode : undefined);
    });
    child.once('error', () => { failure ??= new StateMaintenanceError('worker_failed'); });
    child.once('close', code => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code === 0 && success) resolveTask();
      else reject(new StateMaintenanceError('worker_failed'));
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    else {
      try { child.send({ type: 'run', job: request, timeoutMs: timeout, worker: options.worker?.href },
        error => { if (error) cancel('worker_failed'); }); }
      catch { cancel('worker_failed'); }
    }
  });
  active.set(child, { file: identity(job.file), cancel: abort, done });
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', () => {
      for (const worker of active.keys()) if (worker.connected) {
        try { worker.disconnect(); } catch { /* process exit closes the pipe as well */ }
      }
    });
  }
  void done.then(() => active.delete(child), () => active.delete(child));
  return done;
}

export async function closeStateMaintenanceWorkers(file?: string): Promise<void> {
  const jobs = [...active.values()].filter(job => file === undefined || job.file === identity(file));
  for (const job of jobs) job.cancel();
  await Promise.allSettled(jobs.map(job => job.done));
}
