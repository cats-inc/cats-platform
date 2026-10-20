import type { CatsCoreState, CoreProjectRecord, CoreWorkItemRecord, CoreTaskRecord, CoreRunRecord, MissionRecord, CoreArtifactRecord } from './types.js';
import { CoreConflictError, CoreNotFoundError } from './errors.js';
import type { OwnerSubjectFamily } from './ownerLifecycle.js';

export type ManagedRecord = CoreProjectRecord | CoreWorkItemRecord | CoreTaskRecord | CoreRunRecord | MissionRecord | CoreArtifactRecord;
export interface OwnerDependency { family: string; id: string; title: string }

const collections = { project: 'projects', work_item: 'workItems', task: 'tasks', run: 'runs', mission: 'missions', artifact: 'artifacts' } as const;

export function getOwnerRecord(core: CatsCoreState, family: OwnerSubjectFamily, id: string): ManagedRecord | undefined {
  return family === 'codespace' ? undefined : core[collections[family]].find(record => record.id === id);
}

export function ownerRecordSource(record: ManagedRecord): string {
  const source = record.metadata.source;
  return typeof source === 'string' ? source : 'core';
}

export function ownerRecordDependencies(core: CatsCoreState, family: OwnerSubjectFamily, id: string): OwnerDependency[] {
  const dependencies: OwnerDependency[] = [];
  const field = ({ project: 'projectId', work_item: 'workItemId', task: 'taskId', run: 'runId', mission: 'missionId', artifact: 'artifactId', codespace: '' } as const)[family];
  const sources = { ...collections, trace: 'traces', checkpoint: 'checkpoints', outcome: 'outcomes', activity: 'activities', approval: 'approvalBindings', session: 'sessions' } as const;
  const metadataRefers = (value: unknown): boolean => value === id || Array.isArray(value) && value.some(metadataRefers)
    || !!value && typeof value === 'object' && Object.values(value).some(metadataRefers);
  for (const [sourceFamily, collection] of Object.entries(sources)) {
    for (const item of core[collection as typeof sources[keyof typeof sources]]) {
      if (sourceFamily === family && item.id === id) continue;
      const record = item as unknown as Record<string, unknown>;
      const metadata = item.metadata;
      const refers = !!field && (record[field] === id || metadataRefers(metadata))
        || family === 'task' && (record.parentTaskId === id || record.approvalTaskId === id)
        || family === 'work_item' && record.parentWorkItemId === id
        || family === 'run' && record.parentRunId === id
        || record.subjectKind === family && record.subjectId === id;
      if (refers) dependencies.push({ family: sourceFamily, id: item.id, title: typeof record.title === 'string' ? record.title : item.id });
    }
  }
  for (const link of core.workGraphLinks) {
    if (link.sourceRecordFamily === family && link.sourceRecordId === id || link.targetRecordFamily === family && link.targetRecordId === id) {
      dependencies.push({ family: 'link', id: link.id, title: link.kind });
    }
  }
  if (family === 'work_item') {
    const taskId = core.workItems.find(item => item.id === id)?.taskId;
    const task = taskId && core.tasks.find(item => item.id === taskId);
    if (task) dependencies.push({ family: 'task', id: task.id, title: task.title });
  }
  return dependencies;
}

export function ownerDeleteBlockers(core: CatsCoreState, family: OwnerSubjectFamily, id: string): string[] {
  const record = getOwnerRecord(core, family, id);
  if (!record) return ['Object no longer exists.'];
  const blockers: string[] = [];
  if (['chat-channel', 'chat-room-workflow'].includes(ownerRecordSource(record))) {
    blockers.push('This item is produced by its conversation. Open the source conversation or archive this item instead.');
  }
  if (['in_progress', 'pending_approval', 'running', 'queued', 'planned'].includes(record.status)
    && family !== 'project' && family !== 'work_item') blockers.push('Finish or cancel active work before deleting its record.');
  if (family === 'artifact' && record.status === 'published') blockers.push('Published evidence is protected. Archive it instead.');
  for (const dependency of ownerRecordDependencies(core, family, id)) blockers.push(`${dependency.family}: ${dependency.title}`);
  return blockers;
}

export function assertOwnerRecordDeletable(core: CatsCoreState, family: OwnerSubjectFamily, id: string): void {
  if (!getOwnerRecord(core, family, id)) throw new CoreNotFoundError('Object no longer exists.');
  const blockers = ownerDeleteBlockers(core, family, id);
  if (blockers.length) throw new CoreConflictError(`Cannot delete this item. ${blockers.join('; ')}`, 'owner_delete_blocked');
}
