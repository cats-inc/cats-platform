/**
 * Run lifecycle actions for the golden path (SPEC-114 FR-29, FR-35).
 *
 * Timeout, retry, and resume all reduce to one question: may this Run be
 * driven again, and what does the authoritative record say happened? Core's
 * `CoreRunStatus` stays the answer — these transitions move it, record why, and
 * refuse the moves that would resurrect finished work.
 *
 * Retry and resume are deliberately different. Retry says "that attempt did not
 * work, start the loop again" and is only valid from a stuck state. Resume says
 * "nothing is driving this any more" — the usual cause being a host restart
 * while the Run was mid-flight — and is only valid from a live one.
 */

import { appendCoreActivity, upsertCoreRun } from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { CoreRunRecord, CoreRunStatus } from '../../../core/types.js';
import { readWorkGoldenPathMetadata } from '../shared/workGoldenPathMetadata.js';

export const WORK_GOLDEN_PATH_LIFECYCLE_METADATA_KEY = 'workGoldenPathLifecycle';

export type WorkGoldenPathLifecycleAction = 'retry' | 'resume' | 'timeout';

export type WorkGoldenPathLifecycleStatus =
  | 'redrivable'
  | 'recorded'
  | 'refused';

export interface WorkGoldenPathLifecycleResult {
  status: WorkGoldenPathLifecycleStatus;
  action: WorkGoldenPathLifecycleAction;
  runId: string | null;
  runStatus: CoreRunStatus | null;
  reason: string | null;
}

export interface ApplyWorkGoldenPathLifecycleInput {
  workItemId: string;
  action: WorkGoldenPathLifecycleAction;
  actorRef: string;
  /** Who asked. Absent for `timeout`, which nobody asks for. */
  ownerActorId?: string | null;
  /** Free-text cause, recorded on the Run for `timeout`. */
  detail?: string | null;
}

/** States a stalled attempt can be retried from. */
const RETRYABLE: ReadonlySet<CoreRunStatus> = new Set(['blocked', 'failed']);

/** States that still represent a live attempt, so resume can re-drive them. */
const RESUMABLE: ReadonlySet<CoreRunStatus> = new Set(['queued', 'running']);

const TERMINAL: ReadonlySet<CoreRunStatus> = new Set(['completed', 'cancelled']);

function refused(
  action: WorkGoldenPathLifecycleAction,
  run: CoreRunRecord | null,
  reason: string,
): WorkGoldenPathLifecycleResult {
  return {
    status: 'refused',
    action,
    runId: run?.id ?? null,
    runStatus: run?.status ?? null,
    reason,
  };
}

function nextStatusFor(
  action: WorkGoldenPathLifecycleAction,
  current: CoreRunStatus,
): CoreRunStatus {
  if (action === 'timeout') {
    return 'blocked';
  }
  // Retry restarts the loop from the queue; resume leaves a live run where it
  // is and simply re-attaches a driver.
  return action === 'retry' ? 'queued' : current;
}

function summaryFor(
  action: WorkGoldenPathLifecycleAction,
  detail: string | null | undefined,
): string {
  switch (action) {
    case 'timeout':
      return detail
        ? `Supervised step timed out: ${detail}`
        : 'Supervised step timed out.';
    case 'retry':
      return 'Owner retried the supervised run.';
    default:
      return 'Supervised run resumed.';
  }
}

/**
 * Applies one lifecycle action to a golden-path Run.
 *
 * `redrivable` means the caller should start the runner again; `recorded` means
 * the state changed but nothing should be driven (a timeout waits for the
 * owner); `refused` means the action was invalid for the current state and
 * nothing was written.
 */
export async function applyWorkGoldenPathLifecycleAction(
  coreStore: CoreStore,
  input: ApplyWorkGoldenPathLifecycleInput,
  now: () => Date = () => new Date(),
): Promise<WorkGoldenPathLifecycleResult> {
  const core = await coreStore.readCore();
  const workItem = core.workItems.find((candidate) => candidate.id === input.workItemId)
    ?? null;
  if (workItem === null || readWorkGoldenPathMetadata(workItem.metadata) === null) {
    return refused(input.action, null, 'work_item_not_found');
  }
  const task = workItem.taskId
    ? core.tasks.find((candidate) => candidate.id === workItem.taskId) ?? null
    : null;
  const run = task
    ? core.runs.find((candidate) => candidate.taskId === task.id) ?? null
    : null;
  if (run === null) {
    return refused(input.action, null, 'run_not_found');
  }

  if (TERMINAL.has(run.status)) {
    // A completed or cancelled Run is finished. Re-driving it would produce a
    // second delivery for work the owner already saw closed.
    return refused(input.action, run, `run_${run.status}`);
  }
  if (input.action === 'retry' && !RETRYABLE.has(run.status)) {
    return refused(input.action, run, `retry_not_valid_from_${run.status}`);
  }
  if (input.action === 'resume' && !RESUMABLE.has(run.status)) {
    return refused(input.action, run, `resume_not_valid_from_${run.status}`);
  }

  const occurredAt = now().toISOString();
  const nextStatus = nextStatusFor(input.action, run.status);
  const summary = summaryFor(input.action, input.detail);

  await coreStore.updateCore((state) => {
    const current = state.runs.find((candidate) => candidate.id === run.id);
    if (!current || TERMINAL.has(current.status)) {
      return state;
    }
    const write = upsertCoreRun(
      state,
      {
        id: current.id,
        title: current.title,
        status: nextStatus,
        conversationId: current.conversationId,
        taskId: current.taskId,
        orchestratorActorId: current.orchestratorActorId,
        summary,
        startedAt: current.startedAt,
        // Reopening clears any completion stamp a previous attempt left.
        completedAt: null,
        metadata: {
          ...current.metadata,
          [WORK_GOLDEN_PATH_LIFECYCLE_METADATA_KEY]: {
            schemaVersion: 1,
            action: input.action,
            occurredAt,
            requestedByActorId: input.ownerActorId ?? null,
            previousStatus: current.status,
            detail: input.detail ?? null,
          },
        },
      },
      now(),
    );
    return appendCoreActivity(
      write.core,
      {
        id: `activity-wgp-lifecycle-${run.id}-${input.action}-${occurredAt}`,
        kind: 'status_change',
        actorId: input.ownerActorId ?? input.actorRef,
        projectId: workItem.projectId,
        workItemId: workItem.id,
        conversationId: workItem.conversationId,
        taskId: current.taskId,
        runId: current.id,
        message: summary,
        metadata: {
          [WORK_GOLDEN_PATH_LIFECYCLE_METADATA_KEY]: {
            schemaVersion: 1,
            action: input.action,
            previousStatus: current.status,
          },
        },
      },
      now(),
    ).core;
  });

  return {
    // A timeout is a state change that waits for the owner; retry and resume
    // are requests to start driving again.
    status: input.action === 'timeout' ? 'recorded' : 'redrivable',
    action: input.action,
    runId: run.id,
    runStatus: nextStatus,
    reason: null,
  };
}
