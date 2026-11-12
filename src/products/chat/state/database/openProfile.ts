import { randomUUID } from 'node:crypto';
import { lstat, link, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openStateDatabase, type StateDatabase } from '../../../../platform/persistence/state-db/stateDatabase.js';
import { canonicalDigest } from '../../../../platform/persistence/state-db/canonicalJson.js';
import { fileDigest } from '../../../../platform/persistence/state-db/fileDigest.js';
import { syncDirectory, unlinkStateFile, writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import { ConversationDatabase } from './conversationStore.js';
import { logicalDatabaseSnapshot } from './logicalExport.js';
import { prepareLegacyImport, validateLegacyManifest } from './legacyImport.js';
import { MetadataCommit, type StorageHooks } from './metadataCommit.js';
import { createProfileLease, type ProfileLease } from './profileLease.js';
import { prepareProfileSchemaUpgrade } from './schemaUpgrade.js';
import {
  bytesDigest, databasePath, makeEnvelope, parseJsonRecord, ProfileStorageError,
  readOptionalFile, storageNameIdentity, type StorageEnvelope,
} from './profileFormat.js';

export interface OpenProfile {
  database: StateDatabase;
  conversations: ConversationDatabase;
  metadata: MetadataCommit;
  envelope: StorageEnvelope;
  releaseLease(): Promise<void>;
  leaseToken: string;
}

/** Caller holds withProfileLock. No legacy normalizer ever runs on the user's live source. */
export async function openProfile(profile: string, hooks: StorageHooks): Promise<OpenProfile> {
  if (await readOptionalFile(`${profile}.state-db-restore.json`)) {
    throw new ProfileStorageError('restore_pending',
      'A state restore is unfinished. Resume the restore command before starting Cats.');
  }
  const file = databasePath(profile);
  const present = await lstat(file).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (present && (!present.isFile() || present.isSymbolicLink() || present.size === 0)) {
    throw new ProfileStorageError('unrecognized_database', 'The existing database file is invalid; it was not replaced.');
  }
  if (!present) {
    if (await readOptionalFile(`${profile}.database.json`)) throw missingDatabase();
    const bytes = await readOptionalFile(profile);
    if (bytes) {
      try { if (parseJsonRecord(bytes.toString('utf8')).version === 8) throw missingDatabase(); }
      catch (error) { if ((error as ProfileStorageError).code !== 'unrecognized_profile') throw error; }
    }
    await migrate(profile, hooks);
  }
  const upgradeAdmission = await prepareProfileSchemaUpgrade(profile, hooks);
  let database: StateDatabase | null = null;
  let releaseLease: ProfileLease | null = null;
  try {
    database = openStateDatabase({ file, mode: 'writer', upgradeAdmission });
    if (database.meta('profile_import_complete') !== '1') {
      throw new ProfileStorageError('incomplete_database', 'The database has no verified import marker; no state was reset.');
    }
    await ensureReceipt(profile, database);
    const metadata = new MetadataCommit(profile, database, hooks);
    await archiveLegacyCopies(profile, database, false);
    const envelope = await metadata.recover();
    const conversations = new ConversationDatabase(database);
    await archiveLegacyCopies(profile, database);
    releaseLease = await createProfileLease(profile, () => hooks.checkpoint?.('lease_prepared'));
    return { database, conversations, metadata, envelope, releaseLease, leaseToken: releaseLease.token };
  } catch (error) {
    database?.close();
    await releaseLease?.();
    throw error;
  }
}

async function migrate(profile: string, hooks: StorageHooks): Promise<void> {
  hooks.progress?.('admitting_legacy_state');
  const source = await prepareLegacyImport(profile, hooks);
  const file = databasePath(profile);
  const temporary = `${file}.importing-${randomUUID()}`;
  const installation = randomUUID();
  const envelope = makeEnvelope(source.snapshot, profile, installation);
  const expected = canonicalDigest(source.snapshot);
  const database = openStateDatabase({ file: temporary, mode: 'writer' });
  try {
    const conversations = new ConversationDatabase(database);
    const metadata = new MetadataCommit(profile, database, hooks);
    hooks.progress?.('importing_conversations', 0);
    database.transaction(() => {
      conversations.importChannels(source.snapshot.chat.channels);
      conversations.putGroups(source.snapshot.chat.parallelChatGroups);
      metadata.stage(envelope, source.previousDigest);
      const actual = canonicalDigest(logicalDatabaseSnapshot(envelope, database));
      if (actual !== expected) {
        throw new ProfileStorageError('import_mismatch', 'Imported state did not equal its logical source; original files were preserved.');
      }
      // Check source files again inside the final durable transaction (ADR-152 P4).
      if (source.manifestPath) {
        const manifest = validateLegacyManifest(parseJsonRecord(readFileSync(source.manifestPath, 'utf8')), profile);
        for (const entry of manifest.files) {
          if (fileDigest(path.join(path.dirname(profile), entry.original)) !== entry.sha256) {
            throw new ProfileStorageError('migration_failed', 'Legacy state changed during import; retry with all old writers stopped.');
          }
        }
      } else if (source.previousDigest === null) {
        // No default may replace a profile created concurrently by an old writer.
        try { readFileSync(profile); throw new ProfileStorageError('migration_failed', 'A legacy writer created state during import.'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      database.setMeta('profile_import_complete', '1');
      database.setMeta('initial_logical_digest', expected);
      if (source.sourceDigest) database.setMeta('legacy_source_digest', source.sourceDigest);
      if (source.manifestPath) database.setMeta('legacy_manifest',
        path.relative(path.dirname(profile), source.manifestPath).replaceAll('\\', '/'));
    }, { durable: true });
    hooks.progress?.('importing_conversations', source.snapshot.chat.channels.length);
    await hooks.checkpoint?.('import_verified');
  } finally { database.close(); }
  // link() publishes without overwriting an unexpected destination. Closing the only
  // connection checkpointed WAL before the main database file acquires its final name.
  await link(temporary, file);
  await syncDirectory(path.dirname(file));
  await unlink(temporary);
  await syncDirectory(path.dirname(file));
  hooks.progress?.('database_published');
  await hooks.checkpoint?.('database_published');
}

async function ensureReceipt(profile: string, database: StateDatabase): Promise<void> {
  const id = database.meta('installation_id');
  if (!id) throw new ProfileStorageError('incomplete_database', 'The database installation identity is missing.');
  const expected = `${JSON.stringify({ format: 1, installationId: id })}\n`;
  const file = `${profile}.database.json`;
  const found = await readOptionalFile(file);
  if (found && found.toString('utf8') !== expected) {
    throw new ProfileStorageError('installation_mismatch', 'The state receipt belongs to another database; preserve it for recovery.');
  }
  if (!found) await writeDurableFile(file, expected);
}

async function archiveLegacyCopies(profile: string, database: StateDatabase, remove = true): Promise<void> {
  if (database.meta('legacy_archived') === '1') return;
  const relative = database.meta('legacy_manifest');
  if (!relative) { database.setMeta('legacy_archived', '1'); return; }
  // This path was generated from the profile, not read from a request. Still constrain it
  // before using it, so a tampered database cannot redirect archive cleanup elsewhere.
  const directory = path.resolve(path.dirname(profile));
  const manifestPath = path.resolve(directory, relative);
  if (!manifestPath.startsWith(`${directory}${path.sep}`)) throw new ProfileStorageError('invalid_manifest', 'Legacy manifest escapes the profile directory.');
  const archiveDirectory = path.dirname(manifestPath);
  const prefix = `${path.basename(profile)}.pre-state-db-`;
  const archiveName = path.basename(archiveDirectory);
  const archiveStat = await lstat(archiveDirectory);
  if (path.dirname(archiveDirectory) !== directory || path.basename(manifestPath) !== 'manifest.json'
    || !storageNameIdentity(archiveName).startsWith(storageNameIdentity(prefix)) || !/^[a-f0-9]{16}$/u.test(archiveName.slice(prefix.length))
    || !archiveStat.isDirectory() || archiveStat.isSymbolicLink()) {
    throw new ProfileStorageError('invalid_manifest', 'The legacy archive directory is invalid.');
  }
  const bytes = await readOptionalFile(manifestPath);
  if (!bytes) throw new ProfileStorageError('invalid_manifest', 'The verified legacy backup manifest is missing.');
  const manifest = validateLegacyManifest(parseJsonRecord(bytes.toString('utf8')), profile);
  for (const entry of manifest.files) {
    const archived = await readOptionalFile(path.join(path.dirname(manifestPath), entry.name));
    if (!archived || bytesDigest(archived) !== entry.sha256) throw new ProfileStorageError('invalid_manifest', 'A legacy archive did not verify.');
    const original = path.join(directory, entry.original);
    const current = await readOptionalFile(original);
    if (!current) continue;
    if (entry.kind === 'primary') {
      if (!remove && bytesDigest(current) !== entry.sha256
        && bytesDigest(current) !== database.meta('metadata_digest')) {
        throw new ProfileStorageError('legacy_changed', 'The legacy primary changed after import; it was preserved.');
      }
      continue;
    }
    if (bytesDigest(current) !== entry.sha256) {
      throw new ProfileStorageError('legacy_changed', 'A legacy backup changed after import; it was preserved.');
    }
    if (remove) await unlinkStateFile(original);
  }
  if (remove) database.transaction(() => database.setMeta('legacy_archived', '1'), { durable: true });
}

function missingDatabase(): ProfileStorageError {
  return new ProfileStorageError('missing_database',
    'A database profile is missing its database. Restore a verified state backup; no legacy data was reimported.');
}
