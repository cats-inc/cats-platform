import type { OwnerProfileRecord } from '../../core/types.js';
import type { ChatChannelState } from '../../shared/app-shell.js';
import type {
  CompanionBox,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSourceRecord,
} from '../../products/chat/companion/contracts.js';
import type {
  CanonicalMemoryRecord,
  MemoryFlushReason,
} from './contracts.js';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => normalizeWhitespace(value ?? ''))
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

function clampSummary(value: string | null, maxLength = 220): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function keywordsFrom(value: string, extra: string[] = []): string[] {
  const parts = value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((part) => part.length >= 3);
  return uniqueStrings([...parts, ...extra]);
}

function baseRecord(input: {
  subjectKind: CanonicalMemoryRecord['subjectKind'];
  subjectId: string;
  category: CanonicalMemoryRecord['category'];
  title?: string | null;
  content: string;
  summary?: string | null;
  tags?: string[];
  keywords?: string[];
  confidence?: number | null;
  sourceRefs?: string[];
  originKind: CanonicalMemoryRecord['origin']['kind'];
  boxId?: string | null;
  channelId?: string | null;
  reason: MemoryFlushReason;
  nowIso: string;
}): Omit<CanonicalMemoryRecord, 'id'> {
  return {
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    category: input.category,
    title: input.title ?? null,
    content: normalizeWhitespace(input.content),
    summary: clampSummary(input.summary ?? input.content),
    tags: uniqueStrings(input.tags ?? []),
    keywords: keywordsFrom(input.content, input.keywords ?? []),
    confidence: input.confidence ?? null,
    sourceRefs: uniqueStrings(input.sourceRefs ?? []),
    origin: {
      kind: input.originKind,
      boxId: input.boxId ?? null,
      channelId: input.channelId ?? null,
      flushedAt: input.nowIso,
      flushReason: input.reason,
    },
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    lastRetrievedAt: null,
  };
}

function categoryForCompanionMemory(
  record: CompanionMemoryRecord,
): CanonicalMemoryRecord['category'] {
  switch (record.category) {
    case 'preference':
      return 'preference';
    case 'relationship':
      return 'relationship';
    case 'owner_note':
      return 'lesson';
    case 'identity':
    case 'fact':
    case 'event':
    default:
      return 'fact';
  }
}

function categoryForDerivedRecord(
  record: CompanionDerivedRecord,
): CanonicalMemoryRecord['category'] {
  switch (record.kind) {
    case 'traits':
      return 'style';
    case 'relationship_note':
      return 'relationship';
    case 'event':
      return 'fact';
    case 'transcript':
    case 'normalized_note':
    case 'summary':
    case 'caption':
    case 'tags':
    case 'metadata':
    default:
      return 'fact';
  }
}

export function extractCanonicalMemoryFromCompanionBox(input: {
  catId: string;
  box: CompanionBox;
  sources: CompanionSourceRecord[];
  derived: CompanionDerivedRecord[];
  memory: CompanionMemoryRecord[];
  responseProfile: CompanionResponseProfile;
  reason: MemoryFlushReason;
  now: Date;
}): Array<Omit<CanonicalMemoryRecord, 'id'>> {
  const nowIso = input.now.toISOString();
  const records: Array<Omit<CanonicalMemoryRecord, 'id'>> = [];

  if (input.responseProfile.notes) {
    records.push(baseRecord({
      subjectKind: 'cat',
      subjectId: input.catId,
      category: 'style',
      title: 'Companion response profile',
      content: input.responseProfile.notes,
      tags: [input.responseProfile.expressionMode, input.responseProfile.outputMode],
      keywords: [input.responseProfile.expressionMode, input.responseProfile.outputMode],
      originKind: 'response_profile',
      boxId: input.box.id,
      reason: input.reason,
      nowIso,
    }));
  }

  for (const record of input.memory.filter((candidate) => candidate.status === 'active')) {
    records.push(baseRecord({
      subjectKind: 'cat',
      subjectId: input.catId,
      category: categoryForCompanionMemory(record),
      title: record.summary ?? null,
      content: record.content,
      summary: record.summary,
      sourceRefs: [record.id, ...record.sourceIds],
      originKind: 'companion_memory',
      boxId: input.box.id,
      reason: input.reason,
      nowIso,
    }));
  }

  for (const record of input.derived) {
    if (!record.content.trim()) {
      continue;
    }
    records.push(baseRecord({
      subjectKind: 'cat',
      subjectId: input.catId,
      category: categoryForDerivedRecord(record),
      title: record.title,
      content: record.content,
      tags: record.tags,
      sourceRefs: [record.id, ...record.sourceIds],
      originKind: 'companion_derived',
      boxId: input.box.id,
      reason: input.reason,
      nowIso,
    }));
  }

  for (const record of input.sources) {
    const content = record.ownerNote ?? record.sourceText ?? record.textExcerpt;
    if (!content) {
      continue;
    }
    records.push(baseRecord({
      subjectKind: 'cat',
      subjectId: input.catId,
      category: record.ownerNote ? 'lesson' : 'fact',
      title: record.title,
      content,
      sourceRefs: [record.id],
      tags: uniqueStrings([
        record.kind,
        ...(Array.isArray(record.metadata.tags)
          ? record.metadata.tags.filter((item): item is string => typeof item === 'string')
          : []),
      ]),
      originKind: 'companion_source',
      boxId: input.box.id,
      reason: input.reason,
      nowIso,
    }));
  }

  return records;
}

export function extractCanonicalMemoryFromChannel(input: {
  channel: ChatChannelState;
  reason: MemoryFlushReason;
  now: Date;
}): Array<Omit<CanonicalMemoryRecord, 'id'>> {
  const nowIso = input.now.toISOString();
  const records: Array<Omit<CanonicalMemoryRecord, 'id'>> = [];
  const workingMemory = input.channel.workingMemory;

  if (workingMemory?.summary) {
    records.push(baseRecord({
      subjectKind: 'channel',
      subjectId: input.channel.id,
      category: 'fact',
      title: input.channel.title,
      content: workingMemory.summary,
      summary: workingMemory.summary,
      keywords: [input.channel.title, input.channel.topic],
      originKind: 'channel_working_memory',
      channelId: input.channel.id,
      reason: input.reason,
      nowIso,
    }));
  }

  for (const fact of workingMemory?.facts ?? []) {
    records.push(baseRecord({
      subjectKind: 'channel',
      subjectId: input.channel.id,
      category: 'fact',
      title: input.channel.title,
      content: fact,
      keywords: [input.channel.title],
      originKind: 'channel_working_memory',
      channelId: input.channel.id,
      reason: input.reason,
      nowIso,
    }));
  }

  for (const loop of workingMemory?.openLoops ?? []) {
    records.push(baseRecord({
      subjectKind: 'channel',
      subjectId: input.channel.id,
      category: 'lesson',
      title: `${input.channel.title} open loop`,
      content: loop,
      keywords: [input.channel.title],
      originKind: 'channel_working_memory',
      channelId: input.channel.id,
      reason: input.reason,
      nowIso,
    }));
  }

  return records;
}

export function extractCanonicalMemoryFromOwnerProfile(input: {
  ownerProfile: OwnerProfileRecord;
  reason: MemoryFlushReason;
  now: Date;
}): Array<Omit<CanonicalMemoryRecord, 'id'>> {
  const nowIso = input.now.toISOString();
  const records: Array<Omit<CanonicalMemoryRecord, 'id'>> = [];

  if (input.ownerProfile.summary) {
    records.push(baseRecord({
      subjectKind: 'owner',
      subjectId: input.ownerProfile.actorId,
      category: 'fact',
      title: `${input.ownerProfile.displayName} profile`,
      content: input.ownerProfile.summary,
      originKind: 'owner_profile',
      reason: input.reason,
      nowIso,
    }));
  }

  for (const preference of input.ownerProfile.communicationPreferences) {
    records.push(baseRecord({
      subjectKind: 'owner',
      subjectId: input.ownerProfile.actorId,
      category: 'style',
      title: `${input.ownerProfile.displayName} communication preference`,
      content: preference,
      originKind: 'owner_profile',
      reason: input.reason,
      nowIso,
    }));
  }

  for (const preference of input.ownerProfile.decisionPreferences) {
    records.push(baseRecord({
      subjectKind: 'owner',
      subjectId: input.ownerProfile.actorId,
      category: 'lesson',
      title: `${input.ownerProfile.displayName} decision preference`,
      content: preference,
      originKind: 'owner_profile',
      reason: input.reason,
      nowIso,
    }));
  }

  for (const preference of input.ownerProfile.escalationPreferences) {
    records.push(baseRecord({
      subjectKind: 'owner',
      subjectId: input.ownerProfile.actorId,
      category: 'policy',
      title: `${input.ownerProfile.displayName} escalation preference`,
      content: preference,
      originKind: 'owner_profile',
      reason: input.reason,
      nowIso,
    }));
  }

  return records;
}
