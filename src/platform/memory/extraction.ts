import type {
  DurableMemoryRecord,
  OwnerProfileRecord,
} from '../../core/types.js';
import type { ChatChannelState } from '../../shared/app-shell.js';
import type {
  CompanionBox,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSourceRecord,
} from '../../products/chat/companion/contracts.js';
import type {
  CanonicalMemoryLineage,
  CanonicalMemoryRecord,
  CanonicalMemoryPromotionRule,
  MemoryFlushReason,
  MemoryVisibility,
} from './contracts.js';
import { normalizeWhitespace, tokenize, uniqueStrings } from './utils.js';

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
  return uniqueStrings([...tokenize(value), ...extra.map((item) => item.toLowerCase())]);
}

function buildLineage(input: {
  sourceScopeKeys?: string[];
  derivedFromIds?: string[];
  replacementGroup: string;
}): CanonicalMemoryLineage {
  return {
    sourceScopeKeys: uniqueStrings(input.sourceScopeKeys ?? []),
    derivedFromIds: uniqueStrings(input.derivedFromIds ?? []),
    replacementGroup: input.replacementGroup,
  };
}

function sourceScopeKey(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

function visibilityForSubject(
  subjectKind: CanonicalMemoryRecord['subjectKind'],
): MemoryVisibility {
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
  visibility?: MemoryVisibility;
  promotionRule: CanonicalMemoryPromotionRule;
  lineage: CanonicalMemoryLineage;
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
    visibility: input.visibility ?? visibilityForSubject(input.subjectKind),
    promotionRule: input.promotionRule,
    lineage: structuredClone(input.lineage),
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
      promotionRule: 'companion_response_profile',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('response-profile', input.box.id)],
        replacementGroup: `response-profile:${input.box.id}`,
      }),
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
      promotionRule: 'companion_curated_memory',
      lineage: buildLineage({
        sourceScopeKeys: [
          sourceScopeKey('companion-memory', record.id),
          ...record.sourceIds.map((sourceId) => sourceScopeKey('companion-source', sourceId)),
        ],
        derivedFromIds: [record.id],
        replacementGroup: `companion-memory:${record.id}`,
      }),
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
    let promotionRule: CanonicalMemoryPromotionRule | null = null;
    switch (record.kind) {
      case 'traits':
        promotionRule = 'companion_trait';
        break;
      case 'event':
        promotionRule = 'companion_event';
        break;
      case 'relationship_note':
        promotionRule = 'companion_relationship_note';
        break;
      case 'normalized_note':
        promotionRule = 'companion_normalized_note';
        break;
      case 'summary':
      case 'transcript':
      case 'caption':
      case 'tags':
      case 'metadata':
      default:
        promotionRule = null;
        break;
    }
    if (!promotionRule) {
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
      promotionRule,
      lineage: buildLineage({
        sourceScopeKeys: record.sourceIds.map((sourceId) => sourceScopeKey('companion-source', sourceId)),
        derivedFromIds: [record.id],
        replacementGroup: record.sourceIds.length > 0
          ? `companion-source:${record.sourceIds.slice().sort().join('+')}`
          : `companion-derived:${record.id}`,
      }),
      originKind: 'companion_derived',
      boxId: input.box.id,
      reason: input.reason,
      nowIso,
    }));
  }

  for (const record of input.sources) {
    const content = record.ownerNote;
    if (!content) {
      continue;
    }
    records.push(baseRecord({
      subjectKind: 'cat',
      subjectId: input.catId,
      category: 'lesson',
      title: record.title,
      content,
      sourceRefs: [record.id],
      tags: uniqueStrings([
        record.kind,
        ...(Array.isArray(record.metadata.tags)
          ? record.metadata.tags.filter((item): item is string => typeof item === 'string')
          : []),
      ]),
      promotionRule: 'companion_owner_note',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('companion-source', record.id)],
        replacementGroup: `companion-source:${record.id}`,
      }),
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
      promotionRule: 'channel_summary',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('channel-working-memory', input.channel.id)],
        replacementGroup: `channel-working-memory:${input.channel.id}:summary`,
      }),
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
      promotionRule: 'channel_fact',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('channel-working-memory', input.channel.id)],
        replacementGroup: `channel-working-memory:${input.channel.id}:fact`,
      }),
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
      promotionRule: 'channel_open_loop',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('channel-working-memory', input.channel.id)],
        replacementGroup: `channel-working-memory:${input.channel.id}:open-loop`,
      }),
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
      promotionRule: 'owner_profile_summary',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('owner-profile', input.ownerProfile.actorId)],
        replacementGroup: `owner-profile:${input.ownerProfile.actorId}:summary`,
      }),
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
      promotionRule: 'owner_communication_preference',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('owner-profile', input.ownerProfile.actorId)],
        replacementGroup: `owner-profile:${input.ownerProfile.actorId}:communication`,
      }),
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
      promotionRule: 'owner_decision_preference',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('owner-profile', input.ownerProfile.actorId)],
        replacementGroup: `owner-profile:${input.ownerProfile.actorId}:decision`,
      }),
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
      promotionRule: 'owner_escalation_preference',
      lineage: buildLineage({
        sourceScopeKeys: [sourceScopeKey('owner-profile', input.ownerProfile.actorId)],
        replacementGroup: `owner-profile:${input.ownerProfile.actorId}:escalation`,
      }),
      originKind: 'owner_profile',
      reason: input.reason,
      nowIso,
    }));
  }

  return records;
}

export function extractCanonicalMemoryFromDurableMemory(input: {
  subjectKind: 'cat' | 'owner' | 'relationship' | 'project';
  subjectId: string;
  records: DurableMemoryRecord[];
  reason: MemoryFlushReason;
  now: Date;
}): Array<Omit<CanonicalMemoryRecord, 'id'>> {
  const nowIso = input.now.toISOString();
  return input.records.map((record) => baseRecord({
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    category: record.category,
    title: input.subjectKind === 'owner'
      ? `Owner curated ${record.category}`
      : `Cat curated ${record.category}`,
    content: record.content,
    confidence: record.confidence,
    sourceRefs: [record.id, ...record.sourceRefs],
    tags: ['curated', record.category],
    keywords: [record.category],
    promotionRule: 'durable_memory',
    lineage: buildLineage({
      sourceScopeKeys: [
        sourceScopeKey('durable-memory', record.id),
        ...record.sourceRefs.map((sourceRef) => sourceScopeKey('durable-source', sourceRef)),
      ],
      derivedFromIds: [record.id],
      replacementGroup: `durable-memory:${record.id}`,
    }),
    originKind: 'durable_memory',
    reason: input.reason,
    nowIso,
  }));
}
