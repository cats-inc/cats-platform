import type {
  CoreStore,
} from '../../core/store.js';
import type {
  RuntimeClient,
  RuntimeObservedSessionPayload,
} from '../../runtime/client.js';
import type {
  CatsMemoryService,
  MemoryCompanionSurface,
  MemoryFlushReason,
  MemoryFlushResult,
  MemoryFlushSummary,
} from './index.js';
import {
  appendMemoryMaintenanceActivity,
  buildMemoryFlushSummary,
} from './maintenance.js';

export type RuntimeMaintenancePhase = 'pre_reset' | 'pre_compaction';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveRuntimeMaintenancePhase(
  value: unknown,
): RuntimeMaintenancePhase | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value === 'pre_reset' || value === 'pre_compaction') {
    return value;
  }
  throw new Error('phase must be one of pre_reset or pre_compaction');
}

export function readPendingRuntimeHooks(
  sessionPayload: Record<string, unknown>,
  requestedPhase: RuntimeMaintenancePhase | null,
): {
  phase: RuntimeMaintenancePhase | null;
  hooks: Array<Record<string, unknown>>;
} {
  const inspection = asRecord(sessionPayload.inspection);
  const maintenance = asRecord(inspection?.maintenance);
  const hooks = asRecord(maintenance?.hooks);
  const preReset = asRecord(hooks?.preReset);
  const preCompaction = asRecord(hooks?.preCompaction);
  const preResetPending = Array.isArray(preReset?.pending)
    ? preReset.pending.filter((hook): hook is Record<string, unknown> => asRecord(hook) !== null)
    : [];
  const preCompactionPending = Array.isArray(preCompaction?.pending)
    ? preCompaction.pending.filter((hook): hook is Record<string, unknown> => asRecord(hook) !== null)
    : [];

  if (requestedPhase === 'pre_reset') {
    return { phase: requestedPhase, hooks: preResetPending };
  }
  if (requestedPhase === 'pre_compaction') {
    return { phase: requestedPhase, hooks: preCompactionPending };
  }
  if (preResetPending.length > 0) {
    return { phase: 'pre_reset', hooks: preResetPending };
  }
  if (preCompactionPending.length > 0) {
    return { phase: 'pre_compaction', hooks: preCompactionPending };
  }

  return { phase: null, hooks: [] };
}

export function collectRuntimeFlushTargets(sessionPayload: Record<string, unknown>): {
  channelId: string | null;
  catId: string | null;
} {
  const context = asRecord(sessionPayload.context);
  const metadata = asRecord(context?.metadata);
  const companionSession = asRecord(metadata?.companionSession);
  const companionChannelContext = asRecord(companionSession?.channelContext);

  const channelId = readOptionalString(metadata?.channelId)
    ?? readOptionalString(companionChannelContext?.channelId);
  const targetKind = readOptionalString(metadata?.targetKind);
  const targetId = readOptionalString(metadata?.targetId);
  const catId = readOptionalString(companionSession?.catId)
    ?? (targetKind === 'cat' ? targetId : null);

  return { channelId, catId };
}

export async function flushObservedRuntimeSessionMemory(input: {
  observed: RuntimeObservedSessionPayload;
  requestedPhase?: RuntimeMaintenancePhase | null;
  memoryService: CatsMemoryService;
  companionStore?: MemoryCompanionSurface;
  now?: Date;
}): Promise<{
  phase: RuntimeMaintenancePhase | null;
  requestedHookCount: number;
  flushes: MemoryFlushResult[];
  summary: MemoryFlushSummary | null;
  targets: {
    channelId: string | null;
    catId: string | null;
  };
  reason: 'no_pending_memory_flush_hooks' | 'runtime_memory_context_missing' | null;
}> {
  const sessionPayload = asRecord(input.observed.session);
  if (!sessionPayload) {
    throw new Error('Runtime observe payload did not include a session record.');
  }

  const { phase, hooks } = readPendingRuntimeHooks(
    sessionPayload,
    input.requestedPhase ?? null,
  );
  const memoryFlushHooks = hooks.filter((hook) => readOptionalString(hook.id) === 'memory_flush');
  if (!phase || memoryFlushHooks.length === 0) {
    return {
      phase,
      requestedHookCount: 0,
      flushes: [],
      summary: null,
      targets: {
        channelId: null,
        catId: null,
      },
      reason: 'no_pending_memory_flush_hooks',
    };
  }

  const flushReason = phase as MemoryFlushReason;
  const targets = collectRuntimeFlushTargets(sessionPayload);
  const flushes: MemoryFlushResult[] = [];

  if (targets.catId && input.companionStore) {
    flushes.push(await input.memoryService.flushCompanionBox({
      catId: targets.catId,
      companionStore: input.companionStore,
      reason: flushReason,
      now: input.now,
    }));
  }
  if (targets.channelId) {
    flushes.push(await input.memoryService.flushChannel({
      channelId: targets.channelId,
      reason: flushReason,
      now: input.now,
    }));
  }

  return {
    phase,
    requestedHookCount: memoryFlushHooks.length,
    flushes,
    summary: flushes.length > 0 ? buildMemoryFlushSummary(flushes) : null,
    targets,
    reason: flushes.length === 0 ? 'runtime_memory_context_missing' : null,
  };
}

export async function bestEffortFlushRuntimeSessionMemory(input: {
  runtimeClient: RuntimeClient;
  sessionId: string | null | undefined;
  requestedPhase?: RuntimeMaintenancePhase | null;
  memoryService?: CatsMemoryService;
  companionStore?: MemoryCompanionSurface;
  coreStore?: CoreStore;
  now?: Date;
}): Promise<void> {
  if (
    !input.sessionId
    || !input.memoryService
  ) {
    return;
  }

  const observeSession = (input.runtimeClient as {
    observeSession?: (sessionId: string) => Promise<RuntimeObservedSessionPayload>;
  }).observeSession;
  if (typeof observeSession !== 'function') {
    return;
  }

  try {
    const observed = await observeSession.call(input.runtimeClient, input.sessionId);
    const result = await flushObservedRuntimeSessionMemory({
      observed,
      requestedPhase: input.requestedPhase ?? null,
      memoryService: input.memoryService,
      companionStore: input.companionStore,
      now: input.now,
    });
    if (input.coreStore && result.phase) {
      if (result.summary) {
        await appendMemoryMaintenanceActivity({
          coreStore: input.coreStore,
          trigger: 'runtime_hook',
          status: 'executed',
          phase: result.phase,
          sessionId: input.sessionId,
          channelId: result.targets.channelId,
          catId: result.targets.catId,
          reason: result.phase,
          summary: result.summary,
          now: input.now,
        });
      } else if (result.reason === 'runtime_memory_context_missing') {
        await appendMemoryMaintenanceActivity({
          coreStore: input.coreStore,
          trigger: 'runtime_hook',
          status: 'missing_context',
          phase: result.phase,
          sessionId: input.sessionId,
          reason: result.phase,
          now: input.now,
        });
      }
    }
  } catch (error) {
    if (input.coreStore && input.requestedPhase) {
      await appendMemoryMaintenanceActivity({
        coreStore: input.coreStore,
        trigger: 'runtime_hook',
        status: 'error',
        phase: input.requestedPhase,
        sessionId: input.sessionId,
        reason: input.requestedPhase,
        error: error instanceof Error ? error.message : String(error),
        now: input.now,
      }).catch(() => {
        // Activity logging is also best-effort.
      });
    }
    // Best-effort maintenance hooks should not block session cleanup/restart.
  }
}
