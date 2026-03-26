import type { MemoryCompanionSurface, MemoryFlushReason, MemoryFlushResult, MemoryFlushSummary } from '../platform/memory/contracts.js';
import type { CatsMemoryService } from '../platform/memory/service.js';
import {
  appendMemoryMaintenanceActivity,
  syncCanonicalCompanionMemoryBestEffort,
  syncCanonicalOwnerMemoryBestEffort,
  syncCanonicalScopedMemoryBestEffort,
} from '../platform/memory/maintenance.js';
import type { CoreStore } from './store.js';

export type CoreMemoryMaintenanceActionKind =
  | 'sync_companion'
  | 'sync_owner'
  | 'sync_project'
  | 'sync_relationship';

export interface CoreMemoryMaintenanceActionResult {
  action: CoreMemoryMaintenanceActionKind;
  trigger:
    | 'companion_sync'
    | 'owner_sync'
    | 'project_sync'
    | 'relationship_sync';
  status: 'executed' | 'deferred';
  subject: {
    kind: 'cat' | 'owner' | 'project' | 'relationship';
    id: string;
  };
  reason: MemoryFlushReason;
  flush: MemoryFlushResult | null;
  summary: MemoryFlushSummary | null;
  error: string | null;
}

export async function executeCoreMemoryMaintenanceAction(input: {
  action: CoreMemoryMaintenanceActionKind;
  coreStore: CoreStore;
  memoryService: CatsMemoryService;
  companionStore?: MemoryCompanionSurface;
  catId?: string;
  projectId?: string;
  relationshipId?: string;
  reason?: MemoryFlushReason;
  now?: Date;
}): Promise<CoreMemoryMaintenanceActionResult> {
  const now = input.now ?? new Date();

  if (input.action === 'sync_companion') {
    if (!input.catId) {
      throw new Error('catId is required for sync_companion');
    }
    if (!input.companionStore) {
      throw new Error('companionStore is required for sync_companion');
    }

    const result = await syncCanonicalCompanionMemoryBestEffort({
      catId: input.catId,
      companionStore: input.companionStore,
      memoryService: input.memoryService,
      reason: input.reason ?? 'manual',
      now,
    });
    const output: CoreMemoryMaintenanceActionResult = {
      action: 'sync_companion',
      trigger: 'companion_sync',
      status: result.status === 'synced' ? 'executed' : 'deferred',
      subject: {
        kind: 'cat',
        id: input.catId,
      },
      reason: input.reason ?? 'manual',
      flush: result.flush,
      summary: result.summary,
      error: result.status === 'synced' ? null : result.error,
    };

    await appendMemoryMaintenanceActivity({
      coreStore: input.coreStore,
      trigger: output.trigger,
      status: output.status,
      catId: input.catId,
      reason: output.reason,
      summary: output.summary,
      flushes: output.flush ? [output.flush] : null,
      error: output.error,
      now,
    });

    return output;
  }

  if (input.action === 'sync_project' || input.action === 'sync_relationship') {
    const subjectKind = input.action === 'sync_project' ? 'project' : 'relationship';
    const subjectId = input.action === 'sync_project'
      ? input.projectId
      : input.relationshipId;
    if (!subjectId) {
      throw new Error(
        input.action === 'sync_project'
          ? 'projectId is required for sync_project'
          : 'relationshipId is required for sync_relationship',
      );
    }

    const result = await syncCanonicalScopedMemoryBestEffort({
      subjectKind,
      subjectId,
      memoryService: input.memoryService,
      reason: input.reason ?? 'manual',
      now,
    });
    const output: CoreMemoryMaintenanceActionResult = {
      action: input.action,
      trigger: input.action === 'sync_project' ? 'project_sync' : 'relationship_sync',
      status: result.status === 'synced' ? 'executed' : 'deferred',
      subject: {
        kind: subjectKind,
        id: subjectId,
      },
      reason: input.reason ?? 'manual',
      flush: result.flush,
      summary: result.summary,
      error: result.status === 'synced' ? null : result.error,
    };

    await appendMemoryMaintenanceActivity({
      coreStore: input.coreStore,
      trigger: output.trigger,
      status: output.status,
      projectId: subjectKind === 'project' ? subjectId : null,
      relationshipId: subjectKind === 'relationship' ? subjectId : null,
      reason: output.reason,
      summary: output.summary,
      flushes: output.flush ? [output.flush] : null,
      error: output.error,
      now,
    });

    return output;
  }

  const result = await syncCanonicalOwnerMemoryBestEffort({
    memoryService: input.memoryService,
    reason: input.reason ?? 'manual',
    now,
  });
  const output: CoreMemoryMaintenanceActionResult = {
    action: 'sync_owner',
    trigger: 'owner_sync',
    status: result.status === 'synced' ? 'executed' : 'deferred',
    subject: {
      kind: 'owner',
      id: 'actor-owner',
    },
    reason: input.reason ?? 'manual',
    flush: result.flush,
    summary: result.summary,
    error: result.status === 'synced' ? null : result.error,
  };

  await appendMemoryMaintenanceActivity({
    coreStore: input.coreStore,
    trigger: output.trigger,
    status: output.status,
    reason: output.reason,
    summary: output.summary,
    flushes: output.flush ? [output.flush] : null,
    error: output.error,
    now,
  });

  return output;
}
