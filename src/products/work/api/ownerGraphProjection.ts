import type { CatsCoreState } from '../../../core/types.js';
import type { WorkGraphDiagnostic, WorkGraphObjectSummary } from '../shared/workGraphTypes.js';
import { resolveTaskProductBinding } from './projectionSupport.js';
import { executionSource } from '../state/historyManagement.js';

export function ownerManagedObject(core: CatsCoreState, object: WorkGraphObjectSummary): boolean {
  if (object.kind === 'run' || object.kind === 'mission') {
    const record = (object.kind === 'run' ? core.runs : core.missions).find(record => record.id === object.sourceRecordId);
    return !!record && (['work', 'schedule', 'delegation'].includes(executionSource(record)) || ['failed', 'blocked'].includes(record.status));
  }
  if (object.kind === 'conversation') return core.conversations.some(conversation => conversation.id === object.sourceRecordId && conversation.kind === 'work_thread');
  if (object.kind === 'task' || object.kind === 'work_item') return !['chat-channel', 'chat-room-workflow'].includes(String(object.metadata?.source)) || object.metadata?.originSurface === 'work' || object.productBinding === 'work';
  return true;
}

export function ownerCanonicalPath(core: CatsCoreState, object: WorkGraphObjectSummary): string | null {
  const id = encodeURIComponent(object.sourceRecordId);
  if (object.kind === 'project') return `/work/projects/${id}`;
  if (object.kind === 'work_item') return `/work/work-items/${id}`;
  if (object.kind === 'task') { const task = core.tasks.find(task => task.id === object.sourceRecordId); return task && resolveTaskProductBinding(core, task) === 'code' ? `/code/tasks/${id}` : `/work/tasks/${id}`; }
  if (object.kind === 'run') return `/work/tasks/${encodeURIComponent(object.linkedTaskId ?? 'orphan')}/runs/${id}`;
  if (object.kind === 'mission') return `/work/missions/${id}`;
  if (object.kind === 'artifact') return `/code/artifacts/${id}`;
  const conversation = core.conversations.find(conversation => conversation.id === (object.kind === 'conversation' ? object.sourceRecordId : object.linkedConversationId));
  if (conversation?.sourceChannelId) {
    const surface = conversation.kind === 'code_thread' ? 'code' : conversation.kind === 'work_thread' ? 'work' : 'chat';
    return `/${surface}/chats/${encodeURIComponent(conversation.sourceChannelId)}`;
  }
  if (object.linkedTaskId) return `/work/tasks/${encodeURIComponent(object.linkedTaskId)}`;
  return null;
}

/** Diagnose actual persisted anchors, without treating intentional room/schedule/delegation ownership as an orphan Run. */
export function ownerAnchorDiagnostics(core: CatsCoreState): WorkGraphDiagnostic[] {
  const out: WorkGraphDiagnostic[] = [];
  const collections = { project: core.projects, work_item: core.workItems, task: core.tasks, run: core.runs, mission: core.missions, artifact: core.artifacts, conversation: core.conversations, trace: core.traces };
  const references = { projectId: 'project', workItemId: 'work_item', managedWorkId: 'work_item', taskId: 'task', runId: 'run', conversationId: 'conversation', primaryConversationId: 'conversation', parentTaskId: 'task', parentWorkItemId: 'work_item', parentRunId: 'run', sourceTraceId: 'trace' } as const;
  const all = { ...collections, activity: core.activities, checkpoint: core.checkpoints, outcome: core.outcomes };
  for (const [family, rows] of Object.entries(all)) for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    for (const [field, targetFamily] of Object.entries(references)) {
      const target = record[field];
      if (typeof target === 'string' && !collections[targetFamily as keyof typeof collections].some(candidate => candidate.id === target)) out.push({ id: `owner-broken:${family}:${row.id}:${field}`, objectId: row.id, repairSubject: { family, id: row.id }, severity: 'warning', category: 'anchor', kind: 'broken_fk', message: `A ${targetFamily} anchor is missing: ${target}. Choose an existing record or detach this optional relationship.` });
    }
    if (family === 'work_item' && !record.projectId) out.push({ id: `owner-unanchored-work:${row.id}`, objectId: row.id, repairSubject: { family, id: row.id }, severity: 'info', category: 'anchor', kind: 'missing_project_anchor', message: 'This Work Item has no Project. Assign a Project when this work is ready to be organized.' });
    if (family === 'artifact' && !record.projectId && !record.workItemId && !record.taskId && !record.runId && !record.conversationId) out.push({ id: `owner-unanchored-artifact:${row.id}`, objectId: row.id, repairSubject: { family, id: row.id }, severity: 'info', category: 'anchor', kind: 'unanchored_evidence', message: 'This artifact has no work or conversation context.' });
    if (family === 'run' && !record.taskId && !record.conversationId && !(record.metadata as Record<string, unknown>)?.missionId && !(record.metadata as Record<string, unknown>)?.projectId) {
      const metadata = record.metadata as { scheduleTrigger?: unknown; supervision?: { relay?: unknown } } | undefined;
      if (!metadata?.scheduleTrigger && !metadata?.supervision?.relay) out.push({ id: `owner-unanchored-run:${row.id}`, objectId: row.id, repairSubject: { family, id: row.id }, severity: 'info', category: 'anchor', kind: 'unanchored_run', message: 'This attempt has no Task, conversation, Mission, schedule or delegation context.' });
    }
  }
  for (const binding of core.approvalBindings) {
    const rows = all[binding.subjectKind as keyof typeof all];
    if (rows && !rows.some(record => record.id === binding.subjectId)) out.push({ id: `owner-gate-subject:${binding.id}`, objectId: binding.id, repairSubject: { family: 'task', id: binding.approvalTaskId }, severity: 'error', category: 'anchor', kind: 'missing_gate_subject', message: 'The approval subject is missing. Resolve this gate through its approval Task before moving or retiring its evidence.' });
  }
  return out;
}
