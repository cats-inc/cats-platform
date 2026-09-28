// Official Cats App v1 encoder, exposed only through the public App SDK entry.
// The bytes depend only on the manifest and file contents: a pure-JS deflate at the
// exact-pinned fflate version, a fixed gzip header, and canonical ordering. Node's
// bundled zlib is avoided because its output can differ across Node builds and CPUs.
import { gzipSync } from 'fflate';
import { decodeAppPackage, isPlainObject } from './format.js';

function canonicalJson(value, location) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${location} must be a finite number.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalJson(entry, `${location}[${index}]`));
  const prototype = isPlainObject(value) ? Object.getPrototypeOf(value) : undefined;
  if (prototype === Object.prototype || prototype === null) {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonicalJson(value[key], `${location}.${key}`)]));
  }
  throw new TypeError(`${location} must contain only JSON values.`);
}

export function encodeAppPackage({ manifest, files }) {
  if (!isPlainObject(manifest)) throw new TypeError('manifest must be an object.');
  if (!Array.isArray(files)) throw new TypeError('files must be an array.');
  const entries = files.map((file, index) => {
    if (!isPlainObject(file) || typeof file.path !== 'string' || !(file.data instanceof Uint8Array)) {
      throw new TypeError(`files[${index}] needs a string path and Uint8Array data.`);
    }
    return { path: file.path, base64: Buffer.from(file.data.buffer, file.data.byteOffset, file.data.byteLength).toString('base64') };
  }).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const envelope = { schemaVersion: 1, kind: 'cats-app', manifest: canonicalJson(manifest, 'manifest'), files: entries };
  const bytes = Buffer.from(gzipSync(Buffer.from(JSON.stringify(envelope)), { level: 9, mtime: 0 }));
  // Header bytes are outside the CRC. Pin mtime (4-7) and the OS byte (9, Unix) explicitly.
  bytes.fill(0, 4, 8);
  bytes[9] = 3;
  // Never emit an archive the host decoder would reject.
  decodeAppPackage(bytes);
  return bytes;
}
