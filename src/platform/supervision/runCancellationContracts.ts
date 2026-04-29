/**
 * SPEC-096 / PLAN-085 — public Run stop and Mission cancel contract.
 *
 * Types are kept in a dedicated module so renderer/route code can pull them
 * without dragging in the future service implementation. Cross-checked
 * against `MissionRecord` and `CoreRunRecord` shapes in `src/core/types.ts`.
 */

import type { CoreRunRecord, MissionRecord } from '../../core/types.js';

export type CancellationSource =
  | 'run_stop'
  | 'mission_cancel'
  | 'schedule_replace'
  | 'task_supervised_run_cancel';

export type RuntimeAbortStatus = 'not_applicable' | 'requested' | 'failed';

export interface RuntimeAbortInfo {
  attempted: boolean;
  sessionId: string | null;
  status: RuntimeAbortStatus;
  error?: string;
}

/** Optional cancellation request body. Empty body is acceptable in v1. */
export interface WorkCancellationRequest {
  requestedByActorId?: string;
  reason?: string;
  /**
   * Caller-supplied idempotency token. The service may persist it on
   * cancellation metadata so repeated requests are detectable, but the
   * service itself is structurally idempotent for terminal records.
   */
  idempotencyKey?: string;
}

export type RunStopStatus = 'stopped' | 'already_terminal' | 'not_stoppable';

export interface WorkRunStopResponse {
  status: RunStopStatus;
  run: CoreRunRecord;
  /**
   * The mission that owns this run, when discoverable through
   * `metadata.missionId`. `null` when the run is not mission-scoped or the
   * mission record has been removed.
   */
  mission: MissionRecord | null;
  runtimeAbort: RuntimeAbortInfo;
  message: string | null;
}

export type MissionCancelStatus = 'cancelled' | 'already_terminal' | 'blocked';

export interface MissionCancelBlocker {
  runId: string;
  reason: string;
}

export interface WorkMissionCancelResponse {
  status: MissionCancelStatus;
  mission: MissionRecord;
  runResults: WorkRunStopResponse[];
  blockers: MissionCancelBlocker[];
  message: string | null;
}

/**
 * Cancellation audit metadata appended to `CoreRunRecord.metadata.cancellation`
 * (and `MissionRecord.metadata.cancellation`) by the service. Append-only so
 * retries / repeated requests don't erase prior history.
 */
export interface CoreCancellationMetadata {
  source: CancellationSource;
  commandId: string;
  requestedAt: string;
  requestedByActorId: string;
  reason: string | null;
  status: 'requested' | 'succeeded' | 'blocked';
  runtimeAbort: RuntimeAbortInfo;
}
