import type { DurableMemoryCategory } from '../../core/types.js';

export type CanonicalMemorySubjectKind = 'cat' | 'owner' | 'channel';

export type CanonicalMemoryOriginKind =
  | 'companion_source'
  | 'companion_derived'
  | 'companion_memory'
  | 'response_profile'
  | 'channel_working_memory'
  | 'durable_memory'
  | 'owner_profile';

export type MemoryFlushReason =
  | 'manual'
  | 'session_hydration'
  | 'pre_reset'
  | 'pre_compaction'
  | 'channel_handoff'
  | 'owner_profile_sync';

export interface CanonicalMemoryRecord {
  id: string;
  subjectKind: CanonicalMemorySubjectKind;
  subjectId: string;
  category: DurableMemoryCategory;
  title: string | null;
  content: string;
  summary: string | null;
  tags: string[];
  keywords: string[];
  confidence: number | null;
  sourceRefs: string[];
  origin: {
    kind: CanonicalMemoryOriginKind;
    boxId: string | null;
    channelId: string | null;
    flushedAt: string;
    flushReason: MemoryFlushReason;
  };
  createdAt: string;
  updatedAt: string;
  lastRetrievedAt: string | null;
}

export interface CanonicalMemorySnapshot {
  version: 1;
  updatedAt: string;
  records: CanonicalMemoryRecord[];
}

export interface CanonicalMemoryReplaceFilter {
  subjectKind?: CanonicalMemorySubjectKind;
  subjectId?: string;
  originKinds?: CanonicalMemoryOriginKind[];
}

export interface MemoryFlushResult {
  scope: CanonicalMemorySubjectKind;
  subjectId: string;
  reason: MemoryFlushReason;
  generatedAt: string;
  persistedCount: number;
  persistedRecordIds: string[];
}

export interface MemoryRetrievalHit {
  recordId: string;
  subjectKind: CanonicalMemorySubjectKind;
  subjectId: string;
  category: DurableMemoryCategory;
  title: string | null;
  content: string;
  summary: string | null;
  tags: string[];
  sourceRefs: string[];
  score: number;
  originKind: CanonicalMemoryOriginKind | 'companion_source_live' | 'companion_derived_live' | 'companion_memory_live';
}

export interface MemoryRetrievalContext {
  scope: {
    catId: string | null;
    channelId: string | null;
    includeOwnerProfile: boolean;
  };
  query: string;
  generatedAt: string;
  hits: MemoryRetrievalHit[];
  summary: string | null;
  facts: string[];
  ownerProfileHints: string[];
  openLoops: string[];
}
