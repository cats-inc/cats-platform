import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, copyFile, lstat, link, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Atomic, durable replacement; never delete the destination to get around Windows locks. */
export async function writeDurableFile(file: string, bytes: string | Uint8Array,
  beforePublish?: () => void | Promise<void>): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.unfinished`;
  const fd = await open(temporary, 'wx', 0o600);
  try {
    try { await fd.writeFile(bytes); await fd.sync(); } finally { await fd.close(); }
    await beforePublish?.();
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, file); break; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= 9 || !['EPERM', 'EACCES', 'EEXIST'].includes(code ?? '')) throw error;
        await new Promise<void>(done => setTimeout(done, 10 * (attempt + 1)));
      }
    }
    await syncDirectory(dirname(file));
  } finally {
    await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
  }
}

export async function syncDirectory(directory: string): Promise<void> {
  // Windows does not expose directory fsync through Node. Synced file data + replace is
  // the supported boundary there; POSIX also flushes the directory entry.
  if (process.platform === 'win32') return;
  const fd = await open(directory, 'r');
  try { await fd.sync(); } finally { await fd.close(); }
}

/** Single-file copy, never recursive cp/rm (Electron 41's Unicode path hazards).
 * Publish a new destination only after its contents have reached disk.
 */
export async function copyDurableFile(source: string, destination: string): Promise<void> {
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('State backup source must be a regular file.');
  const temporary = `${destination}.${randomUUID()}.unfinished`;
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    await chmod(temporary, 0o600);
    const fd = await open(temporary, 'r+');
    try { await fd.sync(); } finally { await fd.close(); }
    await link(temporary, destination);
    await syncDirectory(dirname(destination));
  } finally {
    await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
  }
}

/** Remove a verified state file, including Windows read-only files, without recursive rm. */
export async function unlinkStateFile(file: string): Promise<void> {
  try { await unlink(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw error;
    await chmod(file, 0o600);
    await unlink(file);
  }
}
