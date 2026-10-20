import { createHash } from 'node:crypto';
import type { CatsCoreState, CoreTaskRecord } from './types.js';
import type { OwnerActionView, PlanningOwnerAction, PlanningOwnerFamily } from './ownerActionContracts.js';
import { getOwnerRecord, ownerDeleteBlockers, ownerRecordDependencies, ownerRecordSource } from './ownerManagement.js';
import { CoreConflictError, CoreNotFoundError, CoreValidationError } from './errors.js';
import { ownerEntry, setOwnerEntry } from './ownerLifecycle.js';
import { applyOwnerLifecycleProjection } from './ownerLifecycleProjection.js';
import { upsertCoreProject, upsertCoreWorkItem, upsertCoreTask, upsertCoreArtifact } from './model/index.js';

const collections = { project: 'projects', work_item: 'workItems', task: 'tasks', artifact: 'artifacts' } as const;
const terminal = (status: string) => ['completed', 'failed', 'cancelled'].includes(status);
const token = (core: CatsCoreState) => createHash('sha256').update(JSON.stringify(core)).digest('hex');

export function ownerActionView(core: CatsCoreState, family: PlanningOwnerFamily, id: string): OwnerActionView {
  const record = getOwnerRecord(core, family, id);
  if (!record) throw new CoreNotFoundError('Object no longer exists.');
  const source = ownerRecordSource(record);
  const derived = ['chat-channel', 'chat-room-workflow'].includes(source);
  const dependencies = ownerRecordDependencies(core, family, id);
  const taskIds = new Set(family === 'task' ? [id] : core.workItems.filter(item => family === 'project' ? item.projectId === id : item.id === id).flatMap(item => item.taskId ? [item.taskId] : []));
  const active = core.runs.some(run => !terminal(run.status) && (run.taskId && taskIds.has(run.taskId) || dependencies.some(dep => dep.family === 'run' && dep.id === run.id)))
    ;
  const pendingApproval = core.approvalBindings.some(binding => (binding.subjectId === id || taskIds.has(binding.approvalTaskId)) && core.tasks.some(task => task.id === binding.approvalTaskId && task.approval.status === 'pending'))
    || family === 'task' && (record as CoreTaskRecord).approval.status === 'pending';
  const gated = !!record.metadata.workGoldenPath || !!record.metadata.supervision || source === 'transport-work';
  const common = [...(derived ? ['Controlled by its source conversation. Use the source controls.'] : []), ...(active ? ['Active execution must be stopped through its execution owner first.'] : []), ...(pendingApproval ? ['Resolve the pending approval first.'] : [])];
  const actions: OwnerActionView['actions'] = [{ action: 'edit', blockers: family === 'artifact' ? [] : [...common] }, { action: 'archive', blockers: active || pendingApproval || ['in_progress', 'pending_approval'].includes(record.status) ? ['Active work must remain reachable. Stop it first.'] : [] }, { action: 'restore', blockers: [] }, { action: 'delete', blockers: ownerDeleteBlockers(core, family, id) }];
  if (family === 'project') actions.push({ action: record.status === 'paused' ? 'resume' : 'pause', blockers: common });
  if (family === 'task' || family === 'work_item') {
    const linkedTask = family === 'work_item' ? core.tasks.find(task => task.id === core.workItems.find(item => item.id === id)?.taskId) : null;
    actions.push({ action: 'complete', blockers: [...common, ...(gated ? ['Use the supervised acceptance/delivery workflow to complete this work.'] : []), ...(linkedTask && linkedTask.status !== 'completed' ? ['Complete the linked Task and its acceptance first.'] : [])] },
      { action: 'reopen', blockers: [...common, ...(gated ? ['Use the source workflow recovery controls.'] : []), ...(!['completed', 'cancelled'].includes(record.status) ? ['Only completed or cancelled work can be reopened.'] : [])] },
      { action: 'cancel', blockers: [...common, ...(gated ? ['Use the source workflow cancellation controls.'] : [])] });
  }
  const metadata = record.metadata;
  const renderer = metadata.workRenderer && typeof metadata.workRenderer === 'object' ? metadata.workRenderer as Record<string, unknown> : metadata;
  const channelId = typeof metadata.channelId === 'string' ? metadata.channelId : 'conversationId' in record && record.conversationId ? core.conversations.find(conversation => conversation.id === record.conversationId)?.sourceChannelId : null;
  return { family, id, token: token(core), title: record.title, summary: record.summary, status: record.status, listing: ownerEntry(core, family, id)?.listing ?? 'visible', source,
    sourcePath: channelId ? `/chat/chats/${encodeURIComponent(channelId)}` : null,
    assignedActorIds: 'assignedActorIds' in record ? record.assignedActorIds : [], projectId: 'projectId' in record ? record.projectId : null,
    parentId: 'parentTaskId' in record ? record.parentTaskId ?? null : 'parentWorkItemId' in record ? record.parentWorkItemId : null,
    priority: typeof renderer.priority === 'string' ? renderer.priority : '', acceptanceCriteria: typeof renderer.acceptanceCriteria === 'string' ? renderer.acceptanceCriteria : null,
    actions, dependencies, choices: { projects: core.projects.map(item => ({ id: item.id, title: item.title })), parents: (family === 'task' ? core.tasks : family === 'work_item' ? core.workItems : []).filter(item => item.id !== id).map(item => ({ id: item.id, title: item.title })), actors: core.actors.filter(actor => actor.status === 'active').map(actor => ({ id: actor.id, title: actor.name })) } };
}

export function applyOwnerAction(core: CatsCoreState, family: PlanningOwnerFamily, id: string, body: Record<string, unknown>): CatsCoreState {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CoreValidationError('An owner command is required.');
  const view = ownerActionView(core, family, id);
  if (body.token !== view.token) throw new CoreConflictError('The object or its dependencies changed. Refresh and review again.', 'owner_revision_stale');
  const action = body.action as PlanningOwnerAction;
  const capability = view.actions.find(item => item.action === action);
  if (!capability) throw new CoreValidationError('Unsupported owner action.');
  if (capability.blockers.length) throw new CoreConflictError(capability.blockers.join(' '), 'owner_action_blocked');
  if (action === 'archive' || action === 'restore') return setOwnerEntry(core, family, id, { listing: action === 'archive' ? 'archived' : 'visible' });
  if (action === 'delete') return applyOwnerLifecycleProjection(setOwnerEntry(core, family, id, { deleted: true, listing: 'removed', pinned: false }));
  const record = getOwnerRecord(core, family, id)!;
  if (action === 'complete' && view.acceptanceCriteria && (body.acceptanceConfirmed !== true || typeof body.acceptanceNote !== 'string' || !body.acceptanceNote.trim())) throw new CoreValidationError('Review the acceptance criteria and record the evidence before completing.');
  const patch: Record<string, unknown> = { id, title: record.title, metadata: record.metadata };
  if (action === 'edit') {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) throw new CoreValidationError('Title must contain 1–200 characters.');
    if (typeof body.summary !== 'string' || body.summary.length > 12000) throw new CoreValidationError('Summary must be text up to 12000 characters.');
    patch.title = body.title.trim(); patch.summary = body.summary.trim() || null;
    if (family === 'task' || family === 'work_item') {
      if (!Array.isArray(body.assignedActorIds) || body.assignedActorIds.some(id => typeof id !== 'string' || !view.choices.actors.some(actor => actor.id === id))) throw new CoreValidationError('Choose existing active actors.');
      patch.assignedActorIds = [...new Set(body.assignedActorIds)];
      const parentId = body.parentId || null;
      if (parentId !== null && !view.choices.parents.some(parent => parent.id === parentId)) throw new CoreValidationError('Choose an existing parent.');
      let cursor: unknown = parentId; const visited = new Set([id]);
      while (cursor) { if (visited.has(String(cursor))) throw new CoreConflictError('This parent would create a cycle.'); visited.add(String(cursor)); const parent = core[family === 'task' ? 'tasks' : 'workItems'].find(item => item.id === cursor); cursor = parent && ('parentTaskId' in parent ? parent.parentTaskId : 'parentWorkItemId' in parent ? parent.parentWorkItemId : null); }
      patch[family === 'task' ? 'parentTaskId' : 'parentWorkItemId'] = parentId;
      if (family === 'work_item') {
        const projectId = body.projectId || null;
        if (projectId !== null && !view.choices.projects.some(project => project.id === projectId)) throw new CoreValidationError('Choose an existing Project.');
        const parent = core.workItems.find(item => item.id === parentId);
        if (parent && parent.projectId !== projectId) throw new CoreConflictError('The parent must belong to the selected Project.');
        if (core.workItems.some(item => item.parentWorkItemId === id && item.projectId !== projectId)) throw new CoreConflictError('Move or detach child Work Items before moving their parent.');
        patch.projectId = projectId;
      }
      if (!['', 'urgent', 'high', 'medium', 'low'].includes(String(body.priority ?? ''))) throw new CoreValidationError('Invalid priority.');
      patch.metadata = { ...record.metadata, priority: body.priority || null, workRenderer: { ...(record.metadata.workRenderer as object ?? {}), priority: body.priority || null } };
    }
  } else patch.status = ({ pause: 'paused', resume: 'active', complete: 'completed', reopen: 'draft', cancel: 'cancelled' } as const)[action];
  if (action === 'complete') patch.metadata = { ...record.metadata, ownerAcceptance: { confirmedAt: new Date().toISOString(), note: body.acceptanceNote ?? null } };
  let next: CatsCoreState;
  if (family === 'project') next = upsertCoreProject(core, patch as unknown as Parameters<typeof upsertCoreProject>[1]).core;
  else if (family === 'work_item') next = upsertCoreWorkItem(core, patch as unknown as Parameters<typeof upsertCoreWorkItem>[1]).core;
  else if (family === 'task') next = upsertCoreTask(core, patch as unknown as Parameters<typeof upsertCoreTask>[1]).core;
  else next = upsertCoreArtifact(core, { ...patch, kind: core.artifacts.find(item => item.id === id)!.kind } as unknown as Parameters<typeof upsertCoreArtifact>[1]).core;
  return setOwnerEntry(next, family, id, { label: String(patch.title) });
}

export function listOwnerRecords(core: CatsCoreState, family: PlanningOwnerFamily) {
  return core[collections[family]].map(record => ({ id: record.id, title: record.title, listing: ownerEntry(core, family, record.id)?.listing ?? (record.status === 'archived' ? 'archived' : 'visible') }));
}
