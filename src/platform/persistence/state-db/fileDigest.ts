import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readSync } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

/** Bounded-memory file proof for large DB/legacy backups, including final synchronous import checks. */
export function fileDigest(file: string): string {
  const before = lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('State proofs require regular files.');
  const fd = openSync(file, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(128 * 1024);
  try {
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally { closeSync(fd); }
  const after = lstatSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs) throw new Error('State file changed during its proof.');
  return hash.digest('hex');
}

/** Async proof for maintenance: bounded buffers and no serving-thread file scan. */
export async function fileDigestAsync(file: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('State proofs require regular files.');
  const fd = await open(file, 'r');
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(128 * 1024);
  try {
    const opened = await fd.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error('State file changed before its proof.');
    for (;;) {
      signal?.throwIfAborted();
      const { bytesRead } = await fd.read(buffer);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally { await fd.close(); }
  const after = await lstat(file);
  if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('State file changed during its proof.');
  return hash.digest('hex');
}
