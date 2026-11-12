import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { link, lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

interface Owner { pid: number; host: string; token: string; }
interface LockOptions {
  /** Zero permits one immediate acquisition, including its filesystem setup, but no wait. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Fault-injection seam; production callers leave this unset. */
  checkpoint?(stage: 'reclaim_claimed' | 'public_acquired' | 'candidate_prepared'): void | Promise<void>;
}
const queues = new Map<string, Promise<void>>();
const host = hostname();

/** Serialize the entire coordinated JSON/SQLite operation, including crash recovery.
 * Queue tails remain chained even when a waiter cancels, so later callers cannot jump
 * ahead of a running operation. The deadline includes waiting inside this process.
 */
export async function withProfileLock<T>(profile: string, work: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const timeout = options.timeoutMs ?? 15 * 60_000;
  if (!Number.isFinite(timeout) || timeout < 0) throw new RangeError('Invalid profile lock timeout');
  options.signal?.throwIfAborted();
  const deadline = performance.now() + timeout;
  const absolute = resolve(profile);
  const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  const previous = queues.get(key) ?? Promise.resolve();
  let releaseQueue!: () => void;
  const gate = new Promise<void>(done => { releaseQueue = done; });
  const tail = previous.then(() => gate);
  queues.set(key, tail);
  try {
    await waitForPrevious(previous, deadline, options.signal);
    checkDeadline(deadline, options);
    const release = await acquire(`${absolute}.operation-lock`, deadline, options);
    try { checkDeadline(deadline, options); return await work(); } finally { await release(); }
  } finally {
    releaseQueue();
    void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  }
}

async function waitForPrevious(previous: Promise<void>, deadline: number, signal?: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await new Promise<void>((done, reject) => {
      previous.then(done, reject);
      timer = setTimeout(() => reject(timeoutError()), Math.max(0, deadline - performance.now()));
      abort = () => reject(signal?.reason ?? new Error('Profile operation aborted'));
      signal?.addEventListener('abort', abort, { once: true });
    });
    signal?.throwIfAborted();
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}

async function acquire(file: string, deadline: number, options: LockOptions): Promise<() => Promise<void>> {
  await mkdir(dirname(file), { recursive: true });
  const owner: Owner = { pid: process.pid, host, token: randomUUID() };
  const candidate = `${file}.${owner.token}.owner`;
  let candidateCreated = false;
  let acquired = false;
  const cleanCandidate = async (): Promise<void> => {
    // Once the public lock is released this name cannot block anyone. A failed cleanup
    // leaves an orphan temporary link, never a live-owner public lock without a handle.
    if (candidateCreated) await unlink(candidate).catch(() => {});
  };
  const release = async (): Promise<void> => {
    if (!acquired) return;
    const current = await readOwner(file);
    if (current.token !== owner.token) throw new Error('Profile operation lock changed before release.');
    await unlink(file);
    acquired = false;
    await cleanCandidate();
  };
  try {
    const fd = await open(candidate, 'wx', 0o600);
    candidateCreated = true;
    try { await fd.writeFile(JSON.stringify(owner)); await fd.sync(); }
    finally { await fd.close(); }
    await options.checkpoint?.('candidate_prepared');
    for (;;) {
      options.signal?.throwIfAborted();
      checkDeadline(deadline, options);
      try {
        await link(candidate, file);
        acquired = true;
        await options.checkpoint?.('public_acquired');
        return release;
      } catch (error) {
        if (acquired) throw error;
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      let existing: Owner;
      try { existing = await readOwner(file); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') continue;
        // Windows can deny a read while another process retires the public link.
        // Unknown ownership is contention, never evidence that its owner is dead.
        if (['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) {
          await pause(deadline, options.signal);
          continue;
        }
        throw error;
      }
      if (existing.host !== host) throw new Error('Profile is locked by another host; preserve its lock for recovery.');
      if (dead(existing.pid) && await reclaim(file, existing, candidate, deadline, options)) continue;
      await pause(deadline, options.signal);
    }
  } catch (error) {
    if (acquired) await release();
    else await cleanCandidate();
    throw error;
  }
}

/** A single tombstone is insufficient: its creator could die before unlinking the old
 * lock. The append-only claim chain names each reclaimer's PID/token. A contender waits
 * for a live claimant or advances past a provably dead one. Only one live claimant may
 * unlink this original token. Claims left by crashes are retained; completed live claims
 * are removed only after the original lock is gone or the claimant has stopped trying.
 */
async function reclaim(file: string, original: Owner, candidate: string, deadline: number,
  options: LockOptions): Promise<boolean> {
  for (let index = 0; ; index++) {
    options.signal?.throwIfAborted();
    if (index > 0 && performance.now() >= deadline) throw timeoutError();
    let current: Owner;
    try { current = await readOwner(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
    if (current.token !== original.token) return true;
    const claim = `${file}.${original.token}.reclaim-${index}`;
    try { await link(candidate, claim); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let claimant: Owner;
      try { claimant = await readOwner(claim); }
      catch (readError) { if ((readError as NodeJS.ErrnoException).code === 'ENOENT') { index--; continue; } throw readError; }
      if (claimant.host !== host) throw new Error('Profile recovery belongs to another host.');
      if (dead(claimant.pid)) continue;
      await pause(deadline, options.signal);
      return false;
    }
    try {
      await options.checkpoint?.('reclaim_claimed');
      const observed = await readOwner(file).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      });
      if (!observed || observed.token !== original.token) return true;
      if (!dead(observed.pid)) return false;
      const retired = `${file}.${original.token}.retired`;
      try { await link(file, retired); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      if ((await readOwner(retired)).token !== original.token) throw new Error('Unrecognized profile recovery tombstone.');
      await unlink(file);
      return true;
    } finally {
      await unlink(claim).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
    }
  }
}

async function pause(deadline: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw timeoutError();
  await new Promise<void>(done => setTimeout(done, Math.min(20, remaining)));
}

function timeoutError(): Error { return Object.assign(new Error('Timed out waiting for the active profile operation.'),
  { code: 'profile_lock_timeout' }); }

function checkDeadline(deadline: number, options: LockOptions): void {
  options.signal?.throwIfAborted();
  if (options.timeoutMs !== 0 && performance.now() >= deadline) throw timeoutError();
}

async function readOwner(file: string): Promise<Owner> {
  if (!(await lstat(file)).isFile()) throw new Error('Unrecognized profile lock; preserve it for recovery.');
  const raw = await readFile(file, 'utf8');
  let record: Partial<Owner>;
  try { record = JSON.parse(raw) as Partial<Owner>; }
  catch { throw new Error('Unrecognized profile lock; preserve it for recovery.'); }
  if (!Number.isSafeInteger(record?.pid) || Number(record.pid) < 1 || typeof record.host !== 'string'
    || typeof record.token !== 'string' || !/^[a-f0-9-]{36}$/u.test(record.token)) {
    throw new Error('Unrecognized profile lock; preserve it for recovery.');
  }
  return record as Owner;
}

function dead(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
}
