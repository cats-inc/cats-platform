// Host-only App package helpers: Platform version, pinned lock resolution and the
// injected browser bridge. The shared v1 format lives in format.js.
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { MAX_PACKAGE_BYTES, SHA256_PATTERN, assertAppIdentity, decodeAppPackage, isPlainObject } from './format.js';

export { APP_SDK_VERSION, MAX_PACKAGE_BYTES, decodeAppPackage, sha256, supportsVersion } from './format.js';
export const PLATFORM_VERSION = createRequire(import.meta.url)('../../package.json').version;
export const readBrowserSdk = () => readFile(new URL('./browser.js', import.meta.url), 'utf8');
export const componentRunnerUrl = new URL('./component-runner.mjs', import.meta.url);
export const ingressServiceUrl = new URL('./ingress-service.mjs', import.meta.url);

export function parseAppLock(value) {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.apps) || value.apps.length > 64) throw new Error('Invalid app bundle lock.');
  const seen = new Set();
  return { schemaVersion: 1, apps: value.apps.map((entry) => {
    if (!isPlainObject(entry)) throw new Error('Invalid app pin.');
    assertAppIdentity(entry.id, entry.version);
    if (seen.has(entry.id) || !SHA256_PATTERN.test(entry.sha256) || typeof entry.artifact !== 'string' || !entry.artifact.trim()) throw new Error('Duplicate or incomplete app pin.');
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
