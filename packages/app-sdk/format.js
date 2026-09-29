// Cats App v1 package format shared by the host installer and the public App SDK entry.
// Host-only behavior (Platform version, pinned lock resolution, bridge loading) stays in package.js.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// Keep in step with ./package.json and browser.d.ts `sdkVersion`; a test enforces all three.
export const APP_SDK_VERSION = '1.3.0';
export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 24 * 1024 * 1024;
export const MAX_APP_FILES = 128;
export const MAX_APP_FILE_BYTES = 8 * 1024 * 1024;
const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// v1 deliberately supports exact versions, ^x.y.z, x.y.x and x.x only.
// Reject rather than guess at unsupported semver expressions / prereleases.
export function supportsVersion(version, range) {
  if (typeof version !== 'string' || typeof range !== 'string' || !VERSION.test(version)) return false;
  const v = version.split('.').map(Number);
  if (VERSION.test(range)) return range === version;
  const wildcard = /^(0|[1-9]\d*)\.(?:(0|[1-9]\d*)\.)?x$/.exec(range);
  if (wildcard) return v[0] === Number(wildcard[1]) && (wildcard[2] === undefined || v[1] === Number(wildcard[2]));
  if (!range.startsWith('^') || !VERSION.test(range.slice(1))) return false;
  const r = range.slice(1).split('.').map(Number);
  const compare = v[0] - r[0] || v[1] - r[1] || v[2] - r[2];
  if (compare < 0 || v[0] !== r[0]) return false;
  return r[0] > 0 || (v[1] === r[1] && (r[1] > 0 || v[2] === r[2]));
}

// Lower bound of a supported range as [major, minor, patch], or null for unsupported grammar.
// `^1.2.3` and exact versions start at themselves; `1.x` and `1.2.x` start at .0.
export function minimumVersion(range) {
  if (typeof range !== 'string') return null;
  if (VERSION.test(range)) return range.split('.').map(Number);
  const wildcard = /^(0|[1-9]\d*)\.(?:(0|[1-9]\d*)\.)?x$/.exec(range);
  if (wildcard) return [Number(wildcard[1]), wildcard[2] === undefined ? 0 : Number(wildcard[2]), 0];
  if (range.startsWith('^') && VERSION.test(range.slice(1))) return range.slice(1).split('.').map(Number);
  return null;
}

// ADR-128: `compatibility.catsPlatform` is a minimum host version, not a range. The host
// accepts any version at or above the declared range's lower bound; the App SDK version
// (`supportsVersion`) is the only compatibility gate. Unsupported grammar still fails.
export function meetsMinimumVersion(version, range) {
  if (typeof version !== 'string' || !VERSION.test(version)) return false;
  const floor = minimumVersion(range);
  if (!floor) return false;
  const v = version.split('.').map(Number);
  return (v[0] - floor[0] || v[1] - floor[1] || v[2] - floor[2]) >= 0;
}

export function assertAppIdentity(id, version) {
  if (typeof id !== 'string' || id.length > 100 || !ID.test(id)
    || typeof version !== 'string' || !VERSION.test(version)) throw new Error('Invalid app ID or stable version.');
}

export function decodeAppPackage(bytes, expected) {
  if (bytes.length > MAX_PACKAGE_BYTES) throw new Error('App package exceeds compressed size limit.');
  const digest = sha256(bytes);
  if (expected && (!SHA256_PATTERN.test(expected.sha256) || digest !== expected.sha256)) throw new Error('App package SHA-256 mismatch.');
  const envelope = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED_BYTES }).toString('utf8'));
  if (!isPlainObject(envelope) || ![1, 2].includes(envelope.schemaVersion) || envelope.kind !== 'cats-app'
    || !isPlainObject(envelope.manifest) || !Array.isArray(envelope.files)) throw new Error('Invalid Cats App v1 archive.');
  const { manifest } = envelope;
  assertAppIdentity(manifest.id, manifest.version);
  if (expected && (manifest.id !== expected.id || manifest.version !== expected.version)) throw new Error('App package identity/version mismatch.');
  if (envelope.files.length === 0 || envelope.files.length > MAX_APP_FILES) throw new Error('Invalid app file count.');
  const seen = new Set();
  const files = envelope.files.map((file) => {
    // Portable, case-insensitive namespace. No symlinks, executable hooks, or device names.
    if (!isPlainObject(file) || typeof file.path !== 'string' || file.path.length > 180
      || !/^[a-zA-Z0-9_./-]+$/.test(file.path)
      || file.path.split('/').some((part) => !part || part === '.' || part === '..'
        || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) || part.endsWith('.'))
      || ['cats.app.json', '.package.json'].includes(file.path.toLowerCase())
      || seen.has(file.path.toLowerCase()) || typeof file.base64 !== 'string'
      // A grouped repetition here overflows the regexp stack for files above ~3 MiB.
      // This linear pre-check plus the round trip below accepts exactly canonical base64.
      || file.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) {
      throw new Error('Unsafe, duplicate, or invalid app file.');
    }
    seen.add(file.path.toLowerCase());
    const data = Buffer.from(file.base64, 'base64');
    if (data.length > MAX_APP_FILE_BYTES || data.toString('base64') !== file.base64) throw new Error('Invalid app file payload.');
    return { path: file.path, data };
  });
  if (envelope.schemaVersion === 2) {
    if (!isPlainObject(manifest.components) || manifest.components.schemaVersion !== 1
      || manifest.entrypoints !== undefined) throw new Error('v2 archives require a components deployment without legacy entrypoints.');
  } else if (manifest.components !== undefined || typeof manifest.entrypoints?.renderer !== 'string'
    || !files.some((file) => file.path === manifest.entrypoints.renderer)
    || !manifest.entrypoints.renderer.endsWith('.html')
    || manifest.entrypoints.server || manifest.entrypoints.worker) throw new Error('v1 packages require a self-contained HTML renderer; server/worker execution is unsupported.');
  return { manifest, files, sha256: digest };
}
