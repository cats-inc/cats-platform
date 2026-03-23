import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CanonicalMemoryRecord,
  CanonicalMemorySnapshot,
  CanonicalMemorySubjectKind,
} from './contracts.js';
import { isErrnoException, uniqueStrings } from './utils.js';

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

function createEmptySnapshot(nowIso: string): CanonicalMemorySnapshot {
  return {
    version: 1,
    updatedAt: nowIso,
    records: [],
  };
}

function normalizeSnapshot(
  rawSnapshot: unknown,
  nowIso: string = new Date().toISOString(),
): CanonicalMemorySnapshot {
  const record = asRecord(rawSnapshot);
  if (!record) {
    return createEmptySnapshot(nowIso);
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

function normalizeCanonicalMemoryRecord(
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

  if (
    !id
    || !subjectId
    || !['cat', 'owner', 'channel'].includes(subjectKind)
    || !['preference', 'fact', 'policy', 'style', 'relationship', 'lesson'].includes(category)
    || ![
      'companion_source',
      'companion_derived',
      'companion_memory',
      'response_profile',
      'channel_working_memory',
      'owner_profile',
    ].includes(originKind)
  ) {
    return null;
  }

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
    sourceRefs: readStringArray(record.sourceRefs),
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
    }))
    .digest('hex')
    .slice(0, 16);
  return `cats-memory-${hash}`;
}

function prepareRecord(record: Omit<CanonicalMemoryRecord, 'id'>): CanonicalMemoryRecord {
  return {
    ...record,
    id: stableRecordId(record),
    tags: uniqueStrings(record.tags.map((tag) => tag.trim())),
    keywords: uniqueStrings(record.keywords.map((keyword) => keyword.trim().toLowerCase())),
    sourceRefs: uniqueStrings(record.sourceRefs.map((ref) => ref.trim())),
  };
}

export interface CanonicalMemoryStore {
  readSnapshot(): Promise<CanonicalMemorySnapshot>;
  listRecords(filter?: {
    subjectKind?: CanonicalMemorySubjectKind;
    subjectId?: string;
  }): Promise<CanonicalMemoryRecord[]>;
  upsertRecords(
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now?: Date,
  ): Promise<CanonicalMemoryRecord[]>;
  touchRecords(recordIds: string[], now?: Date): Promise<void>;
}

export function deriveCanonicalMemoryStatePath(chatStatePath: string): string {
  const directory = path.dirname(chatStatePath);
  const parsed = path.parse(chatStatePath);
  return path.join(directory, `${parsed.name}.memory.json`);
}

export class FileCanonicalMemoryStore implements CanonicalMemoryStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly snapshotPath: string) {}

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: () => void = () => {};
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async readOrCreateSnapshot(): Promise<CanonicalMemorySnapshot> {
    const nowIso = new Date().toISOString();
    try {
      const rawSnapshot = await readFile(this.snapshotPath, 'utf-8');
      return normalizeSnapshot(JSON.parse(rawSnapshot) as unknown, nowIso);
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'ENOENT') {
        throw error;
      }
      const snapshot = createEmptySnapshot(nowIso);
      await this.writeSnapshot(snapshot);
      return snapshot;
    }
  }

  private async writeSnapshot(snapshot: CanonicalMemorySnapshot): Promise<void> {
    await mkdir(path.dirname(this.snapshotPath), { recursive: true });
    await writeFile(this.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
  }

  async readSnapshot(): Promise<CanonicalMemorySnapshot> {
    await this.mutationQueue;
    return structuredClone(await this.readOrCreateSnapshot());
  }

  async listRecords(filter?: {
    subjectKind?: CanonicalMemorySubjectKind;
    subjectId?: string;
  }): Promise<CanonicalMemoryRecord[]> {
    await this.mutationQueue;
    const snapshot = await this.readOrCreateSnapshot();
    return structuredClone(snapshot.records.filter((record) => {
      if (filter?.subjectKind && record.subjectKind !== filter.subjectKind) {
        return false;
      }
      if (filter?.subjectId && record.subjectId !== filter.subjectId) {
        return false;
      }
      return true;
    }));
  }

  async upsertRecords(
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now: Date = new Date(),
  ): Promise<CanonicalMemoryRecord[]> {
    return this.runExclusive(async () => {
      const snapshot = await this.readOrCreateSnapshot();
      const nowIso = now.toISOString();
      const persisted: CanonicalMemoryRecord[] = [];

      for (const record of records.map((candidate) => prepareRecord(candidate))) {
        const existingIndex = snapshot.records.findIndex((candidate) => candidate.id === record.id);
        if (existingIndex === -1) {
          snapshot.records.unshift(record);
          persisted.push(structuredClone(record));
          continue;
        }

        const existing = snapshot.records[existingIndex]!;
        const nextRecord: CanonicalMemoryRecord = {
          ...existing,
          ...record,
          tags: uniqueStrings([...existing.tags, ...record.tags]),
          keywords: uniqueStrings([...existing.keywords, ...record.keywords]),
          sourceRefs: uniqueStrings([...existing.sourceRefs, ...record.sourceRefs]),
          createdAt: existing.createdAt,
          updatedAt: nowIso,
          lastRetrievedAt: existing.lastRetrievedAt,
        };
        snapshot.records[existingIndex] = nextRecord;
        persisted.push(structuredClone(nextRecord));
      }

      snapshot.updatedAt = nowIso;
      await this.writeSnapshot(snapshot);
      return persisted;
    });
  }

  async touchRecords(recordIds: string[], now: Date = new Date()): Promise<void> {
    if (recordIds.length === 0) {
      return;
    }

    await this.runExclusive(async () => {
      const snapshot = await this.readOrCreateSnapshot();
      const nowIso = now.toISOString();
      const recordIdSet = new Set(recordIds);
      let touched = false;

      snapshot.records = snapshot.records.map((record) => {
        if (!recordIdSet.has(record.id)) {
          return record;
        }
        touched = true;
        return {
          ...record,
          lastRetrievedAt: nowIso,
          updatedAt: nowIso,
        };
      });

      if (!touched) {
        return;
      }

      snapshot.updatedAt = nowIso;
      await this.writeSnapshot(snapshot);
    });
  }
}

export class MemoryCanonicalMemoryStore implements CanonicalMemoryStore {
  private snapshot: CanonicalMemorySnapshot;

  constructor(
    initialSnapshot: CanonicalMemorySnapshot = createEmptySnapshot(new Date().toISOString()),
  ) {
    this.snapshot = normalizeSnapshot(initialSnapshot, new Date().toISOString());
  }

  async readSnapshot(): Promise<CanonicalMemorySnapshot> {
    return structuredClone(this.snapshot);
  }

  async listRecords(filter?: {
    subjectKind?: CanonicalMemorySubjectKind;
    subjectId?: string;
  }): Promise<CanonicalMemoryRecord[]> {
    return structuredClone(this.snapshot.records.filter((record) => {
      if (filter?.subjectKind && record.subjectKind !== filter.subjectKind) {
        return false;
      }
      if (filter?.subjectId && record.subjectId !== filter.subjectId) {
        return false;
      }
      return true;
    }));
  }

  async upsertRecords(
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now: Date = new Date(),
  ): Promise<CanonicalMemoryRecord[]> {
    const nowIso = now.toISOString();
    const persisted: CanonicalMemoryRecord[] = [];

    for (const record of records.map((candidate) => prepareRecord(candidate))) {
      const existingIndex = this.snapshot.records.findIndex((candidate) => candidate.id === record.id);
      if (existingIndex === -1) {
        this.snapshot.records.unshift(record);
        persisted.push(structuredClone(record));
        continue;
      }

      const existing = this.snapshot.records[existingIndex]!;
      const nextRecord: CanonicalMemoryRecord = {
        ...existing,
        ...record,
        tags: uniqueStrings([...existing.tags, ...record.tags]),
        keywords: uniqueStrings([...existing.keywords, ...record.keywords]),
        sourceRefs: uniqueStrings([...existing.sourceRefs, ...record.sourceRefs]),
        createdAt: existing.createdAt,
        updatedAt: nowIso,
        lastRetrievedAt: existing.lastRetrievedAt,
      };
      this.snapshot.records[existingIndex] = nextRecord;
      persisted.push(structuredClone(nextRecord));
    }

    this.snapshot.updatedAt = nowIso;
    return persisted;
  }

  async touchRecords(recordIds: string[], now: Date = new Date()): Promise<void> {
    if (recordIds.length === 0) {
      return;
    }

    const nowIso = now.toISOString();
    this.snapshot.records = this.snapshot.records.map((record) =>
      recordIds.includes(record.id)
        ? {
            ...record,
            lastRetrievedAt: nowIso,
            updatedAt: nowIso,
          }
        : record,
    );
    this.snapshot.updatedAt = nowIso;
  }
}

export function createFileBackedCanonicalMemoryStore(chatStatePath: string): CanonicalMemoryStore {
  return new FileCanonicalMemoryStore(deriveCanonicalMemoryStatePath(chatStatePath));
}
