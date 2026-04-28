/**
 * SPEC-085 Activity vocabulary + aggregation for the companion profile
 * `Activity` tab.
 *
 * The vocabulary is intentionally exhaustive: only the events listed in
 * `COMPANION_ACTIVITY_GROUP_VALUES` render in v1, and adding a new group
 * requires amending this list and SPEC-085 §Activity. Generic derived-record
 * creation events do NOT render.
 *
 * Aggregation key per the plan: `{catId, correlationId || minuteBucket,
 * eventGroup, targetKind}`. Import / ingestion paths that emit many writes
 * for one operation should pass a stable `correlationId` so the user sees
 * one rendered entry instead of a flood of writes.
 *
 * v1 cap: most-recent 100 entries OR most-recent 30 days, whichever is
 * smaller. No `Load more` — when older matching activity is hidden, the UI
 * shows a bounded "Older activity is hidden" indicator.
 */

export const COMPANION_ACTIVITY_GROUP_VALUES = [
  'presence_changed',
  'source_added',
  'source_removed',
  'memory_added',
  'memory_updated',
  'memory_removed',
  'post_promoted',
  'post_edited',
  'post_removed',
  'share_inserted',
  'transport_ingested',
] as const;

export type CompanionActivityGroup = typeof COMPANION_ACTIVITY_GROUP_VALUES[number];

export const COMPANION_ACTIVITY_TARGET_KIND_VALUES = [
  'source',
  'memory',
  'derived',
  'post',
  'message',
  'transport',
  'presence',
] as const;

export type CompanionActivityTargetKind =
  typeof COMPANION_ACTIVITY_TARGET_KIND_VALUES[number];

export interface CompanionActivityEvent {
  id: string;
  catId: string;
  group: CompanionActivityGroup;
  targetKind: CompanionActivityTargetKind;
  targetId: string;
  occurredAt: string;
  /**
   * Stable correlation id passed by the import / ingestion path so all
   * writes from one operation collapse into a single rendered entry.
   * When absent, the aggregator falls back to a 60-second local-time
   * bucket from `occurredAt`.
   */
  correlationId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CompanionActivityRenderEntry {
  id: string;
  catId: string;
  group: CompanionActivityGroup;
  targetKind: CompanionActivityTargetKind;
  bucketKey: string;
  /** Newest event in the bucket — drives the rendered timestamp. */
  occurredAt: string;
  count: number;
  summary: string;
  representativeEventIds: string[];
}

export interface CompanionActivityProjectionOptions {
  /** Defaults to 100 per SPEC-085 §31. */
  maxEntries?: number;
  /** Defaults to 30 days per SPEC-085 §31. */
  maxWindowDays?: number;
  /**
   * Reference "now" for window calculation. Defaults to a `Date` derived
   * from the latest event timestamp; tests pass a fixed value for
   * deterministic windowing.
   */
  now?: Date;
}

export interface CompanionActivityProjection {
  entries: CompanionActivityRenderEntry[];
  /**
   * True when the projection trimmed entries by either cap; the renderer
   * uses this to show the "Older activity is hidden" indicator.
   */
  olderHidden: boolean;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_WINDOW_DAYS = 30;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export function projectCompanionActivity(
  events: readonly CompanionActivityEvent[],
  options: CompanionActivityProjectionOptions = {},
): CompanionActivityProjection {
  if (events.length === 0) {
    return { entries: [], olderHidden: false };
  }

  const valid = events.filter(isRenderableActivityEvent);
  if (valid.length === 0) {
    return { entries: [], olderHidden: false };
  }

  const buckets = new Map<string, CompanionActivityRenderEntry>();
  for (const event of valid) {
    const bucketKey = buildBucketKey(event);
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.count += 1;
      existing.representativeEventIds.push(event.id);
      if (event.occurredAt > existing.occurredAt) {
        existing.occurredAt = event.occurredAt;
      }
      if (existing.count > 1) {
        existing.summary = describeBucketSummary(existing);
      }
      continue;
    }
    buckets.set(bucketKey, {
      id: bucketKey,
      catId: event.catId,
      group: event.group,
      targetKind: event.targetKind,
      bucketKey,
      occurredAt: event.occurredAt,
      count: 1,
      summary: typeof event.summary === 'string' && event.summary.length > 0
        ? event.summary
        : describeSingleEvent(event),
      representativeEventIds: [event.id],
    });
  }

  const sorted = [...buckets.values()].sort(
    (left, right) => right.occurredAt.localeCompare(left.occurredAt),
  );

  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const windowDays = options.maxWindowDays ?? DEFAULT_WINDOW_DAYS;
  const referenceNow = options.now ?? new Date(sorted[0]!.occurredAt);
  const windowFloor = new Date(referenceNow.getTime() - windowDays * MILLIS_PER_DAY);

  const inWindow = sorted.filter((entry) => new Date(entry.occurredAt) >= windowFloor);
  const capped = inWindow.slice(0, Math.max(0, maxEntries));
  const olderHidden = capped.length < sorted.length;

  return { entries: capped, olderHidden };
}

function isRenderableActivityEvent(event: CompanionActivityEvent): boolean {
  if (!event.id || !event.catId) return false;
  if (!isCompanionActivityGroup(event.group)) return false;
  if (!isCompanionActivityTargetKind(event.targetKind)) return false;
  if (typeof event.occurredAt !== 'string' || event.occurredAt.length === 0) return false;
  return true;
}

function isCompanionActivityGroup(value: unknown): value is CompanionActivityGroup {
  return typeof value === 'string'
    && (COMPANION_ACTIVITY_GROUP_VALUES as readonly string[]).includes(value);
}

function isCompanionActivityTargetKind(
  value: unknown,
): value is CompanionActivityTargetKind {
  return typeof value === 'string'
    && (COMPANION_ACTIVITY_TARGET_KIND_VALUES as readonly string[]).includes(value);
}

function buildBucketKey(event: CompanionActivityEvent): string {
  const correlation =
    typeof event.correlationId === 'string' && event.correlationId.trim().length > 0
      ? `corr:${event.correlationId.trim()}`
      : `min:${minuteBucket(event.occurredAt)}`;
  return [event.catId, correlation, event.group, event.targetKind].join('|');
}

function minuteBucket(occurredAt: string): string {
  const ms = new Date(occurredAt).getTime();
  if (!Number.isFinite(ms)) {
    return occurredAt;
  }
  const bucketed = ms - (ms % 60_000);
  return new Date(bucketed).toISOString();
}

function describeSingleEvent(event: CompanionActivityEvent): string {
  return `${event.group} (${event.targetKind})`;
}

function describeBucketSummary(entry: CompanionActivityRenderEntry): string {
  return `${entry.group} ×${entry.count} (${entry.targetKind})`;
}
