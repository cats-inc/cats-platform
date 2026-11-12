import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { withProfileLock } from '../../../../platform/persistence/state-db/profileLock.js';
import { copyDurableFile, syncDirectory, unlinkStateFile, writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import { fileDigest } from '../../../../platform/persistence/state-db/fileDigest.js';
import { admitLegacyBytes, normalizeLegacyRecord, validateLegacyManifest } from './legacyImport.js';
import { assertProfileOffline } from './profileLease.js';
import { bytesDigest, databasePath, parseJsonRecord, ProfileStorageError, readOptionalFile, storageNameIdentity } from './profileFormat.js';

interface SavedFile { name: string; original: string; sha256: string; }
interface CurrentBackup {
  format: 1; kind: 'before-legacy-restore'; profile: string; files: SavedFile[];
}
interface RestoreJournal {
  format: 1;
  profile: string;
  sourceManifestDigest: string;
  targetDigest: string;
  originalPrimaryDigest: string | null;
  currentDirectory: string;
  currentManifestDigest: string;
}
export interface RestoreOptions {
  checkpoint?(stage: 'restore_source_verified' | 'restore_prepared' | 'restore_primary_published' | 'restore_files_removed'): void | Promise<void>;
}
export interface RestoreResult { backupDirectory: string; restoredVersion: number; }

/** Offline, restartable rollback to the previous JSON minor. The marker blocks new-store
 * startup throughout the multi-file switch; current bytes are backed up before any change.
 */
export async function restoreLegacyProfile(profilePath: string, backupManifest: string,
  options: RestoreOptions = {}): Promise<RestoreResult> {
  const profile = path.resolve(profilePath);
  databasePath(profile);
  // Reject an invalid backup before even creating the target operation-lock directory.
  await loadLegacyBackup(backupManifest, profile, options);
  return withProfileLock(profile, async () => {
    await assertProfileOffline(profile);
    const source = await loadLegacyBackup(backupManifest, profile, options);
    const marker = `${profile}.state-db-restore.json`;
    const existing = await readOptionalFile(marker);
    let journal: RestoreJournal;
    let current: CurrentBackup;
    let currentDirectory: string;
    if (existing) {
      journal = validateJournal(parseJsonRecord(existing.toString('utf8')), profile);
      if (journal.sourceManifestDigest !== source.manifestDigest || journal.targetDigest !== bytesDigest(source.target)) {
        throw invalid('The pending restore belongs to another source; preserve it and resume the matching restore.');
      }
      currentDirectory = path.join(path.dirname(profile), journal.currentDirectory);
      await assertDirectory(currentDirectory);
      const saved = await readOptionalFile(path.join(currentDirectory, 'manifest.json'));
      if (!saved || bytesDigest(saved) !== journal.currentManifestDigest) throw invalid('The current-state backup manifest did not verify.');
      current = validateCurrentBackup(parseJsonRecord(saved.toString('utf8')), profile);
      verifySavedFiles(currentDirectory, current);
    } else {
      currentDirectory = `${profile}.before-restore-${randomUUID()}`;
      await mkdir(currentDirectory, { mode: 0o700 });
      await assertDirectory(currentDirectory);
      current = { format: 1, kind: 'before-legacy-restore', profile: path.basename(profile), files: [] };
      for (const name of await currentNames(profile)) {
        const sourceFile = path.join(path.dirname(profile), name);
        if (!(await regularExists(sourceFile))) continue;
        const digest = fileDigest(sourceFile);
        const savedName = `current-${current.files.length}.bin`;
        const destination = path.join(currentDirectory, savedName);
        await copyDurableFile(sourceFile, destination);
        if (fileDigest(destination) !== digest || fileDigest(sourceFile) !== digest) {
          throw invalid('State changed while preparing restore; no active files were replaced.');
        }
        current.files.push({ name: savedName, original: name, sha256: digest });
      }
      const text = `${JSON.stringify(current, null, 2)}\n`;
      await writeDurableFile(path.join(currentDirectory, 'manifest.json'), text);
      journal = {
        format: 1, profile: path.basename(profile), sourceManifestDigest: source.manifestDigest,
        targetDigest: bytesDigest(source.target), currentDirectory: path.basename(currentDirectory),
        currentManifestDigest: bytesDigest(text),
        originalPrimaryDigest: current.files.find(file => sameName(file.original, path.basename(profile)))?.sha256 ?? null,
      };
      await writeDurableFile(marker, `${JSON.stringify(journal, null, 2)}\n`);
    }
    await options.checkpoint?.('restore_prepared');
    const primary = await readOptionalFile(profile);
    const found = primary === null ? null : bytesDigest(primary);
    if (found !== journal.originalPrimaryDigest && found !== journal.targetDigest) {
      throw invalid('The primary changed outside the pending restore; its bytes were preserved.');
    }
    // Validate every active destination before replacing any of them. Missing files are
    // expected when resuming a switch; changed files are never overwritten or removed.
    for (const file of current.files) {
      if (sameName(file.original, path.basename(profile))) continue;
      const active = path.join(path.dirname(profile), file.original);
      if (await regularExists(active) && fileDigest(active) !== file.sha256) {
        throw invalid('An active state file changed during restore; it was preserved.');
      }
    }
    if (found !== journal.targetDigest) await writeDurableFile(profile, source.target);
    await options.checkpoint?.('restore_primary_published');
    for (const file of current.files) {
      if (sameName(file.original, path.basename(profile))) continue;
      const active = path.join(path.dirname(profile), file.original);
      if (await regularExists(active)) {
        if (fileDigest(active) !== file.sha256) throw invalid('A state file changed before removal; it was preserved.');
        await unlinkStateFile(active);
      }
    }
    await syncDirectory(path.dirname(profile));
    await options.checkpoint?.('restore_files_removed');
    if (bytesDigest((await readOptionalFile(profile)) ?? '') !== journal.targetDigest) {
      throw invalid('The restored primary did not verify.');
    }
    const remaining = (await currentNames(profile)).filter(name => !sameName(name, path.basename(profile)));
    for (const name of remaining) {
      if (await regularExists(path.join(path.dirname(profile), name))) {
        throw invalid('Unexpected active database or backup files remain; resume restore after inspection.');
      }
    }
    await unlink(marker);
    await syncDirectory(path.dirname(profile));
    return { backupDirectory: currentDirectory, restoredVersion: source.version };
  });
}

async function loadLegacyBackup(manifestPath: string, profile: string, options: RestoreOptions): Promise<{
  target: Buffer; manifestDigest: string; version: number;
}> {
  const file = path.resolve(manifestPath);
  await assertDirectory(path.dirname(file));
  const bytes = await readOptionalFile(file);
  if (!bytes) throw invalid('The selected legacy backup manifest is missing.');
  const manifest = validateLegacyManifest(parseJsonRecord(bytes.toString('utf8')), profile);
  let selected: Buffer | null = null;
  for (const entry of manifest.files) {
    const saved = path.join(path.dirname(file), entry.name);
    if (fileDigest(saved) !== entry.sha256) throw invalid('A selected legacy backup file did not verify.');
    if (entry.name === manifest.source) {
      await options.checkpoint?.('restore_source_verified');
      selected = await readOptionalFile(saved);
      if (!selected || bytesDigest(selected) !== entry.sha256) throw invalid('The selected legacy source changed while reading it.');
    }
  }
  if (!selected) throw invalid('The selected legacy source is missing.');
  const record = admitLegacyBytes(selected);
  if (!record) throw invalid('The selected legacy source is not readable JSON.');
  normalizeLegacyRecord(record, true); // Validate complete records and owner intent before any replacement.
  const lifecycle = record.ownerLifecycle as { revision: number; retention: Record<string, unknown> } | undefined;
  if (lifecycle?.retention.enabled === true) {
    // A rollback can predate an opt-out made on the database minor, just like .bak recovery.
    lifecycle.retention.enabled = false;
    lifecycle.retention.lastError = 'Automatic cleanup was disabled after profile recovery. Review the policy before enabling it again.';
    lifecycle.revision++;
    selected = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  }
  return { target: selected, manifestDigest: bytesDigest(bytes), version: Number(record.version ?? 1) };
}

async function currentNames(profile: string): Promise<string[]> {
  const base = path.basename(profile); const db = path.basename(databasePath(profile));
  const extra = (await readdir(path.dirname(profile))).filter(name =>
    storageNameIdentity(name).startsWith(`${storageNameIdentity(base)}.`) && storageNameIdentity(name).endsWith('.bak'));
  return [...new Set([base, db, `${db}-wal`, `${db}-shm`, `${base}.database.json`, ...extra])];
}

function validateJournal(value: Record<string, unknown>, profile: string): RestoreJournal {
  const journal = value as unknown as RestoreJournal;
  const prefix = `${path.basename(profile)}.before-restore-`;
  if (journal.format !== 1 || !sameName(journal.profile, path.basename(profile))
    || typeof journal.currentDirectory !== 'string' || !storageNameIdentity(journal.currentDirectory).startsWith(storageNameIdentity(prefix))
    || !/^[a-f0-9-]{36}$/u.test(journal.currentDirectory.slice(prefix.length))
    || !digest(journal.sourceManifestDigest) || !digest(journal.targetDigest)
    || !digest(journal.currentManifestDigest)
    || journal.originalPrimaryDigest !== null && !digest(journal.originalPrimaryDigest)) throw invalid('The pending restore marker is invalid.');
  return journal;
}

function validateCurrentBackup(value: Record<string, unknown>, profile: string): CurrentBackup {
  const current = value as unknown as CurrentBackup;
  const base = path.basename(profile); const db = path.basename(databasePath(profile));
  const allowed = new Set([base, db, `${db}-wal`, `${db}-shm`, `${base}.database.json`].map(storageNameIdentity));
  const names = new Set(); const originals = new Set();
  if (current.format !== 1 || current.kind !== 'before-legacy-restore'
    || !sameName(current.profile, base) || !Array.isArray(current.files)) throw invalid('The current-state backup is invalid.');
  for (const file of current.files) {
    if (!file || typeof file.name !== 'string' || !/^current-\d+\.bin$/u.test(file.name)
      || typeof file.original !== 'string' || file.original.includes('/') || file.original.includes('\\')
      || file.original.includes(':') || !digest(file.sha256) || names.has(file.name) || originals.has(storageNameIdentity(file.original))
      || !allowed.has(storageNameIdentity(file.original)) && !(storageNameIdentity(file.original).startsWith(`${storageNameIdentity(base)}.`)
        && storageNameIdentity(file.original).endsWith('.bak'))) {
      throw invalid('An unsafe current-state backup entry was refused.');
    }
    names.add(file.name); originals.add(storageNameIdentity(file.original));
  }
  return current;
}

function verifySavedFiles(directory: string, current: CurrentBackup): void {
  for (const file of current.files) {
    if (fileDigest(path.join(directory, file.name)) !== file.sha256) throw invalid('A current-state rollback copy did not verify.');
  }
}

async function regularExists(file: string): Promise<boolean> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw invalid('A linked or non-file state target was refused.');
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

async function assertDirectory(directory: string): Promise<void> {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalid('Backup directories must not be links.');
}

function digest(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
function sameName(value: unknown, expected: string): boolean {
  return typeof value === 'string' && storageNameIdentity(value) === storageNameIdentity(expected);
}
function invalid(message: string): ProfileStorageError { return new ProfileStorageError('restore_invalid', message); }
