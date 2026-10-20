import { createHash } from 'node:crypto';
import type { CatsCoreState, CoreWorkGraphLinkEndpointKind } from '../../../core/types.js';
import { CoreConflictError, CoreNotFoundError, CoreValidationError } from '../../../core/errors.js';
import { upsertCoreWorkGraphLink } from '../../../core/model/index.js';
import { suppressOwnerLinks } from '../../../core/ownerLifecycle.js';
import type { OwnerRelationshipView, OrphanLinkPreview } from '../shared/ownerRelationships.js';

const collections = { project: 'projects', work_item: 'workItems', task: 'tasks', run: 'runs', mission: 'missions', artifact: 'artifacts', activity: 'activities', trace: 'traces', checkpoint: 'checkpoints', outcome: 'outcomes', conversation: 'conversations' } as const;
type Family = keyof typeof collections;
const fields: Partial<Record<Family, Record<string, Family>>> = {
  project: { primaryConversationId: 'conversation' }, work_item: { projectId: 'project', taskId: 'task', parentWorkItemId: 'work_item', conversationId: 'conversation' },
  task: { parentTaskId: 'task', conversationId: 'conversation' }, run: { taskId: 'task', parentRunId: 'run', conversationId: 'conversation' }, mission: { managedWorkId: 'work_item', conversationId: 'conversation' },
  artifact: { projectId: 'project', workItemId: 'work_item', taskId: 'task', runId: 'run', conversationId: 'conversation' },
  activity: { projectId: 'project', workItemId: 'work_item', taskId: 'task', runId: 'run', artifactId: 'artifact', conversationId: 'conversation' },
  trace: { taskId: 'task', runId: 'run', conversationId: 'conversation' }, checkpoint: { taskId: 'task', runId: 'run', conversationId: 'conversation' }, outcome: { taskId: 'task', runId: 'run', conversationId: 'conversation' },
};
function records(core: CatsCoreState, family: string): Array<Record<string, unknown>> {
  if (!Object.hasOwn(collections, family)) return [];
  return core[collections[family as Family]] as unknown as Array<Record<string, unknown>>;
}
function fingerprint(core: CatsCoreState): string {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries([...Object.values(collections), 'approvalBindings', 'workGraphLinks', 'ownerLifecycle'].map(key => [key, core[key as keyof CatsCoreState]])))).digest('hex');
}
export function ownerRelationshipView(core: CatsCoreState, family: string, id: string): OwnerRelationshipView {
  const record = records(core, family).find(record => record.id === id);
  if (!record) throw new CoreNotFoundError('Object no longer exists.');
  const metadata = record.metadata as Record<string, unknown> | undefined;
  const taskIds = new Set(family === 'task' ? [id] : family === 'project' ? core.workItems.filter(item => item.projectId === id).flatMap(item => item.taskId ? [item.taskId] : []) : typeof record.taskId === 'string' ? [record.taskId] : []);
  const activeRun = core.runs.some(run => ['running', 'queued', 'blocked'].includes(run.status) && (run.id === record.runId || run.id === id && family === 'run' || !!run.taskId && taskIds.has(run.taskId)));
  const blockers = [
    ...(['chat-channel', 'chat-room-workflow'].includes(String(metadata?.source)) ? ['This relationship is controlled by its source conversation. Repair it at the source.'] : []),
    ...(activeRun || ['in_progress', 'pending_approval', 'running', 'queued'].includes(String(record.status)) ? ['Stop active execution and resolve approval before changing its anchors.'] : []),
    ...(family === 'artifact' && record.status === 'published' ? ['Published evidence must be repaired through its delivery owner.'] : []),
    ...(family === 'checkpoint' && record.status === 'open' || core.tasks.some(task => taskIds.has(task.id) && (task.status === 'pending_approval' || task.approval.status === 'pending')) ? ['Resolve the open checkpoint or pending approval before changing its evidence anchors.'] : []),
    ...(!fields[family as Family] ? ['This object has required source-owned linkage. Open its canonical workflow.'] : []),
  ];
  return { family, id, title: String(record.title ?? record.label ?? record.message ?? id), token: fingerprint(core), blockers,
    fields: Object.entries(fields[family as Family] ?? {}).map(([field, targetFamily]) => ({ field, targetFamily, current: typeof record[field] === 'string' ? record[field] as string : null,
      choices: records(core, targetFamily).filter(candidate => !(family === targetFamily && candidate.id === id)).map(candidate => ({ id: String(candidate.id), title: String(candidate.title ?? candidate.label ?? candidate.message ?? candidate.id) })) })) };
}
export function applyOwnerRelationship(core: CatsCoreState, family: string, id: string, body: Record<string, unknown>): CatsCoreState {
  const view = ownerRelationshipView(core, family, id);
  if (body.token !== view.token) throw new CoreConflictError('Relationships changed. Review again.');
  if (view.blockers.length) throw new CoreConflictError(view.blockers.join(' '));
  const field = view.fields.find(field => field.field === body.field);
  if (!field || !(body.targetId === null || typeof body.targetId === 'string' && field.choices.some(choice => choice.id === body.targetId))) throw new CoreValidationError('Choose an existing target or explicitly detach this optional anchor.');
  if (['parentTaskId', 'parentWorkItemId', 'parentRunId'].includes(field.field)) {
    let cursor: unknown = body.targetId; const visited = new Set([id]);
    while (cursor) { if (visited.has(String(cursor))) throw new CoreConflictError('This relationship would create a cycle.'); visited.add(String(cursor)); cursor = records(core, family).find(record => record.id === cursor)?.[field.field]; }
  }
  const collection = collections[family as Family];
  const next = { ...core, [collection]: records(core, family).map(record => record.id === id ? { ...record, [field.field]: body.targetId, ...('updatedAt' in record ? { updatedAt: new Date().toISOString() } : {}) } : record) } as CatsCoreState;
  if (family === 'work_item') {
    const item = next.workItems.find(item => item.id === id)!;
    if (item.parentWorkItemId && next.workItems.find(parent => parent.id === item.parentWorkItemId)?.projectId !== item.projectId || next.workItems.some(child => child.parentWorkItemId === id && child.projectId !== item.projectId)) throw new CoreConflictError('Detach or move the related Work Items into the same Project first.');
  }
  return next;
}

function isOrphan(core: CatsCoreState, link: CatsCoreState['workGraphLinks'][number]) {
  return !records(core, link.sourceRecordFamily).some(record => record.id === link.sourceRecordId) || !records(core, link.targetRecordFamily).some(record => record.id === link.targetRecordId);
}
export function previewOrphanLinks(core: CatsCoreState, input: unknown): OrphanLinkPreview {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100 || input.some(id => typeof id !== 'string')) throw new CoreValidationError('Select 1–100 orphan links.');
  const ids = [...new Set(input as string[])].sort();
  const items = ids.map(id => { const link = core.workGraphLinks.find(link => link.id === id); if (!link) throw new CoreNotFoundError('A selected link no longer exists.'); if (!isOrphan(core, link)) throw new CoreConflictError('A selected link now has valid endpoints. Review diagnostics again.'); return { id: link.id, kind: link.kind, source: `${link.sourceRecordFamily}:${link.sourceRecordId}`, target: `${link.targetRecordFamily}:${link.targetRecordId}` }; });
  return { token: createHash('sha256').update(JSON.stringify({ snapshot: fingerprint(core), ids })).digest('hex'), items };
}
export function applyOrphanLinks(core: CatsCoreState, body: Record<string, unknown>): CatsCoreState {
  const preview = previewOrphanLinks(core, body.ids);
  if (body.token !== preview.token) throw new CoreConflictError('Link diagnostics changed. Preview again.');
  return suppressOwnerLinks({ ...core, workGraphLinks: core.workGraphLinks.filter(link => !preview.items.some(item => item.id === link.id)) }, preview.items.map(item => item.id));
}
export function repairOwnerLink(core: CatsCoreState, id: string, body: Record<string, unknown>): CatsCoreState {
  const link = core.workGraphLinks.find(link => link.id === id);
  if (!link) throw new CoreNotFoundError('Link no longer exists.');
  if (body.token !== fingerprint(core)) throw new CoreConflictError('Relationships changed. Review again.');
  const source = String(body.source ?? '').split(/:(.*)/su), target = String(body.target ?? '').split(/:(.*)/su);
  if (![source[0], target[0]].every(family => ['project', 'work_item', 'task'].includes(family))) throw new CoreValidationError('Choose existing planning endpoints.');
  const next = { ...core, workGraphLinks: core.workGraphLinks.filter(candidate => candidate.id !== id) };
  const result = upsertCoreWorkGraphLink(next, { ...link, sourceRecordFamily: source[0] as CoreWorkGraphLinkEndpointKind, sourceRecordId: source[1], targetRecordFamily: target[0] as CoreWorkGraphLinkEndpointKind, targetRecordId: target[1] });
  return result.link.id === id ? result.core : suppressOwnerLinks(result.core, [id]);
}
export function ownerLinkView(core: CatsCoreState, id: string) {
  const link = core.workGraphLinks.find(link => link.id === id);
  if (!link) throw new CoreNotFoundError('Link no longer exists.');
  return { token: fingerprint(core), link, choices: (['project', 'work_item', 'task'] as const).flatMap(family => records(core, family).map(record => ({ id: `${family}:${record.id}`, title: `${family}: ${record.title}` }))) };
}
