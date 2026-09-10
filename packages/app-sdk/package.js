import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

export const APP_SDK_VERSION = '1.0.0';
export const PLATFORM_VERSION = createRequire(import.meta.url)('../../package.json').version;
export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 24 * 1024 * 1024;
const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HASH = /^[a-f0-9]{64}$/;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const readBrowserSdk = () => readFile(new URL('./browser.js', import.meta.url), 'utf8');

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

function assertIdentity(id, version) {
  if (typeof id !== 'string' || id.length > 100 || !ID.test(id)
    || typeof version !== 'string' || !VERSION.test(version)) throw new Error('Invalid app ID or stable version.');
}

export function decodeAppPackage(bytes, expected) {
  if (bytes.length > MAX_PACKAGE_BYTES) throw new Error('App package exceeds compressed size limit.');
  const digest = sha256(bytes);
  if (expected && (!HASH.test(expected.sha256) || digest !== expected.sha256)) throw new Error('App package SHA-256 mismatch.');
  const envelope = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED_BYTES }).toString('utf8'));
  if (!object(envelope) || envelope.schemaVersion !== 1 || envelope.kind !== 'cats-app'
    || !object(envelope.manifest) || !Array.isArray(envelope.files)) throw new Error('Invalid Cats App v1 archive.');
  const { manifest } = envelope;
  assertIdentity(manifest.id, manifest.version);
  if (expected && (manifest.id !== expected.id || manifest.version !== expected.version)) throw new Error('App package identity/version mismatch.');
  if (envelope.files.length === 0 || envelope.files.length > 128) throw new Error('Invalid app file count.');
  const seen = new Set();
  const files = envelope.files.map((file) => {
    // Portable, case-insensitive namespace. No symlinks, executable hooks, or device names.
    if (!object(file) || typeof file.path !== 'string' || file.path.length > 180
      || !/^[a-zA-Z0-9_./-]+$/.test(file.path)
      || file.path.split('/').some((part) => !part || part === '.' || part === '..'
        || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) || part.endsWith('.'))
      || ['cats.app.json', '.package.json'].includes(file.path.toLowerCase())
      || seen.has(file.path.toLowerCase()) || typeof file.base64 !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) {
      throw new Error('Unsafe, duplicate, or invalid app file.');
    }
    seen.add(file.path.toLowerCase());
    const data = Buffer.from(file.base64, 'base64');
    if (data.length > 8 * 1024 * 1024 || data.toString('base64') !== file.base64) throw new Error('Invalid app file payload.');
    return { path: file.path, data };
  });
  if (typeof manifest.entrypoints?.renderer !== 'string'
    || !files.some((file) => file.path === manifest.entrypoints.renderer)
    || !manifest.entrypoints.renderer.endsWith('.html')
    || manifest.entrypoints.server || manifest.entrypoints.worker) throw new Error('v1 packages require a self-contained HTML renderer; server/worker execution is unsupported.');
  return { manifest, files, sha256: digest };
}

export function parseAppLock(value) {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.apps) || value.apps.length > 64) throw new Error('Invalid app bundle lock.');
  const seen = new Set();
  return { schemaVersion: 1, apps: value.apps.map((entry) => {
    if (!object(entry)) throw new Error('Invalid app pin.');
    assertIdentity(entry.id, entry.version);
    if (seen.has(entry.id) || !HASH.test(entry.sha256) || typeof entry.artifact !== 'string' || !entry.artifact.trim()) throw new Error('Duplicate or incomplete app pin.');
    seen.add(entry.id);
    return { id: entry.id, version: entry.version, sha256: entry.sha256, artifact: entry.artifact };
  }) };
}

export async function resolveAppLock(lockPath) {
  const lock = parseAppLock(JSON.parse(await readFile(lockPath, 'utf8')));
  const resolved = [];
  for (const pin of lock.apps) {
    let bytes;
    if (/^https:/i.test(pin.artifact)) {
      const url = new URL(pin.artifact);
      const parts = url.pathname.split('/');
      if (url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash
        || parts.length !== 7 || parts[3] !== 'releases' || parts[4] !== 'download'
        || /latest|nightly|current/i.test(parts[5])) throw new Error('App URL must be a pinned GitHub release asset, not a moving alias.');
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok || !response.body) throw new Error(`Cannot download pinned app: HTTP ${response.status}.`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_PACKAGE_BYTES) { await response.body.cancel().catch(() => {}); throw new Error('App download exceeds size limit.'); }
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    } else {
      if (/^[a-z]+:\/\//i.test(pin.artifact)) throw new Error('Unsupported app artifact URL.');
      const artifactPath = path.resolve(path.dirname(lockPath), pin.artifact);
      if ((await stat(artifactPath)).size > MAX_PACKAGE_BYTES) throw new Error('App package exceeds size limit.');
      bytes = await readFile(artifactPath);
    }
    const decoded = decodeAppPackage(bytes, pin);
    resolved.push({ ...pin, bytes, manifest: decoded.manifest });
  }
  return resolved;
}

export async function materializeAppSelection(apps) {
  parseAppLock({ schemaVersion: 1, apps });
  for (const app of apps) decodeAppPackage(app.bytes, app);
  const directory = await mkdtemp(path.join(tmpdir(), 'cats-desktop-apps-'));
  const pins = [];
  for (const app of apps) {
    const artifact = `${app.id}-${app.version}.catsapp`;
    await writeFile(path.join(directory, artifact), app.bytes, { flag: 'wx' });
    pins.push({ id: app.id, version: app.version, sha256: app.sha256, artifact });
  }
  const lockPath = path.join(directory, 'bundle.lock.json');
  await writeFile(lockPath, `${JSON.stringify({ schemaVersion: 1, apps: pins }, null, 2)}\n`, { flag: 'wx' });
  return lockPath;
}
