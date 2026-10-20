import type { CatsCoreState } from './types.js';
import { ownerEntry, type OwnerSubjectFamily } from './ownerLifecycle.js';

/** Reapply durable intent after source materialization; never hide the complete graph for archive alone. */
export function applyOwnerLifecycleProjection(core: CatsCoreState): CatsCoreState {
  if (!core.ownerLifecycle) return core;
  const next = { ...core };
  const collections = { project: 'projects', work_item: 'workItems', task: 'tasks', run: 'runs', mission: 'missions', artifact: 'artifacts' } as const;
  for (const [family, collection] of Object.entries(collections)) {
    (next[collection as typeof collections[keyof typeof collections]] as unknown[]) = core[collection as typeof collections[keyof typeof collections]]
      .filter(record => !ownerEntry(core, family as OwnerSubjectFamily, record.id)?.deleted)
      .map(record => {
        const entry = ownerEntry(core, family as OwnerSubjectFamily, record.id);
        return entry?.label ? { ...record, title: entry.label } : record;
      });
  }
  const cleared = new Set(core.runs.filter(run => ownerEntry(core, 'run', run.id)?.logsClearedAt).map(run => run.id));
  function compactDuplicateText(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(compactDuplicateText);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'fullText' ? '' : compactDuplicateText(child)]));
  }
  next.runs = next.runs.map(run => cleared.has(run.id) ? { ...run, metadata: compactDuplicateText(run.metadata) as typeof run.metadata } : run);
  next.missions = next.missions.map(mission => typeof mission.metadata.runId === 'string' && cleared.has(mission.metadata.runId)
    ? { ...mission, metadata: compactDuplicateText(mission.metadata) as typeof mission.metadata } : mission);
  const deleted = new Set(Object.entries(core.ownerLifecycle?.entries ?? {}).filter(([key, entry]) => key.startsWith('run:') && entry.deleted).map(([key]) => key.slice(4)));
  next.traces = core.traces.filter(trace => !trace.runId || !deleted.has(trace.runId)).map(trace => trace.runId && cleared.has(trace.runId)
    ? { ...trace, message: 'Execution detail cleared.', metadata: { source: trace.metadata?.source ?? 'core', logsCleared: true } } : trace);
  next.activities = core.activities.filter(activity => !activity.runId || !deleted.has(activity.runId)).map(activity => activity.runId && cleared.has(activity.runId)
    ? { ...activity, message: 'Execution detail cleared.', metadata: { logsCleared: true } } : activity);
  next.checkpoints = core.checkpoints.filter(checkpoint => !checkpoint.runId || !deleted.has(checkpoint.runId)).map(checkpoint => checkpoint.runId && cleared.has(checkpoint.runId)
    ? { ...checkpoint, summary: null, metadata: { logsCleared: true } } : checkpoint);
  next.outcomes = core.outcomes.filter(outcome => !outcome.runId || !deleted.has(outcome.runId));
  return next;
}
