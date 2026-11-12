import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { syncDirectory, writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import { withProfileLock } from '../../../../platform/persistence/state-db/profileLock.js';
import { openStateDatabase } from '../../../../platform/persistence/state-db/stateDatabase.js';
import { runStateMaintenance } from '../../../../platform/persistence/state-db/stateMaintenance.js';
import { MetadataCommit } from './metadataCommit.js';
import { bytesDigest, databasePath, parseEnvelope, storageNameIdentity } from './profileFormat.js';

const DAY = 24 * 60 * 60_000;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const COMPLETE = new RegExp(`^snapshot-[0-9]{8}T[0-9]{9}Z-${UUID}$`, 'u');
const UNFINISHED = new RegExp(`^\\.unfinished-${UUID}$`, 'u');

export interface ProfileSnapshotManifest {
  format: 1; kind: 'paired-state-snapshot'; profile: string; createdAt: string;
  installationId: string; revision: string; metadataDigest: string; schemaVersion: number;
  files: Array<{ name: string; sha256: string }>;
}
export type ProfileSnapshotResult = { status: 'published'; directory: string; manifest: string }
  | { status: 'not_due' | 'changed' | 'busy' };
export interface ProfileSnapshotOptions {
  signal?: AbortSignal;
  now?: Date;
  retain?: number;
  force?: boolean;
  timeoutMs?: number;
  /** Private fault-injection seam, never selected by a product request. */
  checkpoint?(stage: 'captured' | 'snapshot_written' | 'verified' | 'published' | 'before_prune'): void | Promise<void>;
}
export class ProfileSnapshotError extends Error {
  constructor(readonly code: 'snapshot_failed' | 'cancelled') {
    super(code === 'cancelled' ? 'State snapshot maintenance was cancelled.' : 'A verified paired state snapshot could not be completed.');
  }
}

export const profileSnapshotDirectory = (profile: string): string => `${path.resolve(profile)}.state-db-snapshots`;
/** Appending to the profile basename cannot collide with its JSON/DB/receipt,
 * including an explicitly configured profile named manifest.json. */
export const profileSnapshotManifestName = (profile: string): string => `${path.basename(profile)}.snapshot-manifest.json`;

/** Only capture runs under the serving store's operation lock. Native VACUUM/check,
 * hashing and retention never hold that lock, so a busy profile can defer a backup.
 */
export async function maintainProfileSnapshot(profilePath: string,
  capture: (signal: AbortSignal) => Promise<Buffer>, options: ProfileSnapshotOptions = {}): Promise<ProfileSnapshotResult> {
  const profile = path.resolve(profilePath);
  const now = options.now ?? new Date();
  const retain = options.retain ?? 7;
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(retain) || retain < 1 || retain > 30) throw new RangeError('Invalid snapshot policy');
  const signal = options.signal ?? new AbortController().signal;
  const root = profileSnapshotDirectory(profile);
  try {
    signal.throwIfAborted();
    await mkdir(root, { recursive: true, mode: 0o700 });
    await assertDirectory(root);
    return await withProfileLock(path.join(root, 'maintenance'), async () => {
      signal.throwIfAborted();
      // Dead holders are reclaimed by the separate maintenance lock. An unfinished
      // directory is never accepted as a backup, including after publication failure.
      for (const name of await readdir(root)) if (UNFINISHED.test(name)) {
        await removeSnapshotDirectory(path.join(root, name), profile).catch(() => false);
      }
      const metadata = await capture(signal);
      const envelope = parseEnvelope(metadata.toString('utf8'), profile);
      const complete = [];
      for (const name of await readdir(root)) if (COMPLETE.test(name)) {
        signal.throwIfAborted();
        const directory = path.join(root, name);
        try { complete.push({ directory, manifest: await inspectProfileSnapshot(directory, profile, signal) }); }
        catch (error) { if (signal.aborted) throw error; /* damaged/incomplete pairs never count */ }
      }
      const eligible = complete.filter(item => item.manifest.installationId === envelope.storage.installationId
        && Date.parse(item.manifest.createdAt) <= now.getTime());
      const latest = Math.max(-Infinity, ...eligible.map(item => Date.parse(item.manifest.createdAt)));
      if (!options.force && now.getTime() - latest < DAY) {
        await options.checkpoint?.('before_prune');
        const kept = await prune(eligible, retain, profile, signal, now, envelope.storage.installationId);
        if (!kept.some(item => now.getTime() - Date.parse(item.manifest.createdAt) < DAY)) throw new Error('The recent snapshot no longer verifies');
        await syncDirectory(root);
        return { status: 'not_due' };
      }
      await options.checkpoint?.('captured');
      signal.throwIfAborted();
      const stage = path.join(root, `.unfinished-${randomUUID()}`);
      await mkdir(stage, { mode: 0o700 });
      let published = false;
      try {
        const savedProfile = path.join(stage, path.basename(profile));
        const savedDatabase = databasePath(savedProfile);
        await writeDurableFile(savedProfile, metadata);
        const receipt = `${JSON.stringify({ format: 1, installationId: envelope.storage.installationId })}\n`;
        await writeDurableFile(`${savedProfile}.database.json`, receipt);
        signal.throwIfAborted();
        await runStateMaintenance({ kind: 'snapshot', file: databasePath(profile), target: savedDatabase },
          { timeoutMs: options.timeoutMs ?? 5 * 60_000, signal });
        await options.checkpoint?.('snapshot_written');
        signal.throwIfAborted();
        await chmod(savedDatabase, 0o600);
        const fd = await open(savedDatabase, 'r+');
        try { await fd.sync(); } finally { await fd.close(); }
        const database = openStateDatabase({ file: savedDatabase, mode: 'reader' });
        let schemaVersion: number;
        try {
          // A different revision, including a pending handoff, is an ordinary
          // concurrent-write deferral. Never recover or modify a backup to match.
          if (database.meta('installation_id') !== envelope.storage.installationId
            || database.meta('revision') !== envelope.storage.revision
            || database.meta('metadata_digest') !== bytesDigest(metadata)
            || database.get('select revision from metadata_handoff where singleton = 1')) return { status: 'changed' };
          await new MetadataCommit(savedProfile, database).readCommitted();
          if (database.meta('profile_import_complete') !== '1') throw new Error('Incomplete snapshot');
          schemaVersion = Number(database.meta('schema_version'));
        } finally { database.close(); }
        const files = [];
        for (const name of snapshotNames(profile)) files.push({ name, sha256: await digestFile(path.join(stage, name), signal) });
        const manifest: ProfileSnapshotManifest = { format: 1, kind: 'paired-state-snapshot', profile: path.basename(profile),
          createdAt: now.toISOString(), installationId: envelope.storage.installationId, revision: envelope.storage.revision,
          metadataDigest: bytesDigest(metadata), schemaVersion, files };
        await writeDurableFile(path.join(stage, profileSnapshotManifestName(profile)), `${JSON.stringify(manifest, null, 2)}\n`);
        await inspectProfileSnapshot(stage, profile, signal);
        await options.checkpoint?.('verified');
        signal.throwIfAborted();
        const directory = path.join(root, `snapshot-${now.toISOString().replace(/[-:.]/gu, '')}-${randomUUID()}`);
        await rename(stage, directory);
        published = true;
        await syncDirectory(root);
        await options.checkpoint?.('published');
        await options.checkpoint?.('before_prune');
        signal.throwIfAborted();
        const kept = await prune([...eligible, { directory, manifest }], retain, profile, signal, now, envelope.storage.installationId, directory);
        if (!kept.some(item => item.directory === directory)) throw new Error('The published snapshot no longer verifies');
        await syncDirectory(root);
        return { status: 'published', directory, manifest: path.join(directory, profileSnapshotManifestName(profile)) };
      } finally { if (!published) await removeSnapshotDirectory(stage, profile).catch(() => false); }
    }, { timeoutMs: 0, signal });
  } catch (error) {
    if (signal.aborted) throw new ProfileSnapshotError('cancelled');
    if ((error as { code?: unknown })?.code === 'profile_lock_timeout') return { status: 'busy' };
    throw new ProfileSnapshotError('snapshot_failed');
  }
}

/** Valid completed pairs only: fixed basenames, exact file proofs and matching
 * database identity/revision/metadata. Read-only; never creates or repairs a pair.
 */
export async function inspectProfileSnapshot(directory: string, profile: string,
  signal: AbortSignal = new AbortController().signal, selectedManifest?: string): Promise<ProfileSnapshotManifest> {
  signal.throwIfAborted();
  await assertDirectory(directory);
  const preferred = profileSnapshotManifestName(profile);
  if (selectedManifest && ![preferred, 'manifest.json'].some(name => storageNameIdentity(name) === storageNameIdentity(selectedManifest))) throw new Error('Invalid snapshot manifest name');
  let manifestFile = path.join(directory, selectedManifest ?? preferred);
  if (!selectedManifest && !(await lstat(manifestFile).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error;
  }))) manifestFile = path.join(directory, 'manifest.json'); // Read older verified backups without rewriting them.
  const stat = await lstat(manifestFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error('Invalid snapshot manifest');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as ProfileSnapshotManifest;
  const names = snapshotNames(profile);
  if ((await readdir(directory)).some(name => !allowedSnapshotName(name, profile))) throw new Error('Unexpected snapshot file');
  if (manifest.format !== 1 || manifest.kind !== 'paired-state-snapshot'
    || storageNameIdentity(manifest.profile) !== storageNameIdentity(path.basename(profile))
    || !Number.isFinite(Date.parse(manifest.createdAt)) || new Date(manifest.createdAt).toISOString() !== manifest.createdAt
    || !Array.isArray(manifest.files) || manifest.files.length !== names.length
    || names.some(name => manifest.files.filter(file => typeof file.name === 'string'
      && storageNameIdentity(file.name) === storageNameIdentity(name)).length !== 1)) throw new Error('Invalid snapshot manifest');
  for (const file of manifest.files) {
    if (!/^[a-f0-9]{64}$/u.test(file.sha256) || await digestFile(path.join(directory, file.name), signal) !== file.sha256) throw new Error('Snapshot digest mismatch');
  }
  const savedProfile = path.join(directory, path.basename(profile));
  const metadata = await readFile(savedProfile);
  const envelope = parseEnvelope(metadata.toString('utf8'), savedProfile);
  const receipt = JSON.parse(await readFile(`${savedProfile}.database.json`, 'utf8')) as { format?: unknown; installationId?: unknown };
  if (bytesDigest(metadata) !== manifest.metadataDigest || envelope.storage.installationId !== manifest.installationId
    || envelope.storage.revision !== manifest.revision || receipt.format !== 1 || receipt.installationId !== manifest.installationId) throw new Error('Snapshot identity mismatch');
  const database = openStateDatabase({ file: databasePath(savedProfile), mode: 'reader' });
  try {
    await new MetadataCommit(savedProfile, database).readCommitted();
    if (database.meta('profile_import_complete') !== '1' || Number(database.meta('schema_version')) !== manifest.schemaVersion) throw new Error('Snapshot schema mismatch');
  } finally { database.close(); }
  return manifest;
}

function snapshotNames(profile: string): string[] {
  return [path.basename(profile), path.basename(databasePath(profile)), `${path.basename(profile)}.database.json`];
}
async function assertDirectory(directory: string): Promise<void> {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Snapshot directory must not be redirected');
}
async function prune(complete: Array<{ directory: string; manifest: ProfileSnapshotManifest }>, retain: number,
  profile: string, signal: AbortSignal, now: Date, installationId: string, preferred?: string) {
  // Revalidate what will be retained immediately before any deletion. A pair
  // damaged since discovery/publication must never displace the last good one.
  const verified = [];
  for (const item of complete) {
    signal.throwIfAborted();
    try {
      const manifest = await inspectProfileSnapshot(item.directory, profile, signal);
      if (manifest.installationId === installationId && Date.parse(manifest.createdAt) <= now.getTime()) verified.push({ directory: item.directory, manifest });
    } catch (error) { if (signal.aborted) throw error; }
  }
  const ordered = verified.sort((a, b) => Date.parse(b.manifest.createdAt) - Date.parse(a.manifest.createdAt)
    || Number(b.directory === preferred) - Number(a.directory === preferred) || b.directory.localeCompare(a.directory));
  for (const old of ordered.slice(retain)) {
    signal.throwIfAborted();
    if (!await removeSnapshotDirectory(old.directory, profile)) throw new Error('Snapshot changed before removal');
  }
  return ordered.slice(0, retain);
}
async function digestFile(file: string, signal: AbortSignal): Promise<string> {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Snapshot proof needs a regular file');
  const fd = await open(file, 'r');
  const hash = createHash('sha256'); const buffer = Buffer.allocUnsafe(128 * 1024);
  try {
    for (;;) {
      signal.throwIfAborted();
      const { bytesRead } = await fd.read(buffer);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally { await fd.close(); }
  const after = await lstat(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Snapshot changed during proof');
  return hash.digest('hex');
}
async function removeSnapshotDirectory(directory: string, profile: string): Promise<boolean> {
  await assertDirectory(directory);
  const entries = await readdir(directory);
  for (const name of entries) {
    if (!allowedSnapshotName(name, profile)) return false;
    const stat = await lstat(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
  }
  for (const name of entries) await unlink(path.join(directory, name));
  await rmdir(directory);
  return true;
}
function allowedSnapshotName(name: string, profile: string): boolean {
  const identity = storageNameIdentity(name);
  return [...snapshotNames(profile), profileSnapshotManifestName(profile), 'manifest.json'].map(storageNameIdentity).some(base =>
    identity === base || identity === `${base}-wal` || identity === `${base}-shm`
    || identity.startsWith(`${base}.`) && new RegExp(`^[0-9]+\\.${UUID}\\.unfinished$`, 'u').test(identity.slice(base.length + 1)));
}

/** Explicitly started after server recovery. A separate abortable capture keeps
 * shutdown/reset from deadlocking behind the serving profile lock.
 */
export class ProfileSnapshotMaintenance {
  private readonly abort = new AbortController();
  private readonly signal: AbortSignal;
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<ProfileSnapshotResult>;
  private started = false;
  private stopped = false;
  private readonly onAbort = () => { void this.stop(); };
  constructor(private readonly profile: string, private readonly capture: (signal: AbortSignal) => Promise<Buffer>,
    private readonly options: { signal?: AbortSignal; initialDelayMs?: number; intervalMs?: number;
      onError?(code: 'snapshot_failed' | 'cancelled'): void } = {}) {
    this.signal = options.signal ? AbortSignal.any([this.abort.signal, options.signal]) : this.abort.signal;
  }
  start(): void {
    if (this.started || this.stopped || this.signal.aborted) return;
    this.started = true;
    this.options.signal?.addEventListener('abort', this.onAbort, { once: true });
    this.schedule(this.options.initialDelayMs ?? 30_000);
  }
  run(): Promise<ProfileSnapshotResult> {
    if (this.stopped || this.signal.aborted) return Promise.reject(new ProfileSnapshotError('cancelled'));
    return this.active ??= maintainProfileSnapshot(this.profile, this.capture, { signal: this.signal })
      .finally(() => { this.active = undefined; });
  }
  async stop(): Promise<void> {
    this.stopped = true; this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    this.options.signal?.removeEventListener('abort', this.onAbort);
    await this.active?.catch(() => {});
  }
  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.run().catch(error => {
        if (!this.signal.aborted) {
          try { this.options.onError?.(error instanceof ProfileSnapshotError ? error.code : 'snapshot_failed'); }
          catch { /* A diagnostic sink cannot turn a backup failure into an unhandled rejection. */ }
        }
      }).finally(() => { if (!this.stopped && !this.signal.aborted) this.schedule(this.options.intervalMs ?? 60 * 60_000); });
    }, delay);
    this.timer.unref();
  }
}
