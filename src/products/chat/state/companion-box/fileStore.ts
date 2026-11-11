import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionLifeProfile,
  CompanionResponseProfile,
  CompanionSnapshot,
  CompanionSourceDeleteResult,
  CompanionSourceIngestResult,
  CompanionSourceRecord,
  CompanionSourceUpdateResult,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
  UpdateCompanionSourceInput,
} from '../../companion/contracts.js';
import {
  createDefaultCompanionLifeProfile,
  type CompanionLifeProfilePatch,
} from '../../companion/life/profile.js';
import {
  appendCompanionBoxMemory,
  buildCompanionBoxSessionContext,
  deleteCompanionBoxMemory,
  deleteCompanionSource,
  ensureCompanionBox,
  ingestCompanionSource,
  listCompanionBoxDerived,
  upsertCompanionBoxDerived,
  listCompanionBoxMemory,
  listCompanionBoxSources,
  summarizeCompanionBox,
  updateCompanionBoxMemoryStatus,
  updateCompanionBoxLifeProfile,
  updateCompanionBoxResponseProfile,
  updateCompanionSource,
} from './operations.js';
import {
  cloneSnapshot,
  createEmptySnapshot,
  describeError,
  isoAt,
  normalizeSnapshot,
} from './snapshot.js';
import type {
  CompanionBoxStore,
  CompanionSessionContextInput,
} from './storeTypes.js';

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

class FileCompanionBoxData implements CompanionBoxStore {
  constructor(private readonly snapshotPath: string) {}

  private async readOrCreateSnapshot(): Promise<CompanionSnapshot> {
    const nowIso = new Date().toISOString();
    let raw: string;
    try {
      raw = await readFile(this.snapshotPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const snapshot = createEmptySnapshot(nowIso);
      await this.writeSnapshot(snapshot);
      return snapshot;
    }
    // A malformed file is surfaced, never replaced with an empty snapshot.
    const parsed: unknown = JSON.parse(raw);
    const snapshot = normalizeSnapshot(parsed, nowIso);
    if ((parsed as { version: number }).version === 1) {
      const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16);
      const backupPath = `${this.snapshotPath}.v1-${digest}.bak`;
      const backupTempPath = `${backupPath}.${randomUUID()}.tmp`;
      try {
        const existing = await readFile(backupPath, 'utf-8').catch(error => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return null;
        });
        if (existing !== raw) {
          // Preserve an incomplete backup from an interrupted older writer for recovery.
          if (existing !== null) await rename(backupPath, `${backupPath}.incomplete-${randomUUID()}`);
          await writeFile(backupTempPath, raw, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
          if (await readFile(backupTempPath, 'utf-8') !== raw) throw new Error('Companion backup readback failed.');
          await rename(backupTempPath, backupPath);
        }
      } finally {
        await rm(backupTempPath, { force: true }).catch(() => {});
      }
      try {
        await this.writeSnapshot(snapshot);
        const readback = normalizeSnapshot(JSON.parse(await readFile(this.snapshotPath, 'utf-8')), nowIso);
        if (JSON.stringify(readback) !== JSON.stringify(snapshot)) throw new Error('Companion upgrade readback failed.');
      } catch (error) {
        try { await this.writeContents(raw); } catch (restoreError) {
          throw new AggregateError([error, restoreError], `Companion upgrade needs recovery from ${backupPath}`);
        }
        throw error;
      }
    }
    return snapshot;
  }

  /** Temp file + rename so a concurrent reader never sees a partial snapshot. */
  private async writeSnapshot(snapshot: CompanionSnapshot): Promise<void> {
    await this.writeContents(`${JSON.stringify(snapshot, null, 2)}\n`);
  }

  private async writeContents(contents: string): Promise<void> {
    await mkdir(path.dirname(this.snapshotPath), { recursive: true });
    const tempPath = path.join(
      path.dirname(this.snapshotPath),
      `.${path.basename(this.snapshotPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(tempPath, contents, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      // Windows can briefly refuse the replace while a reader holds the file.
      for (let attempt = 0; ; attempt += 1) {
        try {
          await rename(tempPath, this.snapshotPath);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (attempt >= 9 || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
        }
      }
    } finally {
      await rm(tempPath, { force: true }).catch(() => {});
    }
  }

  async readSnapshot(): Promise<CompanionSnapshot> {
    return cloneSnapshot(await this.readOrCreateSnapshot());
  }

  async transaction<T>(mutate: (snapshot: CompanionSnapshot) => T): Promise<T> {
    const snapshot = await this.readOrCreateSnapshot();
    const result = mutate(snapshot);
    if (result instanceof Promise) throw new Error('Companion transactions must be synchronous.');
    const validated = normalizeSnapshot(snapshot);
    const detached = structuredClone(result);
    await this.writeSnapshot(validated);
    return detached;
  }

  async clearForReset(): Promise<void> {
    await this.writeSnapshot(createEmptySnapshot(new Date().toISOString()));
  }

  async getBox(catId: string, now: Date = new Date()) {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return structuredClone(box);
  }

  async getBoxSummary(catId: string, now: Date = new Date()) {
    const snapshot = await this.readOrCreateSnapshot();
    const { box, created } = ensureCompanionBox(snapshot, catId, isoAt(now));
    if (created) {
      await this.writeSnapshot(snapshot);
    }
    return summarizeCompanionBox(box, snapshot, this.snapshotPath);
  }

  async listSources(catId: string, now: Date = new Date()) {
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

  async upsertDerived(
    catId: string,
    record: CompanionDerivedRecord,
    now: Date = new Date(),
  ): Promise<CompanionDerivedRecord> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const stored = upsertCompanionBoxDerived(snapshot, box, record, nowIso);
    await this.writeSnapshot(snapshot);
    return structuredClone(stored);
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

  async deleteMemory(
    catId: string,
    memoryId: string,
    now: Date = new Date(),
  ): Promise<{ deleted: boolean }> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const result = deleteCompanionBoxMemory(snapshot, box, memoryId, nowIso);
    if (result.deleted) {
      await this.writeSnapshot(snapshot);
    }
    return result;
  }

  async updateMemoryStatus(
    catId: string,
    memoryId: string,
    status: 'active' | 'archived',
    now: Date = new Date(),
  ): Promise<CompanionMemoryRecord> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const record = updateCompanionBoxMemoryStatus(snapshot, box, memoryId, status, nowIso);
    await this.writeSnapshot(snapshot);
    return structuredClone(record);
  }

  async getResponseProfile(catId: string, now: Date = new Date()): Promise<CompanionResponseProfile> {
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

  async getLifeProfile(catId: string, now: Date = new Date()): Promise<CompanionLifeProfile> {
    const snapshot = await this.readOrCreateSnapshot();
    const box = snapshot.boxes.find((candidate) => candidate.catId === catId);
    return structuredClone(box?.life ?? createDefaultCompanionLifeProfile(isoAt(now)));
  }

  async updateLifeProfile(
    catId: string,
    patch: CompanionLifeProfilePatch,
    now: Date = new Date(),
  ): Promise<CompanionLifeProfile> {
    const nowIso = isoAt(now);
    const snapshot = await this.readOrCreateSnapshot();
    const { box } = ensureCompanionBox(snapshot, catId, nowIso);
    const life = updateCompanionBoxLifeProfile(snapshot, box, patch, nowIso);
    await this.writeSnapshot(snapshot);
    return structuredClone(life);
  }

  async buildSessionContext(input: CompanionSessionContextInput) {
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

// One platform process owns a profile. Multiple adapters for that profile must share its writer.
const writers = new Map<string, Promise<void>>();

export class FileCompanionBoxStore implements CompanionBoxStore {
  private readonly data: FileCompanionBoxData;
  private readonly key: string;

  constructor(snapshotPath: string) {
    this.data = new FileCompanionBoxData(snapshotPath);
    this.key = path.resolve(snapshotPath);
    if (process.platform === 'win32') this.key = this.key.toLowerCase();
  }

  private run<T>(work: () => Promise<T>): Promise<T> {
    const result = (writers.get(this.key) ?? Promise.resolve()).then(work);
    const settled = result.then(() => {}, () => {});
    writers.set(this.key, settled);
    void settled.then(() => { if (writers.get(this.key) === settled) writers.delete(this.key); });
    return result;
  }

  transaction<T>(mutate: (snapshot: CompanionSnapshot) => T): Promise<T> {
    return this.run(() => this.data.transaction(mutate));
  }

  readonly clearForReset = () => this.run(() => this.data.clearForReset());
  readonly readSnapshot = () => this.run(() => this.data.readSnapshot());
  readonly getBox: CompanionBoxStore['getBox'] = (...args) => this.run(() => this.data.getBox(...args));
  readonly getBoxSummary: CompanionBoxStore['getBoxSummary'] = (...args) => this.run(() => this.data.getBoxSummary(...args));
  readonly listSources: CompanionBoxStore['listSources'] = (...args) => this.run(() => this.data.listSources(...args));
  readonly ingestSource: CompanionBoxStore['ingestSource'] = (...args) => this.run(() => this.data.ingestSource(...args));
  readonly updateSource: CompanionBoxStore['updateSource'] = (...args) => this.run(() => this.data.updateSource(...args));
  readonly deleteSource: CompanionBoxStore['deleteSource'] = (...args) => this.run(() => this.data.deleteSource(...args));
  readonly listDerived: CompanionBoxStore['listDerived'] = (...args) => this.run(() => this.data.listDerived(...args));
  readonly upsertDerived: CompanionBoxStore['upsertDerived'] = (...args) => this.run(() => this.data.upsertDerived(...args));
  readonly listMemory: CompanionBoxStore['listMemory'] = (...args) => this.run(() => this.data.listMemory(...args));
  readonly createMemory: CompanionBoxStore['createMemory'] = (...args) => this.run(() => this.data.createMemory(...args));
  readonly deleteMemory: CompanionBoxStore['deleteMemory'] = (...args) => this.run(() => this.data.deleteMemory(...args));
  readonly updateMemoryStatus: CompanionBoxStore['updateMemoryStatus'] = (...args) => this.run(() => this.data.updateMemoryStatus(...args));
  readonly getResponseProfile: CompanionBoxStore['getResponseProfile'] = (...args) => this.run(() => this.data.getResponseProfile(...args));
  readonly updateResponseProfile: CompanionBoxStore['updateResponseProfile'] = (...args) => this.run(() => this.data.updateResponseProfile(...args));
  readonly getLifeProfile: CompanionBoxStore['getLifeProfile'] = (...args) => this.run(() => this.data.getLifeProfile(...args));
  readonly updateLifeProfile: CompanionBoxStore['updateLifeProfile'] = (...args) => this.run(() => this.data.updateLifeProfile(...args));
  readonly buildSessionContext: CompanionBoxStore['buildSessionContext'] = (...args) => this.run(() => this.data.buildSessionContext(...args));
}
