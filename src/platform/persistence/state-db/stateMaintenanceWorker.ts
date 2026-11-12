import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDirectCliEntrypoint } from '../../../shared/cliEntrypoint.js';
import type { StateMaintenanceJob } from './stateMaintenance.js';

/** This reaper never loads SQLite. Its event loop stays responsive to the service
 * dying even while the native child is blocked inside quick_check/VACUUM.
 */
if (isDirectCliEntrypoint(import.meta.url, process.argv[1])) {
  let native: ChildProcess | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: string | undefined;
  let outcome: { ok: boolean; code?: string } | undefined;
  let done = false;
  let started = false;
  let parentGone = false;
  const finish = (response: { ok: boolean; code?: string }) => {
    if (done) return;
    done = true; clearTimeout(timer);
    if (process.connected && !parentGone) {
      try { process.send?.(response, () => process.exit(response.ok ? 0 : 1)); }
      catch { process.exit(1); }
    } else process.exit(1);
  };
  const cancel = (code: string) => {
    failure ??= code;
    if (native) native.kill('SIGKILL');
    else finish({ ok: false, code: failure });
  };
  process.on('disconnect', () => { parentGone = true; cancel('cancelled'); });
  process.on('SIGTERM', () => cancel('cancelled'));
  process.on('SIGINT', () => cancel('cancelled'));
  process.on('message', (input: unknown) => {
    const message = input as { type?: string; job?: StateMaintenanceJob; timeoutMs?: number; worker?: string } | null;
    if (message?.type === 'cancel') { cancel('cancelled'); return; }
    if (started || done) return;
    started = true;
    try {
      if (message?.type !== 'run' || !message.job || !Number.isSafeInteger(message.timeoutMs)
        || message.timeoutMs! < 1 || message.timeoutMs! > 10 * 60_000) throw Error('Invalid maintenance request');
      const options: ForkOptions & { windowsHide: true } = {
        execPath: process.execPath, execArgv: [], windowsHide: true,
        env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      };
      native = fork(fileURLToPath(message.worker ? new URL(message.worker)
        : new URL('./stateMaintenanceNativeWorker.js', import.meta.url)), [], options);
      native.on('message', (response: unknown) => {
        const value = response as { ok?: unknown; code?: unknown } | null;
        outcome = value?.ok === true ? { ok: true } : { ok: false,
          code: value?.code === 'integrity_check_failed' ? 'integrity_check_failed' : 'worker_failed' };
      });
      native.once('error', () => { failure ??= 'worker_failed'; });
      native.once('close', code => finish(failure ? { ok: false, code: failure }
        : code === 0 && outcome?.ok ? outcome : { ok: false, code: outcome?.code ?? 'worker_failed' }));
      timer = setTimeout(() => cancel('timeout'), message.timeoutMs);
      native.send(message.job, error => { if (error) cancel('worker_failed'); });
    } catch { if (native) cancel('worker_failed'); else finish({ ok: false, code: 'worker_failed' }); }
  });
}
