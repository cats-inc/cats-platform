import type { ChatCat, ChatChannelView } from '../api/contracts.js';
import { buildCompanionSessionContext } from '../companion/hydration.js';
import { buildCompanionSourceStorageKey } from '../companion/layout.js';
import {
  applyCompanionResponseProfileUpdate,
  applyCompanionSourceUpdate,
  createCompanionBox,
  createCompanionMemoryRecord,
  createCompanionSourceRecord,
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
  CompanionSourceDeleteResult,
  CompanionSourceIngestResult,
  CompanionSourceRecord,
  CompanionSourceUpdateResult,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
  UpdateCompanionSourceInput,
} from '../companion/contracts.js';
import { buildStorageLayout } from './companionBoxSnapshot.js';

function sortNewestFirst<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function ensureCompanionBox(
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

export function listCompanionBoxSources(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
): CompanionSourceRecord[] {
  return sortNewestFirst(
    snapshot.sources.filter((record) => record.boxId === box.id),
  );
}

export function listCompanionBoxDerived(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
): CompanionDerivedRecord[] {
  return sortNewestFirst(
    snapshot.derived.filter((record) => record.boxId === box.id),
  );
}

export function listCompanionBoxMemory(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
): CompanionMemoryRecord[] {
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

export function summarizeCompanionBox(
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

export function ingestCompanionSource(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  catId: string,
  input: CreateCompanionSourceInput,
  nowIso: string,
): CompanionSourceIngestResult {
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

  return {
    box,
    source,
    derivedRecords,
  };
}

export function updateCompanionSource(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  sourceId: string,
  update: UpdateCompanionSourceInput,
  nowIso: string,
): CompanionSourceUpdateResult & { previousSource: CompanionSourceRecord } {
  const source = requireSourceRecord(snapshot, box, sourceId);
  const nextSource = applyCompanionSourceUpdate(source, update, nowIso);
  const nextDerived = createDerivedRecordsForSource(box, nextSource, nowIso);

  const sourceIndex = snapshot.sources.findIndex((record) => record.id === sourceId && record.boxId === box.id);
  snapshot.sources[sourceIndex] = nextSource;
  replaceDerivedForSource(snapshot, box, sourceId, nextDerived);
  box.updatedAt = nowIso;
  snapshot.updatedAt = nowIso;

  return {
    box,
    previousSource: source,
    source: nextSource,
    derivedRecords: nextDerived,
  };
}

export function deleteCompanionSource(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  sourceId: string,
  nowIso: string,
): CompanionSourceDeleteResult & { source: CompanionSourceRecord } {
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

  return {
    box,
    source,
    sourceId,
    removedDerivedIds,
    prunedMemoryIds,
  };
}

export function appendCompanionBoxMemory(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  input: CreateCompanionMemoryInput,
  nowIso: string,
): CompanionMemoryRecord {
  const record = createCompanionMemoryRecord(box, input, nowIso);
  snapshot.memory.unshift(record);
  box.memoryIds.unshift(record.id);
  box.updatedAt = nowIso;
  snapshot.updatedAt = nowIso;
  return record;
}

export function updateCompanionBoxResponseProfile(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  update: UpdateCompanionResponseProfileInput,
  nowIso: string,
): CompanionResponseProfile {
  box.responseProfile = applyCompanionResponseProfileUpdate(
    box.responseProfile,
    update,
    nowIso,
  );
  box.updatedAt = nowIso;
  snapshot.updatedAt = nowIso;
  return box.responseProfile;
}

export function buildCompanionBoxSessionContext(
  snapshot: CompanionSnapshot,
  box: CompanionBox,
  input: {
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
    hydratedAt: string;
  },
): CompanionSessionContext {
  return buildCompanionSessionContext({
    cat: input.cat,
    box,
    sources: listCompanionBoxSources(snapshot, box),
    derived: listCompanionBoxDerived(snapshot, box),
    memory: listCompanionBoxMemory(snapshot, box),
    requestedSkills: input.requestedSkills,
    channel: input.channel,
    transport: input.transport,
    hydratedAt: input.hydratedAt,
  });
}
