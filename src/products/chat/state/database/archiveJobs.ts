import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { StateDatabase, StateRow } from '../../../../platform/persistence/state-db/stateDatabase.js';
import type { ChatChannelState } from '../../api/contracts.js';
import type { CatsCoreState } from '../../../../core/types.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import { hasActiveSupervisedRun } from '../model/workProject.js';
import { archiveDirectory, conversationArchive } from './archiveAssets.js';

export const ARCHIVE_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
export type ArchiveAction = 'archive' | 'restore';
export type ArchiveErrorCode = 'archive_busy' | 'archive_changed' | 'archive_active' | 'archive_invalid'
  | 'archive_failed' | 'archive_cancelled' | 'archive_missing';
export class ConversationArchiveError extends Error {
  constructor(readonly code: ArchiveErrorCode) {
    super({ archive_busy: 'Another archive operation is using this conversation.',
      archive_changed: 'The conversation changed during preparation. Retry the operation.',
      archive_active: 'Wait for this conversation to finish its active work before archiving.',
      archive_invalid: 'The conversation archive did not verify. Preserve it and restore a verified backup.',
      archive_failed: 'The conversation archive operation could not complete.',
      archive_cancelled: 'The conversation archive operation was cancelled.',
      archive_missing: 'The selected conversation or its archive is unavailable.' }[code]);
    this.name = 'ConversationArchiveError';
  }
}
export interface ConversationArchiveJob {
  channelId: string; token: string; leaseToken: string; kind: ArchiveAction;
  archiveId: string; channelRevision: string; createdAt: string;
}
export interface PreparedConversationArchive {
  format: 1; token: string; channelId: string; archiveId: string; kind: ArchiveAction;
  manifestDigest: string; messagesDigest: string; messageCount: number;
  sourceRevision: string; originalStatus: string; createdAt: string;
  files: Array<{ name: string; sha256: string; dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>;
}
export type ArchiveWorkerPayload = ({ phase: 'prepare'; profile: string; job: ConversationArchiveJob }
  | { phase: 'commit'; profile: string; job: ConversationArchiveJob; preparedDigest: string; envelope: string; previousDigest: string }
  | { phase: 'cleanup'; profile: string; ownerLeaseToken: string; job?: ConversationArchiveJob }) & { observe?: boolean };

export function archiveJobDirectory(file: string, token: string): string {
  if (!ARCHIVE_UUID.test(token)) throw new ConversationArchiveError('archive_invalid');
  return path.join(archiveDirectory(file), `.unfinished-${token}`);
}
export const archiveJobLock = (file: string, token: string): string => `${archiveJobDirectory(file, token)}.job`;

export function validateArchiveJob(value: unknown): ConversationArchiveJob {
  const job = value as ConversationArchiveJob | null;
  if (!job || typeof job.channelId !== 'string' || !job.channelId || job.channelId.length > 1024
    || !ARCHIVE_UUID.test(job.token) || !ARCHIVE_UUID.test(job.leaseToken) || !ARCHIVE_UUID.test(job.archiveId)
    || !['archive', 'restore'].includes(job.kind) || typeof job.channelRevision !== 'string' || !job.channelRevision
    || typeof job.createdAt !== 'string' || !Number.isFinite(Date.parse(job.createdAt))) throw new ConversationArchiveError('archive_invalid');
  return { channelId: job.channelId, token: job.token, leaseToken: job.leaseToken, kind: job.kind,
    archiveId: job.archiveId, channelRevision: job.channelRevision, createdAt: job.createdAt };
}
export function jobFromRow(row: StateRow): ConversationArchiveJob {
  return validateArchiveJob({ channelId: row.channel_id, token: row.token, leaseToken: row.lease_token,
    kind: row.kind, archiveId: row.archive_id, channelRevision: row.channel_revision, createdAt: row.created_at });
}
export function assertArchiveJob(database: StateDatabase, job: ConversationArchiveJob): StateRow {
  const row = database.get('select * from conversation_archive_jobs where channel_id = ?', job.channelId);
  if (!row || JSON.stringify(jobFromRow(row)) !== JSON.stringify(job)) throw new ConversationArchiveError('archive_changed');
  const channel = database.get('select content_revision from channels where id = ?', job.channelId);
  if (!channel || channel.content_revision !== job.channelRevision) throw new ConversationArchiveError('archive_changed');
  return row;
}
export function assertArchiveIdle(channel: Pick<ChatChannelState, 'id' | 'roomRouting'>, core: CatsCoreState): void {
  const conversationId = buildChatConversationId(channel.id), active = channel.roomRouting?.workflow?.activeTurn;
  if (active && ['pending', 'running'].includes(active.status)
    || core.turns.some(turn => turn.conversationId === conversationId && ['planned', 'active'].includes(turn.status))
    || core.lanes.some(lane => lane.conversationId === conversationId && ['pending', 'waiting', 'connecting', 'running', 'streaming'].includes(lane.status))
    || hasActiveSupervisedRun(core, conversationId)) throw new ConversationArchiveError('archive_active');
}
export function reserveArchiveJob(database: StateDatabase, leaseToken: string, channelId: string, kind: ArchiveAction,
  core: CatsCoreState, now = new Date()): ConversationArchiveJob | null {
  const channel = database.get('select json, content_revision from channels where id = ?', channelId);
  if (!channel) throw new ConversationArchiveError('archive_missing');
  const archive = conversationArchive(database, channelId);
  if (kind === 'archive' && archive || kind === 'restore' && !archive) return null;
  assertArchiveIdle(JSON.parse(String(channel.json)) as ChatChannelState, core);
  if (database.get('select token from conversation_archive_jobs where channel_id = ?', channelId)) throw new ConversationArchiveError('archive_busy');
  const job = validateArchiveJob({ channelId, token: randomUUID(), leaseToken, kind,
    archiveId: archive?.archiveId ?? randomUUID(), channelRevision: channel.content_revision, createdAt: now.toISOString() });
  database.transaction(() => database.run(`insert into conversation_archive_jobs(channel_id, token, lease_token, kind,
    archive_id, channel_revision, created_at) values (?, ?, ?, ?, ?, ?, ?)`,
  job.channelId, job.token, job.leaseToken, job.kind, job.archiveId, job.channelRevision, job.createdAt), { durable: true });
  return job;
}
export function validatePreparedArchive(value: unknown, job: ConversationArchiveJob): PreparedConversationArchive {
  const result = value as PreparedConversationArchive | null;
  if (!result || result.format !== 1 || result.token !== job.token || result.channelId !== job.channelId
    || result.archiveId !== job.archiveId || result.kind !== job.kind || !SHA256.test(result.manifestDigest)
    || !SHA256.test(result.messagesDigest) || !Number.isSafeInteger(result.messageCount) || result.messageCount < 0
    || !ARCHIVE_UUID.test(result.sourceRevision) || typeof result.originalStatus !== 'string'
    || !['planned', 'configured', 'active', 'watching', 'archived'].includes(result.originalStatus)
    || typeof result.createdAt !== 'string' || !Number.isFinite(Date.parse(result.createdAt))
    || !Array.isArray(result.files) || result.files.length !== 2 || new Set(result.files.map(file => file?.name)).size !== 2
    || result.files.some(file => !file || ![`${job.archiveId}.jsonl.gz`, `${job.archiveId}.manifest.json`].includes(file.name)
      || !SHA256.test(file.sha256) || ![file.dev, file.ino, file.size, file.mtimeMs, file.ctimeMs].every(Number.isFinite))) throw new ConversationArchiveError('archive_invalid');
  return result;
}
