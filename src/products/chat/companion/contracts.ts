import type { MemoryRetrievalContext } from '../../../platform/memory/contracts.js';

export type CompanionSourceKind =
  | 'note'
  | 'conversation_log'
  | 'article'
  | 'image'
  | 'video'
  | 'audio'
  | 'path_ref';

export type CompanionSourceStorageMode =
  | 'uploaded_copy'
  | 'imported_copy'
  | 'linked_path';

export type CompanionDerivedKind =
  | 'summary'
  | 'transcript'
  | 'caption'
  | 'tags'
  | 'traits'
  | 'event'
  | 'relationship_note'
  | 'normalized_note'
  | 'metadata';

export type CompanionMemoryCategory =
  | 'identity'
  | 'preference'
  | 'relationship'
  | 'fact'
  | 'event'
  | 'owner_note';

export type CompanionMemoryStatus = 'active' | 'superseded' | 'archived';

export type CompanionExpressionMode =
  | 'animalistic'
  | 'anthropomorphic'
  | 'mixed';

export type CompanionOutputMode =
  | 'text'
  | 'audio_clip'
  | 'tts'
  | 'mixed';

export interface CompanionResponseProfile {
  expressionMode: CompanionExpressionMode;
  outputMode: CompanionOutputMode;
  voiceProfileId: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface CompanionBox {
  id: string;
  catId: string;
  sourceIds: string[];
  derivedIds: string[];
  memoryIds: string[];
  responseProfile: CompanionResponseProfile;
  createdAt: string;
  updatedAt: string;
  lastIngestedAt: string | null;
}

export interface CompanionSourceRecord {
  id: string;
  boxId: string;
  catId: string;
  kind: CompanionSourceKind;
  storageMode: CompanionSourceStorageMode;
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

export interface CompanionDerivedRecord {
  id: string;
  boxId: string;
  catId: string;
  kind: CompanionDerivedKind;
  sourceIds: string[];
  title: string | null;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionMemoryRecord {
  id: string;
  boxId: string;
  catId: string;
  category: CompanionMemoryCategory;
  sourceIds: string[];
  content: string;
  summary: string | null;
  status: CompanionMemoryStatus;
  curatedBy: 'owner' | 'system';
  replacedById: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionStorageLayout {
  snapshotKey: string;
  boxDirectoryKey: string;
  sourcesDirectoryKey: string;
}

export interface CompanionBoxSummary {
  box: CompanionBox;
  sourceCount: number;
  derivedCount: number;
  memoryCount: number;
  storage: CompanionStorageLayout;
  hasHydrationContext: boolean;
}

export interface CompanionSessionSourceRef {
  id: string;
  kind: CompanionSourceKind;
  title: string | null;
  excerpt: string | null;
  linkedPath: string | null;
  storedPath: string | null;
  sourceUrl: string | null;
  mimeType: string | null;
  metadata: Record<string, unknown>;
}

export interface CompanionSessionDerivedRef {
  id: string;
  kind: CompanionDerivedKind;
  title: string | null;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface CompanionSessionMemoryRef {
  id: string;
  category: CompanionMemoryCategory;
  content: string;
  summary: string | null;
  status: CompanionMemoryStatus;
}

export interface CompanionSessionContext {
  catId: string;
  boxId: string;
  hydratedAt: string;
  requestedSkills: string[];
  sourceIds: string[];
  derivedIds: string[];
  memoryIds: string[];
  responseProfile: CompanionResponseProfile;
  sources: CompanionSessionSourceRef[];
  derived: CompanionSessionDerivedRef[];
  memory: CompanionSessionMemoryRef[];
  ownerNotes: string[];
  constraints: string[];
  retrieval: MemoryRetrievalContext | null;
  channelContext: {
    channelId: string | null;
    roomMode: 'boss_chat' | 'direct_cat_chat' | null;
    transport: 'telegram' | 'line' | 'web' | null;
  };
}

export interface CreateCompanionSourceInput {
  kind: CompanionSourceKind;
  storageMode: CompanionSourceStorageMode;
  title?: string | null;
  ownerNote?: string | null;
  textContent?: string | null;
  linkedPath?: string | null;
  sourceUrl?: string | null;
  mimeType?: string | null;
  originalFileName?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateCompanionMemoryInput {
  category: CompanionMemoryCategory;
  content: string;
  summary?: string | null;
  sourceIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCompanionResponseProfileInput {
  expressionMode?: CompanionExpressionMode;
  outputMode?: CompanionOutputMode;
  voiceProfileId?: string | null;
  notes?: string | null;
}

export interface CompanionSourceIngestResult {
  box: CompanionBox;
  source: CompanionSourceRecord;
  derivedRecords: CompanionDerivedRecord[];
}

export interface CompanionSnapshot {
  version: 1;
  updatedAt: string;
  boxes: CompanionBox[];
  sources: CompanionSourceRecord[];
  derived: CompanionDerivedRecord[];
  memory: CompanionMemoryRecord[];
}
