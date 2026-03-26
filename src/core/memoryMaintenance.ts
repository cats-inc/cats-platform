import type {
  CanonicalMemorySubjectKind,
  MemoryFlushSummary,
} from '../platform/memory/contracts.js';
import type { CatsCoreState, CoreActivityRecord } from './types.js';

export type CoreMemoryMaintenanceTrigger = 'runtime_hook' | 'companion_sync' | 'owner_sync';
export type CoreMemoryMaintenanceStatus = 'executed' | 'deferred' | 'missing_context' | 'error';
export type CoreMemoryMaintenancePhase = 'pre_reset' | 'pre_compaction' | null;

export interface CoreMemoryMaintenanceSubjectView {
  kind: CanonicalMemorySubjectKind;
  id: string;
}

export interface CoreMemoryMaintenanceActivityView {
  id: string;
  createdAt: string;
  trigger: CoreMemoryMaintenanceTrigger;
  status: CoreMemoryMaintenanceStatus;
  phase: CoreMemoryMaintenancePhase;
  sessionId: string | null;
  channelId: string | null;
  catId: string | null;
  reason: string | null;
  summary: MemoryFlushSummary | null;
  error: string | null;
  message: string;
  subjectKeys: string[];
}

export interface CoreMemoryMaintenanceSummaryView {
  totals: {
    recentCount: number;
    executed: number;
    deferred: number;
    missingContext: number;
    error: number;
  };
  latestByTrigger: {
    runtimeHook: CoreMemoryMaintenanceActivityView | null;
    companionSync: CoreMemoryMaintenanceActivityView | null;
    ownerSync: CoreMemoryMaintenanceActivityView | null;
  };
  recent: CoreMemoryMaintenanceActivityView[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readTrigger(value: unknown): CoreMemoryMaintenanceTrigger | null {
  return value === 'runtime_hook' || value === 'companion_sync' || value === 'owner_sync'
    ? value
    : null;
}

function readStatus(value: unknown): CoreMemoryMaintenanceStatus | null {
  return value === 'executed'
    || value === 'deferred'
    || value === 'missing_context'
    || value === 'error'
    ? value
    : null;
}

function readPhase(value: unknown): CoreMemoryMaintenancePhase {
  return value === 'pre_reset' || value === 'pre_compaction' ? value : null;
}

function readSubjectKind(value: unknown): CanonicalMemorySubjectKind | null {
  return value === 'cat'
    || value === 'owner'
    || value === 'channel'
    || value === 'relationship'
    || value === 'project'
    ? value
    : null;
}

function readSubjects(value: unknown): CoreMemoryMaintenanceSubjectView[] {
  return Array.isArray(value)
    ? value
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item) => ({
        kind: readSubjectKind(item.kind),
        id: readString(item.id),
      }))
      .filter((item): item is CoreMemoryMaintenanceSubjectView =>
        item.kind !== null && item.id !== null,
      )
    : [];
}

function readMemoryFlushSummary(value: unknown): MemoryFlushSummary | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const subjects = readSubjects(record.subjects);
  const flushCount = readNumber(record.flushCount);
  const persistedCount = readNumber(record.persistedCount);
  const removedCount = readNumber(record.removedCount);
  const removedRecordIds = readStringArray(record.removedRecordIds);
  const sourceScopeKeys = readStringArray(record.sourceScopeKeys);
  const replacementGroups = readStringArray(record.replacementGroups);

  return {
    subjects,
    flushCount: flushCount ?? subjects.length,
    persistedCount: persistedCount ?? 0,
    removedCount: removedCount ?? removedRecordIds.length,
    removedRecordIds,
    sourceScopeKeys,
    replacementGroups,
  };
}

function buildSubjectKeys(activity: CoreMemoryMaintenanceActivityView): string[] {
  const summaryKeys = activity.summary?.subjects.map((subject) => `${subject.kind}:${subject.id}`) ?? [];
  if (summaryKeys.length > 0) {
    return summaryKeys;
  }
  if (activity.catId) {
    return [`cat:${activity.catId}`];
  }
  if (activity.channelId) {
    return [`channel:${activity.channelId}`];
  }
  return ['owner:actor-owner'];
}

export function listCoreMemoryMaintenanceActivities(
  core: CatsCoreState,
): CoreMemoryMaintenanceActivityView[] {
  return core.activities
    .map((activity, index) => ({ activity, index }))
    .filter((entry) => asRecord(entry.activity.metadata)?.category === 'memory_maintenance')
    .sort((left, right) => {
      const createdAtDiff = right.activity.createdAt.localeCompare(left.activity.createdAt);
      if (createdAtDiff !== 0) {
        return createdAtDiff;
      }
      return right.index - left.index;
    })
    .map(({ activity }) => {
      const metadata = asRecord(activity.metadata);
      const trigger = readTrigger(metadata?.trigger);
      const status = readStatus(metadata?.status);
      if (!trigger || !status) {
        return null;
      }

      const view: CoreMemoryMaintenanceActivityView = {
        id: activity.id,
        createdAt: activity.createdAt,
        trigger,
        status,
        phase: readPhase(metadata?.phase),
        sessionId: readString(metadata?.sessionId),
        channelId: readString(metadata?.channelId),
        catId: readString(metadata?.catId),
        reason: readString(metadata?.reason),
        summary: readMemoryFlushSummary(metadata?.summary),
        error: readString(metadata?.error),
        message: activity.message,
        subjectKeys: [],
      };
      return {
        ...view,
        subjectKeys: buildSubjectKeys(view),
      };
    })
    .filter((activity): activity is CoreMemoryMaintenanceActivityView => activity !== null);
}

export function buildCoreMemoryMaintenanceSummary(
  core: CatsCoreState,
): CoreMemoryMaintenanceSummaryView {
  const recent = listCoreMemoryMaintenanceActivities(core);
  const latestByTrigger = {
    runtimeHook: recent.find((activity) => activity.trigger === 'runtime_hook') ?? null,
    companionSync: recent.find((activity) => activity.trigger === 'companion_sync') ?? null,
    ownerSync: recent.find((activity) => activity.trigger === 'owner_sync') ?? null,
  };

  return {
    totals: {
      recentCount: recent.length,
      executed: recent.filter((activity) => activity.status === 'executed').length,
      deferred: recent.filter((activity) => activity.status === 'deferred').length,
      missingContext: recent.filter((activity) => activity.status === 'missing_context').length,
      error: recent.filter((activity) => activity.status === 'error').length,
    },
    latestByTrigger,
    recent,
  };
}
