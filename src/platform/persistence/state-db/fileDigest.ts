import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readSync } from 'node:fs';

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
