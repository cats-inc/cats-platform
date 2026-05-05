import type { MemoryCheckpointSummary } from '../../core/types.js';
import type {
  CanonicalMemoryRecord,
  MemoryCompanionDerivedRecord,
  MemoryCompanionMemoryRecord,
  MemoryCompanionSourceRecord,
  MemoryOwnerProfileContext,
  MemoryRetrievalContext,
  MemoryRetrievalExcluded,
  MemoryRetrievalHit,
  MemoryRetrievalPolicy,
  MemoryVisibility,
} from './contracts.js';
import { tokenize, uniqueStrings } from './utils.js';

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

function resolvePolicy(input: {
  channelId: string | null;
  roomMode?: 'chat_channel' | 'direct_message' | null;
  transport?: 'telegram' | 'line' | 'web' | null;
  includeOwnerProfile?: boolean;
}): MemoryRetrievalPolicy {
  let visibility: MemoryVisibility = 'owner_private';
  if (input.transport && input.transport !== 'web') {
    visibility = 'transport';
  } else if (input.roomMode === 'chat_channel') {
    visibility = 'shared_room';
  } else if (input.channelId) {
    visibility = input.roomMode === 'direct_message' ? 'owner_private' : 'channel_private';
  }

  return {
    visibility,
    transport: input.transport ?? null,
    roomMode: input.roomMode ?? null,
    includeOwnerProfile: input.includeOwnerProfile !== false,
  };
}

function isVisibilityAllowed(
  recordVisibility: MemoryVisibility,
  policyVisibility: MemoryVisibility,
): boolean {
  if (policyVisibility === 'owner_private') {
    return true;
  }
  if (policyVisibility === 'channel_private') {
    return recordVisibility !== 'owner_private';
  }
  if (policyVisibility === 'shared_room') {
    return recordVisibility === 'channel_private' || recordVisibility === 'shared_room';
  }
  return (
    recordVisibility === 'channel_private'
    || recordVisibility === 'shared_room'
    || recordVisibility === 'transport'
  );
}

function hitFromCanonicalRecord(
  record: CanonicalMemoryRecord,
  score: number,
  selectionReasons: string[],
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
    durability: 'canonical',
    visibility: record.visibility,
    selectionReasons: structuredClone(selectionReasons),
    promotionRule: record.promotionRule,
    lineage: structuredClone(record.lineage),
  };
}

function hitFromCompanionSource(
  record: MemoryCompanionSourceRecord,
  score: number,
  selectionReasons: string[],
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
    durability: 'live_supporting',
    visibility: 'owner_private',
    selectionReasons: structuredClone(selectionReasons),
    promotionRule: null,
    lineage: null,
  };
}

function hitFromCompanionDerived(
  record: MemoryCompanionDerivedRecord,
  score: number,
  selectionReasons: string[],
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
    durability: 'live_supporting',
    visibility: 'owner_private',
    selectionReasons: structuredClone(selectionReasons),
    promotionRule: null,
    lineage: null,
  };
}

function hitFromCompanionMemory(
  record: MemoryCompanionMemoryRecord,
  score: number,
  selectionReasons: string[],
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
    durability: 'live_supporting',
    visibility: 'owner_private',
    selectionReasons: structuredClone(selectionReasons),
    promotionRule: null,
    lineage: null,
  };
}

function exclude(
  collection: MemoryRetrievalExcluded[],
  input: {
    recordId: string;
    subjectKind: MemoryRetrievalExcluded['subjectKind'];
    subjectId: string;
    originKind: MemoryRetrievalExcluded['originKind'];
    visibility: MemoryVisibility;
    reason: MemoryRetrievalExcluded['reason'];
  },
): void {
  collection.push({
    recordId: input.recordId,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    originKind: input.originKind,
    visibility: input.visibility,
    reason: input.reason,
  });
}

function selectionReasonsForCanonical(input: {
  matchedScore: number;
  record: CanonicalMemoryRecord;
  catId: string | null;
  channelId: string | null;
  relationshipIds: string[];
  projectIds: string[];
  includeOwnerProfile: boolean;
}): string[] {
  const reasons: string[] = [];
  if (input.matchedScore > 0) {
    reasons.push('lexical_match');
  }
  if (input.record.subjectKind === 'cat' && input.record.subjectId === input.catId) {
    reasons.push('cat_scope_match');
  }
  if (input.record.subjectKind === 'channel' && input.record.subjectId === input.channelId) {
    reasons.push('channel_scope_match');
  }
  if (
    input.record.subjectKind === 'relationship'
    && input.relationshipIds.includes(input.record.subjectId)
  ) {
    reasons.push('relationship_scope_match');
  }
  if (
    input.record.subjectKind === 'project'
    && input.projectIds.includes(input.record.subjectId)
  ) {
    reasons.push('project_scope_match');
  }
  if (input.record.subjectKind === 'owner' && input.includeOwnerProfile) {
    reasons.push('owner_profile_hint');
  }
  reasons.push(`promotion:${input.record.promotionRule}`);
  return reasons;
}

function buildOwnerProfileContext(input: {
  policy: MemoryRetrievalPolicy;
  matchedHints: string[];
  matchedRecordIds: string[];
  fallbackHints: string[];
}): MemoryOwnerProfileContext {
  if (!input.policy.includeOwnerProfile) {
    return {
      mode: 'disabled',
      hints: [],
      matchedRecordIds: [],
    };
  }
  if (input.matchedHints.length > 0) {
    return {
      mode: 'matched',
      hints: uniqueStrings([...input.matchedHints, ...input.fallbackHints]).slice(0, 6),
      matchedRecordIds: input.matchedRecordIds.slice(0, 8),
    };
  }
  return {
    mode: 'fallback',
    hints: input.fallbackHints.slice(0, 6),
    matchedRecordIds: [],
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
  roomMode?: 'chat_channel' | 'direct_message' | null;
  transport?: 'telegram' | 'line' | 'web' | null;
  relationshipIds?: string[];
  projectIds?: string[];
  queryHints?: string[];
  canonicalRecords: CanonicalMemoryRecord[];
  companionSources?: MemoryCompanionSourceRecord[];
  companionDerived?: MemoryCompanionDerivedRecord[];
  companionMemory?: MemoryCompanionMemoryRecord[];
}): MemoryRetrievalContext {
  const relationshipIds = uniqueStrings(input.relationshipIds ?? []);
  const projectIds = uniqueStrings(input.projectIds ?? []);
  const nowIso = input.now.toISOString();
  const query = uniqueStrings([
    input.channelTitle,
    input.channelTopic,
    input.workingMemory?.summary,
    ...(input.queryHints ?? []),
    ...(input.workingMemory?.facts ?? []),
  ]).join(' | ');
  const queryTokens = tokenize(query);
  const policy = resolvePolicy({
    channelId: input.channelId,
    roomMode: input.roomMode ?? null,
    transport: input.transport ?? null,
    includeOwnerProfile: input.includeOwnerProfile,
  });
  const hits: MemoryRetrievalHit[] = [];
  const excludedMemories: MemoryRetrievalExcluded[] = [];
  const fallbackOwnerHints: string[] = [];
  const matchedOwnerHints: string[] = [];
  const matchedOwnerRecordIds: string[] = [];

  for (const record of input.canonicalRecords) {
    const candidateTokens = uniqueStrings([
      record.title,
      record.content,
      record.summary,
      ...record.tags,
      ...record.keywords,
    ].filter((value): value is string => typeof value === 'string')).flatMap(tokenize);
    const matchedScore = scoreMatch(queryTokens, candidateTokens);
    let score = matchedScore + (record.subjectKind === 'cat' && record.subjectId === input.catId ? 2 : 0);
    if (record.subjectKind === 'relationship' && relationshipIds.includes(record.subjectId)) {
      score += 2;
    }
    if (record.subjectKind === 'project' && projectIds.includes(record.subjectId)) {
      score += 2;
    }

    if (
      record.subjectKind === 'owner'
      && policy.includeOwnerProfile
      && matchedScore > 0
    ) {
      score += 2;
      matchedOwnerHints.push(record.summary ?? record.content);
      matchedOwnerRecordIds.push(record.id);
    }

    if (record.subjectKind === 'owner' && policy.includeOwnerProfile) {
      fallbackOwnerHints.push(record.summary ?? record.content);
    }

    if (record.subjectKind === 'channel' && record.subjectId === input.channelId) {
      score += 2;
    }

    const selectionReasons = selectionReasonsForCanonical({
      matchedScore,
      record,
      catId: input.catId,
      channelId: input.channelId,
      relationshipIds,
      projectIds,
      includeOwnerProfile: policy.includeOwnerProfile,
    });

    if (!isVisibilityAllowed(record.visibility, policy.visibility)) {
      exclude(excludedMemories, {
        recordId: record.id,
        subjectKind: record.subjectKind,
        subjectId: record.subjectId,
        originKind: record.origin.kind,
        visibility: record.visibility,
        reason: 'policy_scope',
      });
      continue;
    }

    if (record.subjectKind === 'owner') {
      exclude(excludedMemories, {
        recordId: record.id,
        subjectKind: record.subjectKind,
        subjectId: record.subjectId,
        originKind: record.origin.kind,
        visibility: record.visibility,
        reason: 'owner_hint_only',
      });
      continue;
    }

    if (score <= 0) {
      exclude(excludedMemories, {
        recordId: record.id,
        subjectKind: record.subjectKind,
        subjectId: record.subjectId,
        originKind: record.origin.kind,
        visibility: record.visibility,
        reason: 'no_query_match',
      });
      continue;
    }

    hits.push(hitFromCanonicalRecord(record, score, selectionReasons));
  }

  const allowLiveCompanionEvidence = policy.visibility === 'owner_private';

  for (const record of input.companionSources ?? []) {
    const score = scoreMatch(
      queryTokens,
      tokenize(record.ownerNote ?? record.sourceText ?? record.textExcerpt ?? ''),
      1,
    );
    const hit = hitFromCompanionSource(record, score, ['live_source_match']);
    if (!hit) {
      continue;
    }
    if (!allowLiveCompanionEvidence) {
      exclude(excludedMemories, {
        recordId: hit.recordId,
        subjectKind: hit.subjectKind,
        subjectId: hit.subjectId,
        originKind: hit.originKind,
        visibility: hit.visibility,
        reason: 'policy_scope',
      });
      continue;
    }
    if (hit.score <= 0) {
      exclude(excludedMemories, {
        recordId: hit.recordId,
        subjectKind: hit.subjectKind,
        subjectId: hit.subjectId,
        originKind: hit.originKind,
        visibility: hit.visibility,
        reason: 'no_query_match',
      });
      continue;
    }
    hits.push(hit);
  }

  for (const record of input.companionDerived ?? []) {
    const hit = hitFromCompanionDerived(
      record,
      scoreMatch(queryTokens, tokenize(`${record.title ?? ''} ${record.content} ${record.tags.join(' ')}`), 1),
      ['live_derived_match'],
    );
    if (!allowLiveCompanionEvidence) {
      exclude(excludedMemories, {
        recordId: hit.recordId,
        subjectKind: hit.subjectKind,
        subjectId: hit.subjectId,
        originKind: hit.originKind,
        visibility: hit.visibility,
        reason: 'policy_scope',
      });
      continue;
    }
    if (hit.score <= 0) {
      exclude(excludedMemories, {
        recordId: hit.recordId,
        subjectKind: hit.subjectKind,
        subjectId: hit.subjectId,
        originKind: hit.originKind,
        visibility: hit.visibility,
        reason: 'no_query_match',
      });
      continue;
    }
    hits.push(hit);
  }

  for (const record of input.companionMemory ?? []) {
    if (record.status !== 'active') {
      continue;
    }
    const hit = hitFromCompanionMemory(
      record,
      scoreMatch(queryTokens, tokenize(`${record.summary ?? ''} ${record.content}`), 2),
      ['live_memory_match'],
    );
    if (!allowLiveCompanionEvidence) {
      exclude(excludedMemories, {
        recordId: hit.recordId,
        subjectKind: hit.subjectKind,
        subjectId: hit.subjectId,
        originKind: hit.originKind,
        visibility: hit.visibility,
        reason: 'policy_scope',
      });
      continue;
    }
    if (hit.score <= 0) {
      exclude(excludedMemories, {
        recordId: hit.recordId,
        subjectKind: hit.subjectKind,
        subjectId: hit.subjectId,
        originKind: hit.originKind,
        visibility: hit.visibility,
        reason: 'no_query_match',
      });
      continue;
    }
    hits.push(hit);
  }

  const sortedHits = hits
    .sort((left, right) => right.score - left.score || left.recordId.localeCompare(right.recordId))
    .slice(0, 8);
  const selectedMemories = sortedHits.filter((hit) => hit.durability === 'canonical');
  const supportingEvidence = sortedHits.filter((hit) => hit.durability === 'live_supporting');
  const facts = uniqueStrings(
    sortedHits.map((hit) => hit.summary ?? hit.content),
  ).slice(0, 6);
  const ownerProfile = buildOwnerProfileContext({
    policy,
    matchedHints: uniqueStrings(matchedOwnerHints),
    matchedRecordIds: uniqueStrings(matchedOwnerRecordIds),
    fallbackHints: uniqueStrings(fallbackOwnerHints),
  });
  const summary = facts.length > 0
    ? facts.slice(0, 3).join(' | ')
    : null;

  return {
    scope: {
      catId: input.catId,
      channelId: input.channelId,
      relationshipIds,
      projectIds,
      includeOwnerProfile: policy.includeOwnerProfile,
    },
    policy,
    query,
    generatedAt: nowIso,
    hits: sortedHits,
    selectedMemories,
    supportingEvidence,
    excludedMemories,
    summary,
    facts,
    ownerProfileHints: ownerProfile.hints,
    ownerProfile,
    openLoops: uniqueStrings(input.workingMemory?.openLoops ?? []).slice(0, 4),
  };
}
