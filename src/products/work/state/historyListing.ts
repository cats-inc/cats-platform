import type { CatsCoreState } from '../../../core/types.js';
import { ownerEntry } from '../../../core/ownerLifecycle.js';
import { CoreValidationError } from '../../../core/errors.js';
import { executionSource, isTerminalHistory } from './historyManagement.js';
import { resolveTaskProductBinding } from '../api/projectionSupport.js';

export interface ExecutionHistoryItem {
  family: 'run' | 'mission'; id: string; title: string; status: string; summary: string | null;
  source: ReturnType<typeof executionSource>; listing: string; updatedAt: string; taskId: string | null;
  taskTitle: string | null; projectId: string | null; parentRunId: string | null; parentRunTitle: string | null;
  path: string; logsClearedAt: string | null;
  productBinding: string; originSurface: string | null;
}
export interface ExecutionHistoryList {
  items: ExecutionHistoryItem[]; total: number; allSourcesTotal: number; page: number; pageSize: number; revision: number;
  contexts: { tasks: Array<{ id: string; title: string }>; projects: Array<{ id: string; title: string }> };
}

export function listExecutionHistory(core: CatsCoreState, params: URLSearchParams): ExecutionHistoryList {
  const family = params.get('family') ?? 'run';
  if (!['run', 'mission'].includes(family)) throw new CoreValidationError('Choose Runs or Missions.');
  const source = params.get('source') ?? 'managed';
  if (!['managed', 'all', 'work', 'room', 'schedule', 'delegation', 'unknown'].includes(source)) throw new CoreValidationError('Unknown history source filter.');
  const view = params.get('view') ?? 'visible';
  if (!['visible', 'archived', 'all'].includes(view)) throw new CoreValidationError('Unknown history listing filter.');
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 25);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new CoreValidationError('Invalid history page.');
  const from = params.get('from') ? Date.parse(params.get('from')!) : -Infinity;
  const to = params.get('to') ? Date.parse(params.get('to')!) + (params.get('to')!.length === 10 ? 86_399_999 : 0) : Infinity;
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) throw new CoreValidationError('Choose a valid date range.');
  const query = (params.get('q') ?? '').toLocaleLowerCase();
  if (params.get('status') && !['all', 'draft', 'planned', 'queued', 'running', 'blocked', 'completed', 'failed', 'cancelled'].includes(params.get('status')!)) throw new CoreValidationError('Unknown execution status.');
  const records = family === 'run' ? core.runs : core.missions;
  const items: ExecutionHistoryItem[] = records.filter(record => !ownerEntry(core, family as 'run' | 'mission', record.id)?.deleted).map(record => {
    const run = family === 'run' ? core.runs.find(run => run.id === record.id) : undefined;
    const mission = family === 'mission' ? core.missions.find(mission => mission.id === record.id) : undefined;
    const workItem = mission?.managedWorkId ? core.workItems.find(item => item.id === mission.managedWorkId) : core.workItems.find(item => item.taskId === run?.taskId);
    const taskId = run?.taskId ?? workItem?.taskId ?? null;
    const task = taskId ? core.tasks.find(task => task.id === taskId) : undefined;
    const parentRunId = run?.parentRunId ?? (typeof mission?.metadata.runId === 'string' ? mission.metadata.runId : null);
    const intent = ownerEntry(core, family as 'run' | 'mission', record.id);
    return { family: family as 'run' | 'mission', id: record.id, title: record.title, status: record.status, summary: record.summary, source: executionSource(record),
      listing: intent?.listing ?? 'visible', updatedAt: record.updatedAt, taskId, taskTitle: task?.title ?? null, projectId: workItem?.projectId ?? null,
      parentRunId, parentRunTitle: core.runs.find(run => run.id === parentRunId)?.title ?? null,
      productBinding: task ? resolveTaskProductBinding(core, task) : 'unbound',
      originSurface: ['chat', 'code', 'work'].includes(String(record.metadata.originSurface)) ? String(record.metadata.originSurface) : null,
      path: family === 'run' ? `/work/tasks/${encodeURIComponent(taskId ?? 'orphan')}/runs/${encodeURIComponent(record.id)}` : `/work/missions/${encodeURIComponent(record.id)}`,
      logsClearedAt: intent?.logsClearedAt ?? null };
  });
  const filtered = items.filter(item => (source === 'all' || source === 'managed' ? source === 'all'
    || ['work', 'schedule', 'delegation'].includes(item.source) || !isTerminalHistory(item) || item.status === 'failed' : item.source === source)
    && (view === 'all' || item.listing === view)
    && (!params.get('status') || params.get('status') === 'all' || item.status === params.get('status'))
    && (!params.get('taskId') || item.taskId === params.get('taskId'))
    && (!params.get('projectId') || item.projectId === params.get('projectId'))
    && (!params.get('id') || item.id === params.get('id'))
    && (!params.get('binding') || params.get('binding') === 'all' || item.productBinding === params.get('binding'))
    && (!params.get('originSurface') || params.get('originSurface') === 'all' || item.originSurface === params.get('originSurface'))
    && (!params.get('from') && !params.get('to') || Date.parse(item.updatedAt) >= from && Date.parse(item.updatedAt) <= to)
    && `${item.title} ${item.summary ?? ''} ${item.taskTitle ?? ''}`.toLocaleLowerCase().includes(query));
  const root = (item: ExecutionHistoryItem) => {
    let run = core.runs.find(run => run.id === (item.family === 'run' ? item.id : item.parentRunId));
    const seen = new Set<string>();
    while (run?.parentRunId && !seen.has(run.id)) { seen.add(run.id); const parent = core.runs.find(parent => parent.id === run!.parentRunId); if (!parent) break; run = parent; }
    return run?.updatedAt ?? item.updatedAt;
  };
  filtered.sort((a, b) => root(b).localeCompare(root(a)) || Number(!!a.parentRunId) - Number(!!b.parentRunId) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, allSourcesTotal: items.length, page, pageSize, revision: core.ownerLifecycle?.revision ?? 0,
    contexts: { tasks: core.tasks.map(({ id, title }) => ({ id, title })), projects: core.projects.map(({ id, title }) => ({ id, title })) } };
}
