import { randomUUID } from 'node:crypto';
import { chmod, lstat, link, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { canonicalDigest } from '../../../../platform/persistence/state-db/canonicalJson.js';
import { fileDigest } from '../../../../platform/persistence/state-db/fileDigest.js';
import { syncDirectory, writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import { openStateDatabase, type OpenStateDatabaseOptions } from '../../../../platform/persistence/state-db/stateDatabase.js';
import { STATE_SCHEMA_VERSION } from '../../../../platform/persistence/state-db/stateSchema.js';
import { runStateMaintenance, StateMaintenanceError } from '../../../../platform/persistence/state-db/stateMaintenance.js';
import { MetadataCommit, type StorageHooks } from './metadataCommit.js';
import { logicalDatabaseSnapshot } from './logicalExport.js';
import { assertProfileOffline } from './profileLease.js';
import { bytesDigest, databasePath, ProfileStorageError, readOptionalFile } from './profileFormat.js';
import { archiveDirectory, copyArchiveAssets, verifyArchiveAssets, type ArchiveAssetProof } from './archiveAssets.js';

export const schemaUpgradeManifestName = (profile: string): string => `${path.basename(profile)}.schema-upgrade-manifest.json`;

/** Called under the profile lock, before opening an older database for writing.
 * A verified standalone snapshot + exact metadata/receipt precedes the adapter's
 * atomic SQL upgrade. Pending handoffs are backed up as a recoverable pair.
 */
export async function prepareProfileSchemaUpgrade(profile: string, hooks: StorageHooks): Promise<OpenStateDatabaseOptions['upgradeAdmission']> {
  const file = databasePath(profile);
  const reader = openStateDatabase({ file, mode: 'reader' });
  let source: Awaited<ReturnType<MetadataCommit['inspect']>>;
  let logicalDigest: string;
  let archives: ArchiveAssetProof[];
  const version = Number(reader.meta('schema_version'));
  try {
    if (version === STATE_SCHEMA_VERSION) return;
    if (reader.meta('profile_import_complete') !== '1') throw new ProfileStorageError('incomplete_database',
      'The existing database has no verified import marker; no schema was changed.');
    await assertProfileOffline(profile);
    hooks.progress?.('upgrading_database');
    const inspected = await new MetadataCommit(profile, reader).inspect();
    source = inspected;
    logicalDigest = reader.snapshot(() => canonicalDigest(logicalDatabaseSnapshot(inspected.envelope, reader)));
    archives = await verifyArchiveAssets(reader, undefined, hooks.signal);
  } finally { reader.close(); }
  const metadata = await readOptionalFile(profile);
  if ((metadata === null ? null : bytesDigest(metadata)) !== source.currentDigest) throw changed();
  const receipt = await readOptionalFile(`${profile}.database.json`);
  const expectedReceipt = `${JSON.stringify({ format: 1, installationId: source.envelope.storage.installationId })}\n`;
  if (receipt !== null && receipt.toString('utf8') !== expectedReceipt) throw new ProfileStorageError('installation_mismatch',
    'The state receipt belongs to another database; no schema was changed.');
  const key = canonicalDigest([version, STATE_SCHEMA_VERSION, source.envelope.storage.installationId, source.envelope.storage.revision,
    source.currentDigest, receipt === null ? null : bytesDigest(receipt), logicalDigest!]).slice(0, 16);
  const directory = `${profile}.pre-state-db-schema-${version}-${key}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalid();
  const savedProfile = path.join(directory, path.basename(profile));
  await saveExact(savedProfile, metadata);
  await saveExact(`${savedProfile}.database.json`, receipt);
  const savedDatabase = path.join(directory, path.basename(file));
  if (!await readExists(savedDatabase)) {
    await hooks.checkpoint?.('schema_backup_preparing');
    if (hooks.signal?.aborted) throw new StateMaintenanceError('cancelled');
    const candidate = `${savedDatabase}.${randomUUID()}.unfinished`;
    try {
      try { await runStateMaintenance({ kind: 'snapshot', file, target: candidate }, { timeoutMs: 5 * 60_000, signal: hooks.signal }); }
      catch (error) { if (hooks.signal?.aborted) throw new StateMaintenanceError('cancelled'); throw invalid(); }
      await chmod(candidate, 0o600);
      const fd = await open(candidate, 'r+');
      try { await fd.sync(); } finally { await fd.close(); }
      await link(candidate, savedDatabase);
      await syncDirectory(directory);
    } finally { await unlink(candidate).catch(() => {}); }
  }
  const backup = openStateDatabase({ file: savedDatabase, mode: 'reader' });
  try {
    await copyArchiveAssets(archiveDirectory(file), archiveDirectory(savedDatabase), archives!, hooks.signal);
    await verifyArchiveAssets(backup, archives!, hooks.signal, true);
    const recovered = await new MetadataCommit(savedProfile, backup).inspect();
    if (Number(backup.meta('schema_version')) !== version || recovered.currentDigest !== source.currentDigest
      || recovered.envelope.storage.installationId !== source.envelope.storage.installationId
      || recovered.envelope.storage.revision !== source.envelope.storage.revision
      || backup.snapshot(() => canonicalDigest(logicalDatabaseSnapshot(recovered.envelope, backup))) !== logicalDigest!) throw invalid();
  } finally { backup.close(); }
  const verify = openStateDatabase({ file, mode: 'reader' });
  try {
    const current = await new MetadataCommit(profile, verify).inspect();
    if (current.currentDigest !== source.currentDigest || current.envelope.storage.revision !== source.envelope.storage.revision
      || verify.snapshot(() => canonicalDigest(logicalDatabaseSnapshot(current.envelope, verify))) !== logicalDigest!) throw changed();
    await verifyArchiveAssets(verify, archives!, hooks.signal);
  } finally { verify.close(); }
  const receiptNow = await readOptionalFile(`${profile}.database.json`);
  if ((receiptNow === null ? null : bytesDigest(receiptNow)) !== (receipt === null ? null : bytesDigest(receipt))) throw changed();
  const names = [path.basename(file), ...(metadata ? [path.basename(profile)] : []),
    ...(receipt ? [`${path.basename(profile)}.database.json`] : [])];
  const manifest = `${JSON.stringify({ format: 1, kind: 'before-schema-upgrade', sourceSchema: version,
    targetSchema: STATE_SCHEMA_VERSION, installationId: source.envelope.storage.installationId,
    revision: source.envelope.storage.revision, pendingHandoff: source.pending, logicalDigest: logicalDigest!,
    files: names.map(name => ({ name, sha256: fileDigest(path.join(directory, name)) })), archives: archives! }, null, 2)}\n`;
  await saveExact(path.join(directory, schemaUpgradeManifestName(profile)), Buffer.from(manifest));
  await hooks.checkpoint?.('schema_backup_complete');
  if (hooks.signal?.aborted) throw new StateMaintenanceError('cancelled');
  const admittedMetadata = await readOptionalFile(profile);
  const admittedReceipt = await readOptionalFile(`${profile}.database.json`);
  if ((admittedMetadata === null ? null : bytesDigest(admittedMetadata)) !== source.currentDigest
    || (admittedReceipt === null ? null : bytesDigest(admittedReceipt)) !== (receipt === null ? null : bytesDigest(receipt))) throw changed();
  return { schemaVersion: version, installationId: source.envelope.storage.installationId,
    revision: source.envelope.storage.revision, metadataDigest: bytesDigest(source.text) };
}

async function saveExact(file: string, bytes: Buffer | null): Promise<void> {
  const current = await readOptionalFile(file);
  if (current === null && bytes !== null) await writeDurableFile(file, bytes);
  else if ((current === null ? null : bytesDigest(current)) !== (bytes === null ? null : bytesDigest(bytes))) throw invalid();
}
async function readExists(file: string): Promise<boolean> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw invalid();
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function invalid(): ProfileStorageError {
  return new ProfileStorageError('schema_backup_failed', 'A verified database upgrade backup could not be completed. Existing state was preserved.');
}
function changed(): ProfileStorageError {
  return new ProfileStorageError('schema_source_changed', 'State changed while its upgrade backup was prepared. Close all writers and retry; no schema was changed.');
}
