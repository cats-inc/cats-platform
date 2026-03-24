import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CanonicalMemoryRecord,
  CanonicalMemoryReplaceFilter,
  CanonicalMemorySnapshot,
  CanonicalMemorySubjectKind,
} from './contracts.js';
import {
  createEmptyCanonicalMemorySnapshot,
  deriveCanonicalMemoryStatePath,
  hasCanonicalMemoryReplaceSelector,
  matchesCanonicalMemoryFilter,
  normalizeCanonicalMemorySnapshot,
  prepareCanonicalMemoryRecord,
} from './storeSnapshot.js';
import { isErrnoException, uniqueStrings } from './utils.js';

export interface CanonicalMemoryReplaceResult {
  persisted: CanonicalMemoryRecord[];
  removedRecordIds: string[];
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
  replaceRecords(
    filter: CanonicalMemoryReplaceFilter,
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now?: Date,
  ): Promise<CanonicalMemoryRecord[]>;
  replaceRecordsWithResult(
    filter: CanonicalMemoryReplaceFilter,
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now?: Date,
  ): Promise<CanonicalMemoryReplaceResult>;
  touchRecords(recordIds: string[], now?: Date): Promise<void>;
}

export { deriveCanonicalMemoryStatePath };

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
      return normalizeCanonicalMemorySnapshot(JSON.parse(rawSnapshot) as unknown, nowIso);
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'ENOENT') {
        throw error;
      }
      const snapshot = createEmptyCanonicalMemorySnapshot(nowIso);
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

      for (const record of records.map((candidate) => prepareCanonicalMemoryRecord(candidate))) {
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

  async replaceRecords(
    filter: CanonicalMemoryReplaceFilter,
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now: Date = new Date(),
  ): Promise<CanonicalMemoryRecord[]> {
    return (await this.replaceRecordsWithResult(filter, records, now)).persisted;
  }

  async replaceRecordsWithResult(
    filter: CanonicalMemoryReplaceFilter,
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now: Date = new Date(),
  ): Promise<CanonicalMemoryReplaceResult> {
    if (!hasCanonicalMemoryReplaceSelector(filter)) {
      throw new Error('replaceRecords requires at least one filter selector.');
    }
    return this.runExclusive(async () => {
      const snapshot = await this.readOrCreateSnapshot();
      const nowIso = now.toISOString();
      const prepared = records.map((candidate) => prepareCanonicalMemoryRecord(candidate));
      const matchedRecords = snapshot.records.filter((record) =>
        matchesCanonicalMemoryFilter(record, filter),
      );
      const existingById = new Map(snapshot.records.map((record) => [record.id, record] as const));
      const persisted = prepared.map((record) => {
        const existing = existingById.get(record.id);
        if (!existing) {
          return record;
        }
        return {
          ...existing,
          ...record,
          tags: uniqueStrings([...existing.tags, ...record.tags]),
          keywords: uniqueStrings([...existing.keywords, ...record.keywords]),
          sourceRefs: uniqueStrings([...existing.sourceRefs, ...record.sourceRefs]),
          createdAt: existing.createdAt,
          updatedAt: nowIso,
          lastRetrievedAt: existing.lastRetrievedAt,
        };
      });
      const persistedIds = new Set(persisted.map((record) => record.id));
      const removedRecordIds = matchedRecords
        .map((record) => record.id)
        .filter((recordId) => !persistedIds.has(recordId));

      snapshot.records = [
        ...persisted,
        ...snapshot.records.filter((record) =>
          !matchesCanonicalMemoryFilter(record, filter) && !persistedIds.has(record.id),
        ),
      ];
      snapshot.updatedAt = nowIso;
      await this.writeSnapshot(snapshot);
      return {
        persisted: structuredClone(persisted),
        removedRecordIds,
      };
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
    initialSnapshot: CanonicalMemorySnapshot = createEmptyCanonicalMemorySnapshot(
      new Date().toISOString(),
    ),
  ) {
    this.snapshot = normalizeCanonicalMemorySnapshot(initialSnapshot, new Date().toISOString());
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

    for (const record of records.map((candidate) => prepareCanonicalMemoryRecord(candidate))) {
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

  async replaceRecords(
    filter: CanonicalMemoryReplaceFilter,
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now: Date = new Date(),
  ): Promise<CanonicalMemoryRecord[]> {
    return (await this.replaceRecordsWithResult(filter, records, now)).persisted;
  }

  async replaceRecordsWithResult(
    filter: CanonicalMemoryReplaceFilter,
    records: Array<Omit<CanonicalMemoryRecord, 'id'>>,
    now: Date = new Date(),
  ): Promise<CanonicalMemoryReplaceResult> {
    if (!hasCanonicalMemoryReplaceSelector(filter)) {
      throw new Error('replaceRecords requires at least one filter selector.');
    }
    const nowIso = now.toISOString();
    const prepared = records.map((candidate) => prepareCanonicalMemoryRecord(candidate));
    const matchedRecords = this.snapshot.records.filter((record) =>
      matchesCanonicalMemoryFilter(record, filter),
    );
    const existingById = new Map(this.snapshot.records.map((record) => [record.id, record] as const));
    const persisted = prepared.map((record) => {
      const existing = existingById.get(record.id);
      if (!existing) {
        return record;
      }
      return {
        ...existing,
        ...record,
        tags: uniqueStrings([...existing.tags, ...record.tags]),
        keywords: uniqueStrings([...existing.keywords, ...record.keywords]),
        sourceRefs: uniqueStrings([...existing.sourceRefs, ...record.sourceRefs]),
        createdAt: existing.createdAt,
        updatedAt: nowIso,
        lastRetrievedAt: existing.lastRetrievedAt,
      };
    });
    const persistedIds = new Set(persisted.map((record) => record.id));
    const removedRecordIds = matchedRecords
      .map((record) => record.id)
      .filter((recordId) => !persistedIds.has(recordId));

    this.snapshot = {
      ...this.snapshot,
      updatedAt: nowIso,
      records: [
        ...persisted,
        ...this.snapshot.records.filter((record) =>
          !matchesCanonicalMemoryFilter(record, filter) && !persistedIds.has(record.id),
        ),
      ],
    };
    return {
      persisted: structuredClone(persisted),
      removedRecordIds,
    };
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
