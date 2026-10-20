import type { OwnerLifecycleState } from '../../../core/ownerLifecycle.js';

export const HISTORY_RETENTION_INTERVAL_MS = 60 * 60 * 1000;
export interface HistoryRetentionView {
  revision: number;
  policy: OwnerLifecycleState['retention'];
  nextCleanupAt: string | null;
  intervalMs: number;
  batchLimit: number;
}
