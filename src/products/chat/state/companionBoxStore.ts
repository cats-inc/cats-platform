import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChatCat, ChatChannelView } from '../api/contracts.js';
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
  appendCompanionBoxMemory,
  buildCompanionBoxSessionContext,
  deleteCompanionSource,
  ensureCompanionBox,
  ingestCompanionSource,
  listCompanionBoxDerived,
  listCompanionBoxMemory,
  listCompanionBoxSources,
  summarizeCompanionBox,
  updateCompanionBoxResponseProfile,
  updateCompanionSource,
} from './companionBoxOperations.js';
import {
  cloneSnapshot,
  createEmptySnapshot,
  deriveCompanionBoxStatePath,
  describeError,
  isoAt,
  normalizeSnapshot,
  resolveCompanionStorageRoot,
} from './companionBoxSnapshot.js';

export { deriveCompanionBoxStatePath };

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
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(box);
  }

  async getBoxSummary(catId: string, now: Date = new Date()): Promise<CompanionBoxSummary> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return summarizeCompanionBox(box, snapshot, this.snapshotPath);
  }

  async listSources(catId: string, now: Date = new Date()): Promise<CompanionSourceRecord[]> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(listCompanionBoxSources(snapshot, box));
  }

  async ingestSource(
    catId: string,
    input: CreateCompanionSourceInput,
    now: Date = new Date(),
  ): Promise<CompanionSourceIngestResult> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const snapshotBeforeMutation = cloneSnapshot(snapshot);
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const result = ingestCompanionSource(snapshot, box, catId, input, nowIso);

    try {
      await this.writeSnapshot(snapshot);
      await materializeStoredSource(this.snapshotPath, result.source);
    } catch (error) {
      const rollbackErrors: string[] = [];
      try {
        await this.writeSnapshot(snapshotBeforeMutation);
      } catch (rollbackError) {
        rollbackErrors.push(`snapshot rollback failed: ${describeError(rollbackError)}`);
      }
      try {
        await removeMaterializedStoredSource(this.snapshotPath, result.source.storedPath);
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
      box: structuredClone(result.box),
      source: structuredClone(result.source),
      derivedRecords: structuredClone(result.derivedRecords),
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
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const result = updateCompanionSource(snapshot, box, sourceId, update, nowIso);

    try {
      await this.writeSnapshot(snapshot);
      await materializeStoredSource(this.snapshotPath, result.source);
    } catch (error) {
      const rollbackErrors: string[] = [];
      try {
        await this.writeSnapshot(snapshotBeforeMutation);
      } catch (rollbackError) {
        rollbackErrors.push(`snapshot rollback failed: ${describeError(rollbackError)}`);
      }
      try {
        await materializeStoredSource(this.snapshotPath, result.previousSource);
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
      box: structuredClone(result.box),
      source: structuredClone(result.source),
      derivedRecords: structuredClone(result.derivedRecords),
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
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const result = deleteCompanionSource(snapshot, box, sourceId, nowIso);

    try {
      await this.writeSnapshot(snapshot);
      await removeMaterializedStoredSource(this.snapshotPath, result.source.storedPath);
    } catch (error) {
      const rollbackErrors: string[] = [];
      try {
        await this.writeSnapshot(snapshotBeforeMutation);
      } catch (rollbackError) {
        rollbackErrors.push(`snapshot rollback failed: ${describeError(rollbackError)}`);
      }
      try {
        await materializeStoredSource(this.snapshotPath, result.source);
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
      box: structuredClone(result.box),
      sourceId: result.sourceId,
      removedDerivedIds: structuredClone(result.removedDerivedIds),
      prunedMemoryIds: structuredClone(result.prunedMemoryIds),
    };
  }

  async listDerived(catId: string, now: Date = new Date()): Promise<CompanionDerivedRecord[]> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(listCompanionBoxDerived(snapshot, box));
  }

  async listMemory(catId: string, now: Date = new Date()): Promise<CompanionMemoryRecord[]> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(listCompanionBoxMemory(snapshot, box));
  }

  async createMemory(
    catId: string,
    input: CreateCompanionMemoryInput,
    now: Date = new Date(),
  ): Promise<CompanionMemoryRecord> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const record = appendCompanionBoxMemory(snapshot, box, input, nowIso);
    await this.writeSnapshot(snapshot);

    return structuredClone(record);
  }

  async getResponseProfile(
    catId: string,
    now: Date = new Date(),
  ): Promise<CompanionResponseProfile> {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
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
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const responseProfile = updateCompanionBoxResponseProfile(snapshot, box, update, nowIso);
    await this.writeSnapshot(snapshot);
    return structuredClone(responseProfile);
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
    const { box, created } = ensureCompanionBox(snapshot, input.cat.id, hydratedAt);
    if (created) {
      await this.writeSnapshot(snapshot);
    }

    return buildCompanionBoxSessionContext(snapshot, box, {
      ...input,
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
    return structuredClone(ensureCompanionBox(this.snapshot, catId, isoAt(now)).box);
  }

  async getBoxSummary(catId: string, now: Date = new Date()): Promise<CompanionBoxSummary> {
    const { box } = ensureCompanionBox(this.snapshot, catId, isoAt(now));
    return summarizeCompanionBox(box, this.snapshot, this.snapshotPath);
  }

  async listSources(catId: string, now: Date = new Date()): Promise<CompanionSourceRecord[]> {
    const { box } = ensureCompanionBox(this.snapshot, catId, isoAt(now));
    return structuredClone(listCompanionBoxSources(this.snapshot, box));
  }

  async ingestSource(
    catId: string,
    input: CreateCompanionSourceInput,
    now: Date = new Date(),
  ): Promise<CompanionSourceIngestResult> {
    const nowIso = isoAt(now);
    const { box } = ensureCompanionBox(this.snapshot, catId, nowIso);
    const result = ingestCompanionSource(this.snapshot, box, catId, input, nowIso);

    return {
      box: structuredClone(result.box),
      source: structuredClone(result.source),
      derivedRecords: structuredClone(result.derivedRecords),
    };
  }

  async updateSource(
    catId: string,
    sourceId: string,
    update: UpdateCompanionSourceInput,
    now: Date = new Date(),
  ): Promise<CompanionSourceUpdateResult> {
    const nowIso = isoAt(now);
    const { box } = ensureCompanionBox(this.snapshot, catId, nowIso);
    const result = updateCompanionSource(this.snapshot, box, sourceId, update, nowIso);

    return {
      box: structuredClone(result.box),
      source: structuredClone(result.source),
      derivedRecords: structuredClone(result.derivedRecords),
    };
  }

  async deleteSource(
    catId: string,
    sourceId: string,
    now: Date = new Date(),
  ): Promise<CompanionSourceDeleteResult> {
    const nowIso = isoAt(now);
    const { box } = ensureCompanionBox(this.snapshot, catId, nowIso);
    const result = deleteCompanionSource(this.snapshot, box, sourceId, nowIso);

    return {
      box: structuredClone(result.box),
      sourceId: result.sourceId,
      removedDerivedIds: structuredClone(result.removedDerivedIds),
      prunedMemoryIds: structuredClone(result.prunedMemoryIds),
    };
  }

  async listDerived(catId: string, now: Date = new Date()): Promise<CompanionDerivedRecord[]> {
    const { box } = ensureCompanionBox(this.snapshot, catId, isoAt(now));
    return structuredClone(listCompanionBoxDerived(this.snapshot, box));
  }

  async listMemory(catId: string, now: Date = new Date()): Promise<CompanionMemoryRecord[]> {
    const { box } = ensureCompanionBox(this.snapshot, catId, isoAt(now));
    return structuredClone(listCompanionBoxMemory(this.snapshot, box));
  }

  async createMemory(
    catId: string,
    input: CreateCompanionMemoryInput,
    now: Date = new Date(),
  ): Promise<CompanionMemoryRecord> {
    const nowIso = isoAt(now);
    const { box } = ensureCompanionBox(this.snapshot, catId, nowIso);
    const record = appendCompanionBoxMemory(this.snapshot, box, input, nowIso);
    return structuredClone(record);
  }

  async getResponseProfile(
    catId: string,
    now: Date = new Date(),
  ): Promise<CompanionResponseProfile> {
    const { box } = ensureCompanionBox(this.snapshot, catId, isoAt(now));
    return structuredClone(box.responseProfile);
  }

  async updateResponseProfile(
    catId: string,
    update: UpdateCompanionResponseProfileInput,
    now: Date = new Date(),
  ): Promise<CompanionResponseProfile> {
    const nowIso = isoAt(now);
    const { box } = ensureCompanionBox(this.snapshot, catId, nowIso);
    return structuredClone(
      updateCompanionBoxResponseProfile(this.snapshot, box, update, nowIso),
    );
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
    const { box } = ensureCompanionBox(this.snapshot, input.cat.id, hydratedAt);

    return buildCompanionBoxSessionContext(this.snapshot, box, {
      ...input,
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
