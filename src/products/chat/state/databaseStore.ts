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
import { prepareChatSnapshot, type ChatStore, type ChatSnapshotMutator, type ChatChannelMutator, type ChatChannelsMutator, type ChatChannelsMutationOptions, type ChatMetadata } from './store.js';
import { mergeScopedCoreProjection, mergeScopedCoreProjections } from './core-projection/scoped.js';
import { openProfile, type OpenProfile } from './database/openProfile.js';
import { assertProfileOffline, createProfileLease } from './database/profileLease.js';
import { reclaimConversationOperations, releaseConversationOperation } from './database/conversationOperations.js';
import { logicalDatabaseSnapshot } from './database/logicalExport.js';
import { type StorageHooks } from './database/metadataCommit.js';
import {
  bytesDigest, databasePath, envelopeCore, makeEnvelope, ProfileStorageError,
  readOptionalFile, serializeEnvelope, type StorageEnvelope,
} from './database/profileFormat.js';
import type { MessagePage, MessageSearchHit } from './database/conversationStore.js';
import { StateDatabaseError } from '../../../platform/persistence/state-db/stateDatabase.js';
import { upsertCoreSegment, type CoreSegmentWriteInput } from '../../../core/model/index.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { closeStateMaintenanceWorkers } from '../../../platform/persistence/state-db/stateMaintenance.js';
import { prepareTranscriptState } from './transcriptRepairs.js';
import type { ChatPresentationSnapshot, ChatMessageWindow } from './presentation.js';
import { DEFAULT_MESSAGE_PAGE_SIZE } from '../../shared/transcript.js';
import { ProfileSnapshotMaintenance } from './database/profileSnapshots.js';
import { maintainConversationArchives as maintainArchives, performConversationArchive,
  type ConversationArchiveOptions, type ConversationArchiveHost } from './database/archiveCoordinator.js';
import { ConversationArchiveError, type ArchiveAction, type ConversationArchiveJob } from './database/archiveJobs.js';
import type { ConversationArchiveResult } from '../../shared/conversationArchive.js';
import { conversationArchive } from './database/archiveAssets.js';
import { readArchivePage, type ArchivePageRequest, type ArchivePageResult } from './database/archiveRead.js';
import { archivePlacementBasis, MAX_ARCHIVE_PLACEMENTS, type ArchivePlacementBasis } from './database/archivePlacement.js';
import { decodeMessageCursor, encodeMessageCursor } from './messageCursor.js';
import { MessageCursorExpiredError, type MessagePresentationPlacement } from '../../shared/transcript.js';

export interface DatabaseStoreOptions extends StorageHooks {
  lockTimeoutMs?: number;
  onFatal?(error: ProfileStorageError): void;
  runtimeDataDir?: string | null;
  /** Private timing seam for isolated lifecycle checks. */
  snapshotMaintenance?: { initialDelayMs?: number; intervalMs?: number };
  /** Private scheduler timing seam for isolated archive cleanup checks. */
  archiveMaintenance?: { retryDelayMs?: number };
  /** Private read fault seam; never selected from an HTTP request. */
  archiveReadCheckpoint?(phase: 'captured' | 'proof_prepared' | 'page_read'): void | Promise<void>;
  archiveReadWorkerCheckpoint?(phase: string): void | Promise<void>;
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
  private maintenanceAbort = new AbortController();
  private readonly maintenanceSignal: AbortSignal;
  private snapshots?: ProfileSnapshotMaintenance;
  private maintenanceRequested = false;
  private archiveCleanup?: Promise<void>;
  private archiveAbort = new AbortController();
  private abandonedArchiveJobs = new Map<string, ConversationArchiveJob>();
  private archiveCleanupTimer?: ReturnType<typeof setTimeout>;
  private archiveCleanupNotBefore = 0;
  private archiveCleanupAgain = false;
  private archiveReadCache = new Map<string, { placements?: MessagePresentationPlacement[]; pending?: Promise<ArchivePageResult> }>();

  constructor(filePath: string, private readonly options: DatabaseStoreOptions = {}) {
    this.filePath = path.resolve(filePath);
    this.maintenanceSignal = options.signal ? AbortSignal.any([this.maintenanceAbort.signal, options.signal])
      : this.maintenanceAbort.signal;
    databasePath(this.filePath); // Reject unsupported locations before creating lock files.
  }

  async initialize(): Promise<void> { await this.run(async session => this.prepareSearch(session)); }

  /** Background only: startup readiness never waits for native check/VACUUM. */
  startMaintenance(): void {
    if (this.closing || this.closed || this.maintenanceSignal.aborted) return;
    this.maintenanceRequested = true;
    this.resumeSnapshotMaintenance();
    void this.maintainConversationArchives().catch(() => {
      if (!this.maintenanceSignal.aborted) process.stderr.write('[cats-platform-store] archive_cleanup_deferred\n');
    });
  }

  private archiveHost(): ConversationArchiveHost {
    return { profile: this.filePath, signal: AbortSignal.any([this.maintenanceSignal, this.archiveAbort.signal]),
      run: (work, signal) => this.resetContext.exit(() => this.run(async (session, envelope) => {
        if (this.abandonedArchiveJobs.size) {
          const abandoned = [...this.abandonedArchiveJobs.values()];
          session.database.transaction(() => {
            for (const job of abandoned) session.database.run('delete from conversation_archive_jobs where token = ? and lease_token = ?', job.token, job.leaseToken);
          }, { durable: true });
          for (const job of abandoned) this.abandonedArchiveJobs.delete(job.token);
        }
        return work(session, envelope);
      }, signal)),
      abandon: job => {
        // A zero/expired lock deadline may defer withdrawal. Remember only jobs
        // whose native producer has already closed, and retry under the next
        // archive/maintenance lock even while this connection lease remains alive.
        this.abandonedArchiveJobs.set(job.token, job);
        return this.resetContext.exit(() => withProfileLock(this.filePath, async () => {
        if (this.closing || this.closed || this.maintenanceSignal.aborted || this.archiveAbort.signal.aborted) return;
        this.session?.database.transaction(() => {
          this.session!.database.run('delete from conversation_archive_jobs where token = ? and lease_token = ?', job.token, job.leaseToken);
        }, { durable: true });
        this.abandonedArchiveJobs.delete(job.token);
      }, { signal: this.maintenanceSignal, timeoutMs: this.options.lockTimeoutMs })); },
      recovered: async (session, previous) => {
        await this.options.checkpoint?.('database_committed');
        session.envelope = await session.metadata.recover();
        const core = envelopeCore(session.envelope);
        if (hasSubstantiveCoreChange(envelopeCore(previous), core)) for (const listener of this.listeners) {
          try { listener(structuredClone(core)); } catch { process.stderr.write('[cats-platform-store] core_listener_failed\n'); }
        }
      } };
  }

  async maintainConversationArchives(options?: ConversationArchiveOptions): Promise<void> {
    if (this.closing || this.closed || this.maintenanceSignal.aborted) return;
    if (this.archiveCleanup) return this.archiveCleanup;
    this.archiveCleanupNotBefore = Date.now() + (this.options.archiveMaintenance?.retryDelayMs ?? 60_000);
    const epoch = this.archiveAbort;
    return this.archiveCleanup = maintainArchives(this.archiveHost(), options).catch(error => {
      if (epoch === this.archiveAbort && !epoch.signal.aborted) this.archiveCleanupAgain = true;
      throw error;
    }).finally(() => {
      this.archiveCleanup = undefined;
      if (this.archiveCleanupAgain) { this.archiveCleanupAgain = false; this.queueArchiveCleanup(); }
    });
  }

  private queueArchiveCleanup(): void {
    if (!this.maintenanceRequested || this.closing || this.closed || this.maintenanceSignal.aborted || this.archiveAbort.signal.aborted) return;
    if (this.archiveCleanup) { this.archiveCleanupAgain = true; return; }
    if (this.archiveCleanupTimer) return;
    this.archiveCleanupTimer = setTimeout(() => {
      this.archiveCleanupTimer = undefined;
      void this.maintainConversationArchives().catch(() => {
        if (!this.maintenanceSignal.aborted) process.stderr.write('[cats-platform-store] archive_cleanup_deferred\n');
      });
    }, Math.max(0, this.archiveCleanupNotBefore - Date.now()));
    this.archiveCleanupTimer.unref();
  }

  async archiveConversation(id: string, action: ArchiveAction, options?: ConversationArchiveOptions): Promise<ConversationArchiveResult> {
    if (this.resetContext.getStore()?.active) throw new ConversationArchiveError('archive_busy');
    const signal = options?.signal ? AbortSignal.any([this.maintenanceSignal, this.archiveAbort.signal, options.signal])
      : AbortSignal.any([this.maintenanceSignal, this.archiveAbort.signal]);
    const epoch = this.archiveAbort;
    try {
      await this.run(async session => this.prepareSearch(session), signal);
      return await performConversationArchive(this.archiveHost(), id, action, options);
    } finally { if (epoch === this.archiveAbort) this.queueArchiveCleanup(); }
  }

  private resumeSnapshotMaintenance(): void {
    if (!this.maintenanceRequested || this.snapshots || !this.session || this.closing || this.closed || this.maintenanceSignal.aborted) return;
    this.snapshots = new ProfileSnapshotMaintenance(this.filePath, signal => this.resetContext.exit(() =>
      this.run(async session => {
        signal.throwIfAborted();
        const metadata = await readOptionalFile(this.filePath);
        if (!metadata || bytesDigest(metadata) !== session.database.meta('metadata_digest')) throw new ProfileStorageError('metadata_mismatch',
          'The database and metadata do not belong to the same committed state. Preserve both and restore a verified pair.');
        signal.throwIfAborted();
        return metadata;
      }, signal)), { ...this.options.snapshotMaintenance, signal: this.maintenanceSignal,
      onError: code => process.stderr.write(`[cats-platform-store] ${code}\n`) });
    this.snapshots.start();
  }

  private async stopSnapshotMaintenance(): Promise<void> {
    const snapshots = this.snapshots;
    this.snapshots = undefined;
    await snapshots?.stop();
  }

  /** One explicit full-history preparation per repair form, before serving windows.
   * Import/export proofs remain separate from application recovery changes.
   */
  async prepareTranscriptReads(): Promise<void> {
    await this.run(async (session, envelope) => {
      if (session.database.meta('transcript_repair_form') === '1') return;
      this.options.progress?.('preparing_transcripts');
      const chat = this.chat(session, envelope);
      const repaired = prepareTranscriptState(chat, { core: envelopeCore(envelope), runtimeDataDir: this.options.runtimeDataDir });
      const prepared = !isDeepStrictEqual(chat, repaired)
        ? (await this.save(session, envelope, chat, repaired, envelopeCore(envelope))).chat : chat;
      session.database.transaction(() => {
        for (const channel of prepared.channels) session.conversations.putPresentationFacts(channel);
        session.database.setMeta('transcript_repair_form', '1');
      }, { durable: true });
    });
  }

  async readPresentation(channelId?: string): Promise<ChatPresentationSnapshot> {
    return this.withMessageWindow(channelId, DEFAULT_MESSAGE_PAGE_SIZE, undefined, (session, envelope, selected) => {
      if (session.database.meta('transcript_repair_form') !== '1') throw new ProfileStorageError('presentation_pending',
        'Conversation read models need startup preparation before they can be served.');
      const headers = session.conversations.headers();
      const archivedIds = new Set(headers.filter(header => header.status === 'archived').map(header => header.id));
      const facts = session.conversations.presentationFacts();
      if (headers.some(header => !facts.has(header.id))) throw new ProfileStorageError('presentation_pending',
        'Conversation read models need startup preparation before they can be served.');
      return { metadata: { ...structuredClone(envelope.chat), parallelChatGroups: session.conversations.groups() },
        headers, selected,
        core: structuredClone(envelopeCore(envelope)),
        awaitingReplyChannelIds: [...facts].filter(([id, awaiting]) => awaiting && !archivedIds.has(id)).map(([id]) => id) };
    });
  }

  async readCatalog() {
    return this.run(async (session, envelope) => ({
      revision: envelope.storage.revision,
      metadata: { ...structuredClone(envelope.chat), parallelChatGroups: session.conversations.groups() },
      headers: session.conversations.headers(), core: structuredClone(envelopeCore(envelope)),
    }));
  }

  async read(): Promise<ChatState> {
    return this.run(async (session, envelope) => this.chat(session, envelope));
  }

  async readCore(): Promise<CatsCoreState> {
    return this.run(async (_session, envelope) => structuredClone(envelopeCore(envelope)));
  }

  async readChannel(id: string): Promise<ChatChannelState | null> {
    return this.run(async session => session.conversations.channel(id));
  }

  async readChannelHeader(id: string): Promise<Omit<ChatChannelState, 'messages'> | null> {
    return this.run(async session => session.conversations.header(id));
  }

  async readChannelState(id: string): Promise<ChatState> {
    return this.readChannelStates([id]);
  }

  async readChannelStates(ids: readonly string[], options: {
    metadataOnly?: boolean; excludeArchived?: boolean; archivedMetadataOnly?: boolean;
  } = {}): Promise<ChatState> {
    return this.run(async (session, envelope) => {
      const selected = [...new Set(ids)].map(id => ({ id, position: session.conversations.position(id) }))
        .filter((entry): entry is { id: string; position: number } => entry.position !== null)
        .filter(({ id }) => !options.excludeArchived || session.conversations.header(id)!.status !== 'archived')
        .sort((left, right) => left.position - right.position);
      const channels = selected.map(({ id }) => {
        const header = options.metadataOnly || options.archivedMetadataOnly ? session.conversations.header(id)! : null;
        if (options.metadataOnly || (options.archivedMetadataOnly && header?.status === 'archived')) {
          return { ...header!, messages: [] };
        }
        return session.conversations.channel(id)!;
      });
      return { ...structuredClone(envelope.chat), parallelChatGroups: session.conversations.groups(),
        channels };
    });
  }

  async updateChannel(id: string, mutator: ChatChannelMutator): Promise<ChatChannelState | null> {
    return this.run(async (session, envelope) => {
      const stored = session.conversations.channel(id);
      if (!stored) return null; // A completed dispatch must never resurrect a deleted channel.
      const core = envelopeCore(envelope);
      const { channels: _channels, ...chatMetadata } = structuredClone(envelope.chat);
      const metadata = { ...chatMetadata, parallelChatGroups: session.conversations.groups() };
      const catalog = session.conversations.projectionMetadata();
      const context = { revision: envelope.storage.revision, chat: structuredClone(metadata), core: structuredClone(core), channelCatalog: structuredClone(catalog) };
      let result: ReturnType<ChatChannelMutator>;
      try { result = mutator(structuredClone(stored), context); }
      catch (error) { throw new MutationFailure(error); }
      if (result && typeof (result as unknown as { then?: unknown }).then === 'function') {
        void Promise.resolve(result).catch(() => {});
        throw new TypeError('A channel mutation must be synchronous');
      }
      if (context.revision !== envelope.storage.revision || !isDeepStrictEqual(context.chat, metadata) || !isDeepStrictEqual(context.core, core)
        || !isDeepStrictEqual(context.channelCatalog, catalog)) {
        throw new TypeError('A channel mutation cannot edit global Chat or Core state');
      }
      const incoming = result?.channel;
      if (!incoming || incoming.id !== id || !Array.isArray(incoming.messages)
        || incoming.messages.some(message => !message || !message.id || message.channelId !== id)) {
        throw new TypeError('A channel mutation must keep its channel and message identities');
      }
      const nextMetadata = result.metadata ?? metadata;
      validateScopedMetadata(metadata, nextMetadata, incoming);
      if (isDeepStrictEqual(incoming, stored) && isDeepStrictEqual(nextMetadata, metadata)) return structuredClone(stored);
      const now = new Date();
      const beforeChat = { ...metadata, channels: [stored] };
      const before = prepareChatSnapshot(beforeChat, beforeChat, core, this.filePath, now);
      const repaired = prepareTranscriptState({ ...nextMetadata, channels: [incoming] },
        { core, runtimeDataDir: this.options.runtimeDataDir, now });
      const after = prepareChatSnapshot(beforeChat, repaired, core, this.filePath, now);
      const channel = after.chat.channels[0]!;
      const nextCore = mergeScopedCoreProjection(core, extractCoreState(before), extractCoreState(after),
        beforeChat, catalog, channel);
      const position = session.conversations.position(id)!;
      this.prepareSearch(session);
      const target = makeEnvelope(buildPersistedChatSnapshot(after.chat, nextCore), this.filePath,
        envelope.storage.installationId);
      await this.commit(session, envelope, target, nextCore, () => {
        session.conversations.putChannel(channel, position);
        if (!isDeepStrictEqual(metadata.parallelChatGroups, nextMetadata.parallelChatGroups)) {
          session.conversations.putGroups(nextMetadata.parallelChatGroups);
        }
      });
      return structuredClone(channel);
    });
  }

  async updateChannels(ids: readonly string[], mutator: ChatChannelsMutator,
    options: ChatChannelsMutationOptions = {}): Promise<ChatState> {
    return this.run(async (session, envelope) => {
      const requested = [...new Set(ids)].map(id => ({ id, position: session.conversations.position(id) }))
        .filter((entry): entry is { id: string; position: number } => entry.position !== null)
        .sort((left, right) => left.position - right.position);
      const { channels: _channels, ...chatMetadata } = structuredClone(envelope.chat);
      const metadata = { ...chatMetadata, parallelChatGroups: session.conversations.groups() };
      if (options.preflight) {
        try {
          const checked: unknown = options.preflight({ ...structuredClone(metadata), channels: requested.map(({ id }) =>
            ({ ...session.conversations.header(id)!, messages: [] })) });
          if (checked && typeof (checked as unknown as { then?: unknown }).then === 'function') {
            void Promise.resolve(checked).catch(() => {});
            throw new TypeError('Channel batch admission must be synchronous');
          }
        } catch (error) { throw new MutationFailure(error); }
      }
      const selected = requested.filter(({ id }) => !options.excludeArchived || session.conversations.header(id)!.status !== 'archived');
      const stored = { ...metadata, channels: selected.map(({ id }) => session.conversations.channel(id)!) };
      if (!selected.length) return stored;
      const core = envelopeCore(envelope), catalog = session.conversations.projectionMetadata();
      const context = { revision: envelope.storage.revision, chat: structuredClone(metadata), core: structuredClone(core), channelCatalog: structuredClone(catalog) };
      let incoming: ChatState;
      try { incoming = mutator(structuredClone(stored), context); }
      catch (error) { throw new MutationFailure(error); }
      if (incoming && typeof (incoming as unknown as { then?: unknown }).then === 'function') {
        void Promise.resolve(incoming).catch(() => {});
        throw new TypeError('A channel batch mutation must be synchronous');
      }
      if (context.revision !== envelope.storage.revision || !isDeepStrictEqual(context.chat, metadata) || !isDeepStrictEqual(context.core, core)
        || !isDeepStrictEqual(context.channelCatalog, catalog)) {
        throw new TypeError('A channel batch mutation cannot edit global Chat or Core state');
      }
      if (!incoming || !Array.isArray(incoming.channels) || incoming.channels.length !== selected.length
        || incoming.channels.some((channel, index) => !channel || channel.id !== selected[index]!.id
          || !Array.isArray(channel.messages)
          || channel.messages.some(message => !message || !message.id || message.channelId !== channel.id))) {
        throw new TypeError('A channel batch mutation must keep its channel order and message identities');
      }
      const { channels, ...nextMetadata } = incoming;
      validateScopedBatchMetadata(metadata, nextMetadata, channels);
      if (isDeepStrictEqual(stored, incoming)) return structuredClone(stored);
      const now = new Date();
      const before = prepareChatSnapshot(stored, stored, core, this.filePath, now);
      const repaired = prepareTranscriptState(incoming, { core, runtimeDataDir: this.options.runtimeDataDir, now });
      const after = prepareChatSnapshot(stored, repaired, core, this.filePath, now);
      const nextCore = mergeScopedCoreProjections(core, extractCoreState(before), extractCoreState(after),
        stored, catalog, after.chat.channels);
      this.prepareSearch(session);
      const target = makeEnvelope(buildPersistedChatSnapshot(after.chat, nextCore), this.filePath,
        envelope.storage.installationId);
      await this.commit(session, envelope, target, nextCore, () => {
        for (let index = 0; index < selected.length; index++) {
          if (!isDeepStrictEqual(stored.channels[index], after.chat.channels[index])) {
            session.conversations.putChannel(after.chat.channels[index]!, selected[index]!.position);
          }
        }
        if (!isDeepStrictEqual(metadata.parallelChatGroups, nextMetadata.parallelChatGroups)) {
          session.conversations.putGroups(nextMetadata.parallelChatGroups);
        }
      });
      return structuredClone(after.chat);
    });
  }

  async reserveConversationOperation(id: string): Promise<(() => Promise<void>) | null> {
    if (this.resetContext.getStore()?.active) throw new ProfileStorageError('profile_busy',
      'Finish the current state reset before starting conversation work.');
    return this.run(async session => {
      const header = session.conversations.header(id);
      if (!header) return null;
      if (header.status === 'archived') throw new ProfileStorageError('conversation_archived',
        'Restore this archived conversation before starting work.');
      await reclaimConversationOperations(this.filePath, session.database, id);
      // An independent lease protects pending external work even after this store closes.
      const lease = await createProfileLease(this.filePath), token = randomUUID();
      try {
        session.database.transaction(() => session.database.run(
          'insert into conversation_operations(token, channel_id, lease_token) values (?, ?, ?)', token, id, lease.token),
        { durable: true });
        await this.options.checkpoint?.('conversation_operation_reserved');
        return () => releaseConversationOperation(this.filePath, lease);
      } catch (error) { await lease(); throw error; }
    });
  }

  async writeConversationPresentation(id: string, segment: CoreSegmentWriteInput, now: Date): Promise<void> {
    await this.run(async (session, envelope) => {
      const header = session.conversations.header(id);
      if (!header) return; // A late presentation never resurrects a deleted conversation.
      if (header.status === 'archived') throw new ProfileStorageError('conversation_archived',
        'Restore this archived conversation before changing its presentation.');
      const core = envelopeCore(envelope), conversationId = buildChatConversationId(id);
      const previous = core.segments.find(record => record.id === segment.id);
      if (typeof segment.id !== 'string' || !segment.id || segment.id.trim() !== segment.id
        || segment.kind !== 'status' || segment.conversationId !== conversationId
        || segment.metadata?.event !== 'conversation_presentation' || segment.metadata?.channelId !== id
        || (previous && (previous.conversationId !== conversationId
          || previous.metadata?.event !== 'conversation_presentation' || previous.metadata?.channelId !== id))) {
        throw new TypeError('A conversation presentation must retain its target identity');
      }
      const nextCore = upsertCoreSegment(core, structuredClone(segment), now).core;
      if (isDeepStrictEqual(nextCore, core)) return;
      const chat = { ...structuredClone(envelope.chat), parallelChatGroups: session.conversations.groups() };
      const target = makeEnvelope(buildPersistedChatSnapshot(chat, nextCore), this.filePath, envelope.storage.installationId);
      await this.commit(session, envelope, target, nextCore, () => {});
    });
  }

  async readMessagePage(id: string, limit = 50, before?: string): Promise<MessagePage> {
    return (await this.readMessageWindow(id, limit, before)).page;
  }

  async readMessageWindow(id: string, limit = 50, before?: string): Promise<ChatMessageWindow> {
    return this.withMessageWindow(id, limit, before, (_session, _envelope, window) => {
      if (!window) throw new ConversationArchiveError('archive_missing');
      return window;
    });
  }

  private async withMessageWindow<T>(channelId: string | undefined, limit: number, before: string | undefined,
    build: (session: OpenProfile, envelope: StorageEnvelope, window: ChatMessageWindow | null) => T): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.messageWindowAttempt(channelId, limit, before, build); }
      catch (error) { if (channelId !== undefined || attempt > 0 || !(error instanceof MessageCursorExpiredError)) throw error; }
    }
  }

  private async messageWindowAttempt<T>(channelId: string | undefined, limit: number, before: string | undefined,
    build: (session: OpenProfile, envelope: StorageEnvelope, window: ChatMessageWindow | null) => T): Promise<T> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new RangeError('Invalid conversation page limit');
    const window = (session: OpenProfile, envelope: StorageEnvelope, id: string, page: MessagePage,
      placements = session.conversations.presentationPlacements(envelopeCore(envelope), id, page, before === undefined)): ChatMessageWindow => ({
      page: { ...page, archiveActions: true }, channel: { ...session.conversations.header(id)!, messages: page.messages },
      core: structuredClone(envelopeCore(envelope)), placements,
      metadata: { ...structuredClone(envelope.chat), parallelChatGroups: session.conversations.groups() },
    });
    const capture = await this.run(async (session, envelope) => {
      const id = channelId ?? envelope.chat.selectedChannelId;
      if (!session.conversations.header(id)) return { result: build(session, envelope, null) };
      const archive = conversationArchive(session.database, id);
      if (!archive) return { result: build(session, envelope, window(session, envelope, id, session.conversations.page(id, limit, before))) };
      if (this.resetContext.getStore()?.active) throw new ConversationArchiveError('archive_busy');
      const cursor = before === undefined ? null : decodeMessageCursor(before, id);
      const row = session.database.get('select order_revision, content_revision from channels where id = ?', id)!;
      if (cursor && cursor.order !== Number(row.order_revision)) throw new MessageCursorExpiredError();
      if (cursor && cursor.before > archive.messageCount) throw new RangeError('Invalid conversation page cursor');
      const basis = archivePlacementBasis(envelopeCore(envelope), id);
      return { cold: { profile: this.filePath, ownerLeaseToken: session.leaseToken, channelId: id,
        archiveId: archive.archiveId, manifestDigest: archive.manifestDigest, orderRevision: String(row.order_revision),
        before: cursor?.before ?? archive.messageCount, limit }, archive, basis,
        cacheKey: canonicalDigest([1, envelope.storage.installationId, archive.archiveId, archive.manifestDigest, basis]),
        installationId: envelope.storage.installationId, contentRevision: row.content_revision,
        historyRevision: session.database.meta(`channel_history:${id}`) ?? '0' };
    });
    if ('result' in capture) return capture.result!;
    const signal = AbortSignal.any([this.maintenanceSignal, this.archiveAbort.signal]);
    await this.options.archiveReadCheckpoint?.('captured');
    let result: ArchivePageResult;
    try { result = await this.coldPage(capture.cold, capture.cacheKey, capture.basis, signal); }
    catch (error) {
      if (error instanceof ConversationArchiveError && !['archive_cancelled', 'archive_busy'].includes(error.code)) {
        await this.run(async (session, envelope) => {
          const id = capture.cold.channelId;
          if ((channelId === undefined && envelope.chat.selectedChannelId !== id)
            || envelope.storage.installationId !== capture.installationId) throw new MessageCursorExpiredError();
          const row = session.database.get('select order_revision, content_revision from channels where id = ?', id);
          if (!row) throw new ConversationArchiveError('archive_missing');
          const archive = conversationArchive(session.database, id);
          if (!archive || archive.archiveId !== capture.archive.archiveId || archive.manifestDigest !== capture.archive.manifestDigest
            || row.content_revision !== capture.contentRevision || String(row.order_revision) !== capture.cold.orderRevision
            || (session.database.meta(`channel_history:${id}`) ?? '0') !== capture.historyRevision) throw new MessageCursorExpiredError();
        }, signal);
        if (error.code === 'archive_changed') throw new MessageCursorExpiredError();
      }
      throw error;
    }
    await this.options.archiveReadCheckpoint?.('page_read');
    return this.run(async (session, envelope) => {
      const id = capture.cold.channelId, archive = conversationArchive(session.database, id);
      const row = session.database.get('select order_revision, content_revision from channels where id = ?', id);
      if ((channelId === undefined && envelope.chat.selectedChannelId !== id)
        || envelope.storage.installationId !== capture.installationId) throw new MessageCursorExpiredError();
      if (!row) return build(session, envelope, null);
      if (!archive || archive.archiveId !== capture.archive.archiveId || archive.manifestDigest !== capture.archive.manifestDigest
        || (channelId === undefined && envelope.chat.selectedChannelId !== id)
        || envelope.storage.installationId !== capture.installationId || row.content_revision !== capture.contentRevision
        || String(row.order_revision) !== capture.cold.orderRevision
        || (session.database.meta(`channel_history:${id}`) ?? '0') !== capture.historyRevision) throw new MessageCursorExpiredError();
      const page: MessagePage = { messages: result.messages, total: result.total, orderRevision: capture.cold.orderRevision,
        historyRevision: capture.historyRevision, nextCursor: result.nextPosition === null ? null
          : encodeMessageCursor(id, Number(capture.cold.orderRevision), result.nextPosition),
        archive: { id: archive.archiveId, createdAt: archive.createdAt } };
      return build(session, envelope, window(session, envelope, id, page, result.placements));
    }, signal);
  }

  private async coldPage(request: ArchivePageRequest, key: string, basis: ArchivePlacementBasis[], signal: AbortSignal): Promise<ArchivePageResult> {
    const read = (input: ArchivePageRequest) => readArchivePage(input, signal, this.options.archiveReadWorkerCheckpoint);
    if (basis.length === 0) return read(request);
    const cached = this.archiveReadCache.get(key);
    if (cached) {
      this.archiveReadCache.delete(key); this.archiveReadCache.set(key, cached);
      const placements = cached.placements ?? (await cached.pending!).placements;
      return { ...await read(request), placements };
    }
    while (this.archiveReadCache.size >= 32) {
      const oldest = [...this.archiveReadCache].find(([, entry]) => !entry.pending);
      if (!oldest) throw new ConversationArchiveError('archive_busy');
      this.archiveReadCache.delete(oldest[0]);
    }
    const entry: { placements?: MessagePresentationPlacement[]; pending?: Promise<ArchivePageResult> } = {
      pending: read({ ...request, basis }),
    };
    this.archiveReadCache.set(key, entry);
    try {
      const result = await entry.pending!;
      entry.pending = undefined; entry.placements = result.placements;
      let count = [...this.archiveReadCache.values()].reduce((sum, value) => sum + (value.placements?.length ?? 0), 0);
      for (const [id, value] of this.archiveReadCache) if (count > MAX_ARCHIVE_PLACEMENTS && id !== key && !value.pending) {
        count -= value.placements?.length ?? 0; this.archiveReadCache.delete(id);
      }
      await this.options.archiveReadCheckpoint?.('proof_prepared');
      return result;
    } catch (error) { if (this.archiveReadCache.get(key) === entry) this.archiveReadCache.delete(key); throw error; }
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
    if (this.archiveCleanupTimer) clearTimeout(this.archiveCleanupTimer);
    this.archiveCleanupAgain = false;
    this.maintenanceAbort.abort();
    this.archiveReadCache.clear();
    await this.stopSnapshotMaintenance();
    await closeStateMaintenanceWorkers(databasePath(this.filePath));
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
      await this.stopSnapshotMaintenance();
      if (this.archiveCleanupTimer) clearTimeout(this.archiveCleanupTimer);
      this.archiveCleanupTimer = undefined; this.archiveCleanupAgain = false;
      this.archiveAbort.abort();
      await closeStateMaintenanceWorkers(databasePath(this.filePath));
      session.database.close();
      await session.releaseLease();
      this.session = null;
      await assertProfileOffline(this.filePath);
      await remove();
      this.abandonedArchiveJobs.clear();
      this.archiveReadCache.clear();
      this.archiveAbort = new AbortController();
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
    const repaired = prepareTranscriptState(chat, { core, runtimeDataDir: this.options.runtimeDataDir });
    const snapshot = prepareChatSnapshot(stored, repaired, core, this.filePath);
    this.prepareSearch(session);
    const envelope = makeEnvelope(snapshot, this.filePath, previous.storage.installationId);
    await this.commit(session, previous, envelope, extractCoreState(snapshot),
      () => session.conversations.synchronize(snapshot.chat));
    return structuredClone(snapshot);
  }

  private async commit(session: OpenProfile, previous: StorageEnvelope, envelope: StorageEnvelope,
    nextCore: CatsCoreState, changeRows: () => void): Promise<void> {
    session.database.transaction(() => {
      // Core-only output can change an older displayed window without editing a
      // stored message. Invalidate only channels whose changed placement is old.
      const before = new Map(envelopeCore(previous).segments.filter(segment => segment.metadata?.event === 'conversation_presentation')
        .map(segment => [segment.id, segment]));
      const after = new Map(nextCore.segments.filter(segment => segment.metadata?.event === 'conversation_presentation')
        .map(segment => [segment.id, segment]));
      const previousCore = envelopeCore(previous);
      const oldLanes = new Map(previousCore.lanes.map(lane => [lane.id, lane.status]));
      const newLanes = new Map(nextCore.lanes.map(lane => [lane.id, lane.status]));
      const affected = [...new Set([...before.keys(), ...after.keys()])].filter(id =>
        !isDeepStrictEqual(before.get(id), after.get(id))
        || oldLanes.get(before.get(id)?.laneId ?? '') !== newLanes.get(after.get(id)?.laneId ?? ''));
      const invalidate = (core: CatsCoreState, records: typeof before) => {
        const invalidated = new Set<string>();
        for (const id of affected) {
          const segment = records.get(id); const channelId = segment?.metadata.channelId;
          if (!segment || typeof channelId !== 'string' || invalidated.has(channelId) || session.conversations.position(channelId) === null) continue;
          if (conversationArchive(session.database, channelId)) {
            session.database.setMeta(`channel_history:${channelId}`, randomUUID()); invalidated.add(channelId); continue;
          }
          const page = session.conversations.page(channelId);
          const proof = session.conversations.presentationPlacements({ ...core, segments: [segment] }, channelId, page, true, true)[0];
          const anchor = proof?.responseMessageId ?? proof?.anchorMessageId;
          const position = anchor ? session.conversations.messagePosition(channelId, anchor) : null;
          if (position !== null && position < page.total - DEFAULT_MESSAGE_PAGE_SIZE) {
            session.database.setMeta(`channel_history:${channelId}`, randomUUID()); invalidated.add(channelId);
          }
        }
      };
      invalidate(previousCore, before);
      changeRows();
      invalidate(nextCore, after);
      session.metadata.stage(envelope, bytesDigest(serializeEnvelope(previous)));
    }, { durable: true });
    await this.options.checkpoint?.('database_committed');
    session.envelope = await session.metadata.recover();
    if (hasSubstantiveCoreChange(envelopeCore(previous), nextCore)) {
      for (const listener of this.listeners) {
        try { listener(structuredClone(nextCore)); }
        catch { process.stderr.write('[cats-platform-store] core_listener_failed\n'); }
      }
    }
    if (session.database.get("select archive_id from conversation_archives where state = 'delete_pending' limit 1")) this.queueArchiveCleanup();
  }

  private async run<T>(work: (session: OpenProfile, envelope: StorageEnvelope) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.closing || this.closed) throw new ProfileStorageError('closed', 'The state store is closed.');
    this.pending++;
    let phase: 'lock' | 'opening' | 'recovering' | 'operation' = 'lock';
    try {
      const perform = async () => {
        phase = 'opening';
        if (this.closed) throw new ProfileStorageError('closed', 'The state store is closed.');
        if (!this.session) await resumePlatformOwnedDataReset(this.filePath,
          (profile, remove) => this.withResetExclusivity(undefined, remove, profile));
        this.session ??= await openProfile(this.filePath, { ...this.options, signal: this.maintenanceSignal });
        phase = 'recovering';
        const envelope = await this.session.metadata.recover();
        this.session.envelope = envelope;
        this.resumeSnapshotMaintenance();
        phase = 'operation';
        return work(this.session, envelope);
      };
      const context = this.resetContext.getStore();
      if (context?.active) {
        const result = context.tail.then(perform);
        context.tail = result.catch(() => {});
        return await result;
      }
      return await withProfileLock(this.filePath, perform, { timeoutMs: this.options.lockTimeoutMs, signal });
    } catch (error) {
      if (error instanceof MutationFailure) throw error.original;
      const failure = classifyStorageFailure(error, phase);
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

/** Scoped dispatch may refresh derived memory, but never remove cats, alter their
 * execution profiles, change group membership or overwrite unrelated preferences.
 * Renaming this member may rename its group, as the existing product model does.
 */
function validateScopedMetadata(previous: ChatMetadata, next: ChatMetadata, channel: ChatChannelState): void {
  const activeCats = new Set(channel.catAssignments.filter(assignment => assignment.status === 'active')
    .map(assignment => assignment.catId));
  const expected = { ...previous,
    parallelChatGroups: previous.parallelChatGroups.map(group => {
      const candidate = next.parallelChatGroups.find(value => value.id === group.id);
      return candidate && !isDeepStrictEqual(candidate, group) && group.memberChannelIds.includes(channel.id)
        ? { ...group, title: channel.title, updatedAt: channel.updatedAt } : group;
    }),
    globalOrchestrator: { ...previous.globalOrchestrator,
      memory: next.globalOrchestrator.memory, updatedAt: next.globalOrchestrator.updatedAt },
    cats: previous.cats.map(cat => {
      const candidate = next.cats.find(value => value.id === cat.id);
      return activeCats.has(cat.id) && candidate
        ? { ...cat, memory: candidate.memory, updatedAt: candidate.updatedAt } : cat;
    }),
  };
  if (!isDeepStrictEqual(expected, next)) throw new TypeError('A scoped channel mutation may only update derived shared memory or its related group name');
}

/** A batch can touch a related group's activity, but cannot change its audience or title. */
function validateScopedBatchMetadata(previous: ChatMetadata, next: ChatMetadata, channels: ChatChannelState[]): void {
  const ids = new Set(channels.map(channel => channel.id));
  const activeCats = new Set(channels.flatMap(channel => channel.catAssignments
    .filter(assignment => assignment.status === 'active').map(assignment => assignment.catId)));
  const expected = { ...previous,
    selectedChannelId: ids.has(next.selectedChannelId) ? next.selectedChannelId : previous.selectedChannelId,
    parallelChatGroups: previous.parallelChatGroups.map(group => {
      const candidate = next.parallelChatGroups.find(value => value.id === group.id);
      if (!candidate || isDeepStrictEqual(candidate, group) || !group.memberChannelIds.some(id => ids.has(id))) return group;
      return { ...group, updatedAt: candidate.updatedAt, lastMessageAt: candidate.lastMessageAt };
    }),
    globalOrchestrator: { ...previous.globalOrchestrator,
      memory: next.globalOrchestrator.memory, updatedAt: next.globalOrchestrator.updatedAt },
    cats: previous.cats.map(cat => {
      const candidate = next.cats.find(value => value.id === cat.id);
      return activeCats.has(cat.id) && candidate
        ? { ...cat, memory: candidate.memory, updatedAt: candidate.updatedAt } : cat;
    }),
  };
  if (!isDeepStrictEqual(expected, next)) throw new TypeError('A scoped channel batch may only update derived memory, target selection or related-group activity');
}

/** Keep SQLite/OS diagnostics and stored JSON out of public errors. Busy locks and
 * caller mistakes remain ordinary operation failures; corruption/I/O stops the host.
 */
function classifyStorageFailure(error: unknown, phase: 'lock' | 'opening' | 'recovering' | 'operation'): ProfileStorageError | undefined {
  if (error instanceof ProfileStorageError) return ['closed', 'profile_busy', 'conversation_archived', 'archive_invalid'].includes(error.code) ? undefined : error;
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
      'Cats cannot safely access its state. Close Cats and use state check or restore before retrying.', {
        phase,
        sourceCode: error instanceof StateDatabaseError ? error.code : code!,
        ...(code === 'ERR_SQLITE_ERROR' && Number.isSafeInteger(sqlite?.errcode) && sqlite!.errcode! >= 0
          ? { sqliteResultCode: sqlite!.errcode } : {}),
      });
  }
  return undefined;
}
