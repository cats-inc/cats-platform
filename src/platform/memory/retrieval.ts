import type { MemoryCheckpointSummary } from '../../core/types.js';
import type {
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionSourceRecord,
} from '../../products/chat/companion/contracts.js';
import type {
  CanonicalMemoryRecord,
  MemoryRetrievalContext,
  MemoryRetrievalHit,
} from './contracts.js';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => normalizeWhitespace(value ?? ''))
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

function tokenize(value: string): string[] {
  return uniqueStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((part) => part.length >= 3),
  );
}

function scoreMatch(
  queryTokens: string[],
  candidateTokens: string[],
  baseScore = 0,
): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return baseScore;
  }

  let score = baseScore;
  for (const token of queryTokens) {
    if (candidateTokens.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function hitFromCanonicalRecord(
  record: CanonicalMemoryRecord,
  score: number,
): MemoryRetrievalHit {
  return {
    recordId: record.id,
    subjectKind: record.subjectKind,
    subjectId: record.subjectId,
    category: record.category,
    title: record.title,
    content: record.content,
    summary: record.summary,
    tags: structuredClone(record.tags),
    sourceRefs: structuredClone(record.sourceRefs),
    score,
    originKind: record.origin.kind,
  };
}

function hitFromCompanionSource(
  record: CompanionSourceRecord,
  score: number,
): MemoryRetrievalHit | null {
  const content = record.ownerNote ?? record.sourceText ?? record.textExcerpt;
  if (!content) {
    return null;
  }

  return {
    recordId: `companion-source-live:${record.id}`,
    subjectKind: 'cat',
    subjectId: record.catId,
    category: record.ownerNote ? 'lesson' : 'fact',
    title: record.title,
    content,
    summary: record.textExcerpt,
    tags: [],
    sourceRefs: [record.id],
    score,
    originKind: 'companion_source_live',
  };
}

function hitFromCompanionDerived(
  record: CompanionDerivedRecord,
  score: number,
): MemoryRetrievalHit {
  return {
    recordId: `companion-derived-live:${record.id}`,
    subjectKind: 'cat',
    subjectId: record.catId,
    category: record.kind === 'traits'
      ? 'style'
      : record.kind === 'relationship_note'
        ? 'relationship'
        : 'fact',
    title: record.title,
    content: record.content,
    summary: record.content,
    tags: structuredClone(record.tags),
    sourceRefs: [record.id, ...record.sourceIds],
    score,
    originKind: 'companion_derived_live',
  };
}

function hitFromCompanionMemory(
  record: CompanionMemoryRecord,
  score: number,
): MemoryRetrievalHit {
  return {
    recordId: `companion-memory-live:${record.id}`,
    subjectKind: 'cat',
    subjectId: record.catId,
    category: record.category === 'preference'
      ? 'preference'
      : record.category === 'relationship'
        ? 'relationship'
        : record.category === 'owner_note'
          ? 'lesson'
          : 'fact',
    title: record.summary,
    content: record.content,
    summary: record.summary,
    tags: [],
    sourceRefs: [record.id, ...record.sourceIds],
    score,
    originKind: 'companion_memory_live',
  };
}

export function buildMemoryRetrievalContext(input: {
  now: Date;
  catId: string | null;
  channelId: string | null;
  includeOwnerProfile?: boolean;
  channelTitle?: string;
  channelTopic?: string;
  workingMemory?: MemoryCheckpointSummary;
  canonicalRecords: CanonicalMemoryRecord[];
  companionSources?: CompanionSourceRecord[];
  companionDerived?: CompanionDerivedRecord[];
  companionMemory?: CompanionMemoryRecord[];
}): MemoryRetrievalContext {
  const nowIso = input.now.toISOString();
  const query = uniqueStrings([
    input.channelTitle,
    input.channelTopic,
    input.workingMemory?.summary,
    ...(input.workingMemory?.facts ?? []),
  ]).join(' | ');
  const queryTokens = tokenize(query);
  const hits: MemoryRetrievalHit[] = [];

  for (const record of input.canonicalRecords) {
    let score = scoreMatch(
      queryTokens,
      uniqueStrings([
        record.title,
        record.content,
        record.summary,
        ...record.tags,
        ...record.keywords,
      ].filter((value): value is string => typeof value === 'string')).flatMap(tokenize),
      record.subjectKind === 'cat' && record.subjectId === input.catId ? 2 : 0,
    );

    if (record.subjectKind === 'owner') {
      score += input.includeOwnerProfile === false ? 0 : 2;
    }
    if (record.subjectKind === 'channel' && record.subjectId === input.channelId) {
      score += 2;
    }
    if (score > 0) {
      hits.push(hitFromCanonicalRecord(record, score));
    }
  }

  for (const record of input.companionSources ?? []) {
    const hit = hitFromCompanionSource(
      record,
      scoreMatch(queryTokens, tokenize(record.ownerNote ?? record.sourceText ?? record.textExcerpt ?? ''), 1),
    );
    if (hit && hit.score > 0) {
      hits.push(hit);
    }
  }

  for (const record of input.companionDerived ?? []) {
    const hit = hitFromCompanionDerived(
      record,
      scoreMatch(queryTokens, tokenize(`${record.title ?? ''} ${record.content} ${record.tags.join(' ')}`), 1),
    );
    if (hit.score > 0) {
      hits.push(hit);
    }
  }

  for (const record of input.companionMemory ?? []) {
    if (record.status !== 'active') {
      continue;
    }
    const hit = hitFromCompanionMemory(
      record,
      scoreMatch(queryTokens, tokenize(`${record.summary ?? ''} ${record.content}`), 2),
    );
    if (hit.score > 0) {
      hits.push(hit);
    }
  }

  const sortedHits = hits
    .sort((left, right) => right.score - left.score || left.recordId.localeCompare(right.recordId))
    .slice(0, 8);
  const ownerHints = hits
    .filter((hit) => hit.subjectKind === 'owner')
    .sort((left, right) => right.score - left.score || left.recordId.localeCompare(right.recordId));
  const facts = uniqueStrings(
    sortedHits.map((hit) => hit.summary ?? hit.content),
  ).slice(0, 6);
  const ownerProfileHints = uniqueStrings(
    ownerHints
      .map((hit) => hit.summary ?? hit.content),
  ).slice(0, 4);
  const summary = facts.length > 0
    ? facts.slice(0, 3).join(' | ')
    : null;

  return {
    scope: {
      catId: input.catId,
      channelId: input.channelId,
      includeOwnerProfile: input.includeOwnerProfile !== false,
    },
    query,
    generatedAt: nowIso,
    hits: sortedHits,
    summary,
    facts,
    ownerProfileHints,
    openLoops: uniqueStrings(input.workingMemory?.openLoops ?? []).slice(0, 4),
  };
}
