import type {
  CompanionDerivedRecord,
  CompanionMemoryRecord,
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
import { cloneSnapshot, createEmptySnapshot, isoAt, normalizeSnapshot } from './companionBoxSnapshot.js';
import type {
  CompanionBoxStore,
  CompanionSessionContextInput,
} from './companionBoxStoreTypes.js';

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

  async getBox(catId: string, now: Date = new Date()) {
    return structuredClone(ensureCompanionBox(this.snapshot, catId, isoAt(now)).box);
  }

  async getBoxSummary(catId: string, now: Date = new Date()) {
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

  async getResponseProfile(catId: string, now: Date = new Date()): Promise<CompanionResponseProfile> {
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

  async buildSessionContext(input: CompanionSessionContextInput) {
    const hydratedAt = isoAt(input.now ?? new Date());
    const { box } = ensureCompanionBox(this.snapshot, input.cat.id, hydratedAt);

    return buildCompanionBoxSessionContext(this.snapshot, box, {
      ...input,
      hydratedAt,
    });
  }
}
