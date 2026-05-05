import type { DurableMemoryCategory } from '../../core/types.js';

import type { CatsCoreState, MemoryCheckpointSummary } from '../../core/types.js';
import type { RoomRoutingState } from '../../shared/roomRouting.js';

export type CanonicalMemorySubjectKind =
  | 'cat'
  | 'owner'
  | 'channel'
  | 'relationship'
  | 'project';

export type CanonicalMemoryOriginKind =
  | 'companion_source'
  | 'companion_derived'
  | 'companion_memory'
  | 'response_profile'
  | 'channel_working_memory'
  | 'durable_memory'
  | 'owner_profile';

export type MemoryRetrievalOriginKind =
  | CanonicalMemoryOriginKind
  | 'companion_source_live'
  | 'companion_derived_live'
  | 'companion_memory_live';

export type MemoryFlushReason =
  | 'manual'
  | 'session_hydration'
  | 'pre_reset'
  | 'pre_compaction'
  | 'channel_handoff'
  | 'owner_profile_sync';

export type MemoryVisibility =
  | 'owner_private'
  | 'channel_private'
  | 'shared_room'
  | 'transport';

export type CanonicalMemoryPromotionRule =
  | 'companion_owner_note'
  | 'companion_response_profile'
  | 'companion_curated_memory'
  | 'companion_trait'
  | 'companion_event'
  | 'companion_relationship_note'
  | 'companion_normalized_note'
  | 'channel_summary'
  | 'channel_fact'
  | 'channel_open_loop'
  | 'durable_memory'
  | 'owner_profile_summary'
  | 'owner_communication_preference'
  | 'owner_decision_preference'
  | 'owner_escalation_preference';

export interface CanonicalMemoryLineage {
  sourceScopeKeys: string[];
  derivedFromIds: string[];
  replacementGroup: string;
}

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
  visibility: MemoryVisibility;
  promotionRule: CanonicalMemoryPromotionRule;
  lineage: CanonicalMemoryLineage;
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

export interface MemoryFlushRecordPayload {
  recordId: string;
  category: DurableMemoryCategory;
  originKind: CanonicalMemoryOriginKind;
  promotionRule: CanonicalMemoryPromotionRule;
  visibility: MemoryVisibility;
  sourceRefs: string[];
  sourceScopeKeys: string[];
  replacementGroup: string;
}

export interface MemoryFlushPayload {
  version: 1;
  reason: MemoryFlushReason;
  generatedAt: string;
  subject: {
    kind: CanonicalMemorySubjectKind;
    id: string;
  };
  replacementMode: 'subject_projection_replace';
  sourceScopeKeys: string[];
  persistedRecords: MemoryFlushRecordPayload[];
  removedRecordIds: string[];
}

export interface MemoryFlushResult {
  scope: CanonicalMemorySubjectKind;
  subjectId: string;
  reason: MemoryFlushReason;
  generatedAt: string;
  persistedCount: number;
  persistedRecordIds: string[];
  removedRecordIds: string[];
  payload: MemoryFlushPayload;
}

export interface MemoryFlushSummarySubject {
  kind: CanonicalMemorySubjectKind;
  id: string;
}

export interface MemoryFlushSummary {
  subjects: MemoryFlushSummarySubject[];
  flushCount: number;
  persistedCount: number;
  removedCount: number;
  removedRecordIds: string[];
  sourceScopeKeys: string[];
  replacementGroups: string[];
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
  originKind: MemoryRetrievalOriginKind;
  durability: 'canonical' | 'live_supporting';
  visibility: MemoryVisibility;
  selectionReasons: string[];
  promotionRule: CanonicalMemoryPromotionRule | null;
  lineage: CanonicalMemoryLineage | null;
}

export type MemoryRetrievalExclusionReason =
  | 'no_query_match'
  | 'policy_scope'
  | 'owner_hint_only';

export interface MemoryRetrievalExcluded {
  recordId: string;
  subjectKind: CanonicalMemorySubjectKind;
  subjectId: string;
  originKind: MemoryRetrievalOriginKind;
  visibility: MemoryVisibility;
  reason: MemoryRetrievalExclusionReason;
}

export interface MemoryRetrievalPolicy {
  visibility: MemoryVisibility;
  transport: 'telegram' | 'line' | 'web' | null;
  roomMode: 'chat_channel' | 'direct_message' | null;
  includeOwnerProfile: boolean;
}

export interface MemoryOwnerProfileContext {
  mode: 'matched' | 'fallback' | 'disabled';
  hints: string[];
  matchedRecordIds: string[];
}

export interface MemoryRetrievalContext {
  scope: {
    catId: string | null;
    channelId: string | null;
    relationshipIds: string[];
    projectIds: string[];
    includeOwnerProfile: boolean;
  };
  policy: MemoryRetrievalPolicy;
  query: string;
  generatedAt: string;
  hits: MemoryRetrievalHit[];
  selectedMemories: MemoryRetrievalHit[];
  supportingEvidence: MemoryRetrievalHit[];
  excludedMemories: MemoryRetrievalExcluded[];
  summary: string | null;
  facts: string[];
  ownerProfileHints: string[];
  ownerProfile: MemoryOwnerProfileContext;
  openLoops: string[];
}

export interface MemoryCatRef {
  id: string;
}

export interface MemoryChannelSnapshot {
  id: string;
  title: string;
  topic: string;
  workingMemory?: MemoryCheckpointSummary;
  roomRouting?: RoomRoutingState;
}

export interface MemoryChannelContext {
  id: string | null;
  title: string;
  topic: string;
  workingMemory?: MemoryCheckpointSummary;
  roomRouting?: RoomRoutingState;
}

export interface MemoryChatSurface {
  readCore(): Promise<CatsCoreState>;
  readChannel(channelId: string): Promise<MemoryChannelSnapshot>;
  findCat(catId: string): Promise<MemoryCatRef | null>;
}

export type MemoryCompanionSourceKind =
  | 'note'
  | 'conversation_log'
  | 'article'
  | 'image'
  | 'video'
  | 'audio'
  | 'path_ref';

export type MemoryCompanionDerivedKind =
  | 'summary'
  | 'transcript'
  | 'caption'
  | 'tags'
  | 'traits'
  | 'event'
  | 'relationship_note'
  | 'normalized_note'
  | 'metadata';

export type MemoryCompanionMemoryCategory =
  | 'identity'
  | 'preference'
  | 'relationship'
  | 'fact'
  | 'event'
  | 'owner_note';

export type MemoryCompanionMemoryStatus = 'active' | 'superseded' | 'archived';

export type MemoryCompanionExpressionMode =
  | 'animalistic'
  | 'anthropomorphic'
  | 'mixed';

export type MemoryCompanionOutputMode =
  | 'text'
  | 'audio_clip'
  | 'tts'
  | 'mixed';

export interface MemoryCompanionResponseProfile {
  expressionMode: MemoryCompanionExpressionMode;
  outputMode: MemoryCompanionOutputMode;
  voiceProfileId: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface MemoryCompanionBox {
  id: string;
  catId: string;
  sourceIds: string[];
  derivedIds: string[];
  memoryIds: string[];
  responseProfile: MemoryCompanionResponseProfile;
  createdAt: string;
  updatedAt: string;
  lastIngestedAt: string | null;
}

export interface MemoryCompanionSourceRecord {
  id: string;
  boxId: string;
  catId: string;
  kind: MemoryCompanionSourceKind;
  title: string | null;
  ownerNote: string | null;
  sourceText: string | null;
  textExcerpt: string | null;
  linkedPath: string | null;
  storedPath: string | null;
  sourceUrl: string | null;
  mimeType: string | null;
  originalFileName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCompanionDerivedRecord {
  id: string;
  boxId: string;
  catId: string;
  kind: MemoryCompanionDerivedKind;
  sourceIds: string[];
  title: string | null;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCompanionMemoryRecord {
  id: string;
  boxId: string;
  catId: string;
  category: MemoryCompanionMemoryCategory;
  sourceIds: string[];
  content: string;
  summary: string | null;
  status: MemoryCompanionMemoryStatus;
  curatedBy: 'owner' | 'system';
  replacedById: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCompanionSurface {
  getBox(catId: string, now?: Date): Promise<MemoryCompanionBox>;
  listSources(catId: string, now?: Date): Promise<MemoryCompanionSourceRecord[]>;
  listDerived(catId: string, now?: Date): Promise<MemoryCompanionDerivedRecord[]>;
  listMemory(catId: string, now?: Date): Promise<MemoryCompanionMemoryRecord[]>;
  getResponseProfile(catId: string, now?: Date): Promise<MemoryCompanionResponseProfile>;
}
