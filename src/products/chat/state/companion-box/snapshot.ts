import path from 'node:path';

import {
  buildCompanionBoxDirectoryKey,
  buildCompanionSnapshotKey,
  buildCompanionSourcesDirectoryKey,
} from '../../companion/layout.js';
import type {
  CompanionBox,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSnapshot,
  CompanionSourceRecord,
  CompanionStorageLayout,
} from '../../companion/contracts.js';
import {
  COMPANION_EXPRESSION_MODES,
  COMPANION_MEMORY_CATEGORIES,
  COMPANION_OUTPUT_MODES,
  COMPANION_SOURCE_KINDS,
  COMPANION_SOURCE_STORAGE_MODES,
} from '../../companion/validation.js';
import { createDefaultCompanionResponseProfile } from '../../companion/sourceIngestion.js';

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

export function cloneSnapshot(snapshot: CompanionSnapshot): CompanionSnapshot {
  return structuredClone(snapshot);
}

export function isoAt(now: Date): string {
  return now.toISOString();
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function deriveCompanionBoxStatePath(chatStatePath: string): string {
  const directory = path.dirname(chatStatePath);
  const parsed = path.parse(chatStatePath);
  return path.join(directory, `${parsed.name}.companion-boxes.json`);
}

export function resolveCompanionStorageRoot(snapshotPath: string): string {
  return path.join(path.dirname(snapshotPath), 'companion-boxes');
}

export function createEmptySnapshot(nowIso: string): CompanionSnapshot {
  return {
    version: 1,
    updatedAt: nowIso,
    boxes: [],
    sources: [],
    derived: [],
    memory: [],
  };
}

function normalizeResponseProfile(
  rawProfile: unknown,
  nowIso: string,
): CompanionResponseProfile {
  const profileRecord = asRecord(rawProfile);
  const fallback = createDefaultCompanionResponseProfile(nowIso);
  const expressionMode = readString(profileRecord?.expressionMode, fallback.expressionMode);
  const outputMode = readString(profileRecord?.outputMode, fallback.outputMode);

  return {
    expressionMode: COMPANION_EXPRESSION_MODES.includes(
      expressionMode as CompanionResponseProfile['expressionMode'],
    )
      ? expressionMode as CompanionResponseProfile['expressionMode']
      : fallback.expressionMode,
    outputMode: COMPANION_OUTPUT_MODES.includes(
      outputMode as CompanionResponseProfile['outputMode'],
    )
      ? outputMode as CompanionResponseProfile['outputMode']
      : fallback.outputMode,
    voiceProfileId: readNullableString(profileRecord?.voiceProfileId),
    notes: readNullableString(profileRecord?.notes),
    updatedAt: readString(profileRecord?.updatedAt, nowIso),
  };
}

function normalizeBox(rawBox: unknown, nowIso: string): CompanionBox | null {
  const boxRecord = asRecord(rawBox);
  if (!boxRecord) {
    return null;
  }

  const catId = readNullableString(boxRecord.catId);
  const id = readNullableString(boxRecord.id);
  if (!catId || !id) {
    return null;
  }

  return {
    id,
    catId,
    sourceIds: readStringArray(boxRecord.sourceIds),
    derivedIds: readStringArray(boxRecord.derivedIds),
    memoryIds: readStringArray(boxRecord.memoryIds),
    responseProfile: normalizeResponseProfile(boxRecord.responseProfile, nowIso),
    createdAt: readString(boxRecord.createdAt, nowIso),
    updatedAt: readString(boxRecord.updatedAt, nowIso),
    lastIngestedAt: readNullableString(boxRecord.lastIngestedAt),
  };
}

function normalizeSource(rawSource: unknown, nowIso: string): CompanionSourceRecord | null {
  const record = asRecord(rawSource);
  if (!record) {
    return null;
  }

  const id = readNullableString(record.id);
  const boxId = readNullableString(record.boxId);
  const catId = readNullableString(record.catId);
  const kind = readString(record.kind);
  const storageMode = readString(record.storageMode);
  if (
    !id
    || !boxId
    || !catId
    || !COMPANION_SOURCE_KINDS.includes(kind as CompanionSourceRecord['kind'])
    || !COMPANION_SOURCE_STORAGE_MODES.includes(
      storageMode as CompanionSourceRecord['storageMode'],
    )
  ) {
    return null;
  }

  return {
    id,
    boxId,
    catId,
    kind: kind as CompanionSourceRecord['kind'],
    storageMode: storageMode as CompanionSourceRecord['storageMode'],
    title: readNullableString(record.title),
    ownerNote: readNullableString(record.ownerNote),
    sourceText: readNullableString(record.sourceText),
    textExcerpt: readNullableString(record.textExcerpt),
    linkedPath: readNullableString(record.linkedPath),
    storedPath: readNullableString(record.storedPath),
    sourceUrl: readNullableString(record.sourceUrl),
    mimeType: readNullableString(record.mimeType),
    originalFileName: readNullableString(record.originalFileName),
    metadata: asRecord(record.metadata) ?? {},
    createdAt: readString(record.createdAt, nowIso),
    updatedAt: readString(record.updatedAt, nowIso),
  };
}

function normalizeDerived(rawRecord: unknown, nowIso: string): CompanionDerivedRecord | null {
  const record = asRecord(rawRecord);
  if (!record) {
    return null;
  }

  const id = readNullableString(record.id);
  const boxId = readNullableString(record.boxId);
  const catId = readNullableString(record.catId);
  const kind = readString(record.kind);
  if (
    !id
    || !boxId
    || !catId
    || ![
      'summary',
      'transcript',
      'caption',
      'tags',
      'traits',
      'event',
      'relationship_note',
      'normalized_note',
      'metadata',
    ].includes(kind)
  ) {
    return null;
  }

  return {
    id,
    boxId,
    catId,
    kind: kind as CompanionDerivedRecord['kind'],
    sourceIds: readStringArray(record.sourceIds),
    title: readNullableString(record.title),
    content: readString(record.content),
    tags: readStringArray(record.tags),
    metadata: asRecord(record.metadata) ?? {},
    createdAt: readString(record.createdAt, nowIso),
    updatedAt: readString(record.updatedAt, nowIso),
  };
}

function normalizeMemory(rawRecord: unknown, nowIso: string): CompanionMemoryRecord | null {
  const record = asRecord(rawRecord);
  if (!record) {
    return null;
  }

  const id = readNullableString(record.id);
  const boxId = readNullableString(record.boxId);
  const catId = readNullableString(record.catId);
  const category = readString(record.category);
  const status = readString(record.status, 'active');
  const curatedBy = readString(record.curatedBy, 'owner');
  if (
    !id
    || !boxId
    || !catId
    || !COMPANION_MEMORY_CATEGORIES.includes(category as CompanionMemoryRecord['category'])
    || !['active', 'superseded', 'archived'].includes(status)
    || !['owner', 'system'].includes(curatedBy)
  ) {
    return null;
  }

  return {
    id,
    boxId,
    catId,
    category: category as CompanionMemoryRecord['category'],
    sourceIds: readStringArray(record.sourceIds),
    content: readString(record.content),
    summary: readNullableString(record.summary),
    status: status as CompanionMemoryRecord['status'],
    curatedBy: curatedBy as CompanionMemoryRecord['curatedBy'],
    replacedById: readNullableString(record.replacedById),
    metadata: asRecord(record.metadata) ?? {},
    createdAt: readString(record.createdAt, nowIso),
    updatedAt: readString(record.updatedAt, nowIso),
  };
}

export function normalizeSnapshot(
  rawSnapshot: unknown,
  nowIso: string = new Date().toISOString(),
): CompanionSnapshot {
  const snapshotRecord = asRecord(rawSnapshot);
  if (!snapshotRecord) {
    return createEmptySnapshot(nowIso);
  }

  return {
    version: 1,
    updatedAt: readString(snapshotRecord.updatedAt, nowIso),
    boxes: Array.isArray(snapshotRecord.boxes)
      ? snapshotRecord.boxes
          .map((box) => normalizeBox(box, nowIso))
          .filter((box): box is CompanionBox => box !== null)
      : [],
    sources: Array.isArray(snapshotRecord.sources)
      ? snapshotRecord.sources
          .map((source) => normalizeSource(source, nowIso))
          .filter((source): source is CompanionSourceRecord => source !== null)
      : [],
    derived: Array.isArray(snapshotRecord.derived)
      ? snapshotRecord.derived
          .map((record) => normalizeDerived(record, nowIso))
          .filter((record): record is CompanionDerivedRecord => record !== null)
      : [],
    memory: Array.isArray(snapshotRecord.memory)
      ? snapshotRecord.memory
          .map((record) => normalizeMemory(record, nowIso))
          .filter((record): record is CompanionMemoryRecord => record !== null)
      : [],
  };
}

export function buildStorageLayout(catId: string, snapshotPath: string): CompanionStorageLayout {
  return {
    snapshotKey: buildCompanionSnapshotKey(path.basename(snapshotPath)),
    boxDirectoryKey: buildCompanionBoxDirectoryKey(catId),
    sourcesDirectoryKey: buildCompanionSourcesDirectoryKey(catId),
  };
}
