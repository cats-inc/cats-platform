import type {
  CatsCoreState,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTaskRecord,
} from '../../core/types.js';

/**
 * SPEC-142 Definitions and FR-9: a conversation's own records, found by its conversation id only.
 * Every conversation tool in PLAN-135 reads through these.
 *
 * - Its Tasks: those whose conversation it is, which includes the Task projected from it.
 * - Its Runs: those whose conversation it is, and those of its Tasks that name no conversation.
 * - A record whose conversation is another one is not its own, even when it hangs under one of
 *   its Tasks. A SPEC-118 role Task, for example, is admitted with the source conversation's id
 *   and moves to the collaboration conversation when its stage starts; from then on only the
 *   collaboration conversation sees it.
 * - A record's conversation is taken as its writer stored it.
 */

export function isOwnTask(task: CoreTaskRecord, conversationId: string): boolean {
  return task.conversationId === conversationId;
}

export function ownTasks(core: Pick<CatsCoreState, 'tasks'>, conversationId: string): CoreTaskRecord[] {
  return core.tasks.filter((task) => isOwnTask(task, conversationId));
}

export function isOwnRun(run: CoreRunRecord, conversationId: string, ownTaskIds: ReadonlySet<string>): boolean {
  if (run.conversationId !== null) return run.conversationId === conversationId;
  return run.taskId !== null && ownTaskIds.has(run.taskId);
}

export function ownRuns(core: Pick<CatsCoreState, 'tasks' | 'runs'>, conversationId: string): CoreRunRecord[] {
  const taskIds = new Set(ownTasks(core, conversationId).map((task) => task.id));
  return core.runs.filter((run) => isOwnRun(run, conversationId, taskIds));
}

/** One of the conversation's Runs, or null when it is not one of them. */
export function findOwnRun(
  core: Pick<CatsCoreState, 'tasks' | 'runs'>,
  conversationId: string,
  runId: string,
): CoreRunRecord | null {
  return ownRuns(core, conversationId).find((run) => run.id === runId) ?? null;
}

/** An own Run's Outcomes and Checkpoints: they name the Run, and no other conversation. */
function ofRun<T extends { runId: string | null; conversationId: string | null }>(
  records: readonly T[],
  run: CoreRunRecord,
  conversationId: string,
): T[] {
  return records.filter((record) => record.runId === run.id
    && (record.conversationId === null || record.conversationId === conversationId));
}

export function runOutcome(
  core: Pick<CatsCoreState, 'outcomes'>,
  run: CoreRunRecord,
  conversationId: string,
): CoreOrchestrationOutcomeRecord | null {
  return ofRun(core.outcomes, run, conversationId)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0] ?? null;
}

export function latestRunCheckpoint(
  core: Pick<CatsCoreState, 'checkpoints'>,
  run: CoreRunRecord,
  conversationId: string,
): CoreCheckpointRecord | null {
  return ofRun(core.checkpoints, run, conversationId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

/** SPEC-142 Definitions: the Run the projection writes for each chat turn. */
export function isTurnRun(run: CoreRunRecord): boolean {
  return run.metadata?.source === 'chat-room-workflow';
}
