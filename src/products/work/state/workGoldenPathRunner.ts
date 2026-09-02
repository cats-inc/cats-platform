/**
 * The supervised-run driver for the golden path (SPEC-114 FR-28..FR-31,
 * PLAN-105 Phase 4).
 *
 * Before this module the run loop stopped after one provider response: the Run
 * was marked `running`, a handoff decision was recorded, and nothing consumed
 * it. That is the seam this closes.
 *
 * The controlling rule is FR-30. A provider step returning successfully is
 * evidence that a *step* returned, never that the goal was met, so the provider
 * is never allowed to declare completion. After every step Cats re-evaluates
 * the acceptance criteria itself and either continues with the gaps as the next
 * instruction, or accepts terminal evidence. That inversion is what stops
 * "I have finished the task." from ending a run.
 */

import {
  appendCoreActivity,
  upsertCoreCheckpoint,
  upsertCoreRun,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type {
  CoreDeliveryMode,
  CoreRunStatus,
  CoreRunRecord,
  ExecutionTargetSummary,
} from '../../../core/types.js';
import type { SupervisionToolScope } from '../../../platform/supervision/contracts.js';
import type { TransportWorkStage } from '../../../platform/transports/work-delivery/contracts.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import {
  evaluateWorkCompletionEvidence,
  type WorkCommitEvidence,
  type WorkCompletionEvidenceGap,
  type WorkCompletionEvidenceResult,
} from './workCompletionEvidence.js';
import { readWorkGoldenPathMetadata } from '../shared/workGoldenPathMetadata.js';
import { applyWorkGoldenPathLifecycleAction } from './workGoldenPathLifecycle.js';
import { readWorkGoldenPathExecutionSnapshot } from './workGoldenPathAdmission.js';
import type { WorkGoldenPathService } from './workGoldenPathService.js';

/** Default step ceiling. Bounded so a looping agent cannot run forever. */
const DEFAULT_MAX_STEPS = 6;

/** Default wall-clock ceiling for one step. */
const DEFAULT_STEP_TIMEOUT_MS = 10 * 60 * 1000;

/** Sentinel resolved by the deadline race; never produced by an executor. */
const STEP_TIMED_OUT = Symbol('work-golden-path-step-timeout');

/** Where a refusal is recorded on the Run, for the Desktop read model. */
export const WORK_GOLDEN_PATH_DENIAL_METADATA_KEY = 'workGoldenPathDenial';

export interface WorkGoldenPathArtifactEvidence {
  title: string;
  path: string | null;
  mimeType: string | null;
  /** Runtime-owned location from which a later gated publish must resume. */
  deliveryWorkspacePath?: string | null;
  /** Runtime session that materialized the artifact. */
  deliverySessionId?: string | null;
}

export interface WorkGoldenPathStepContext {
  runId: string;
  taskId: string | null;
  workItemId: string;
  /** Zero-based; step 0 opens the session. */
  stepIndex: number;
  goal: string;
  acceptanceCriteria: readonly string[];
  deliveryMode: CoreDeliveryMode;
  workspacePath: string | null;
  executionTarget?: ExecutionTargetSummary | null;
  toolScope?: SupervisionToolScope;
  workspaceHeadOid?: string | null;
  /**
   * What was still missing after the previous step.
   *
   * This is the whole continuation signal: the executor turns it into the next
   * instruction, so the agent is told what remains rather than asked again.
   */
  outstandingGaps: readonly WorkCompletionEvidenceGap[];
  outstandingCriteria: readonly string[];
}

/**
 * A step refused by the supervision boundary rather than by the provider.
 *
 * Kept distinct from a generic failure because the remedy is different: no
 * amount of retrying helps until the owner widens the permission envelope, so
 * the owner has to be told *what* to grant, not that "something went wrong".
 */
export interface WorkGoldenPathPermissionDenial {
  /** The supervised tool that was refused. */
  toolName: string;
  /** The boundary's rejection code, e.g. `E_TOOL_SCOPE_DENIED`. */
  code: string;
}

export interface WorkGoldenPathStepResult {
  /**
   * `continue` and `claims_complete` are both non-terminal from Cats' point of
   * view; only the evidence check can end a run successfully.
   */
  status: 'continue' | 'claims_complete' | 'blocked' | 'permission_denied' | 'failed';
  summary: string;
  /** Criteria the step claims to have satisfied. Verified, never trusted. */
  satisfiedCriteria: readonly string[];
  artifact: WorkGoldenPathArtifactEvidence | null;
  commit: WorkCommitEvidence | null;
  blockedReason: string | null;
  /** Present only when `status` is `permission_denied`. */
  denial?: WorkGoldenPathPermissionDenial | null;
}

export type WorkGoldenPathStepExecutor = (
  context: WorkGoldenPathStepContext,
) => Promise<WorkGoldenPathStepResult>;

export type WorkGoldenPathRunStatus =
  | 'delivered'
  | 'result_ready'
  | 'blocked'
  | 'permission_denied'
  | 'timed_out'
  | 'failed'
  | 'cancelled'
  | 'not_runnable';

export interface WorkGoldenPathRunOutcome {
  status: WorkGoldenPathRunStatus;
  steps: number;
  evidence: WorkCompletionEvidenceResult | null;
  stage: TransportWorkStage | null;
  reason: string | null;
}

export interface WorkGoldenPathRunnerOptions {
  coreStore: CoreStore;
  service: WorkGoldenPathService;
  executeStep: WorkGoldenPathStepExecutor;
  maxSteps?: number;
  /**
   * Wall-clock ceiling for a single step.
   *
   * A provider call cannot be cancelled from here, so a timed-out step is
   * abandoned rather than killed: the Run is blocked for the owner and the
   * terminal-state guard makes the late result harmless if it ever arrives.
   */
  stepTimeoutMs?: number;
  now?: () => Date;
}

export interface WorkGoldenPathRunner {
  /**
   * Drives one Run to a terminal or owner-blocking state.
   *
   * Safe to call concurrently for the same Run: a second call joins the first
   * rather than starting a second execution. Admission, an owner retry, and the
   * startup sweep can all fire for one Run, and none of them can know about the
   * others.
   */
  drive(input: { runId: string }): Promise<WorkGoldenPathRunOutcome>;
}

const TERMINAL_RUN_STATUSES: ReadonlySet<CoreRunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

/** Accumulated across steps: evidence produced early must not be lost later. */
interface AccumulatedEvidence {
  satisfiedCriteria: Set<string>;
  artifact: WorkGoldenPathArtifactEvidence | null;
  commit: WorkCommitEvidence | null;
  summary: string;
}

export function createWorkGoldenPathRunner(
  options: WorkGoldenPathRunnerOptions,
): WorkGoldenPathRunner {
  const now = options.now ?? (() => new Date());
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const stepTimeoutMs = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const { coreStore, service, executeStep } = options;
  const inFlight = new Map<string, Promise<WorkGoldenPathRunOutcome>>();

  /**
   * Runs one step against a deadline.
   *
   * The timer is cleared on the normal path so a finished run does not hold the
   * event loop open for the remainder of its budget.
   */
  async function executeStepWithDeadline(
    context: WorkGoldenPathStepContext,
  ): Promise<WorkGoldenPathStepResult | typeof STEP_TIMED_OUT> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        executeStep(context),
        new Promise<typeof STEP_TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(STEP_TIMED_OUT), stepTimeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  async function readRun(runId: string): Promise<CoreRunRecord | null> {
    const core = await coreStore.readCore();
    return core.runs.find((candidate) => candidate.id === runId) ?? null;
  }

  /**
   * Writes a run status unless the run already reached a terminal state.
   *
   * A late runtime event must never resurrect a cancelled or failed run
   * (SPEC-114 FR-29, PLAN-105 Phase 4), and a cancellation that lands mid-step
   * must win over the step that was already in flight.
   */
  async function writeNonTerminalStatus(input: {
    runId: string;
    status: CoreRunStatus;
    summary: string;
  }): Promise<{ applied: boolean; run: CoreRunRecord | null }> {
    let applied = false;
    let resolved: CoreRunRecord | null = null;
    await coreStore.updateCore((core) => {
      const run = core.runs.find((candidate) => candidate.id === input.runId);
      if (!run) {
        return core;
      }
      resolved = run;
      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        return core;
      }
      const write = upsertCoreRun(
        core,
        {
          id: run.id,
          title: run.title,
          status: input.status,
          conversationId: run.conversationId,
          taskId: run.taskId,
          orchestratorActorId: run.orchestratorActorId,
          summary: input.summary,
          startedAt: run.startedAt ?? (input.status === 'running' ? now().toISOString() : null),
          completedAt: TERMINAL_RUN_STATUSES.has(input.status)
            ? now().toISOString()
            : run.completedAt,
          metadata: run.metadata,
        },
        now(),
      );
      applied = true;
      resolved = write.run;
      return write.core;
    });
    return { applied, run: resolved };
  }

  /**
   * Records a checkpoint with a structured continuation reason.
   *
   * Structured on purpose: PLAN-105 Phase 4 requires that recovery never has to
   * re-read a raw transcript to work out where a run got to.
   */
  async function recordCheckpoint(input: {
    run: CoreRunRecord;
    stepIndex: number;
    gaps: readonly WorkCompletionEvidenceGap[];
    outstandingCriteria: readonly string[];
    summary: string;
  }): Promise<void> {
    await coreStore.updateCore((core) => upsertCoreCheckpoint(
      core,
      {
        id: `checkpoint-wgp-${input.run.id}-${input.stepIndex}`,
        label: `Supervised step ${input.stepIndex + 1}`,
        status: 'completed',
        conversationId: input.run.conversationId,
        runId: input.run.id,
        taskId: input.run.taskId,
        summary: input.summary,
        completedAt: now().toISOString(),
        metadata: {
          workGoldenPath: {
            schemaVersion: 1,
            stepIndex: input.stepIndex,
            continuationReason: input.gaps.length > 0 ? 'acceptance_gaps' : 'agent_continued',
            gaps: [...input.gaps],
            outstandingCriteria: [...input.outstandingCriteria],
          },
        },
      },
      now(),
    ).core);
  }

  /**
   * Records the refusal on the Run so Desktop can show exactly what to grant.
   */
  async function recordPermissionDenial(input: {
    run: CoreRunRecord;
    workItemId: string;
    denial: WorkGoldenPathPermissionDenial;
  }): Promise<void> {
    await coreStore.updateCore((core) => {
      const run = core.runs.find((candidate) => candidate.id === input.run.id);
      if (!run) {
        return core;
      }
      const stamped = upsertCoreRun(
        core,
        {
          ...run,
          metadata: {
            ...run.metadata,
            [WORK_GOLDEN_PATH_DENIAL_METADATA_KEY]: {
              schemaVersion: 1,
              toolName: input.denial.toolName,
              code: input.denial.code,
              deniedAt: now().toISOString(),
            },
          },
        },
        now(),
      );
      return appendCoreActivity(
        stamped.core,
        {
          id: `activity-wgp-denied-${run.id}`,
          kind: 'status_change',
          actorId: run.orchestratorActorId,
          workItemId: input.workItemId,
          conversationId: run.conversationId,
          taskId: run.taskId,
          runId: run.id,
          message: `Supervision refused ${input.denial.toolName}: ${input.denial.code}.`,
          metadata: {
            [WORK_GOLDEN_PATH_DENIAL_METADATA_KEY]: {
              schemaVersion: 1,
              toolName: input.denial.toolName,
              code: input.denial.code,
            },
          },
        },
        now(),
      ).core;
    });
  }

  async function recordTerminalActivity(input: {
    run: CoreRunRecord;
    workItemId: string;
    message: string;
    reason: string;
  }): Promise<void> {
    await coreStore.updateCore((core) => appendCoreActivity(
      core,
      {
        id: `activity-wgp-terminal-${input.run.id}`,
        kind: 'status_change',
        actorId: input.run.orchestratorActorId,
        workItemId: input.workItemId,
        conversationId: input.run.conversationId,
        taskId: input.run.taskId,
        runId: input.run.id,
        message: input.message,
        metadata: { workGoldenPath: { schemaVersion: 1, reason: input.reason } },
      },
      now(),
    ).core);
  }

  return {
    drive({ runId }) {
      const existing = inFlight.get(runId);
      if (existing !== undefined) {
        return existing;
      }
      const started = driveOnce(runId).finally(() => {
        inFlight.delete(runId);
      });
      inFlight.set(runId, started);
      return started;
    },
  };

  async function driveOnce(runId: string): Promise<WorkGoldenPathRunOutcome> {
    const core = await coreStore.readCore();
    const run = core.runs.find((candidate) => candidate.id === runId) ?? null;
    if (run === null) {
      return {
        status: 'not_runnable',
        steps: 0,
        evidence: null,
        stage: null,
        reason: `No Run found for id ${runId}.`,
      };
    }
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      return {
        status: 'not_runnable',
        steps: 0,
        evidence: null,
        stage: null,
        reason: `Run ${runId} is already ${run.status}.`,
      };
    }

    const workItem = core.workItems.find((candidate) => candidate.taskId === run.taskId)
      ?? null;
    const proposal = workItem
      ? readWorkGoldenPathMetadata(workItem.metadata)?.proposal ?? null
      : null;
    if (workItem === null || proposal === null) {
      return {
        status: 'not_runnable',
        steps: 0,
        evidence: null,
        stage: null,
        reason: `Run ${runId} is not a golden-path run.`,
      };
    }
    const execution = readWorkGoldenPathExecutionSnapshot(run.metadata);

    await service.markRunStatus({
      workItemId: workItem.id,
      runId,
      status: 'running',
      stageKey: messageKeys.workDeliveryStageRunning,
      milestoneKey: messageKeys.workDeliveryMilestoneAdmitted,
    });

    const accumulated: AccumulatedEvidence = {
      satisfiedCriteria: new Set<string>(),
      artifact: null,
      commit: null,
      summary: '',
    };
    let evidence: WorkCompletionEvidenceResult = evaluateWorkCompletionEvidence({
      deliveryMode: proposal.deliveryMode,
      acceptanceCriteria: proposal.acceptanceCriteria,
      satisfiedCriteria: [],
      outcomeStatus: 'succeeded',
      artifacts: [],
      commit: null,
    });
    let steps = 0;

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      // Re-read before each step so an owner cancellation that landed while
      // the previous step was in flight stops the loop immediately.
      const current = await readRun(runId);
      if (current === null || TERMINAL_RUN_STATUSES.has(current.status)) {
        return {
          status: current?.status === 'cancelled' ? 'cancelled' : 'not_runnable',
          steps,
          evidence,
          stage: (await service.describeStage(workItem.id))?.stage ?? null,
          reason: `Run stopped at ${current?.status ?? 'missing'}.`,
        };
      }

      const stepOrTimeout = await executeStepWithDeadline({
        runId,
        taskId: run.taskId,
        workItemId: workItem.id,
        stepIndex,
        goal: proposal.goal,
        acceptanceCriteria: proposal.acceptanceCriteria,
        deliveryMode: proposal.deliveryMode,
        workspacePath: proposal.workspacePath,
        executionTarget: execution.executionTarget,
        toolScope: execution.toolScope,
        workspaceHeadOid: execution.workspaceHeadOid,
        outstandingGaps: evidence.gaps,
        outstandingCriteria: evidence.unmetCriteria,
      });
      steps = stepIndex + 1;

      if (stepOrTimeout === STEP_TIMED_OUT) {
        await applyWorkGoldenPathLifecycleAction(
          coreStore,
          {
            workItemId: workItem.id,
            action: 'timeout',
            actorRef: run.orchestratorActorId ?? 'actor-work-golden-path',
            detail: `step ${stepIndex + 1} exceeded ${stepTimeoutMs}ms`,
          },
          now,
        );
        await service.notifyDecisionNeeded({
          workItemId: workItem.id,
          runId,
          reasonKey: messageKeys.workDeliveryTimeoutReason,
          consequenceKey: messageKeys.workDeliveryTimeoutConsequence,
          discriminator: `timeout:${stepIndex}`,
        });
        return {
          status: 'timed_out',
          steps,
          evidence,
          stage: (await service.describeStage(workItem.id))?.stage ?? null,
          reason: `Step ${stepIndex + 1} exceeded its ${stepTimeoutMs}ms budget.`,
        };
      }
      const step = stepOrTimeout;

      for (const criterion of step.satisfiedCriteria) {
        accumulated.satisfiedCriteria.add(criterion);
      }
      accumulated.artifact = step.artifact ?? accumulated.artifact;
      accumulated.commit = step.commit ?? accumulated.commit;
      accumulated.summary = step.summary || accumulated.summary;

      if (step.status === 'failed') {
        await writeNonTerminalStatus({
          runId,
          status: 'failed',
          summary: step.blockedReason ?? 'Supervised step failed.',
        });
        await recordTerminalActivity({
          run,
          workItemId: workItem.id,
          message: `Supervised run failed: ${step.blockedReason ?? step.summary}`,
          reason: 'step_failed',
        });
        return {
          status: 'failed',
          steps,
          evidence,
          stage: (await service.describeStage(workItem.id))?.stage ?? null,
          reason: step.blockedReason ?? step.summary,
        };
      }

      if (step.status === 'permission_denied') {
        // Not a failure of the work, and not something a retry can fix on its
        // own: the envelope has to change first, so the Run waits for the owner
        // with the refused tool named.
        const denial = step.denial ?? { toolName: 'unknown', code: 'E_TOOL_SCOPE_DENIED' };
        await writeNonTerminalStatus({
          runId,
          status: 'blocked',
          summary: `Permission denied for ${denial.toolName} (${denial.code}).`,
        });
        await recordPermissionDenial({ run, workItemId: workItem.id, denial });
        await service.notifyDecisionNeeded({
          workItemId: workItem.id,
          runId,
          reasonKey: messageKeys.workDeliveryPermissionDeniedReason,
          consequenceKey: messageKeys.workDeliveryPermissionDeniedConsequence,
          reasonValues: { tool: denial.toolName, code: denial.code },
          discriminator: `permission:${denial.code}:${denial.toolName}`,
        });
        return {
          status: 'permission_denied',
          steps,
          evidence,
          stage: (await service.describeStage(workItem.id))?.stage ?? null,
          reason: `${denial.toolName} was refused with ${denial.code}.`,
        };
      }

      if (step.status === 'blocked') {
        await writeNonTerminalStatus({
          runId,
          status: 'blocked',
          summary: step.blockedReason ?? 'Supervised step needs an owner decision.',
        });
        return {
          status: 'blocked',
          steps,
          evidence,
          stage: (await service.describeStage(workItem.id))?.stage ?? null,
          reason: step.blockedReason ?? step.summary,
        };
      }

      // FR-30: evaluate before believing anything. The provider's own claim
      // only decides whether it is *worth* evaluating now.
      evidence = evaluateWorkCompletionEvidence({
        deliveryMode: proposal.deliveryMode,
        acceptanceCriteria: proposal.acceptanceCriteria,
        satisfiedCriteria: [...accumulated.satisfiedCriteria],
        outcomeStatus: 'succeeded',
        artifacts: accumulated.artifact === null
          ? []
          : [{
            id: `artifact-wgp-${runId}`,
            title: accumulated.artifact.title,
            kind: 'document',
            status: 'ready',
            projectId: workItem.projectId,
            workItemId: workItem.id,
            conversationId: workItem.conversationId,
            taskId: workItem.taskId,
            runId,
            path: accumulated.artifact.path,
            mimeType: accumulated.artifact.mimeType,
            sizeBytes: null,
            summary: accumulated.summary,
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            metadata: {},
          }],
        commit: accumulated.commit,
      });

      const lastStep = stepIndex === maxSteps - 1;
      if (!evidence.accepted && !lastStep) {
        await recordCheckpoint({
          run,
          stepIndex,
          gaps: evidence.gaps,
          outstandingCriteria: evidence.unmetCriteria,
          summary: step.summary,
        });
        continue;
      }

      // Either the evidence holds, or the budget is spent and the owner
      // deserves an honest "not done" rather than another silent retry.
      const completion = await service.completeRun({
        workItemId: workItem.id,
        runId,
        satisfiedCriteria: [...accumulated.satisfiedCriteria],
        summary: accumulated.summary || step.summary,
        artifact: accumulated.artifact,
        commit: accumulated.commit,
      });

      return {
        status: completion.status === 'insufficient_evidence' ? 'blocked' : completion.status,
        steps,
        evidence: completion.evidence,
        stage: completion.stage,
        reason: completion.evidence.accepted
          ? null
          : `Acceptance unmet after ${steps} step(s): ${completion.evidence.gaps.join(', ')}.`,
      };
    }

    // Unreachable while maxSteps >= 1; kept so a zero budget fails loudly
    // rather than silently reporting success.
    return {
    status: 'blocked',
    steps,
    evidence,
    stage: (await service.describeStage(workItem.id))?.stage ?? null,
    reason: 'No supervised steps were permitted.',
    };
  }
}
