import type { CatsCoreState } from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
import { CoreConflictError, CoreValidationError } from '../../../core/errors.js';
import { emptyOwnerLifecycle, normalizeOwnerLifecycle, ownerEntry, ownerSubjectKey } from '../../../core/ownerLifecycle.js';
import { getOwnerRecord } from '../../../core/ownerManagement.js';
import { applyHistory, isTerminalHistory, previewHistory, type HistorySubject } from './historyManagement.js';
import { HISTORY_RETENTION_INTERVAL_MS, type HistoryRetentionView } from '../shared/historyRetention.js';

export function historyRetentionView(core: CatsCoreState, now = new Date()): HistoryRetentionView {
  const policy = core.ownerLifecycle?.retention ?? emptyOwnerLifecycle().retention;
  return { revision: core.ownerLifecycle?.revision ?? 0, policy, intervalMs: HISTORY_RETENTION_INTERVAL_MS, batchLimit: 100,
    nextCleanupAt: policy.enabled ? new Date(Math.max(now.getTime(), policy.lastCleanupAt ? Date.parse(policy.lastCleanupAt) + HISTORY_RETENTION_INTERVAL_MS : now.getTime())).toISOString() : null };
}

export function updateHistoryRetention(core: CatsCoreState, input: Record<string, unknown>): CatsCoreState {
  if (typeof input.enabled !== 'boolean' || !Number.isInteger(input.days) || Number(input.days) < 1 || Number(input.days) > 3650) throw new CoreValidationError('Choose whether retention is enabled and an age between 1 and 3650 days.');
  if (input.revision !== (core.ownerLifecycle?.revision ?? 0)) throw new CoreConflictError('Retention or owner records changed. Reload before saving.', 'owner_revision_stale');
  const lifecycle = structuredClone(core.ownerLifecycle ?? emptyOwnerLifecycle());
  lifecycle.retention = { ...lifecycle.retention, enabled: input.enabled, days: Number(input.days), cursor: null };
  lifecycle.revision++;
  return { ...core, ownerLifecycle: normalizeOwnerLifecycle(lifecycle) };
}

/** One bounded pass, recalculated under the same Core lock as manual cleanup. No I/O to Runtime or folders. */
export function applyHistoryRetention(core: CatsCoreState, now = new Date()): CatsCoreState {
  const policy = core.ownerLifecycle?.retention;
  if (!policy?.enabled || policy.lastCleanupAt && now.getTime() < Date.parse(policy.lastCleanupAt) + HISTORY_RETENTION_INTERVAL_MS) return core;
  const cutoff = now.getTime() - policy.days * 86_400_000;
  const old = (subject: HistorySubject) => {
    const record = getOwnerRecord(core, subject.family, subject.id)!;
    const endedAt = 'completedAt' in record && typeof record.completedAt === 'string' ? record.completedAt : record.updatedAt;
    return isTerminalHistory(record) && Date.parse(endedAt) <= cutoff;
  };
  const candidates: HistorySubject[] = [
    ...core.runs.map(run => ({ family: 'run' as const, id: run.id })),
    ...core.missions.map(mission => ({ family: 'mission' as const, id: mission.id })),
  ].filter(subject => old(subject) && !ownerEntry(core, subject.family, subject.id)?.logsClearedAt)
    .sort((a, b) => ownerSubjectKey(a.family, a.id).localeCompare(ownerSubjectKey(b.family, b.id)));
  const start = policy.cursor ? candidates.findIndex(subject => ownerSubjectKey(subject.family, subject.id).localeCompare(policy.cursor!) > 0) : 0;
  const ordered = start > 0 ? [...candidates.slice(start), ...candidates.slice(0, start)] : candidates;
  const batch = ordered.slice(0, 100);
  const selected = new Map<string, HistorySubject>(); let protectedCount = 0, inspected = 0; let cursor: string | null = null;
  for (const subject of batch) {
    inspected++; cursor = ownerSubjectKey(subject.family, subject.id);
    if (selected.has(ownerSubjectKey(subject.family, subject.id))) continue;
    try {
      // Automatic retention is deliberately stricter: referenced evidence is left for explicit owner review.
      const preview = previewHistory(core, { subjects: [subject], scope: 'history' });
      if (preview.items.some(item => item.outcome !== 'removed') || preview.subjects.some(item => !old(item))) { protectedCount++; continue; }
      const additional = preview.subjects.filter(item => !selected.has(ownerSubjectKey(item.family, item.id)));
      if (selected.size + additional.length > 100) break;
      for (const item of additional) selected.set(ownerSubjectKey(item.family, item.id), item);
    } catch (error) {
      if (!(error instanceof CoreValidationError)) throw error;
      protectedCount++; // An oversized tree requires an explicit smaller manual selection.
    }
  }
  let next = core;
  if (selected.size) next = applyHistory(core, previewHistory(core, { subjects: [...selected.values()], scope: 'logs' })).core;
  const lifecycle = structuredClone(next.ownerLifecycle ?? emptyOwnerLifecycle());
  lifecycle.retention = { ...lifecycle.retention, lastCleanupAt: now.toISOString(), lastError: null,
    cursor, lastResult: { inspected, compacted: selected.size, protected: protectedCount } };
  lifecycle.revision++;
  return { ...next, ownerLifecycle: lifecycle };
}

export async function tickHistoryRetention(store: CoreStore, now = new Date()): Promise<void> {
  // Disabled/migrated profiles incur no write. Recheck policy and eligibility inside updateCore.
  const view = historyRetentionView(await store.readCore(), now);
  if (!view.policy.enabled || view.nextCleanupAt && Date.parse(view.nextCleanupAt) > now.getTime()) return;
  try { await store.updateCore(core => applyHistoryRetention(core, now)); }
  catch (error) {
    // A failing atomic persistence boundary may reject this too; never report a successful cleanup.
    try {
      await store.updateCore(core => {
        if (!core.ownerLifecycle?.retention.enabled) return core;
        const lifecycle = structuredClone(core.ownerLifecycle);
        lifecycle.retention.lastCleanupAt = now.toISOString();
        lifecycle.retention.lastError = 'Cleanup did not commit. Existing data was preserved; retry after checking profile storage.';
        lifecycle.revision++;
        return { ...core, ownerLifecycle: lifecycle };
      });
    } catch { /* Preserve the original failure and both profile files. */ }
    throw error;
  }
}

export function startHistoryRetentionLoop(options: { coreStore: CoreStore; now?: () => Date; intervalMs?: number }): (() => void) & { isIdle(): boolean } {
  let stopped = false, ticking = false;
  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try { await tickHistoryRetention(options.coreStore, options.now?.() ?? new Date()); }
    catch { process.stderr.write('[cats-work-retention] cleanup_failed; profile data preserved\n'); }
    finally { ticking = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? 60_000); timer.unref?.();
  return Object.assign(() => { stopped = true; clearInterval(timer); }, { isIdle: () => !ticking });
}
