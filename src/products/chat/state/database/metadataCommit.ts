import { writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import type { StateDatabase } from '../../../../platform/persistence/state-db/stateDatabase.js';
import {
  bytesDigest, parseEnvelope, ProfileStorageError, readOptionalFile, serializeEnvelope,
  type StorageEnvelope,
} from './profileFormat.js';

export type StorageCheckpoint =
  | 'backup_complete' | 'import_verified' | 'database_published'
  | 'database_committed' | 'metadata_published' | 'handoff_acknowledged' | 'lease_prepared'
  | 'schema_backup_complete' | 'schema_backup_preparing';

export interface StorageHooks {
  signal?: AbortSignal;
  /** Fault-injection/progress seam. Never passed through public request payloads. */
  checkpoint?(stage: StorageCheckpoint): void | Promise<void>;
  progress?(stage: string, completed?: number): void;
}

/** All methods are called under the cross-process profile operation lock. */
export class MetadataCommit {
  constructor(readonly profile: string, readonly database: StateDatabase,
    readonly hooks: StorageHooks = {}) {}

  /** Joins the caller's synchronous durable transaction, alongside entity changes. */
  stage(envelope: StorageEnvelope, previousDigest: string | null): void {
    const text = serializeEnvelope(envelope);
    this.database.transaction(() => {
      this.database.setMeta('installation_id', envelope.storage.installationId);
      this.database.setMeta('revision', envelope.storage.revision);
      this.database.setMeta('metadata_digest', bytesDigest(text));
      this.database.run(`insert into metadata_handoff(singleton, revision, previous_digest, json)
        values (1, ?, ?, ?) on conflict(singleton) do update set
        revision = excluded.revision, previous_digest = excluded.previous_digest, json = excluded.json`,
      envelope.storage.revision, previousDigest, text);
    });
  }

  async recover(): Promise<StorageEnvelope> {
    const state = await this.inspect();
    if (state.pending) {
      if (state.currentDigest !== bytesDigest(state.text)) await writeDurableFile(this.profile, state.text);
      if (bytesDigest((await readOptionalFile(this.profile)) ?? '') !== bytesDigest(state.text)) throw this.mismatch();
      await this.hooks.checkpoint?.('metadata_published');
      this.database.transaction(() => {
        this.database.run('delete from metadata_handoff where singleton = 1 and revision = ?', state.envelope.storage.revision);
      }, { durable: true });
      await this.hooks.checkpoint?.('handoff_acknowledged');
    }
    return state.envelope;
  }

  /** Validate a recoverable pair without publishing/acknowledging any handoff. */
  async inspect(): Promise<{ envelope: StorageEnvelope; text: string; pending: boolean; currentDigest: string | null }> {
    const pending = this.database.get('select revision, previous_digest, json from metadata_handoff where singleton = 1');
    if (pending) {
      const text = String(pending.json);
      const envelope = parseEnvelope(text, this.profile);
      this.verify(envelope, text);
      if (envelope.storage.revision !== pending.revision) throw this.mismatch();
      const current = await readOptionalFile(this.profile);
      const digest = current === null ? null : bytesDigest(current);
      const target = bytesDigest(text);
      if (digest !== target && digest !== pending.previous_digest) {
        throw new ProfileStorageError('handoff_conflict',
          'The profile changed outside its committed operation. Preserve it and use state recovery.');
      }
      return { envelope, text, pending: true, currentDigest: digest };
    }
    const current = await readOptionalFile(this.profile);
    if (current === null) {
      throw new ProfileStorageError('missing_metadata',
        'The database exists but its metadata is missing. Restore a complete state backup; no reset was performed.');
    }
    const text = current.toString('utf8');
    const envelope = parseEnvelope(text, this.profile);
    this.verify(envelope, text);
    return { envelope, text, pending: false, currentDigest: bytesDigest(current) };
  }

  /** Read-only tools never replay the handoff or write metadata. A pending commit
   * is an actionable recovery condition, even if its target JSON already exists.
   */
  async readCommitted(): Promise<StorageEnvelope> {
    if (this.database.get('select revision from metadata_handoff where singleton = 1')) {
      throw new ProfileStorageError('recovery_pending',
        'A committed state handoff needs recovery. Start the matching Cats build before taking a complete backup.');
    }
    return (await this.inspect()).envelope;
  }

  private verify(envelope: StorageEnvelope, text: string): void {
    if (this.database.meta('installation_id') !== envelope.storage.installationId
      || this.database.meta('revision') !== envelope.storage.revision
      || this.database.meta('metadata_digest') !== bytesDigest(text)) throw this.mismatch();
  }

  private mismatch(): ProfileStorageError {
    return new ProfileStorageError('metadata_mismatch',
      'The database and metadata do not belong to the same committed state. Preserve both and restore a verified pair.');
  }
}
