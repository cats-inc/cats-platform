import type { CatsCoreState } from '../../../../core/types.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import type { ChatMessage } from '../../api/contracts.js';
import { presentationTargetKey, type MessagePresentationPlacement } from '../../shared/transcript.js';
import { ConversationArchiveError } from './archiveJobs.js';

export interface ArchivePlacementBasis {
  key: string;
  turnId: string | null;
  targetStateId: string | null;
  targetId: string | null;
  createdAt: string;
  live: boolean;
}
export const MAX_ARCHIVE_PLACEMENTS = 100_000;

/** Bodies are deliberately excluded: edits/redaction use current Core with the same anchors. */
export function archivePlacementBasis(core: CatsCoreState, channelId: string): ArchivePlacementBasis[] {
  const segments = new Map<string, CatsCoreState['segments'][number]>();
  for (const segment of core.segments) {
    if (segment.conversationId !== buildChatConversationId(channelId) || segment.metadata?.event !== 'conversation_presentation'
      || segment.metadata.channelId !== channelId) continue;
    const key = presentationTargetKey(segment.turnId, segment.metadata.targetStateId), previous = segments.get(key);
    if (!previous || previous.createdAt <= segment.createdAt) segments.set(key, segment);
  }
  if (segments.size > MAX_ARCHIVE_PLACEMENTS) throw new ConversationArchiveError('archive_invalid');
  const lanes = new Map(core.lanes.map(lane => [lane.id, lane.status]));
  return [...segments].map(([key, segment]) => {
    const lane = lanes.get(segment.laneId ?? '');
    return { key, turnId: segment.turnId, targetStateId: typeof segment.metadata.targetStateId === 'string' ? segment.metadata.targetStateId : null,
      targetId: typeof segment.metadata.targetId === 'string' ? segment.metadata.targetId : null, createdAt: segment.createdAt,
      live: (segment.metadata.presentation as { phase?: unknown } | null)?.phase === 'streaming'
        && (!lane || !['failed', 'cancelled', 'completed'].includes(lane)) };
  });
}

/** One native streaming preparation per archive/projection basis, not a per-page fallback. */
export function prepareArchivePlacements(messages: Iterable<ChatMessage>, basis: ArchivePlacementBasis[]): MessagePresentationPlacement[] {
  if (!Array.isArray(basis) || basis.length > MAX_ARCHIVE_PLACEMENTS) throw new ConversationArchiveError('archive_invalid');
  const times = [...new Set(basis.map(item => item.createdAt))].sort();
  type Anchor = { id: string; time: string; position: number };
  const buckets: Array<Anchor | undefined> = new Array(times.length);
  const responses = new Map<string, { terminal?: string; partial?: string }>();
  const rejected = new Set<string>();
  // Match json_extract's SQL values, separately from the display key which may
  // retain a legacy non-string targetStateId. The indexed hot query normalizes
  // its Core target-state binding to null, not the raw message field.
  const sqlValue = (value: unknown) => value === undefined || value === null ? null
    : typeof value === 'boolean' ? Number(value) : typeof value === 'object' ? JSON.stringify(value) : value;
  const responseKey = (turn: unknown, target: unknown) => JSON.stringify([sqlValue(turn), sqlValue(target)]);
  const wanted = new Set(basis.map(item => responseKey(item.turnId, item.targetStateId)));
  const rejectionKey = responseKey;
  const wantedRejections = new Set(basis.map(item => rejectionKey(item.turnId, item.targetId)));
  const newer = (a: Anchor | undefined, b: Anchor): Anchor => !a || a.time < b.time
    || (a.time === b.time && a.position < b.position) ? b : a;
  let first: string | null = null, last: string | null = null, position = 0;
  for (const message of messages) {
    first ??= message.id; last = message.id;
    const metadata = message.metadata ?? {}, key = responseKey(metadata.turnId, metadata.targetStateId);
    if (wanted.has(key) && metadata.event === 'assistant_turn_segment') {
      const response = responses.get(key) ?? {};
      if (metadata.terminal === false) response.partial = message.id;
      else response.terminal = message.id;
      responses.set(key, response);
    }
    const rejection = rejectionKey(metadata.turnId, metadata.targetId);
    if (metadata.event === 'assistant_finalization_rejected' && wantedRejections.has(rejection)) rejected.add(rejection);
    let low = 0, high = times.length;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (times[mid] < message.createdAt) low = mid + 1; else high = mid; }
    if (low < times.length) buckets[low] = newer(buckets[low], { id: message.id, time: message.createdAt, position });
    position++;
  }
  const anchors = new Map<string, string | null>();
  let best: Anchor | undefined;
  for (let i = 0; i < times.length; i++) { if (buckets[i]) best = newer(best, buckets[i]!); anchors.set(times[i], best?.id ?? first); }
  return basis.map(item => {
    const response = responses.get(responseKey(item.turnId, item.targetStateId)), responseMessageId = response?.terminal ?? response?.partial ?? null;
    return { key: item.key, responseMessageId, anchorMessageId: responseMessageId ? null : item.live ? last : anchors.get(item.createdAt) ?? first,
      rejected: rejected.has(rejectionKey(item.turnId, item.targetId)), newestEmpty: position === 0 };
  });
}
