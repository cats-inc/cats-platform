import { randomUUID } from 'node:crypto';
import { link, lstat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '../../platform/persistence/state-db/canonicalJson.js';
import { syncDirectory } from '../../platform/persistence/state-db/atomicFile.js';
import { withProfileLock } from '../../platform/persistence/state-db/profileLock.js';
import { openStateDatabase, StateDatabaseError, type StateDatabase } from '../../platform/persistence/state-db/stateDatabase.js';
import { closeStateMaintenanceWorkers, runStateMaintenance, StateMaintenanceError } from '../../platform/persistence/state-db/stateMaintenance.js';
import { logicalDatabaseSnapshot } from '../../products/chat/state/database/logicalExport.js';
import { verifyArchiveAssets } from '../../products/chat/state/database/archiveAssets.js';
import { MetadataCommit } from '../../products/chat/state/database/metadataCommit.js';
import { assertProfileOffline } from '../../products/chat/state/database/profileLease.js';
import { maintainProfileSnapshot } from '../../products/chat/state/database/profileSnapshots.js';
import { restoreLegacyProfile, restoreSnapshotProfile } from '../../products/chat/state/database/restoreProfile.js';
import { databasePath, parseJsonRecord, ProfileStorageError, readOptionalFile, storageNameIdentity,
  type StorageEnvelope } from '../../products/chat/state/database/profileFormat.js';
import { resolveDefaultPlatformDir, resolvePlatformStatePath } from '../../shared/platformPaths.js';

interface StateCommand { command: 'check' | 'snapshot' | 'export' | 'restore'; profile?: string; output?: string; manifest?: string; timeoutMs: number; }
class StateCommandUsageError extends Error {}

export function getStateHelpText(): string {
  return [
    'Usage: cats-platform state <command> [options]', '',
    'Offline commands (close Cats Desktop and all processes using this profile):',
    '  check                         Verify SQLite integrity and its committed JSON/receipt pair',
    '  snapshot                      Publish a verified paired snapshot; keep seven valid pairs',
    '  export --output <new-file>    Stream a complete deterministic logical JSON export',
    '  restore --manifest <file>     Restore a paired snapshot or the previous JSON minor', '',
    'Options:',
    '  --profile <file>              Exact profile; defaults to CATS_PLATFORM_DIR/state/chat-state.local.json',
    '  --timeout-ms <1..600000>       Native maintenance deadline (default 300000)',
    '  -h, --help', '',
    'Check/export never initialize, migrate or repair state. Export requires a new output file.',
    'Restore backs up current files first; after interruption, rerun with the same manifest.',
  ].join('\n');
}

function parseStateCommand(args: string[]): StateCommand | null {
  if (args.includes('--help') || args.includes('-h')) return null;
  const command = args[0];
  if (!['check', 'snapshot', 'export', 'restore'].includes(command ?? '')) throw new StateCommandUsageError();
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i++) {
    const flag = args[i]!; const value = args[++i];
    if (!['--profile', '--output', '--manifest', '--timeout-ms'].includes(flag) || values.has(flag)
      || !value?.trim() || value.startsWith('-')) throw new StateCommandUsageError();
    values.set(flag, value);
  }
  const timeout = values.get('--timeout-ms') ?? '300000';
  if (!/^[1-9][0-9]*$/u.test(timeout) || Number(timeout) > 600_000
    || (command === 'export') !== values.has('--output') || (command === 'restore') !== values.has('--manifest')) throw new StateCommandUsageError();
  return { command: command as StateCommand['command'], profile: values.get('--profile'), output: values.get('--output'),
    manifest: values.get('--manifest'), timeoutMs: Number(timeout) };
}

/** Routed before ordinary startup/auth provisioning. No HTTP listener, Runtime
 * contact, live-store initialization or legacy migration is performed here.
 */
export async function runStateCommand(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let options: StateCommand | null;
  try { options = parseStateCommand(args); }
  catch { process.stderr.write(`${getStateHelpText()}\n`); return 2; }
  if (!options) { process.stdout.write(`${getStateHelpText()}\n`); return 0; }
  const profile = path.resolve(options.profile ?? resolvePlatformStatePath(path.resolve(env.CATS_PLATFORM_DIR?.trim()
    || resolveDefaultPlatformDir(env.HOME || env.USERPROFILE || undefined))));
  const abort = new AbortController(); let cancelledExit = 1;
  const interrupt = () => { cancelledExit = 130; abort.abort(); };
  const terminate = () => { cancelledExit = 143; abort.abort(); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try {
    let result: unknown;
    if (options.command === 'restore') {
      const bytes = await readOptionalFile(path.resolve(options.manifest!));
      if (!bytes) throw new ProfileStorageError('restore_invalid', 'The selected restore manifest is missing.');
      const manifest = parseJsonRecord(bytes.toString('utf8'));
      const restore = manifest.kind === 'paired-state-snapshot' ? restoreSnapshotProfile : restoreLegacyProfile;
      result = await restore(profile, path.resolve(options.manifest!), { signal: abort.signal, timeoutMs: options.timeoutMs });
    } else {
      // Admission precedes lock creation, including on a missing parent directory.
      if (!await readOptionalFile(profile) || !(await lstat(databasePath(profile)).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error;
      }))) throw new ProfileStorageError('not_initialized', 'No initialized conversation database exists at this profile.');
      result = await withProfileLock(profile, async () => {
        await assertProfileOffline(profile); abort.signal.throwIfAborted();
        if (await readOptionalFile(`${profile}.state-db-restore.json`)
          || await readOptionalFile(path.join(path.dirname(profile), 'platform-data-reset.pending.json'))) throw new ProfileStorageError('recovery_pending', 'Complete pending state recovery before using offline commands.');
        const database = openStateDatabase({ file: databasePath(profile), mode: 'reader' });
        try {
          const envelope = await new MetadataCommit(profile, database).readCommitted();
          const receiptBytes = await readOptionalFile(`${profile}.database.json`);
          const receipt = receiptBytes ? parseJsonRecord(receiptBytes.toString('utf8')) : null;
          if (database.meta('profile_import_complete') !== '1' || database.meta('legacy_archived') !== '1'
            || receipt?.format !== 1 || receipt.installationId !== envelope.storage.installationId) throw new ProfileStorageError('recovery_pending', 'Complete state startup recovery with the matching Cats build first.');
          if (options.command === 'check') {
            await runStateMaintenance({ kind: 'check', file: databasePath(profile) }, { timeoutMs: options.timeoutMs, signal: abort.signal });
            await verifyArchiveAssets(database, undefined, abort.signal);
            return { checked: true, schemaVersion: Number(database.meta('schema_version')), installationId: envelope.storage.installationId, revision: envelope.storage.revision };
          }
          if (options.command === 'snapshot') {
            const snapshot = await maintainProfileSnapshot(profile, async signal => {
              signal.throwIfAborted(); return (await readOptionalFile(profile))!;
            }, { force: true, signal: abort.signal, timeoutMs: options.timeoutMs });
            if (snapshot.status !== 'published') throw new ProfileStorageError('snapshot_deferred', 'The snapshot could not be published; close other operations and retry.');
            return snapshot;
          }
          const destination = path.resolve(options.output!);
          await exportState(profile, destination, database, envelope, abort.signal);
          return { exported: true, output: destination };
        } finally { database.close(); }
      }, { signal: abort.signal, timeoutMs: 0 });
    }
    abort.signal.throwIfAborted();
    process.stdout.write(`${JSON.stringify({ command: options.command, ok: true, profile, result })}\n`);
    return 0;
  } catch (error) {
    const code = abort.signal.aborted ? 'cancelled' : error instanceof ProfileStorageError ? error.code
      : error instanceof StateDatabaseError || error instanceof StateMaintenanceError ? error.code
      : (error as { code?: unknown })?.code === 'profile_lock_timeout' ? 'profile_busy' : 'state_operation_failed';
    const message = code === 'profile_busy' ? 'Close Cats Desktop and every process using this profile, then retry.'
      : code === 'not_initialized' || code === 'missing' ? 'No initialized database was found. Start the matching Cats build to initialize or migrate this profile first.'
        : code === 'unsupported_sqlite' ? 'Use the supported Cats Desktop runtime; this host lacks required SQLite capabilities.'
          : code === 'newer_schema' || code === 'newer_profile' ? 'Use the matching or newer Cats build to read this state.'
            : code === 'integrity_check_failed' ? 'The database failed its integrity check. Preserve the files and restore a verified backup.'
              : code === 'timeout' ? 'Native maintenance exceeded its deadline. Resume any interrupted restore with the same manifest.'
        : ['recovery_pending', 'restore_pending', 'reset_pending'].includes(code) ? 'Complete pending recovery with the matching build, or resume restore with the original manifest.'
          : code === 'cancelled' ? 'State operation cancelled. Resume an interrupted restore with the same manifest.'
            : 'State operation did not complete. Keep the state files; inspect a verified backup or resume the matching restore.';
    process.stderr.write(`${JSON.stringify({ ok: false, code, message })}\n`);
    return abort.signal.aborted ? cancelledExit : 1;
  } finally {
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
    await closeStateMaintenanceWorkers();
  }
}

async function exportState(profile: string, destination: string, database: StateDatabase, envelope: StorageEnvelope,
  signal: AbortSignal): Promise<void> {
  const identity = (file: string) => storageNameIdentity(path.resolve(file));
  const target = identity(destination);
  if ([profile, databasePath(profile)].some(file => target === identity(file) || target.startsWith(`${identity(file)}.`)
    || target.startsWith(`${identity(file)}-`) || target.startsWith(`${identity(file)}${path.sep}`))) throw new ProfileStorageError('invalid_output', 'Export must use a new file outside active profile and backup paths.');
  const temporary = `${destination}.${randomUUID()}.unfinished`;
  const fd = await open(temporary, 'wx', 0o600);
  try {
    try {
      let buffer = '';
      for (const token of canonicalJson(logicalDatabaseSnapshot(envelope, database))) {
        signal.throwIfAborted(); buffer += token;
        if (buffer.length >= 64 * 1024) { await fd.writeFile(buffer); buffer = ''; }
      }
      if (buffer) await fd.writeFile(buffer);
      await fd.sync();
    } finally { await fd.close(); }
    signal.throwIfAborted(); await link(temporary, destination); await syncDirectory(path.dirname(destination));
  } finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }); }
}
