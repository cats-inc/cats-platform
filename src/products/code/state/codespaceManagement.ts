import type { CatsCoreState } from '../../../core/types.js';
import { ownerEntry, setOwnerEntry } from '../../../core/ownerLifecycle.js';
import { CoreConflictError, CoreNotFoundError, CoreValidationError } from '../../../core/errors.js';
import { buildCodeWorkspaceDetailProjection } from '../api/projection.js';
import type { LivePreviewLeaseStore } from '../livePreview/leaseStore.js';

export type CodespaceAction = 'pin' | 'unpin' | 'rename' | 'archive' | 'restore' | 'remove';

export function codespaceRemovalBlockers(core: CatsCoreState, id: string, previews?: LivePreviewLeaseStore): string[] {
  const detail = buildCodeWorkspaceDetailProjection(core, id);
  if (!detail) return ['Codespace no longer exists.'];
  const taskIds = new Set(detail.tasks.map(task => task.id));
  const conversationIds = new Set(detail.conversations.map(conversation => conversation.id));
  for (const session of core.sessions) {
    if (typeof session.metadata.leaseCwd === 'string'
      && session.metadata.leaseCwd.replaceAll('\\', '/') === detail.workspace.path.replaceAll('\\', '/')) conversationIds.add(session.conversationId);
  }
  const blockers: string[] = [];
  for (const run of core.runs) {
    if ((run.taskId && taskIds.has(run.taskId) || run.conversationId && conversationIds.has(run.conversationId))
      && !['completed', 'failed', 'cancelled'].includes(run.status)) blockers.push(`Run: ${run.title}`);
  }
  for (const session of core.sessions) {
    if (conversationIds.has(session.conversationId) && ['connecting', 'active'].includes(session.status)) blockers.push(`Session: ${session.id}`);
  }
  for (const lease of previews?.listLeases() ?? []) {
    if ((lease.workspaceRef.rootPath.replaceAll('\\', '/') === detail.workspace.path.replaceAll('\\', '/')
      || lease.surface.kind === 'code_codespace' && lease.surface.surfaceId === id)
      && ['starting', 'ready', 'stopping'].includes(lease.status)) blockers.push(`Preview: ${lease.previewId}`);
  }
  return blockers;
}

export function applyCodespaceAction(core: CatsCoreState, id: string, input: { action: CodespaceAction; revision: number; label?: string }, previews?: LivePreviewLeaseStore): CatsCoreState {
  if (!input || typeof input !== 'object') throw new CoreValidationError('An action and revision are required.');
  if (!Number.isInteger(input.revision) || input.revision !== (core.ownerLifecycle?.revision ?? 0)) {
    throw new CoreConflictError('The list changed. Refresh and try again.', 'owner_revision_stale');
  }
  const detail = buildCodeWorkspaceDetailProjection(core, id);
  if (!detail) throw new CoreNotFoundError('Codespace not found.');
  const current = ownerEntry(core, 'codespace', id);
  if (current?.listing === 'removed' && !['restore', 'rename', 'unpin'].includes(input.action)) {
    throw new CoreConflictError('Restore this entry before changing its listing.', 'codespace_removed');
  }
  const base = { path: detail.workspace.path };
  switch (input.action) {
    case 'pin': return setOwnerEntry(core, 'codespace', id, { ...base, pinned: true, listing: 'visible' });
    case 'unpin': return setOwnerEntry(core, 'codespace', id, { ...base, pinned: false });
    case 'rename': {
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      if (!label || label.length > 200) throw new CoreValidationError('Name must contain 1–200 characters.');
      return setOwnerEntry(core, 'codespace', id, { ...base, label });
    }
    case 'archive': return setOwnerEntry(core, 'codespace', id, { ...base, listing: 'archived', pinned: false });
    case 'restore': return setOwnerEntry(core, 'codespace', id, { ...base, listing: 'visible', deleted: false });
    case 'remove': {
      const blockers = codespaceRemovalBlockers(core, id, previews);
      if (blockers.length) throw new CoreConflictError(`Stop active work before removing this entry. ${blockers.join('; ')}`, 'codespace_in_use');
      return setOwnerEntry(core, 'codespace', id, { ...base, listing: 'removed', pinned: false, label: current?.label ?? null });
    }
    default: throw new CoreValidationError('Unsupported Codespace action.');
  }
}
