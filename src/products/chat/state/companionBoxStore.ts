import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChatCat, ChatChannelView } from '../../../shared/app-shell.js';
import {
  buildCompanionSessionContext,
} from '../companion/hydration.js';
import {
  buildCompanionBoxDirectoryKey,
  buildCompanionSnapshotKey,
  buildCompanionSourceStorageKey,
  buildCompanionSourcesDirectoryKey,
} from '../companion/layout.js';
import {
  applyCompanionSourceUpdate,
  applyCompanionResponseProfileUpdate,
  createCompanionBox,
  createCompanionMemoryRecord,
  createCompanionSourceRecord,
  createDefaultCompanionResponseProfile,
  createDerivedRecordsForSource,
} from '../companion/sourceIngestion.js';
import type {
  CompanionBox,
  CompanionBoxSummary,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSessionContext,
  CompanionSnapshot,
  CompanionSourceIngestResult,
  CompanionSourceUpdateResult,
  CompanionSourceDeleteResult,
  CompanionSourceRecord,
  CompanionStorageLayout,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
} from '../companion/contracts.js';
import {
  COMPANION_EXPRESSION_MODES,
  COMPANION_MEMORY_CATEGORIES,
  COMPANION_OUTPUT_MODES,
  COMPANION_SOURCE_KINDS,
  COMPANION_SOURCE_STORAGE_MODES,
} from '../companion/validation.js';

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

function cloneSnapshot(snapshot: CompanionSnapshot): CompanionSnapshot {
  return structuredClone(snapshot);
}

function isoAt(now: Date): string {
  return now.toISOString();
}

function describeError(error: unknown): string {
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

function resolveCompanionStorageRoot(snapshotPath: string): string {
  return path.join(path.dirname(snapshotPath), 'companion-boxes');
}

function createEmptySnapshot(nowIso: string): CompanionSnapshot {
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

function normalizeSnapshot(
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

function buildStorageLayout(catId: string, snapshotPath: string): CompanionStorageLayout {
  return {
    snapshotKey: buildCompanionSnapshotKey(path.basename(snapshotPath)),
    boxDirectoryKey: buildCompanionBoxDirectoryKey(catId),
    sourcesDirectoryKey: buildCompanionSourcesDirectoryKey(catId),
  };
}

function sortNewestFirst<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function ensureBox(
  snapshot: CompanionSnapshot,
  catId: string,
  nowIso: string,
): { box: CompanionBox; created: boolean } {
  const existing = snapshot.boxes.find((box) => box.catId === catId);
  if (existing) {
    return {
      box: existing,
      created: false,
    };
  }

  const box = createCompanionBox(catId, nowIso);
  snapshot.boxes.push(box);
  snapshot.updatedAt = nowIso;
  return {
    box,
    created: true,
  };
}

function listBoxSources(snapshot: CompanionSnapshot, box: CompanionBox): CompanionSourceRecord[] {
  return sortNewestFirst(
    snapshot.sources.filter((record) => record.boxId === box.id),
  );
}

function listBoxDerived(snapshot: CompanionSnapshot, box: CompanionBox): CompanionDerivedRecord[] {
  return sortNewestFirst(
    snapshot.derived.filter((record) => record.boxId === box.id),
  );
}

function listBoxMemory(snapshot: CompanionSnapshot, box: CompanionBox): CompanionMemoryRecord[] {
  return sortNewestFirst(
    snapshot.memory.filter((record) => record.boxId === box.id),
  );
}

function requireSourceRecord(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  sourceId: string,
): CompanionSourceRecord {
  const source = snapshot.sources.find((record) => record.boxId === box.id && record.id === sourceId);
  if (!source) {
    throw new Error(`Companion source not found: ${sourceId}`);
  }
  return source;
}

function collectDerivedIdsForSource(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  sourceId: string,
): string[] {
  return snapshot.derived
    .filter((record) => record.boxId === box.id && record.sourceIds.includes(sourceId))
    .map((record) => record.id);
}

function replaceDerivedForSource(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  sourceId: string,
  nextDerived: CompanionDerivedRecord[],
): string[] {
  const removedDerivedIds = collectDerivedIdsForSource(snapshot, box, sourceId);
  snapshot.derived = [
    ...nextDerived,
    ...snapshot.derived.filter((record) =>
      !(record.boxId === box.id && record.sourceIds.includes(sourceId)),
    ),
  ];
  box.derivedIds = [
    ...nextDerived.map((record) => record.id),
    ...box.derivedIds.filter((id) => !removedDerivedIds.includes(id)),
  ];
  return removedDerivedIds;
}

function pruneMemorySourceRefs(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  sourceId: string,
  nowIso: string,
): string[] {
  const prunedMemoryIds: string[] = [];
  snapshot.memory = snapshot.memory.map((record) => {
    if (record.boxId !== box.id || !record.sourceIds.includes(sourceId)) {
      return record;
    }
    const nextSourceIds = record.sourceIds.filter((candidate) => candidate !== sourceId);
    prunedMemoryIds.push(record.id);
    return {
      ...record,
      sourceIds: nextSourceIds,
      updatedAt: nowIso,
    };
  });
  return prunedMemoryIds;
}

function summarizeBox(
  box: CompanionBox,
  snapshot: CompanionSnapshot,
  snapshotPath: string,
): CompanionBoxSummary {
  const sourceCount = snapshot.sources.filter((record) => record.boxId === box.id).length;
  const derivedCount = snapshot.derived.filter((record) => record.boxId === box.id).length;
  const memoryCount = snapshot.memory.filter((record) => record.boxId === box.id).length;

  return {
    box: structuredClone(box),
    sourceCount,
    derivedCount,
    memoryCount,
    storage: buildStorageLayout(box.catId, snapshotPath),
    hasHydrationContext:
      sourceCount > 0
      || derivedCount > 0
      || memoryCount > 0
      || Boolean(box.responseProfile.notes),
  };
}

async function materializeStoredSource(
  snapshotPath: string,
  source: CompanionSourceRecord,
): Promise<void> {
  if (source.storageMode === 'linked_path' || !source.storedPath) {
    return;
  }

  const targetPath = path.join(path.dirname(snapshotPath), ...source.storedPath.split('/'));
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    `${JSON.stringify({
      id: source.id,
      kind: source.kind,
      storageMode: source.storageMode,
      title: source.title,
      ownerNote: source.ownerNote,
      sourceText: source.sourceText,
      linkedPath: source.linkedPath,
      sourceUrl: source.sourceUrl,
      mimeType: source.mimeType,
      originalFileName: source.originalFileName,
      metadata: source.metadata,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    }, null, 2)}\n`,
    'utf-8',
  );
}

async function removeMaterializedStoredSource(
  snapshotPath: string,
  storedPath: string | null,
): Promise<void> {
  if (!storedPath) {
    return;
  }

  const targetPath = path.join(path.dirname(snapshotPath), ...storedPath.split('/'));
  await rm(targetPath, { force: true });
}

export interface CompanionBoxStore {
  readSnapshot(): Promise<CompanionSnapshot>;
  getBox(catId: string, now?: Date): Promise<CompanionBox>;
  getBoxSummary(catId: string, now?: Date): Promise<CompanionBoxSummary>;
  listSources(catId: string, now?: Date): Promise<CompanionSourceRecord[]>;
  ingestSource(
    catId: string,
    input: CreateCompanionSourceInput,
    now?: Date,
  ): Promise<CompanionSourceIngestResult>;
  updateSource(
    catId: string,
    sourceId: string,
    update: UpdateCompanionSourceInput,
    now?: Date,
  ): Promise<CompanionSourceUpdateResult>;
  deleteSource(
    catId: string,
    sourceId: string,
    now?: Date,
  ): Promise<CompanionSourceDeleteResult>;
  listDerived(catId: string, now?: Date): Promise<CompanionDerivedRecord[]>;
  listMemory(catId: string, now?: Date): Promise<CompanionMemoryRecord[]>;
  createMemory(
    catId: string,
    input: CreateCompanionMemoryInput,
    now?: Date,
  ): Promise<CompanionMemoryRecord>;
  getResponseProfile(catId: string, now?: Date): Promise<CompanionResponseProfile>;
  updateResponseProfile(
    catId: string,
    update: UpdateCompanionResponseProfileInput,
    now?: Date,
  ): Promise<CompanionResponseProfile>;
  buildSessionContext(input: {
    cat: ChatCat;
    channel: {
      id: string | null;
      title: string;
      topic: string;
      workingMemory?: ChatChannelView['workingMemory'];
      roomRouting?: ChatChannelView['roomRouting'];
    };
    requestedSkills: string[];
    transport: 'telegram' | 'line' | 'web' | null;
    now?: Date;
  }): Promise<CompanionSessionContext>;
}

export class FileCompanionBoxStore implements CompanionBoxStore {
  constructor(private readonly snapshotPath: string) {}

  private async readOrCreateSnapshot(): Promise<CompanionSnapshot> {
    const nowIso = new Date().toISOString();
    try {
      return normalizeSnapshot(
        JSON.parse(await readFile(this.snapshotPath, 'utf-8')) as unknown,
        nowIso,
      );
    } catch {
      const snapshot = createEmptySnapshot(nowIso);
      await this.writeSnapshot(snapshot);
      return snapshot;
    }
  }

  private async writeSnapshot(snapshot: CompanionSnapshot): Promise<void> {
    await mkdir(path.dirname(this.snapshotPath), { recursive: true });
    await writeFile(
      this.snapshotPath,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      'utf-8',
    );
  }

  async readSnapshot(): Promise<CompanionSnapshot> {
    return cloneSnapshot(await this.readOrCreateSnapshot());
  }

  async getBox(catId: string, now: Date = new Date()): Promise<CompanionBox> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(box);
  }

  async getBoxSummary(catId: string, now: Date = new Date()): Promise<CompanionBoxSummary> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return summarizeBox(box, snapshot, this.snapshotPath);
  }

  async listSources(catId: string, now: Date = new Date()): Promise<CompanionSourceRecord[]> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(listBoxSources(snapshot, box));
  }

  async ingestSource(
    catId: string,
    input: CreateCompanionSourceInput,
    now: Date = new Date(),
  ): Promise<CompanionSourceIngestResult> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const snapshotBeforeMutation = cloneSnapshot(snapshot);
    const { box } = ensureBox(snapshot, catId, nowIso);
    const source = createCompanionSourceRecord(box, input, nowIso, null);
    if (input.storageMode !== 'linked_path') {
      source.storedPath = buildCompanionSourceStorageKey(catId, source.id, 'json');
    }
    const derivedRecords = createDerivedRecordsForSource(box, source, nowIso);

    snapshot.sources.unshift(source);
    snapshot.derived.unshift(...derivedRecords);
    box.sourceIds.unshift(source.id);
    box.derivedIds.unshift(...derivedRecords.map((record) => record.id));
    box.updatedAt = nowIso;
    box.lastIngestedAt = nowIso;
    snapshot.updatedAt = nowIso;

    try {
      await this.writeSnapshot(snapshot);
      await materializeStoredSource(this.snapshotPath, source);
    } catch (error) {
      const rollbackErrors: string[] = [];
      try {
        await this.writeSnapshot(snapshotBeforeMutation);
      } catch (rollbackError) {
        rollbackErrors.push(`snapshot rollback failed: ${describeError(rollbackError)}`);
      }
      try {
        await removeMaterializedStoredSource(this.snapshotPath, source.storedPath);
      } catch (rollbackError) {
        rollbackErrors.push(`stored source cleanup failed: ${describeError(rollbackError)}`);
      }

      if (rollbackErrors.length > 0) {
        throw new Error(
          `Failed to persist companion source: ${describeError(error)}. ${rollbackErrors.join('; ')}`,
        );
      }

      throw error;
    }

    return {
      box: structuredClone(box),
      source: structuredClone(source),
      derivedRecords: structuredClone(derivedRecords),
    };
  }

  async updateSource(
    catId: string,
    sourceId: string,
    update: UpdateCompanionSourceInput,
    now: Date = new Date(),
  ): Promise<CompanionSourceUpdateResult> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const snapshotBeforeMutation = cloneSnapshot(snapshot);
    const { box } = ensureBox(snapshot, catId, nowIso);
    const source = requireSourceRecord(snapshot, box, sourceId);
    const nextSource = applyCompanionSourceUpdate(source, update, nowIso);
    const nextDerived = createDerivedRecordsForSource(box, nextSource, nowIso);

    const sourceIndex = snapshot.sources.findIndex((record) => record.id === sourceId && record.boxId === box.id);
    snapshot.sources[sourceIndex] = nextSource;
    replaceDerivedForSource(snapshot, box, sourceId, nextDerived);
    box.updatedAt = nowIso;
    snapshot.updatedAt = nowIso;

    try {
      await this.writeSnapshot(snapshot);
      await materializeStoredSource(this.snapshotPath, nextSource);
    } catch (error) {
      const rollbackErrors: string[] = [];
      try {
        await this.writeSnapshot(snapshotBeforeMutation);
      } catch (rollbackError) {
        rollbackErrors.push(`snapshot rollback failed: ${describeError(rollbackError)}`);
      }
      try {
        await materializeStoredSource(this.snapshotPath, source);
      } catch (rollbackError) {
        rollbackErrors.push(`stored source rollback failed: ${describeError(rollbackError)}`);
      }
      if (rollbackErrors.length > 0) {
        throw new Error(
          `Failed to update companion source: ${describeError(error)}. ${rollbackErrors.join('; ')}`,
        );
      }
      throw error;
    }

    return {
      box: structuredClone(box),
      source: structuredClone(nextSource),
      derivedRecords: structuredClone(nextDerived),
    };
  }

  async deleteSource(
    catId: string,
    sourceId: string,
    now: Date = new Date(),
  ): Promise<CompanionSourceDeleteResult> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const snapshotBeforeMutation = cloneSnapshot(snapshot);
    const { box } = ensureBox(snapshot, catId, nowIso);
    const source = requireSourceRecord(snapshot, box, sourceId);
    const removedDerivedIds = collectDerivedIdsForSource(snapshot, box, sourceId);
    const prunedMemoryIds = pruneMemorySourceRefs(snapshot, box, sourceId, nowIso);

    snapshot.sources = snapshot.sources.filter((record) => !(record.boxId === box.id && record.id === sourceId));
    box.sourceIds = box.sourceIds.filter((id) => id !== sourceId);
    box.derivedIds = box.derivedIds.filter((id) => !removedDerivedIds.includes(id));
    snapshot.derived = snapshot.derived.filter((record) =>
      !(record.boxId === box.id && record.sourceIds.includes(sourceId)),
    );
    box.updatedAt = nowIso;
    snapshot.updatedAt = nowIso;

    try {
      await this.writeSnapshot(snapshot);
      await removeMaterializedStoredSource(this.snapshotPath, source.storedPath);
    } catch (error) {
      const rollbackErrors: string[] = [];
      try {
        await this.writeSnapshot(snapshotBeforeMutation);
      } catch (rollbackError) {
        rollbackErrors.push(`snapshot rollback failed: ${describeError(rollbackError)}`);
      }
      try {
        await materializeStoredSource(this.snapshotPath, source);
      } catch (rollbackError) {
        rollbackErrors.push(`stored source rollback failed: ${describeError(rollbackError)}`);
      }
      if (rollbackErrors.length > 0) {
        throw new Error(
          `Failed to delete companion source: ${describeError(error)}. ${rollbackErrors.join('; ')}`,
        );
      }
      throw error;
    }

    return {
      box: structuredClone(box),
      sourceId,
      removedDerivedIds: structuredClone(removedDerivedIds),
      prunedMemoryIds: structuredClone(prunedMemoryIds),
    };
  }

  async listDerived(catId: string, now: Date = new Date()): Promise<CompanionDerivedRecord[]> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(listBoxDerived(snapshot, box));
  }

  async listMemory(catId: string, now: Date = new Date()): Promise<CompanionMemoryRecord[]> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(listBoxMemory(snapshot, box));
  }

  async createMemory(
    catId: string,
    input: CreateCompanionMemoryInput,
    now: Date = new Date(),
  ): Promise<CompanionMemoryRecord> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const { box } = ensureBox(snapshot, catId, nowIso);
    const record = createCompanionMemoryRecord(box, input, nowIso);

    snapshot.memory.unshift(record);
    box.memoryIds.unshift(record.id);
    box.updatedAt = nowIso;
    snapshot.updatedAt = nowIso;
    await this.writeSnapshot(snapshot);

    return structuredClone(record);
  }

  async getResponseProfile(
    catId: string,
    now: Date = new Date(),
  ): Promise<CompanionResponseProfile> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(box.responseProfile);
  }

  async updateResponseProfile(
    catId: string,
    update: UpdateCompanionResponseProfileInput,
    now: Date = new Date(),
  ): Promise<CompanionResponseProfile> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const { box } = ensureBox(snapshot, catId, nowIso);
    box.responseProfile = applyCompanionResponseProfileUpdate(
      box.responseProfile,
      update,
      nowIso,
    );
    box.updatedAt = nowIso;
    snapshot.updatedAt = nowIso;
    await this.writeSnapshot(snapshot);
    return structuredClone(box.responseProfile);
  }

  async buildSessionContext(input: {
    cat: ChatCat;
    channel: {
      id: string | null;
      title: string;
      topic: string;
      workingMemory?: ChatChannelView['workingMemory'];
      roomRouting?: ChatChannelView['roomRouting'];
    };
    requestedSkills: string[];
    transport: 'telegram' | 'line' | 'web' | null;
    now?: Date;
  }): Promise<CompanionSessionContext> {
    const snapshot = await this.readOrCreateSnapshot();
    const hydratedAt = isoAt(input.now ?? new Date());
    const { box, created } = ensureBox(snapshot, input.cat.id, hydratedAt);
    if (created) {
      await this.writeSnapshot(snapshot);
    }

    return buildCompanionSessionContext({
      cat: input.cat,
      box,
      sources: listBoxSources(snapshot, box),
      derived: listBoxDerived(snapshot, box),
      memory: listBoxMemory(snapshot, box),
      requestedSkills: input.requestedSkills,
      channel: input.channel,
      transport: input.transport,
      hydratedAt,
    });
  }
}

export class MemoryCompanionBoxStore implements CompanionBoxStore {
  private snapshot: CompanionSnapshot;
  private readonly snapshotPath: string;

  constructor(
    initialSnapshot: CompanionSnapshot = createEmptySnapshot(new Date().toISOString()),
    snapshotPath = 'config/chat-state.local.companion-boxes.json',
  ) {
    this.snapshot = normalizeSnapshot(initialSnapshot, new Date().toISOString());
    this.snapshotPath = snapshotPath;
  }

  async readSnapshot(): Promise<CompanionSnapshot> {
    return cloneSnapshot(this.snapshot);
  }

  async getBox(catId: string, now: Date = new Date()): Promise<CompanionBox> {
    return structuredClone(ensureBox(this.snapshot, catId, isoAt(now)).box);
  }

  async getBoxSummary(catId: string, now: Date = new Date()): Promise<CompanionBoxSummary> {
    const { box } = ensureBox(this.snapshot, catId, isoAt(now));
    return summarizeBox(box, this.snapshot, this.snapshotPath);
  }

  async listSources(catId: string, now: Date = new Date()): Promise<CompanionSourceRecord[]> {
    const { box } = ensureBox(this.snapshot, catId, isoAt(now));
    return structuredClone(listBoxSources(this.snapshot, box));
  }

  async ingestSource(
    catId: string,
    input: CreateCompanionSourceInput,
    now: Date = new Date(),
  ): Promise<CompanionSourceIngestResult> {
    const nowIso = isoAt(now);
    const { box } = ensureBox(this.snapshot, catId, nowIso);
    const source = createCompanionSourceRecord(box, input, nowIso, null);
    if (input.storageMode !== 'linked_path') {
      source.storedPath = buildCompanionSourceStorageKey(catId, source.id, 'json');
    }
    const derivedRecords = createDerivedRecordsForSource(box, source, nowIso);

    this.snapshot.sources.unshift(source);
    this.snapshot.derived.unshift(...derivedRecords);
    box.sourceIds.unshift(source.id);
    box.derivedIds.unshift(...derivedRecords.map((record) => record.id));
    box.updatedAt = nowIso;
    box.lastIngestedAt = nowIso;
    this.snapshot.updatedAt = nowIso;

    return {
      box: structuredClone(box),
      source: structuredClone(source),
      derivedRecords: structuredClone(derivedRecords),
    };
  }

  async updateSource(
    catId: string,
    sourceId: string,
    update: UpdateCompanionSourceInput,
    now: Date = new Date(),
  ): Promise<CompanionSourceUpdateResult> {
    const nowIso = isoAt(now);
    const { box } = ensureBox(this.snapshot, catId, nowIso);
    const source = requireSourceRecord(this.snapshot, box, sourceId);
    const nextSource = applyCompanionSourceUpdate(source, update, nowIso);
    const nextDerived = createDerivedRecordsForSource(box, nextSource, nowIso);
    const sourceIndex = this.snapshot.sources.findIndex((record) =>
      record.id === sourceId && record.boxId === box.id,
    );
    this.snapshot.sources[sourceIndex] = nextSource;
    replaceDerivedForSource(this.snapshot, box, sourceId, nextDerived);
    box.updatedAt = nowIso;
    this.snapshot.updatedAt = nowIso;

    return {
      box: structuredClone(box),
      source: structuredClone(nextSource),
      derivedRecords: structuredClone(nextDerived),
    };
  }

  async deleteSource(
    catId: string,
    sourceId: string,
    now: Date = new Date(),
  ): Promise<CompanionSourceDeleteResult> {
    const nowIso = isoAt(now);
    const { box } = ensureBox(this.snapshot, catId, nowIso);
    requireSourceRecord(this.snapshot, box, sourceId);
    const removedDerivedIds = collectDerivedIdsForSource(this.snapshot, box, sourceId);
    const prunedMemoryIds = pruneMemorySourceRefs(this.snapshot, box, sourceId, nowIso);

    this.snapshot.sources = this.snapshot.sources.filter((record) =>
      !(record.boxId === box.id && record.id === sourceId),
    );
    this.snapshot.derived = this.snapshot.derived.filter((record) =>
      !(record.boxId === box.id && record.sourceIds.includes(sourceId)),
    );
    box.sourceIds = box.sourceIds.filter((id) => id !== sourceId);
    box.derivedIds = box.derivedIds.filter((id) => !removedDerivedIds.includes(id));
    box.updatedAt = nowIso;
    this.snapshot.updatedAt = nowIso;

    return {
      box: structuredClone(box),
      sourceId,
      removedDerivedIds: structuredClone(removedDerivedIds),
      prunedMemoryIds: structuredClone(prunedMemoryIds),
    };
  }

  async listDerived(catId: string, now: Date = new Date()): Promise<CompanionDerivedRecord[]> {
    const { box } = ensureBox(this.snapshot, catId, isoAt(now));
    return structuredClone(listBoxDerived(this.snapshot, box));
  }

  async listMemory(catId: string, now: Date = new Date()): Promise<CompanionMemoryRecord[]> {
    const { box } = ensureBox(this.snapshot, catId, isoAt(now));
    return structuredClone(listBoxMemory(this.snapshot, box));
  }

  async createMemory(
    catId: string,
    input: CreateCompanionMemoryInput,
    now: Date = new Date(),
  ): Promise<CompanionMemoryRecord> {
    const nowIso = isoAt(now);
    const { box } = ensureBox(this.snapshot, catId, nowIso);
    const record = createCompanionMemoryRecord(box, input, nowIso);
    this.snapshot.memory.unshift(record);
    box.memoryIds.unshift(record.id);
    box.updatedAt = nowIso;
    this.snapshot.updatedAt = nowIso;
    return structuredClone(record);
  }

  async getResponseProfile(
    catId: string,
    now: Date = new Date(),
  ): Promise<CompanionResponseProfile> {
    const { box } = ensureBox(this.snapshot, catId, isoAt(now));
    return structuredClone(box.responseProfile);
  }

  async updateResponseProfile(
    catId: string,
    update: UpdateCompanionResponseProfileInput,
    now: Date = new Date(),
  ): Promise<CompanionResponseProfile> {
    const nowIso = isoAt(now);
    const { box } = ensureBox(this.snapshot, catId, nowIso);
    box.responseProfile = applyCompanionResponseProfileUpdate(
      box.responseProfile,
      update,
      nowIso,
    );
    box.updatedAt = nowIso;
    this.snapshot.updatedAt = nowIso;
    return structuredClone(box.responseProfile);
  }

  async buildSessionContext(input: {
    cat: ChatCat;
    channel: {
      id: string | null;
      title: string;
      topic: string;
      workingMemory?: ChatChannelView['workingMemory'];
      roomRouting?: ChatChannelView['roomRouting'];
    };
    requestedSkills: string[];
    transport: 'telegram' | 'line' | 'web' | null;
    now?: Date;
  }): Promise<CompanionSessionContext> {
    const hydratedAt = isoAt(input.now ?? new Date());
    const { box } = ensureBox(this.snapshot, input.cat.id, hydratedAt);

    return buildCompanionSessionContext({
      cat: input.cat,
      box,
      sources: listBoxSources(this.snapshot, box),
      derived: listBoxDerived(this.snapshot, box),
      memory: listBoxMemory(this.snapshot, box),
      requestedSkills: input.requestedSkills,
      channel: input.channel,
      transport: input.transport,
      hydratedAt,
    });
  }
}

export function createFileBackedCompanionBoxStore(
  chatStatePath: string,
): CompanionBoxStore {
  return new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
}

export function getCompanionStorageRootPath(chatStatePath: string): string {
  return resolveCompanionStorageRoot(deriveCompanionBoxStatePath(chatStatePath));
}
