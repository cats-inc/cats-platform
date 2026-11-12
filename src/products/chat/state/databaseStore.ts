import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PlatformResetBusyError, resumePlatformOwnedDataReset } from '../../../shared/platformDataReset.js';
import { withProfileLock } from '../../../platform/persistence/state-db/profileLock.js';
import { canonicalDigest, canonicalJson } from '../../../platform/persistence/state-db/canonicalJson.js';
import { hasSubstantiveCoreChange, type CoreStoreListener } from '../../../core/store.js';
import type { CatsCoreState } from '../../../core/types.js';
import type { ChatChannelState, ChatState } from '../api/contracts.js';
import { buildPersistedChatSnapshot, extractCoreState, type PersistedChatSnapshot } from './core-snapshot/index.js';
import { prepareChatSnapshot, type ChatStore, type ChatSnapshotMutator } from './store.js';
import { openProfile, type OpenProfile } from './database/openProfile.js';
import { assertProfileOffline } from './database/profileLease.js';
import { logicalDatabaseSnapshot } from './database/logicalExport.js';
import { type StorageHooks } from './database/metadataCommit.js';
import {
  bytesDigest, databasePath, envelopeCore, makeEnvelope, ProfileStorageError,
  serializeEnvelope, type StorageEnvelope,
} from './database/profileFormat.js';
import type { MessagePage, MessageSearchHit } from './database/conversationStore.js';
import { StateDatabaseError } from '../../../platform/persistence/state-db/stateDatabase.js';

export interface DatabaseStoreOptions extends StorageHooks {
  lockTimeoutMs?: number;
  onFatal?(error: ProfileStorageError): void;
}

class MutationFailure extends Error {
  constructor(readonly original: unknown) { super('A caller mutation failed'); }
}
interface ResetContext { active: boolean; tail: Promise<unknown>; }

/** The sole live disk backend. Snapshot-shaped global APIs remain explicit materializations;
 * indexed reads do not load other transcripts or normalize/project the whole profile.
 */
export class DatabaseChatStore implements ChatStore {
  readonly filePath: string;
  private session: OpenProfile | null = null;
  private pending = 0;
  private closing = false;
  private closed = false;
  private listeners = new Set<CoreStoreListener>();
  private resetContext = new AsyncLocalStorage<ResetContext>();

  constructor(filePath: string, private readonly options: DatabaseStoreOptions = {}) {
    this.filePath = path.resolve(filePath);
    databasePath(this.filePath); // Reject unsupported locations before creating lock files.
  }

  async initialize(): Promise<void> { await this.run(async session => this.prepareSearch(session)); }

  async read(): Promise<ChatState> {
    return this.run(async (session, envelope) => this.chat(session, envelope));
  }

  async readCore(): Promise<CatsCoreState> {
    return this.run(async (_session, envelope) => structuredClone(envelopeCore(envelope)));
  }

  async readChannel(id: string): Promise<ChatChannelState | null> {
    return this.run(async session => session.conversations.channel(id));
  }

  async readMessagePage(id: string, limit = 50, before?: string): Promise<MessagePage> {
    return this.run(async session => session.conversations.page(id, limit, before));
  }

  async searchMessages(query: string, options: { channelId?: string; limit?: number } = {}): Promise<MessageSearchHit[]> {
    return this.run(async session => {
      this.prepareSearch(session);
      return session.conversations.search(query, options);
    });
  }

  async writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot> {
    return this.run(async (session, envelope) =>
      this.save(session, envelope, this.chat(session, envelope), chat, core));
  }

  async write(chat: ChatState): Promise<ChatState> {
    return (await this.run(async (session, envelope) =>
      this.save(session, envelope, this.chat(session, envelope), chat, envelopeCore(envelope)))).chat;
  }

  async writeCore(core: CatsCoreState): Promise<CatsCoreState> {
    return extractCoreState(await this.run(async (session, envelope) => {
      const chat = this.chat(session, envelope);
      return this.save(session, envelope, chat, chat, core);
    }));
  }

  async updateSnapshot(mutator: ChatSnapshotMutator): Promise<PersistedChatSnapshot> {
    return this.run(async (session, envelope) => {
      const chat = this.chat(session, envelope);
      const core = envelopeCore(envelope);
      let next: ReturnType<ChatSnapshotMutator>;
      try { next = mutator({ chat: structuredClone(chat), core: structuredClone(core) }); }
      catch (error) { throw new MutationFailure(error); }
      if (next && typeof (next as unknown as { then?: unknown }).then === 'function') {
        void Promise.resolve(next).catch(() => {});
        throw new TypeError('A Chat snapshot mutation must be synchronous');
      }
      if (isDeepStrictEqual(next.chat, chat) && isDeepStrictEqual(next.core, core)) {
        return buildPersistedChatSnapshot(chat, core);
      }
      return this.save(session, envelope, chat, next.chat, next.core);
    });
  }

  async updateCore(mutator: (core: CatsCoreState) => CatsCoreState | Promise<CatsCoreState>): Promise<CatsCoreState> {
    return extractCoreState(await this.run(async (session, envelope) => {
      // Core's existing async callback contract is retained outside any SQLite transaction.
      const core = envelopeCore(envelope);
      let next: CatsCoreState;
      try { next = await mutator(structuredClone(core)); }
      catch (error) { throw new MutationFailure(error); }
      if (isDeepStrictEqual(next, core)) return buildPersistedChatSnapshot(this.chat(session, envelope), core);
      const chat = this.chat(session, envelope);
      return this.save(session, envelope, chat, chat, next);
    }));
  }

  subscribeCore(listener: CoreStoreListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async logicalDigest(): Promise<string> {
    return this.run(async (session, envelope) =>
      session.database.snapshot(() => canonicalDigest(logicalDatabaseSnapshot(envelope, session.database))));
  }

  /** Export an initialized backend; never initialize/migrate a profile merely to export it. */
  async exportLogicalState(destination: string): Promise<void> {
    if (!this.session) throw new ProfileStorageError('not_initialized', 'Open committed state before exporting from this backend.');
    await this.run(async (session, envelope) => {
      const temporary = `${destination}.${randomUUID()}.unfinished`;
      const fd = await open(temporary, 'wx', 0o600);
      try {
        try {
          let buffer = '';
          for (const token of canonicalJson(logicalDatabaseSnapshot(envelope, session.database))) {
            buffer += token;
            if (buffer.length >= 64 * 1024) { await fd.writeFile(buffer); buffer = ''; }
          }
          if (buffer) await fd.writeFile(buffer);
          await fd.sync();
        } finally { await fd.close(); }
        await link(temporary, destination);
      } finally { await unlink(temporary).catch(() => {}); }
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    if (!this.session && this.pending === 0) { this.closed = true; return; }
    await withProfileLock(this.filePath, async () => {
      const session = this.session;
      this.session = null;
      if (session) {
        session.database.close();
        await session.releaseLease();
      }
      this.closed = true;
      this.listeners.clear();
    }, { timeoutMs: this.options.lockTimeoutMs });
  }

  async removeOwnedState(remove: () => Promise<void>): Promise<void> {
    if (!this.resetContext.getStore()?.active) throw new TypeError('State removal requires the coordinated reset operation');
    await this.run(async session => {
      // The profile lock keeps other writers out while connections close and the
      // reset removes the old identity. The next request can initialize fresh state.
      session.database.close();
      await session.releaseLease();
      this.session = null;
      await assertProfileOffline(this.filePath);
      await remove();
    });
  }

  async withDataReset<T>(operation: () => Promise<T>): Promise<T> {
    return this.run(async session => {
      const context: ResetContext = { active: true, tail: Promise.resolve() };
      return this.withResetExclusivity(session, async () => {
        try { return await this.resetContext.run(context, operation); }
        catch (error) { throw new MutationFailure(error); }
        finally { context.active = false; await context.tail; }
      });
    });
  }

  private async withResetExclusivity<T>(session: OpenProfile | undefined,
    operation: () => Promise<T>, targetProfile = this.filePath): Promise<T> {
    const defaultProfile = path.join(path.dirname(this.filePath), 'chat-state.local.json');
    const identity = (file: string) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
    const profiles = [this.filePath, targetProfile, defaultProfile].filter((file, index, all) =>
      all.findIndex(candidate => identity(candidate) === identity(file)) === index);
    const perform = async () => {
      try {
        for (const profile of profiles) await assertProfileOffline(profile,
          identity(profile) === identity(this.filePath) ? session?.leaseToken : undefined);
      }
      catch (error) {
        if ((error as { code?: string })?.code === 'profile_busy') throw new PlatformResetBusyError();
        throw error;
      }
      return operation();
    };
    const additional = profiles.filter(profile => identity(profile) !== identity(this.filePath)).sort();
    const acquire = (index: number): Promise<T> => index === additional.length ? perform()
      : withProfileLock(additional[index]!, () => acquire(index + 1), { timeoutMs: 0 });
    // A second profile lock is never waited on while holding the first: concurrent
    // custom/default reset attempts must reject busy instead of creating a lock cycle.
    try { return await acquire(0); }
    catch (error) {
      if ((error as { code?: string })?.code === 'profile_lock_timeout') throw new PlatformResetBusyError();
      throw error;
    }
  }

  private chat(session: OpenProfile, envelope: StorageEnvelope): ChatState {
    return { ...structuredClone(envelope.chat), channels: session.conversations.channels(),
      parallelChatGroups: session.conversations.groups() };
  }

  private async save(session: OpenProfile, previous: StorageEnvelope, stored: ChatState,
    chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot> {
    const snapshot = prepareChatSnapshot(stored, chat, core, this.filePath);
    this.prepareSearch(session);
    const envelope = makeEnvelope(snapshot, this.filePath, previous.storage.installationId);
    session.database.transaction(() => {
      session.conversations.synchronize(snapshot.chat);
      session.metadata.stage(envelope, bytesDigest(serializeEnvelope(previous)));
    }, { durable: true });
    await this.options.checkpoint?.('database_committed');
    session.envelope = await session.metadata.recover();
    const nextCore = extractCoreState(snapshot);
    if (hasSubstantiveCoreChange(envelopeCore(previous), nextCore)) {
      for (const listener of this.listeners) {
        try { listener(structuredClone(nextCore)); }
        catch { process.stderr.write('[cats-platform-store] core_listener_failed\n'); }
      }
    }
    return structuredClone(snapshot);
  }

  private async run<T>(work: (session: OpenProfile, envelope: StorageEnvelope) => Promise<T>): Promise<T> {
    if (this.closing || this.closed) throw new ProfileStorageError('closed', 'The state store is closed.');
    this.pending++;
    try {
      const perform = async () => {
        if (this.closed) throw new ProfileStorageError('closed', 'The state store is closed.');
        if (!this.session) await resumePlatformOwnedDataReset(this.filePath,
          (profile, remove) => this.withResetExclusivity(undefined, remove, profile));
        this.session ??= await openProfile(this.filePath, this.options);
        const envelope = await this.session.metadata.recover();
        this.session.envelope = envelope;
        return work(this.session, envelope);
      };
      const context = this.resetContext.getStore();
      if (context?.active) {
        const result = context.tail.then(perform);
        context.tail = result.catch(() => {});
        return await result;
      }
      return await withProfileLock(this.filePath, perform, { timeoutMs: this.options.lockTimeoutMs });
    } catch (error) {
      if (error instanceof MutationFailure) throw error.original;
      const failure = classifyStorageFailure(error);
      if (failure) { this.options.onFatal?.(failure); throw failure; }
      throw error;
    } finally { this.pending--; }
  }

  private prepareSearch(session: OpenProfile): void {
    // Core reads and paging never scan transcripts just to prepare a derived search index.
    if (!session.conversations.indexCurrent) {
      this.options.progress?.('rebuilding_search');
      session.conversations.rebuildIndex();
    }
  }
}

/** Keep SQLite/OS diagnostics and stored JSON out of public errors. Busy locks and
 * caller mistakes remain ordinary operation failures; corruption/I/O stops the host.
 */
function classifyStorageFailure(error: unknown): ProfileStorageError | undefined {
  if (error instanceof ProfileStorageError) return ['closed', 'profile_busy'].includes(error.code) ? undefined : error;
  if (error instanceof SyntaxError) return new ProfileStorageError('invalid_database_record',
    'A database record contains invalid JSON; preserve the state and restore a verified backup.');
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const sqlite = error as { errcode?: number } | null;
  if (error instanceof StateDatabaseError && ['unsupported_sqlite', 'newer_schema'].includes(error.code)) {
    return new ProfileStorageError(error.code, error.code === 'unsupported_sqlite'
      ? 'This runtime does not support the required SQLite capabilities. Use the supported Cats Desktop runtime; the profile was preserved.'
      : 'This database was written by a newer Cats build. Use that build or explicitly restore a compatible complete backup.');
  }
  if (error instanceof StateDatabaseError ||
    (code === 'ERR_SQLITE_ERROR' && ![5, 6].includes((sqlite?.errcode ?? 0) & 255)) ||
    ['ENOSPC', 'EIO', 'EROFS', 'EACCES', 'EPERM'].includes(code ?? '')) {
    return new ProfileStorageError('state_unavailable',
      'Cats cannot safely access its state. Close Cats and use state check or restore before retrying.');
  }
  return undefined;
}
