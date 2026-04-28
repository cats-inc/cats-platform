import type {
  CompanionDerivedRecord,
} from './contracts.js';
import {
  COMPANION_PROFILE_POST_METADATA_KEYS,
  type CompanionProfilePostMediaRef,
  type CompanionProfilePostStatus,
} from './profileReadModel.js';

/**
 * SPEC-085 / PLAN-077 Phase 2 owner `Promote to post` producer.
 *
 * The producer is intentionally explicit: there is no auto-promotion
 * from source summary, derived record, memory highlight, etc. The owner
 * triggers `Promote to post` from a Sources row, media tile, Files row,
 * or eligible Inspector selection. The dedup key is
 * `(catId, profilePostOriginType, profilePostOriginId)` — re-promoting
 * the same item updates the existing derived record (and can flip a
 * `removed` post back to `active`).
 */

export type CompanionProfilePostOriginType = 'source' | 'derived' | 'artifact';

export interface CompanionProfilePostPromoteInput {
  catId: string;
  boxId: string;
  origin: {
    type: CompanionProfilePostOriginType;
    id: string;
  };
  /** Required, non-empty. Empty / whitespace-only titles are rejected. */
  title: string;
  body?: string;
  tags?: readonly string[];
  /**
   * Ordered media inclusion list captured from the promotion dialog.
   * `[]` is an explicit "no media" choice — the post-card reader will
   * render no media grid, even if the underlying source has media.
   */
  mediaRefs: readonly CompanionProfilePostMediaRef[];
  /** Authoritative source lineage. Defaults to the origin id when unset. */
  sourceIds?: readonly string[];
  promotedAt: string;
}

export interface CompanionProfilePostPromoteResult {
  derived: CompanionDerivedRecord;
  /** True when the producer updated an existing record rather than created one. */
  updated: boolean;
  dedupKey: string;
}

export class CompanionProfilePostValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CompanionProfilePostValidationError';
  }
}

export function buildCompanionProfilePostDedupKey(input: {
  catId: string;
  originType: CompanionProfilePostOriginType;
  originId: string;
}): string {
  return [input.catId, input.originType, input.originId].join('|');
}

export function findExistingProfilePostRecord(
  derived: readonly CompanionDerivedRecord[],
  dedupKey: string,
): CompanionDerivedRecord | null {
  for (const record of derived) {
    if (!isProfilePostRecord(record)) continue;
    const recordKey = readDedupKey(record);
    if (recordKey === dedupKey) {
      return record;
    }
  }
  return null;
}

export function promoteCompanionProfilePost(
  input: CompanionProfilePostPromoteInput,
  options: {
    existingDerived?: readonly CompanionDerivedRecord[];
    deriveId?: () => string;
  } = {},
): CompanionProfilePostPromoteResult {
  const trimmedTitle = (input.title ?? '').trim();
  if (trimmedTitle.length === 0) {
    throw new CompanionProfilePostValidationError(
      'title_required',
      'Promote-to-post requires a non-empty title.',
    );
  }
  if (!input.origin?.id || input.origin.id.trim().length === 0) {
    throw new CompanionProfilePostValidationError(
      'origin_id_required',
      'Promote-to-post requires a non-empty origin id.',
    );
  }
  if (!input.catId || !input.boxId) {
    throw new CompanionProfilePostValidationError(
      'cat_box_required',
      'Promote-to-post requires both catId and boxId.',
    );
  }

  const dedupKey = buildCompanionProfilePostDedupKey({
    catId: input.catId,
    originType: input.origin.type,
    originId: input.origin.id,
  });
  const existing = options.existingDerived
    ? findExistingProfilePostRecord(options.existingDerived, dedupKey)
    : null;

  const sanitizedMediaRefs = sanitizeMediaRefs(input.mediaRefs);
  const sanitizedTags = sanitizeTags(input.tags ?? []);
  const sourceIds = sanitizeSourceIds(
    input.sourceIds && input.sourceIds.length > 0
      ? input.sourceIds
      : input.origin.type === 'source'
        ? [input.origin.id]
        : [],
  );
  const body = (input.body ?? '').trim();

  const baseMetadata: Record<string, unknown> = {
    [COMPANION_PROFILE_POST_METADATA_KEYS.surface]:
      COMPANION_PROFILE_POST_METADATA_KEYS.surfaceValue,
    [COMPANION_PROFILE_POST_METADATA_KEYS.status]: 'active' satisfies CompanionProfilePostStatus,
    [COMPANION_PROFILE_POST_METADATA_KEYS.producer]:
      COMPANION_PROFILE_POST_METADATA_KEYS.producerValue,
    [COMPANION_PROFILE_POST_METADATA_KEYS.originType]: input.origin.type,
    [COMPANION_PROFILE_POST_METADATA_KEYS.originId]: input.origin.id,
    [COMPANION_PROFILE_POST_METADATA_KEYS.mediaRefs]: sanitizedMediaRefs,
    [COMPANION_PROFILE_POST_METADATA_KEYS.promotedAt]:
      existing
        ? readPromotedAt(existing) ?? input.promotedAt
        : input.promotedAt,
  };

  if (existing) {
    const updated: CompanionDerivedRecord = {
      ...existing,
      title: trimmedTitle,
      content: body,
      tags: sanitizedTags,
      sourceIds,
      metadata: {
        ...existing.metadata,
        ...baseMetadata,
      },
      updatedAt: input.promotedAt,
    };
    return { derived: updated, updated: true, dedupKey };
  }

  const id = options.deriveId?.() ?? `companion-derived:${dedupKey}`;
  const created: CompanionDerivedRecord = {
    id,
    boxId: input.boxId,
    catId: input.catId,
    kind: 'normalized_note',
    sourceIds,
    title: trimmedTitle,
    content: body,
    tags: sanitizedTags,
    metadata: baseMetadata,
    createdAt: input.promotedAt,
    updatedAt: input.promotedAt,
  };
  return { derived: created, updated: false, dedupKey };
}

export interface CompanionProfilePostStatusFlipInput {
  record: CompanionDerivedRecord;
  status: CompanionProfilePostStatus;
  now: string;
}

export function setCompanionProfilePostStatus(
  input: CompanionProfilePostStatusFlipInput,
): CompanionDerivedRecord {
  if (!isProfilePostRecord(input.record)) {
    throw new CompanionProfilePostValidationError(
      'not_a_profile_post',
      'Cannot flip status on a derived record that is not a profile post.',
    );
  }
  return {
    ...input.record,
    metadata: {
      ...input.record.metadata,
      [COMPANION_PROFILE_POST_METADATA_KEYS.status]: input.status,
    },
    updatedAt: input.now,
  };
}

function isProfilePostRecord(record: CompanionDerivedRecord): boolean {
  const metadata = record.metadata ?? {};
  return metadata[COMPANION_PROFILE_POST_METADATA_KEYS.surface]
    === COMPANION_PROFILE_POST_METADATA_KEYS.surfaceValue;
}

function readDedupKey(record: CompanionDerivedRecord): string | null {
  const metadata = record.metadata ?? {};
  const originType = metadata[COMPANION_PROFILE_POST_METADATA_KEYS.originType];
  const originId = metadata[COMPANION_PROFILE_POST_METADATA_KEYS.originId];
  if (
    typeof originType !== 'string'
    || typeof originId !== 'string'
    || originType.length === 0
    || originId.length === 0
  ) {
    return null;
  }
  return buildCompanionProfilePostDedupKey({
    catId: record.catId,
    originType: originType as CompanionProfilePostOriginType,
    originId,
  });
}

function readPromotedAt(record: CompanionDerivedRecord): string | null {
  const metadata = record.metadata ?? {};
  const value = metadata[COMPANION_PROFILE_POST_METADATA_KEYS.promotedAt];
  return typeof value === 'string' ? value : null;
}

function sanitizeMediaRefs(
  input: readonly CompanionProfilePostMediaRef[],
): CompanionProfilePostMediaRef[] {
  const seen = new Set<string>();
  const out: CompanionProfilePostMediaRef[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const kind = entry.kind;
    const id = entry.id;
    if (kind !== 'source' && kind !== 'derived' && kind !== 'artifact') continue;
    if (typeof id !== 'string' || id.trim().length === 0) continue;
    const dedup = `${kind}:${id}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    out.push({ kind, id: id.trim() });
  }
  return out;
}

function sanitizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of input) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function sanitizeSourceIds(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of input) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
