import { runStateMaintenance, StateMaintenanceError } from '../../../../platform/persistence/state-db/stateMaintenance.js';
import type { ChatMessage } from '../../api/contracts.js';
import type { MessagePresentationPlacement } from '../../shared/transcript.js';
import { ConversationArchiveError } from './archiveJobs.js';
import { databasePath, storageNameIdentity } from './profileFormat.js';
import type { ArchivePlacementBasis } from './archivePlacement.js';

export interface ArchivePageRequest {
  profile: string;
  ownerLeaseToken: string;
  channelId: string;
  archiveId: string;
  manifestDigest: string;
  orderRevision: string;
  limit: number;
  before: number;
  /** Absent on bounded page reads; present only for coalesced proof preparation. */
  basis?: ArchivePlacementBasis[];
}

export interface ArchivePageResult {
  messages: ChatMessage[];
  total: number;
  nextPosition: number | null;
  placements: MessagePresentationPlacement[];
}

type ReadWaiter = { start(): void; cancel(): void };
const pools = new Map<string, { running: number; queue: ReadWaiter[] }>();

/** Per-profile, cross-store process bound. Waiting readers own no native process or SQL connection. */
async function withReadSlot<T>(request: ArchivePageRequest, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new ConversationArchiveError('archive_cancelled');
  const key = storageNameIdentity(databasePath(request.profile));
  let pool = pools.get(key);
  if (!pool) { pool = { running: 0, queue: [] }; pools.set(key, pool); }
  const selected = pool;
  if (selected.running >= 2) await new Promise<void>((resolve, reject) => {
    if (selected.queue.length >= 64) { reject(new ConversationArchiveError('archive_busy')); return; }
    let timer: ReturnType<typeof setTimeout>;
    const clean = () => { clearTimeout(timer); signal.removeEventListener('abort', waiter.cancel); };
    const remove = () => { const index = selected.queue.indexOf(waiter); if (index >= 0) selected.queue.splice(index, 1); };
    const waiter: ReadWaiter = {
      start() { clean(); selected.running++; resolve(); },
      cancel() { clean(); remove(); reject(new ConversationArchiveError('archive_cancelled')); },
    };
    selected.queue.push(waiter); signal.addEventListener('abort', waiter.cancel, { once: true });
    timer = setTimeout(() => { clean(); remove(); reject(new ConversationArchiveError('archive_busy')); }, 30_000);
    if (signal.aborted) waiter.cancel();
  });
  else selected.running++;
  try { if (signal.aborted) throw new ConversationArchiveError('archive_cancelled'); return await work(); }
  finally {
    selected.running--;
    const next = selected.queue.shift();
    if (next) next.start();
    else if (selected.running === 0) pools.delete(key);
  }
}

export async function readArchivePage(request: ArchivePageRequest, signal: AbortSignal,
  checkpoint?: (phase: string) => void | Promise<void>): Promise<ArchivePageResult> {
  return withReadSlot(request, signal, async () => {
  let result: ArchivePageResult | undefined;
  try {
    await runStateMaintenance({ kind: 'product', file: databasePath(request.profile), payload: { phase: 'read', ...request, observe: Boolean(checkpoint) } }, {
      signal, timeoutMs: 30_000, worker: new URL('./archiveWorker.js', import.meta.url), onProgress(value) {
        if (typeof value === 'string' && checkpoint) return checkpoint(value);
        if (result || !value || typeof value !== 'object' || !('page' in value)) throw new ConversationArchiveError('archive_invalid');
        const page = value.page as ArchivePageResult;
        if (!Array.isArray(page?.messages) || page.messages.length > request.limit
          || page.messages.some(message => message.channelId !== request.channelId)
          || !Array.isArray(page.placements)) throw new ConversationArchiveError('archive_invalid');
        result = page;
      },
    });
  } catch (error) {
    if (error instanceof StateMaintenanceError && error.code === 'cancelled') throw new ConversationArchiveError('archive_cancelled');
    if (error instanceof StateMaintenanceError && error.productCode === 'archive_changed') throw new ConversationArchiveError('archive_changed');
    throw new ConversationArchiveError('archive_invalid');
  }
  if (!result) throw new ConversationArchiveError('archive_invalid');
  return result;
  });
}
