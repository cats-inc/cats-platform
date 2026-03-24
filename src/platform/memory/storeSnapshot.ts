import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
  CanonicalMemoryRecord,
  CanonicalMemoryReplaceFilter,
  CanonicalMemorySnapshot,
} from './contracts.js';
import { uniqueStrings } from './utils.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function defaultVisibilityForSubjectKind(
  subjectKind: string,
): CanonicalMemoryRecord['visibility'] {
  switch (subjectKind) {
    case 'channel':
      return 'channel_private';
    case 'relationship':
    case 'project':
      return 'shared_room';
    case 'cat':
    case 'owner':
    default:
      return 'owner_private';
  }
}

function readLineage(
  value: unknown,
  fallback: {
    sourceScopeKeys: string[];
    replacementGroup: string;
  },
): CanonicalMemoryRecord['lineage'] {
  const record = asRecord(value);
  const sourceScopeKeys = readStringArray(record?.sourceScopeKeys);
  return {
    sourceScopeKeys: sourceScopeKeys.length > 0
      ? sourceScopeKeys
      : fallback.sourceScopeKeys,
    derivedFromIds: readStringArray(record?.derivedFromIds),
    replacementGroup: readNullableString(record?.replacementGroup) ?? fallback.replacementGroup,
  };
}

export function createEmptyCanonicalMemorySnapshot(nowIso: string): CanonicalMemorySnapshot {
  return {
    version: 1,
    updatedAt: nowIso,
    records: [],
  };
}

export function normalizeCanonicalMemorySnapshot(
  rawSnapshot: unknown,
  nowIso: string = new Date().toISOString(),
): CanonicalMemorySnapshot {
  const record = asRecord(rawSnapshot);
  if (!record) {
    return createEmptyCanonicalMemorySnapshot(nowIso);
  }

  return {
    version: 1,
    updatedAt: readString(record.updatedAt, nowIso),
    records: Array.isArray(record.records)
      ? record.records
          .map((item) => normalizeCanonicalMemoryRecord(item, nowIso))
          .filter((item): item is CanonicalMemoryRecord => item !== null)
      : [],
  };
}

export function normalizeCanonicalMemoryRecord(
  rawRecord: unknown,
  nowIso: string,
): CanonicalMemoryRecord | null {
  const record = asRecord(rawRecord);
  const origin = asRecord(record?.origin);
  if (!record || !origin) {
    return null;
  }

  const id = readNullableString(record.id);
  const subjectKind = readString(record.subjectKind);
  const subjectId = readNullableString(record.subjectId);
  const category = readString(record.category);
  const originKind = readString(origin.kind);
  const flushedAt = readString(origin.flushedAt, nowIso);
  const flushReason = readString(origin.flushReason, 'manual');
  const visibility = readString(record.visibility, defaultVisibilityForSubjectKind(subjectKind));
  const promotionRule = readString(record.promotionRule, 'durable_memory');

  if (
    !id
    || !subjectId
    || !['cat', 'owner', 'channel', 'relationship', 'project'].includes(subjectKind)
    || !['preference', 'fact', 'policy', 'style', 'relationship', 'lesson'].includes(category)
    || ![
      'companion_source',
      'companion_derived',
      'companion_memory',
      'response_profile',
      'channel_working_memory',
      'durable_memory',
      'owner_profile',
    ].includes(originKind)
    || !['owner_private', 'channel_private', 'shared_room', 'transport'].includes(visibility)
    || ![
      'companion_owner_note',
      'companion_response_profile',
      'companion_curated_memory',
      'companion_trait',
      'companion_event',
      'companion_relationship_note',
      'companion_normalized_note',
      'channel_summary',
      'channel_fact',
      'channel_open_loop',
      'durable_memory',
      'owner_profile_summary',
      'owner_communication_preference',
      'owner_decision_preference',
      'owner_escalation_preference',
    ].includes(promotionRule)
  ) {
    return null;
  }

  const sourceRefs = readStringArray(record.sourceRefs);
  const lineage = readLineage(record.lineage, {
    sourceScopeKeys: sourceRefs,
    replacementGroup: `${originKind}:${subjectId}`,
  });

  return {
    id,
    subjectKind: subjectKind as CanonicalMemoryRecord['subjectKind'],
    subjectId,
    category: category as CanonicalMemoryRecord['category'],
    title: readNullableString(record.title),
    content: readString(record.content),
    summary: readNullableString(record.summary),
    tags: readStringArray(record.tags),
    keywords: readStringArray(record.keywords),
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    sourceRefs,
    visibility: visibility as CanonicalMemoryRecord['visibility'],
    promotionRule: promotionRule as CanonicalMemoryRecord['promotionRule'],
    lineage,
    origin: {
      kind: originKind as CanonicalMemoryRecord['origin']['kind'],
      boxId: readNullableString(origin.boxId),
      channelId: readNullableString(origin.channelId),
      flushedAt,
      flushReason: flushReason as CanonicalMemoryRecord['origin']['flushReason'],
    },
    createdAt: readString(record.createdAt, nowIso),
    updatedAt: readString(record.updatedAt, nowIso),
    lastRetrievedAt: readNullableString(record.lastRetrievedAt),
  };
}

function stableRecordId(record: Omit<CanonicalMemoryRecord, 'id'>): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({
      subjectKind: record.subjectKind,
      subjectId: record.subjectId,
      category: record.category,
      title: record.title,
      content: record.content,
      sourceRefs: [...record.sourceRefs].sort(),
      originKind: record.origin.kind,
      visibility: record.visibility,
      promotionRule: record.promotionRule,
    }))
    .digest('hex')
    .slice(0, 16);
  return `cats-memory-${hash}`;
}

export function prepareCanonicalMemoryRecord(
  record: Omit<CanonicalMemoryRecord, 'id'>,
): CanonicalMemoryRecord {
  return {
    ...record,
    id: stableRecordId(record),
    tags: uniqueStrings(record.tags.map((tag) => tag.trim())),
    keywords: uniqueStrings(record.keywords.map((keyword) => keyword.trim().toLowerCase())),
    sourceRefs: uniqueStrings(record.sourceRefs.map((ref) => ref.trim())),
    lineage: {
      sourceScopeKeys: uniqueStrings(record.lineage.sourceScopeKeys.map((key) => key.trim())),
      derivedFromIds: uniqueStrings(record.lineage.derivedFromIds.map((id) => id.trim())),
      replacementGroup: record.lineage.replacementGroup.trim(),
    },
  };
}

export function matchesCanonicalMemoryFilter(
  record: CanonicalMemoryRecord,
  filter: CanonicalMemoryReplaceFilter,
): boolean {
  if (filter.subjectKind && record.subjectKind !== filter.subjectKind) {
    return false;
  }
  if (filter.subjectId && record.subjectId !== filter.subjectId) {
    return false;
  }
  if (filter.originKinds && !filter.originKinds.includes(record.origin.kind)) {
    return false;
  }
  return true;
}

export function hasCanonicalMemoryReplaceSelector(
  filter: CanonicalMemoryReplaceFilter,
): boolean {
  return Boolean(
    filter.subjectKind
    || filter.subjectId
    || (filter.originKinds && filter.originKinds.length > 0),
  );
}

export function deriveCanonicalMemoryStatePath(chatStatePath: string): string {
  const directory = path.dirname(chatStatePath);
  const parsed = path.parse(chatStatePath);
  return path.join(directory, `${parsed.name}.memory.json`);
}
