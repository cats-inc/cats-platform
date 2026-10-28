import { spawn as spawnProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * SPEC-133 R7: the Node side of the native desktop control helper. It starts the helper on
 * first use, speaks protocol 1 (one JSON object per line), ends it after five idle minutes and
 * stops restarting it after more than three crashes within five minutes (DC-16).
 */

export const DESKTOP_CONTROL_PROTOCOL = 1;
const IDLE_EXIT_MS = 5 * 60_000;
const CRASH_WINDOW_MS = 5 * 60_000;
const MAX_CRASHES = 3;
const STDERR_TAIL_BYTES = 8 * 1024;
const SUMMARY_CHARS = 2_000;

export class DesktopControlHelperError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DesktopControlHelperError';
  }
}

/**
 * What a helper's stderr may say in Platform's logs (DC-17): exception type names and stack
 * frames only. Exception messages are dropped, since one could quote typed or on-screen text.
 */
export function summarizeHelperStderr(text: string): string {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    const frame = /^at [\w.`<>$|,[\] ]+\([^()]*\)/u.exec(line);
    if (frame) { lines.push(frame[0]); continue; }
    const type = /^(?:(?:Unhandled exception\.|Fatal error\.|--->)\s*)?((?:[A-Za-z_][\w]*\.)+[A-Za-z_]\w*(?:Exception|Error))\b/u.exec(line);
    if (type) lines.push(type[1]);
  }
  return lines.join('\n').slice(0, SUMMARY_CHARS);
}

/** The subset of a child process the client needs; tests pass a fake. */
export interface DesktopControlHelperProcess {
  stdin: { write(chunk: string): boolean; end(): void };
  stdout: NodeJS.ReadableStream;
  /** Kept in memory so an unexpected exit can be diagnosed; absent in fakes. */
  stderr?: NodeJS.ReadableStream | null;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
  kill(): boolean;
}

export interface DesktopControlHelperOptions {
  path: string;
  selfProcessIds: number[];
  selfExecutables: string[];
  spawn?(path: string): DesktopControlHelperProcess;
  now?(): number;
  setTimer?(callback: () => void, ms: number): { unref?(): void } | unknown;
  clearTimer?(timer: unknown): void;
  /** An unexpected helper exit, with the redacted stderr summary (see summarizeHelperStderr). */
  onExit?(exit: { code: number | null; summary: string }): void;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: unknown;
}

export interface DesktopControlHelperClient {
  call<T = Record<string, unknown>>(op: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  /** null while usable; otherwise why the helper cannot be used. */
  unavailableReason(): string | null;
  /** Ends the process and forgets crash history, for example when the owner turns the feature off. */
  reset(): void;
  close(): void;
}

export function createDesktopControlHelperClient(options: DesktopControlHelperOptions): DesktopControlHelperClient {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => {
    const timer = setTimeout(callback, ms);
    timer.unref();
    return timer;
  });
  const clearTimer = options.clearTimer ?? ((timer: unknown) => clearTimeout(timer as NodeJS.Timeout));
  const spawn = options.spawn ?? ((path: string) => spawnProcess(path, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  }) as unknown as DesktopControlHelperProcess);

  let child: DesktopControlHelperProcess | null = null;
  let ready: Promise<void> | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let crashes: number[] = [];
  let idleTimer: unknown = null;
  let closed = false;

  function failAll(code: string, message: string) {
    for (const [id, entry] of pending) {
      clearTimer(entry.timer);
      entry.reject(new DesktopControlHelperError(code, message));
      pending.delete(id);
    }
  }

  function stop() {
    const current = child;
    child = null;
    ready = null;
    if (current) {
      try { current.stdin.end(); } catch { /* already gone */ }
      current.kill();
    }
  }

  function armIdle() {
    if (idleTimer) clearTimer(idleTimer);
    idleTimer = setTimer(() => {
      idleTimer = null;
      if (pending.size === 0) stop();
    }, IDLE_EXIT_MS);
  }

  function send(op: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const target = child;
    if (!target) return Promise.reject(new DesktopControlHelperError('executor_failed', 'The helper is not running.'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimer(() => {
        pending.delete(id);
        reject(new DesktopControlHelperError('executor_failed', `The helper did not answer ${op} in time.`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      target.stdin.write(`${JSON.stringify({ id, op, params })}\n`);
    });
  }

  function start(): Promise<void> {
    const process = spawn(options.path);
    child = process;
    createInterface({ input: process.stdout }).on('line', (line) => {
      let message: { id?: unknown; ok?: unknown; result?: unknown; error?: { code?: unknown; message?: unknown } };
      try { message = JSON.parse(line); } catch { return; }
      if (typeof message.id !== 'number') return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimer(entry.timer);
      if (message.ok === true) entry.resolve(message.result);
      else entry.reject(new DesktopControlHelperError(
        typeof message.error?.code === 'string' ? message.error.code : 'executor_failed',
        typeof message.error?.message === 'string' ? message.error.message : 'The helper failed.',
      ));
    });
    // Always drained, so a chatty helper never blocks on a full pipe; only the tail is kept.
    let stderrTail = '';
    process.stderr?.on('data', (chunk: Buffer | string) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_BYTES);
    });
    process.once('exit', (code: number | null) => {
      if (child !== process) return;
      child = null;
      ready = null;
      crashes = [...crashes.filter((at) => now() - at < CRASH_WINDOW_MS), now()];
      failAll('executor_failed', 'The desktop control helper stopped.');
      options.onExit?.({ code, summary: summarizeHelperStderr(stderrTail) });
    });
    return send('hello', {
      protocol: DESKTOP_CONTROL_PROTOCOL,
      selfProcessIds: options.selfProcessIds,
      selfExecutables: options.selfExecutables,
    }, 15_000).then((result) => {
      const hello = result as { protocol?: unknown; platform?: unknown };
      if (hello.protocol !== DESKTOP_CONTROL_PROTOCOL || hello.platform !== 'win32') {
        stop();
        throw new DesktopControlHelperError('unavailable', 'The desktop control helper speaks another protocol.');
      }
    });
  }

  function unavailableReason(): string | null {
    if (closed) return 'closed';
    const recent = crashes.filter((at) => now() - at < CRASH_WINDOW_MS);
    return recent.length > MAX_CRASHES ? 'helper_crashed' : null;
  }

  return {
    async call<T>(op: string, params: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<T> {
      const reason = unavailableReason();
      if (reason) throw new DesktopControlHelperError('unavailable', `Desktop control is unavailable (${reason}).`);
      if (!ready) {
        ready = start();
        ready.catch(() => { ready = null; });
      }
      await ready;
      armIdle();
      return await send(op, params, timeoutMs) as T;
    },
    unavailableReason,
    reset() {
      failAll('stopped', 'Desktop control was stopped.');
      stop();
      crashes = [];
    },
    close() {
      closed = true;
      if (idleTimer) clearTimer(idleTimer);
      failAll('unavailable', 'Desktop control closed.');
      stop();
    },
  };
}
