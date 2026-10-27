import type { CatsCoreState } from './types.js';
export type ContentOrigin = 'internal' | 'unknown' | 'external';
function origin(metadata: Record<string, unknown>): ContentOrigin {
  return metadata.contentOrigin === 'external' || metadata.externalWorkBindings || metadata.workExternalIssueImport
    ? 'external' : metadata.contentOrigin === 'internal' ? 'internal' : 'unknown';
}
/** Host-established source classification, independent of ownership and current tracker links. */
export function preserveContentOrigin(metadata: Record<string, unknown>, previous?: Record<string, unknown>, created = false): Record<string, unknown> {
  const contentOrigin = origin(metadata) === 'external' || previous && origin(previous) === 'external' ? 'external'
    : previous?.contentOrigin === 'internal' || created ? 'internal' : 'unknown';
  return { ...metadata, contentOrigin };
}
/** Planning links may carry copied context; uncertainty never grants prompt-generation permission. */
export function coreContentOrigins(core: CatsCoreState): Map<string, ContentOrigin> {
  const records = [...core.projects, ...core.workItems, ...core.tasks];
  const origins = new Map(records.map(record => [record.id, origin(record.metadata)]));
  for (const conversation of core.conversations) origins.set(conversation.id,
    ['direct_message', 'external_transport', 'private_escalation'].includes(conversation.kind) ? 'external' : 'internal');
  for (const activity of core.activities) {
    if (activity.metadata.workExternalBinding || activity.metadata.workExternalIssueImport) {
      if (activity.projectId) origins.set(activity.projectId, 'external');
      if (activity.workItemId) origins.set(activity.workItemId, 'external');
    }
  }
  const inherit = (child: string, parent?: string | null): boolean => {
    if (!parent) return false;
    const source = origins.get(parent) ?? 'unknown', current = origins.get(child) ?? 'unknown';
    if (current === 'external' || source === 'internal' || current === 'unknown' && source === 'unknown') return false;
    origins.set(child, source); return true;
  };
  for (let pass = 0; pass <= records.length; pass++) {
    let changed = false;
    for (const project of core.projects) changed = inherit(project.id, project.primaryConversationId) || changed;
    for (const item of core.workItems) {
      changed = inherit(item.id, item.conversationId) || changed;
      changed = inherit(item.id, item.projectId) || changed;
      changed = inherit(item.id, item.parentWorkItemId) || changed;
      if (item.taskId) changed = inherit(item.taskId, item.id) || changed;
    }
    for (const task of core.tasks) {
      changed = inherit(task.id, task.parentTaskId) || changed;
      changed = inherit(task.id, task.conversationId) || changed;
    }
    for (const link of core.workGraphLinks) {
      changed = inherit(link.targetRecordId, link.sourceRecordId) || changed;
      changed = inherit(link.sourceRecordId, link.targetRecordId) || changed;
    }
    if (!changed) break;
  }
  return origins;
}
/** Keep observed inherited provenance when a later mutation removes its source link. */
export function preserveInheritedContentOrigins(core: CatsCoreState): CatsCoreState {
  const origins = coreContentOrigins(core);
  const apply = <T extends { id: string; metadata: Record<string, unknown> }>(records: T[]): T[] => {
    return records.map(record => {
      const derived = origins.get(record.id);
      return derived && derived !== 'internal' && record.metadata.contentOrigin === 'internal'
        || derived === 'external' && origin(record.metadata) !== 'external'
        ? { ...record, metadata: { ...record.metadata, contentOrigin: derived } } : record;
    });
  };
  return { ...core, projects: apply(core.projects), workItems: apply(core.workItems), tasks: apply(core.tasks) };
}
