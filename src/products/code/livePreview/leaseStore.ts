import type { LivePreviewLease } from './contracts.js';

export interface LivePreviewLeaseStore {
  listLeases(): LivePreviewLease[];
  getLease(previewId: string): LivePreviewLease | null;
  readLogs(previewId: string): string | null;
}

export class InMemoryLivePreviewLeaseStore implements LivePreviewLeaseStore {
  private readonly leases = new Map<string, LivePreviewLease>();
  private readonly logs = new Map<string, string>();

  listLeases(): LivePreviewLease[] {
    return [...this.leases.values()].map(cloneLease);
  }

  getLease(previewId: string): LivePreviewLease | null {
    const lease = this.leases.get(previewId);
    return lease ? cloneLease(lease) : null;
  }

  upsertLease(lease: LivePreviewLease): void {
    this.leases.set(lease.previewId, cloneLease(lease));
  }

  updateLease(
    previewId: string,
    updater: (lease: LivePreviewLease) => LivePreviewLease,
  ): LivePreviewLease | null {
    const current = this.leases.get(previewId);
    if (!current) {
      return null;
    }
    const next = updater(cloneLease(current));
    this.upsertLease(next);
    return cloneLease(next);
  }

  readLogs(previewId: string): string | null {
    return this.logs.get(previewId) ?? null;
  }

  setLogs(previewId: string, logs: string): void {
    this.logs.set(previewId, logs);
  }
}

function cloneLease(lease: LivePreviewLease): LivePreviewLease {
  return {
    ...lease,
    surface: { ...lease.surface },
    workspaceRef: { ...lease.workspaceRef },
  };
}
