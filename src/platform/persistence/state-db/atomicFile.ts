import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Atomic, durable replacement; never delete the destination to get around Windows locks. */
export async function writeDurableFile(file: string, bytes: string | Uint8Array): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.unfinished`;
  const fd = await open(temporary, 'wx', 0o600);
  try {
    try { await fd.writeFile(bytes); await fd.sync(); } finally { await fd.close(); }
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
