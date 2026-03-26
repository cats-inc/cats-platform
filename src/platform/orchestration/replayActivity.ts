import {
  appendCoreActivity,
} from '../../core/model/index.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreTaskRecord,
} from '../../core/types.js';
import type { OrchestratorDispatchReplayTrigger } from './dispatchReplay.js';

export type OrchestratorReplayActivityPhase =
  | 'pending_dispatch_stored'
  | 'replay_started'
  | 'replay_dispatched'
  | 'replay_blocked'
  | 'replay_failed'
  | 'startup_recovered';

interface ReplayActivityStore {
  writeCore(state: CatsCoreState): Promise<CatsCoreState>;
}

export interface OrchestratorReplayActivityInput {
  task: Pick<CoreTaskRecord, 'id' | 'title' | 'conversationId'>;
  actorId?: string | null;
  runId?: string | null;
  source?:
    | 'orchestrator-replay'
    | 'orchestrator-startup-recovery'
    | 'workflow-continuation-replay';
  phase: OrchestratorReplayActivityPhase;
  trigger?: OrchestratorDispatchReplayTrigger | null;
  blockedReason?: string | null;
  error?: string | null;
  resultCount?: number | null;
  pendingDispatchRecovered?: boolean;
  dispatchReplayRecovered?: boolean;
}

function describeTrigger(trigger: OrchestratorDispatchReplayTrigger | null | undefined): string {
  switch (trigger) {
    case 'approve':
      return 'after approval';
    case 'reroute':
      return 'after reroute';
    case 'retry':
      return 'after retry';
    case 'dispatch':
    default:
      return 'after dispatch';
  }
}

function buildReplayActivityMessage(input: OrchestratorReplayActivityInput): string {
  const subject = `"${input.task.title}"`;
  const replaySubject = input.source === 'workflow-continuation-replay'
    ? 'stored workflow continuation'
    : 'stored orchestrator dispatch';
  switch (input.phase) {
    case 'pending_dispatch_stored':
      return `Stored the approval-blocked orchestrator dispatch for ${subject}.`;
    case 'replay_started':
      return `Started replaying the ${replaySubject} for ${subject} ${describeTrigger(input.trigger)}.`;
    case 'replay_dispatched':
      return `Replayed the ${replaySubject} for ${subject} ${describeTrigger(input.trigger)}.`;
    case 'replay_blocked':
      return input.blockedReason
        ? `The ${replaySubject} for ${subject} remained blocked ${describeTrigger(input.trigger)}: ${input.blockedReason}.`
        : `The ${replaySubject} for ${subject} remained blocked ${describeTrigger(input.trigger)}.`;
    case 'replay_failed':
      return input.error
        ? `Replaying the ${replaySubject} for ${subject} failed ${describeTrigger(input.trigger)}: ${input.error}.`
        : `Replaying the ${replaySubject} for ${subject} failed ${describeTrigger(input.trigger)}.`;
    case 'startup_recovered':
    default:
      return input.source === 'workflow-continuation-replay'
        ? `Recovered interrupted workflow-continuation replay metadata for ${subject}.`
        : `Recovered interrupted orchestrator replay metadata for ${subject}.`;
  }
}

export function appendOrchestratorReplayActivity(
  core: CatsCoreState,
  input: OrchestratorReplayActivityInput,
  now: Date,
): {
  core: CatsCoreState;
  activity: CoreActivityRecord;
} {
  const activity = appendCoreActivity(
    core,
    {
      kind: 'note',
      actorId: input.actorId ?? null,
      conversationId: input.task.conversationId,
      taskId: input.task.id,
      runId: input.runId ?? null,
      message: buildReplayActivityMessage(input),
      metadata: {
        source: input.source ?? 'orchestrator-replay',
        replayPhase: input.phase,
        replayTrigger: input.trigger ?? null,
        blockedReason: input.blockedReason ?? null,
        error: input.error ?? null,
        resultCount: input.resultCount ?? null,
        pendingDispatchRecovered: input.pendingDispatchRecovered ?? false,
        dispatchReplayRecovered: input.dispatchReplayRecovered ?? false,
      },
    },
    now,
  );

  return {
    core: activity.core,
    activity: activity.activity,
  };
}

export async function persistOrchestratorReplayActivity(
  store: ReplayActivityStore,
  core: CatsCoreState,
  input: OrchestratorReplayActivityInput,
  now: Date,
): Promise<{
  core: CatsCoreState;
  activity: CoreActivityRecord;
}> {
  const appended = appendOrchestratorReplayActivity(core, input, now);
  const persisted = await store.writeCore(appended.core);
  return {
    core: persisted,
    activity: persisted.activities.find((candidate) => candidate.id === appended.activity.id)
      ?? appended.activity,
  };
}
