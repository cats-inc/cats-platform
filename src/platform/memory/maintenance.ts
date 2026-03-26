import { appendCoreActivity } from '../../core/model/index.js';
import type { CoreStore } from '../../core/store.js';
import type {
  MemoryFlushResult,
  MemoryFlushSummary,
  MemoryFlushReason,
} from './contracts.js';
import type { MemoryCompanionSurface } from './contracts.js';
import type { CatsMemoryService } from './service.js';

export type CanonicalMemorySyncResult =
  | {
      status: 'synced';
      flush: MemoryFlushResult;
      summary: MemoryFlushSummary;
    }
  | {
      status: 'deferred';
      flush: null;
      summary: null;
      error: string;
    };

export interface MemoryMaintenanceActivityInput {
  coreStore: CoreStore;
  trigger: 'runtime_hook' | 'companion_sync' | 'owner_sync';
  status: 'executed' | 'deferred' | 'missing_context' | 'error';
  phase?: 'pre_reset' | 'pre_compaction' | null;
  sessionId?: string | null;
  channelId?: string | null;
  catId?: string | null;
  reason?: MemoryFlushReason | null;
  summary?: MemoryFlushSummary | null;
  error?: string | null;
  now?: Date;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function formatMemoryMaintenanceError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export function reportMemoryMaintenanceFailure(scope: string, error: unknown): string {
  const message = formatMemoryMaintenanceError(error);
  process.stderr.write(`[cats-memory-sync] ${scope}: ${message}\n`);
  return message;
}

export function buildMemoryFlushSummary(
  flushes: MemoryFlushResult[],
): MemoryFlushSummary {
  return {
    subjects: flushes.map((flush) => ({
      kind: flush.scope,
      id: flush.subjectId,
    })),
    flushCount: flushes.length,
    persistedCount: flushes.reduce((total, flush) => total + flush.persistedCount, 0),
    removedCount: flushes.reduce((total, flush) => total + flush.removedRecordIds.length, 0),
    removedRecordIds: uniqueStrings(
      flushes.flatMap((flush) => flush.removedRecordIds),
    ),
    sourceScopeKeys: uniqueStrings(
      flushes.flatMap((flush) => flush.payload.sourceScopeKeys),
    ),
    replacementGroups: uniqueStrings(
      flushes.flatMap((flush) =>
        flush.payload.persistedRecords.map((record) => record.replacementGroup)),
    ),
  };
}

function buildMemoryMaintenanceMessage(
  input: Omit<MemoryMaintenanceActivityInput, 'coreStore' | 'now'>,
): string {
  if (input.trigger === 'runtime_hook') {
    const phaseLabel = input.phase === 'pre_compaction' ? 'pre-compaction' : 'pre-reset';
    if (input.status === 'executed') {
      const subjectCount = input.summary?.subjects.length ?? 0;
      const persistedCount = input.summary?.persistedCount ?? 0;
      return `Flushed Cats-owned memory before runtime ${phaseLabel} across ${subjectCount} scope(s) and ${persistedCount} persisted record(s).`;
    }
    if (input.status === 'missing_context') {
      return `Runtime requested Cats-owned memory flush before ${phaseLabel}, but no cats-owned channel or companion context could be resolved.`;
    }
    const detail = input.error?.trim();
    return detail
      ? `Cats-owned memory maintenance failed before runtime ${phaseLabel}: ${detail}`
      : `Cats-owned memory maintenance failed before runtime ${phaseLabel}.`;
  }

  if (input.trigger === 'companion_sync') {
    if (input.status === 'executed') {
      const persistedCount = input.summary?.persistedCount ?? 0;
      return `Synchronized Cats-owned canonical companion memory for cat ${input.catId ?? 'unknown'} with ${persistedCount} persisted record(s).`;
    }
    const detail = input.error?.trim();
    return detail
      ? `Cats-owned canonical companion memory sync failed for cat ${input.catId ?? 'unknown'}: ${detail}`
      : `Cats-owned canonical companion memory sync failed for cat ${input.catId ?? 'unknown'}.`;
  }

  if (input.status === 'executed') {
    const persistedCount = input.summary?.persistedCount ?? 0;
    return `Synchronized Cats-owned owner memory with ${persistedCount} persisted record(s).`;
  }
  const detail = input.error?.trim();
  return detail
    ? `Cats-owned owner memory sync failed: ${detail}`
    : 'Cats-owned owner memory sync failed.';
}

export async function appendMemoryMaintenanceActivity(
  input: MemoryMaintenanceActivityInput,
): Promise<void> {
  const core = await input.coreStore.readCore();
  const activity = appendCoreActivity(
    core,
    {
      kind: 'note',
      conversationId: input.channelId ? `conversation-channel-${input.channelId}` : null,
      message: buildMemoryMaintenanceMessage(input),
      metadata: {
        category: 'memory_maintenance',
        trigger: input.trigger,
        status: input.status,
        phase: input.phase ?? null,
        sessionId: input.sessionId ?? null,
        channelId: input.channelId ?? null,
        catId: input.catId ?? null,
        reason: input.reason ?? null,
        summary: input.summary ? structuredClone(input.summary) : null,
        error: input.error ?? null,
      },
    },
    input.now,
  );
  await input.coreStore.writeCore(activity.core);
}

export async function syncCanonicalCompanionMemoryBestEffort(input: {
  catId: string;
  companionStore: MemoryCompanionSurface;
  memoryService: CatsMemoryService;
  reason?: MemoryFlushReason;
  now?: Date;
  coreStore?: CoreStore;
}): Promise<CanonicalMemorySyncResult> {
  try {
    const flush = await input.memoryService.flushCompanionBox({
      catId: input.catId,
      companionStore: input.companionStore,
      reason: input.reason ?? 'manual',
      now: input.now,
    });
    return {
      status: 'synced',
      flush,
      summary: buildMemoryFlushSummary([flush]),
    };
  } catch (error) {
    const message = reportMemoryMaintenanceFailure(`companion:${input.catId}`, error);
    if (input.coreStore) {
      await appendMemoryMaintenanceActivity({
        coreStore: input.coreStore,
        trigger: 'companion_sync',
        status: 'deferred',
        catId: input.catId,
        reason: input.reason ?? 'manual',
        error: message,
        now: input.now,
      });
    }
    return {
      status: 'deferred',
      flush: null,
      summary: null,
      error: message,
    };
  }
}

export async function syncCanonicalOwnerMemoryBestEffort(input: {
  memoryService: CatsMemoryService;
  reason?: MemoryFlushReason;
  now?: Date;
  coreStore?: CoreStore;
}): Promise<CanonicalMemorySyncResult> {
  try {
    const flush = await input.memoryService.flushOwnerProfile({
      reason: input.reason ?? 'owner_profile_sync',
      now: input.now,
    });
    return {
      status: 'synced',
      flush,
      summary: buildMemoryFlushSummary([flush]),
    };
  } catch (error) {
    const message = reportMemoryMaintenanceFailure('owner', error);
    if (input.coreStore) {
      await appendMemoryMaintenanceActivity({
        coreStore: input.coreStore,
        trigger: 'owner_sync',
        status: 'deferred',
        reason: input.reason ?? 'owner_profile_sync',
        error: message,
        now: input.now,
      });
    }
    return {
      status: 'deferred',
      flush: null,
      summary: null,
      error: message,
    };
  }
}

export async function syncCanonicalScopedMemoryBestEffort(input: {
  subjectKind: 'project' | 'relationship';
  subjectId: string;
  memoryService: CatsMemoryService;
  reason?: MemoryFlushReason;
  now?: Date;
}): Promise<CanonicalMemorySyncResult> {
  try {
    const flush = input.subjectKind === 'project'
      ? await input.memoryService.flushProject({
          projectId: input.subjectId,
          reason: input.reason ?? 'manual',
          now: input.now,
        })
      : await input.memoryService.flushRelationship({
          relationshipId: input.subjectId,
          reason: input.reason ?? 'manual',
          now: input.now,
        });
    return {
      status: 'synced',
      flush,
      summary: buildMemoryFlushSummary([flush]),
    };
  } catch (error) {
    const message = reportMemoryMaintenanceFailure(
      `${input.subjectKind}:${input.subjectId}`,
      error,
    );
    return {
      status: 'deferred',
      flush: null,
      summary: null,
      error: message,
    };
  }
}
