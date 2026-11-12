import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { lstat, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import { parseJsonRecord, ProfileStorageError, readOptionalFile } from './profileFormat.js';

export interface ProfileLease {
  (): Promise<void>;
  token: string;
}

/** A connection lease outlives short operation locks. Offline restore checks these before
 * replacing a database: POSIX would otherwise let an idle process keep writing an old inode.
 * These helpers are always called under the profile operation lock.
 */
export async function createProfileLease(profile: string,
  prepared?: () => void | Promise<void>): Promise<ProfileLease> {
  const directory = `${profile}.leases`;
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalid();
  await reclaimLeaseTemporaries(directory);
  const token = randomUUID();
  const file = path.join(directory, `${token}.json`);
  const text = JSON.stringify({ pid: process.pid, host: hostname(), token });
  await writeDurableFile(file, text, prepared);
  return Object.assign(async () => {
    const bytes = await readOptionalFile(file);
    if (bytes === null) return;
    if (bytes.toString('utf8') !== text) throw invalid();
    await unlink(file);
  }, { token });
}

export async function assertProfileOffline(profile: string, ignoreToken?: string): Promise<void> {
  const directory = `${profile}.leases`;
  let names: string[];
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalid();
    await reclaimLeaseTemporaries(directory);
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.json$/u.test(name)) throw invalid();
    const file = path.join(directory, name);
    const bytes = await readOptionalFile(file);
    if (bytes === null) continue;
    const owner = parseJsonRecord(bytes.toString('utf8'));
    if (owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 1) throw invalid();
    if (`${owner.token}.json` !== name) throw invalid();
    if (owner.token === ignoreToken) continue;
    let gone = false;
    try { process.kill(Number(owner.pid), 0); }
    catch (error) { gone = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
    if (!gone) throw new ProfileStorageError('profile_busy',
      'Close Cats Desktop and every process using this profile before restoring state.');
    await unlink(file);
  }
}

/** A killed writer can leave a partial durable-file candidate before publishing its lease.
 * Only our exact temporary names with a provably dead local PID are reclaimable.
 */
async function reclaimLeaseTemporaries(directory: string): Promise<void> {
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
  const pattern = new RegExp(`^${uuid}\\.json\\.([1-9][0-9]*)\\.${uuid}\\.unfinished$`, 'u');
  for (const name of await readdir(directory)) {
    const match = pattern.exec(name);
    if (!match) continue;
    const pid = Number(match[1]);
    if (!Number.isSafeInteger(pid)) throw invalid();
    const file = path.join(directory, name);
    const bytes = await readOptionalFile(file); // Also rejects links and directories.
    if (!bytes) continue;
    try {
      const owner = JSON.parse(bytes.toString('utf8')) as { host?: unknown } | null;
      if (owner?.host !== undefined && owner.host !== hostname()) throw invalid();
    } catch (error) { if (error instanceof ProfileStorageError) throw error; }
    let gone = false;
    try { process.kill(pid, 0); }
    catch (error) { gone = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
    if (!gone) throw new ProfileStorageError('profile_busy',
      'A state connection lease is being prepared; close its process before recovery.');
    await unlink(file);
  }
}

function invalid(): ProfileStorageError {
  return new ProfileStorageError('invalid_lease', 'An unrecognized state connection lease was preserved for recovery.');
}
