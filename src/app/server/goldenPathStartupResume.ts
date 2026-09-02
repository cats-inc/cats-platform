/**
 * Startup resume for transport golden-path runs (SPEC-114 FR-14, FR-29).
 *
 * A supervised Run is driven by an in-process loop. When the host dies
 * mid-flight the Core record survives but its driver does not, so the Run sits
 * in `queued` or `running` forever and the owner is left waiting for a Telegram
 * message that will never arrive. This sweep re-attaches a driver on boot.
 *
 * Two properties matter more than throughput:
 *
 *  - it only resumes work that is genuinely live and genuinely a golden-path
 *    run, so a Task created in Desktop or a finished run is never touched; and
 *  - it records the resume as an ordinary lifecycle action, so a run that
 *    completes after a restart can still be explained.
 *
 * Resuming opens a *new* provider session — the previous one died with the
 * host. That is survivable precisely because continuation is driven by the
 * outstanding acceptance gaps rather than by the agent's memory of the chat.
 */

import type { CoreStore } from '../../core/store.js';
import type { CoreRunRecord, CoreRunStatus } from '../../core/types.js';
import { readWorkGoldenPathMetadata } from '../../products/work/shared/workGoldenPathMetadata.js';
import { applyWorkGoldenPathLifecycleAction } from '../../products/work/state/workGoldenPathLifecycle.js';
import type { WorkGoldenPathRunner } from '../../products/work/state/workGoldenPathRunner.js';
import type { ResolvedServerDependencies } from './contracts.js';

/** Runs still holding a live claim on a driver that no longer exists. */
const RESUMABLE_STATUSES: ReadonlySet<CoreRunStatus> = new Set(['queued', 'running']);

/**
 * Bound on how many stranded runs one boot will pick up.
 *
 * A host that crashed repeatedly could accumulate many; starting them all at
 * once would stampede the provider on the very boot that is already recovering.
 */
const DEFAULT_MAX_RESUMED_RUNS = 5;

export interface GoldenPathStartupResumeResult {
  scanned: number;
  resumed: string[];
  skipped: number;
}

export interface ResumeGoldenPathRunsInput {
  coreStore: CoreStore;
  runner: WorkGoldenPathRunner;
  maxRuns?: number;
  now?: () => Date;
  actorRef?: string;
}

/**
 * Finds golden-path runs whose driver was lost and re-drives them.
 *
 * Driving is detached: boot must not wait for supervised work, which may take
 * minutes. The runner's own in-flight guard means a Run already being driven
 * (for instance by a Telegram retry that raced the sweep) is joined rather than
 * started twice.
 */
export async function resumeGoldenPathRuns(
  input: ResumeGoldenPathRunsInput,
): Promise<GoldenPathStartupResumeResult> {
  const core = await input.coreStore.readCore();
  const maxRuns = input.maxRuns ?? DEFAULT_MAX_RESUMED_RUNS;
  const actorRef = input.actorRef ?? 'actor-work-golden-path';

  const candidates: Array<{ run: CoreRunRecord; workItemId: string }> = [];
  for (const run of core.runs) {
    if (!RESUMABLE_STATUSES.has(run.status)) {
      continue;
    }
    const workItem = core.workItems.find((candidate) => candidate.taskId === run.taskId)
      ?? null;
    if (workItem === null) {
      continue;
    }
    const metadata = readWorkGoldenPathMetadata(workItem.metadata);
    // A Task created in Desktop has no origin and is not this sweep's business.
    if (metadata?.origin == null || metadata.proposal == null) {
      continue;
    }
    candidates.push({ run, workItemId: workItem.id });
  }

  const selected = candidates.slice(0, maxRuns);
  const resumed: string[] = [];

  for (const candidate of selected) {
    const lifecycle = await applyWorkGoldenPathLifecycleAction(
      input.coreStore,
      {
        workItemId: candidate.workItemId,
        action: 'resume',
        actorRef,
        ownerActorId: null,
        detail: 'resumed after host restart',
      },
      input.now,
    );
    if (lifecycle.status !== 'redrivable' || lifecycle.runId === null) {
      continue;
    }
    resumed.push(lifecycle.runId);
    const runId = lifecycle.runId;
    void input.runner.drive({ runId }).catch(() => {
      // `drive` records terminal state and notifies the owner itself; this
      // catch only stops an unhandled rejection from taking down boot.
    });
  }

  return {
    scanned: candidates.length,
    resumed,
    skipped: candidates.length - resumed.length,
  };
}

/**
 * The startup pass. Does nothing when the golden path is disabled or when no
 * runner exists, which is also the case for a host without a runtime client.
 */
export async function resumeGoldenPathRunsOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  const runner = dependencies.chat.transportWorkGoldenPath?.runner;
  if (!runner) {
    return;
  }
  await resumeGoldenPathRuns({
    coreStore: dependencies.work.coreStore,
    runner,
    now: dependencies.shared.now,
  });
}

/**
 * Re-drives outbound intents that were durably pending before the host stopped.
 * Rows left in `sending` are hydrated as ambiguous and deliberately excluded:
 * only an explicit owner retry may risk sending those again.
 */
export async function recoverGoldenPathDeliveriesOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  await dependencies.chat.transportWorkGoldenPath?.outbox.recoverPending();
}
