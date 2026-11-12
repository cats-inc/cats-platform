import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runStateMaintenance, StateMaintenanceError } from '../../../../platform/persistence/state-db/stateMaintenance.js';
import { syncDirectory } from '../../../../platform/persistence/state-db/atomicFile.js';
import { buildChatArchiveId, buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import type { OpenProfile } from './openProfile.js';
import { archiveDirectory, conversationArchive } from './archiveAssets.js';
import { bytesDigest, databasePath, readOptionalFile, serializeEnvelope, type StorageEnvelope } from './profileFormat.js';
import { archiveJobDirectory, assertArchiveIdle, assertArchiveJob, reserveArchiveJob, validatePreparedArchive,
  ConversationArchiveError, type ArchiveAction, type ArchiveErrorCode, type ArchiveWorkerPayload, type ConversationArchiveJob } from './archiveJobs.js';
import type { ConversationArchiveResult } from '../../shared/conversationArchive.js';
import { envelopeCore } from './profileFormat.js';

export interface ConversationArchiveOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Private test seam, never taken from an HTTP/CLI payload. */
  checkpoint?(phase: 'reserved' | 'prepared' | 'database_committed' | 'metadata_recovered'): void | Promise<void>;
  /** Private native fault seam; callbacks receive phase labels, never stored content. */
  workerCheckpoint?(phase: string): void | Promise<void>;
}
export interface ConversationArchiveHost {
  profile: string;
  signal: AbortSignal;
  run<T>(work: (session: OpenProfile, envelope: StorageEnvelope) => Promise<T>, signal?: AbortSignal): Promise<T>;
  recovered(session: OpenProfile, previous: StorageEnvelope): Promise<void>;
  abandon(job: ConversationArchiveJob): Promise<void>;
}
const codes: ArchiveErrorCode[] = ['archive_busy', 'archive_changed', 'archive_active', 'archive_invalid',
  'archive_failed', 'archive_cancelled', 'archive_missing'];

async function worker(profile: string, payload: ArchiveWorkerPayload, signal: AbortSignal, timeoutMs?: number,
  checkpoint?: ConversationArchiveOptions['workerCheckpoint']): Promise<void> {
  try {
    await runStateMaintenance({ kind: 'product', file: databasePath(profile), payload: { ...payload, observe: Boolean(checkpoint) } },
      { signal, timeoutMs: timeoutMs ?? 5 * 60_000, worker: new URL('./archiveWorker.js', import.meta.url),
        onProgress: value => { if (typeof value !== 'string') throw new ConversationArchiveError('archive_invalid'); return checkpoint?.(value); } });
  } catch (error) {
    if (signal.aborted || error instanceof StateMaintenanceError && error.code === 'cancelled') throw new ConversationArchiveError('archive_cancelled');
    if (error instanceof StateMaintenanceError && codes.includes(error.productCode as ArchiveErrorCode)) {
      throw new ConversationArchiveError(error.productCode as ArchiveErrorCode);
    }
    throw new ConversationArchiveError('archive_failed');
  }
}

export async function maintainConversationArchives(host: ConversationArchiveHost, options: ConversationArchiveOptions = {}): Promise<void> {
  const root = archiveDirectory(databasePath(host.profile));
  const present = await lstat(root).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
  if (!present) return;
  if (!present.isDirectory() || present.isSymbolicLink()) throw new ConversationArchiveError('archive_invalid');
  // First recover the profile through the ordinary store; cleanup itself runs
  // outside the serving lock and only tries that lock for short publication steps.
  const ownerLeaseToken = await host.run(async session => session.leaseToken, host.signal);
  await worker(host.profile, { phase: 'cleanup', profile: host.profile, ownerLeaseToken }, host.signal, options.timeoutMs, options.workerCheckpoint);
}

export async function performConversationArchive(host: ConversationArchiveHost, channelId: string, kind: ArchiveAction,
  options: ConversationArchiveOptions = {}): Promise<ConversationArchiveResult> {
  const signal = options.signal ? AbortSignal.any([host.signal, options.signal]) : host.signal;
  let job: ConversationArchiveJob | null = null;
  try {
    signal.throwIfAborted();
    // Dead jobs can be recovered after a killed process without a service restart.
    await maintainConversationArchives({ ...host, signal }).catch(error => {
      if (signal.aborted) throw error;
      process.stderr.write('[cats-platform-store] archive_cleanup_deferred\n');
    });
    const reserved = await host.run(async (session, envelope) => {
      const root = archiveDirectory(databasePath(host.profile));
      await mkdir(root, { recursive: true, mode: 0o700 });
      const stat = await lstat(root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ConversationArchiveError('archive_invalid');
      await syncDirectory(path.dirname(root));
      const selected = reserveArchiveJob(session.database, session.leaseToken, channelId, kind, envelopeCore(envelope));
      const archive = conversationArchive(session.database, channelId);
      return { job: selected, result: { channelId, archived: Boolean(archive), archiveId: archive?.archiveId ?? null,
        messageCount: archive?.messageCount ?? Number(session.database.get('select message_count from channels where id = ?', channelId)!.message_count),
        unchanged: true } };
    }, signal);
    job = reserved.job;
    if (!job) return reserved.result;
    await options.checkpoint?.('reserved'); signal.throwIfAborted();
    await worker(host.profile, { phase: 'prepare', profile: host.profile, job }, signal, options.timeoutMs, options.workerCheckpoint);
    await options.checkpoint?.('prepared'); signal.throwIfAborted();
    return await host.run(async (session, previous) => {
      const row = assertArchiveJob(session.database, job!);
      const bytes = await readOptionalFile(path.join(archiveJobDirectory(databasePath(host.profile), job!.token), 'prepared.json'));
      if (!bytes || bytes.length > 64 * 1024 || row.prepared_digest !== bytesDigest(bytes)) throw new ConversationArchiveError('archive_changed');
      const prepared = validatePreparedArchive(JSON.parse(bytes.toString('utf8')), job!);
      const header = session.conversations.header(channelId);
      if (!header) throw new ConversationArchiveError('archive_missing');
      assertArchiveIdle(header, envelopeCore(previous));
      const next = structuredClone(previous), now = new Date().toISOString(), conversationId = buildChatConversationId(channelId);
      next.storage.revision = randomUUID();
      const archiveId = buildChatArchiveId(channelId);
      const old = next.archives.find(record => record.id === archiveId);
      const updated = { ...(old ?? { id: archiveId, sourceConversationId: conversationId,
        sourceChannelId: channelId, exportFormat: 'chat-channel-json' as const }),
      status: kind === 'archive' ? 'archived' as const : prepared.messageCount ? 'ready_for_archive' as const : 'not_ready' as const,
      lastExportedAt: kind === 'archive' ? now : old?.lastExportedAt ?? null, updatedAt: now };
      next.archives = old ? next.archives.map(record => record.id === archiveId ? updated : record) : [...next.archives, updated];
      next.conversations = next.conversations.map(record => record.id === conversationId
        ? { ...record, status: kind === 'archive' ? 'archived' : prepared.originalStatus === 'planned' ? 'planned' : 'active', updatedAt: now } : record);
      await worker(host.profile, { phase: 'commit', profile: host.profile, job: job!, preparedDigest: bytesDigest(bytes),
        previousDigest: bytesDigest(serializeEnvelope(previous)), envelope: serializeEnvelope(next) }, signal, options.timeoutMs, options.workerCheckpoint);
      await options.checkpoint?.('database_committed');
      await host.recovered(session, previous);
      await options.checkpoint?.('metadata_recovered');
      return { channelId, archived: kind === 'archive', archiveId: kind === 'archive' ? job!.archiveId : null,
        messageCount: prepared.messageCount, unchanged: false };
    }, signal);
  } catch (error) {
    if (signal.aborted) throw new ConversationArchiveError('archive_cancelled');
    if (error instanceof ConversationArchiveError) throw error;
    throw new ConversationArchiveError('archive_failed');
  } finally {
    // The reaper has closed the native worker before this force cleanup. If close
    // or reset cancelled the store, a later startup reclaims the durable job.
    if (job && !host.signal.aborted) {
      try { await host.abandon(job); }
      catch { process.stderr.write('[cats-platform-store] archive_reservation_cleanup_deferred\n'); }
      try { await worker(host.profile, { phase: 'cleanup', profile: host.profile, ownerLeaseToken: job.leaseToken, job }, host.signal, options.timeoutMs, options.workerCheckpoint); }
      catch { process.stderr.write('[cats-platform-store] archive_cleanup_deferred\n'); }
    }
  }
}
