import {
  persistOrchestratorReplayActivity,
} from '../../../platform/orchestration/replayActivity.js';
import {
  readWorkflowContinuationReplay,
} from '../../../platform/orchestration/workflowContinuationReplay.js';
import { buildChannelView, resolveOrchestratorDisplayName } from '../state/model/index.js';
import { resumeStoredWorkflowContinuationDispatch } from '../state/orchestratorAdapter.js';
import { readWorkflowRecommendation } from '../state/room-routing/recommendations.js';
import type { ChatStore } from '../state/store.js';
import type { ChatApiRouteContext } from './routeSupport.js';
import { notifyStreamTargetChanged } from './resources/streamTargetSignal.js';

interface RecoveredContinuationParticipant {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
}

function buildChannelTaskId(channelId: string): string {
  return `task-channel-${channelId}`;
}

function replayMatchesRecoveredParticipant(
  replay: NonNullable<ReturnType<typeof readWorkflowContinuationReplay>>,
  participant: RecoveredContinuationParticipant,
): boolean {
  const normalizedParticipantName = participant.participantName.trim().toLowerCase();
  if (replay.targets.some((target) =>
    target.participantKind === participant.participantKind
    && (
      target.participantId === participant.participantId
      || target.participantName.trim().toLowerCase() === normalizedParticipantName
    )
  )) {
    return true;
  }

  const recommendation = readWorkflowRecommendation(replay.workflowRecommendation);
  if (!recommendation) {
    return false;
  }

  return recommendation.candidateTargets.some((candidate) =>
    (
      candidate.participantKind === null
      || candidate.participantKind === participant.participantKind
    )
    && (
      candidate.participantId === participant.participantId
      || candidate.participantName?.trim().toLowerCase() === normalizedParticipantName
    )
  );
}

function hasStartupRecoveredContinuationActivity(
  core: Awaited<ReturnType<ChatStore['readCore']>>,
  taskId: string,
): boolean {
  return core.activities.some((activity) =>
    activity.taskId === taskId
    && activity.metadata?.source === 'workflow-continuation-replay'
    && activity.metadata?.replayPhase === 'startup_recovered'
  );
}

function isRecoveredContinuationReplayEligibleForAutoResume(
  core: Awaited<ReturnType<ChatStore['readCore']>>,
  taskId: string,
  replay: NonNullable<ReturnType<typeof readWorkflowContinuationReplay>>,
  participant: RecoveredContinuationParticipant,
): boolean {
  if (replay.replayState !== 'ready' || !replayMatchesRecoveredParticipant(replay, participant)) {
    return false;
  }

  if (replay.blockedReason === 'no_valid_targets' && replay.workflowRecommendation) {
    return true;
  }

  return replay.blockedReason === null
    && hasStartupRecoveredContinuationActivity(core, taskId);
}

async function maybeAutoResumeRecoveredContinuationForParticipant(
  context: ChatApiRouteContext,
  channelId: string,
  participant: RecoveredContinuationParticipant,
  now: Date,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  const taskId = buildChannelTaskId(channelId);
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const replay = readWorkflowContinuationReplay(task?.metadata);
  if (
    !task
    || !replay
    || !isRecoveredContinuationReplayEligibleForAutoResume(core, taskId, replay, participant)
  ) {
    return;
  }

  try {
    await persistOrchestratorReplayActivity(
      context.dependencies.chatStore,
      core,
      {
        task,
        source: 'workflow-continuation-replay',
        phase: 'replay_started',
        resumeReason: 'target_recovered',
      },
      now,
    );
  } catch {
    // Inspectability is additive; do not block the auto-resume attempt.
  }

  try {
    const result = await resumeStoredWorkflowContinuationDispatch({
      request: replay,
      chatStore: context.dependencies.chatStore,
      runtimeClient: context.dependencies.runtimeClient,
      now,
      companionStore: context.dependencies.companionStore,
      memoryService: context.dependencies.memoryService,
      onStateWritten: notifyStreamTargetChanged,
    });
    try {
      const latestCore = await context.dependencies.chatStore.readCore();
      const latestTask = latestCore.tasks.find((candidate) =>
        candidate.id === buildChannelTaskId(channelId)
      ) ?? task;
      await persistOrchestratorReplayActivity(
        context.dependencies.chatStore,
        latestCore,
        {
          task: latestTask,
          source: 'workflow-continuation-replay',
          phase: result.status === 'dispatched'
            ? 'replay_dispatched'
            : 'replay_blocked',
          resumeReason: 'target_recovered',
          blockedReason: result.blockedReason,
          resultCount: result.results.length,
        },
        now,
      );
    } catch {
      // The auto-resume itself already completed; do not regress the main path.
    }
  } catch {
    try {
      const latestCore = await context.dependencies.chatStore.readCore();
      const latestTask = latestCore.tasks.find((candidate) =>
        candidate.id === buildChannelTaskId(channelId)
      ) ?? task;
      await persistOrchestratorReplayActivity(
        context.dependencies.chatStore,
        latestCore,
        {
          task: latestTask,
          source: 'workflow-continuation-replay',
          phase: 'replay_failed',
          resumeReason: 'target_recovered',
        },
        now,
      );
    } catch {
      // Keep the auto-resume path best-effort even if activity persistence fails.
    }
  }
}

export async function maybeAutoResumeRecoveredCatContinuation(
  context: ChatApiRouteContext,
  channelId: string,
  catId: string,
  now: Date,
): Promise<void> {
  const state = await context.dependencies.chatStore.read();
  const channel = buildChannelView(state, channelId);
  const assignment = channel.assignedCats.find((candidate) =>
    candidate.catId === catId && candidate.status === 'active'
  );
  if (!assignment) {
    return;
  }

  await maybeAutoResumeRecoveredContinuationForParticipant(
    context,
    channelId,
    {
      participantKind: 'cat',
      participantId: assignment.catId,
      participantName: assignment.name,
    },
    now,
  );
}

export async function maybeAutoResumeRecoveredOrchestratorContinuation(
  context: ChatApiRouteContext,
  channelId: string,
  now: Date,
): Promise<void> {
  const state = await context.dependencies.chatStore.read();
  const channel = buildChannelView(state, channelId);
  if (!channel.orchestratorLease.sessionId) {
    return;
  }

  await maybeAutoResumeRecoveredContinuationForParticipant(
    context,
    channelId,
    {
      participantKind: 'orchestrator',
      participantId: 'orchestrator',
      participantName: resolveOrchestratorDisplayName(state),
    },
    now,
  );
}
