import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreTaskRecord,
} from './types.js';
import type {
  CoreTaskDispatchReplayView,
  CoreTaskPendingDispatchRecoveryView,
  CoreTaskRecoveryActivityView,
  CoreTaskRecoveryReplayPhase,
  CoreTaskRecoveryReplaySource,
  CoreTaskRecoveryReplayTrigger,
  CoreTaskRecoveryResumeReason,
  CoreTaskRecoveryWorkflowShape,
  CoreTaskWorkflowContinuationRecoveryView,
} from './recovery.js';
import {
  ORCHESTRATOR_REPLAY_ACTIVITY_PHASES,
  ORCHESTRATOR_REPLAY_ACTIVITY_SOURCES,
  ORCHESTRATOR_REPLAY_ACTIVITY_TRIGGERS,
} from '../platform/orchestration/replayActivityContracts.js';
import { readOrchestratorDispatchReplay } from '../platform/orchestration/dispatchReplay.js';
import { readPendingOrchestratorDispatchSnapshot } from '../platform/orchestration/pendingDispatch.js';
import { readWorkflowContinuationReplay } from '../platform/orchestration/workflowContinuationReplay.js';

const BODY_PREVIEW_LIMIT = 160;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readResumeReason(value: unknown): CoreTaskRecoveryResumeReason | null {
  return value === 'target_recovered' ? value : null;
}

export function readReplaySource(value: unknown): CoreTaskRecoveryReplaySource | null {
  return typeof value === 'string'
    && ORCHESTRATOR_REPLAY_ACTIVITY_SOURCES.includes(value as CoreTaskRecoveryReplaySource)
    ? value as CoreTaskRecoveryReplaySource
    : null;
}

export function readReplayTrigger(value: unknown): CoreTaskRecoveryReplayTrigger | null {
  return typeof value === 'string'
    && ORCHESTRATOR_REPLAY_ACTIVITY_TRIGGERS.includes(value as CoreTaskRecoveryReplayTrigger)
    ? value as CoreTaskRecoveryReplayTrigger
    : null;
}

export function readReplayPhase(value: unknown): CoreTaskRecoveryReplayPhase | null {
  return typeof value === 'string'
    && ORCHESTRATOR_REPLAY_ACTIVITY_PHASES.includes(value as CoreTaskRecoveryReplayPhase)
    ? value as CoreTaskRecoveryReplayPhase
    : null;
}

function summarizeBody(body: string): {
  bodyPreview: string;
  bodyLength: number;
} {
  const trimmed = body.trim();
  return {
    bodyPreview: trimmed.length > BODY_PREVIEW_LIMIT
      ? `${trimmed.slice(0, BODY_PREVIEW_LIMIT - 1)}...`
      : trimmed,
    bodyLength: trimmed.length,
  };
}

function compareActivityDesc(
  left: CoreActivityRecord,
  right: CoreActivityRecord,
): number {
  return right.createdAt.localeCompare(left.createdAt);
}

export function buildLatestRecoveryActivity(
  core: CatsCoreState,
  taskId: string,
): CoreTaskRecoveryActivityView | null {
  const latest = core.activities
    .filter((activity) =>
      activity.taskId === taskId && readString(asRecord(activity.metadata)?.replayPhase),
    )
    .sort(compareActivityDesc)[0] ?? null;
  if (!latest) {
    return null;
  }

  const metadata = asRecord(latest.metadata);
  return {
    id: latest.id,
    source: readReplaySource(metadata?.source),
    phase: readString(metadata?.replayPhase) ?? 'unknown',
    trigger: readReplayTrigger(metadata?.replayTrigger),
    resumeReason: readResumeReason(metadata?.resumeReason),
    createdAt: latest.createdAt,
    message: latest.message,
    error: readString(metadata?.error),
    blockedReason: readString(metadata?.blockedReason),
    resultCount: readNumber(metadata?.resultCount),
  };
}

export function buildPendingDispatchView(
  task: CoreTaskRecord,
): CoreTaskPendingDispatchRecoveryView | null {
  const snapshot = readPendingOrchestratorDispatchSnapshot(task.metadata, {
    includeInProgress: true,
  });
  if (!snapshot) {
    return null;
  }

  return {
    channelId: snapshot.channelId,
    transport: snapshot.transport,
    senderName: snapshot.senderName,
    blockedAt: snapshot.blockedAt,
    blockedReason: snapshot.blockedReason,
    hasChoiceResponse: Boolean(snapshot.choiceResponse),
    ...summarizeBody(snapshot.body),
    replayState: snapshot.replayState,
    replayTrigger: snapshot.replayTrigger,
    replayAttemptAt: snapshot.replayAttemptAt,
    replayError: snapshot.replayError,
  };
}

export function buildDispatchReplayView(
  task: CoreTaskRecord,
): CoreTaskDispatchReplayView | null {
  const snapshot = readOrchestratorDispatchReplay(task.metadata, {
    includeInProgress: true,
  });
  if (!snapshot) {
    return null;
  }

  return {
    channelId: snapshot.channelId,
    transport: snapshot.transport,
    senderName: snapshot.senderName,
    recordedAt: snapshot.recordedAt,
    sourceMessageId: snapshot.sourceMessageId,
    hasChoiceResponse: Boolean(snapshot.choiceResponse),
    ...summarizeBody(snapshot.body),
    replayState: snapshot.replayState,
    replayTrigger: snapshot.replayTrigger,
    replayAttemptAt: snapshot.replayAttemptAt,
    replayError: snapshot.replayError,
  };
}

export function buildWorkflowContinuationReplayView(
  task: CoreTaskRecord,
): CoreTaskWorkflowContinuationRecoveryView | null {
  const snapshot = readWorkflowContinuationReplay(task.metadata, {
    includeInProgress: true,
  });
  if (!snapshot) {
    return null;
  }

  return {
    channelId: snapshot.channelId,
    checkpointId: snapshot.checkpointId,
    recordedAt: snapshot.recordedAt,
    sourceMessageId: snapshot.sourceMessageId,
    sourceTurnId: snapshot.sourceTurnId,
    sourceLaneId: snapshot.sourceLaneId,
    sourceAssistantTurnId: snapshot.sourceAssistantTurnId,
    sourceParticipant: snapshot.sourceParticipant
      ? {
          participantKind: snapshot.sourceParticipant.participantKind,
          participantId: snapshot.sourceParticipant.participantId,
          participantName: snapshot.sourceParticipant.participantName,
        }
      : null,
    targets: snapshot.targets.map((target) => ({
      participantKind: target.participantKind,
      participantId: target.participantId,
      participantName: target.participantName,
      laneId: target.laneId,
      sessionId: target.sessionId,
    })),
    mentionNames: [...snapshot.mentionNames],
    trigger: snapshot.trigger,
    branchStrategy: snapshot.branchStrategy,
    workflowStageId: snapshot.workflowStageId,
    workflowShape: snapshot.workflowShape,
    reviewRequired: snapshot.reviewRequired,
    continuationSource: snapshot.continuationSource,
    unresolvedTargets: [...snapshot.unresolvedTargets],
    blockedReason: snapshot.blockedReason,
    replayState: snapshot.replayState,
    replayTrigger: snapshot.replayTrigger,
    replayAttemptAt: snapshot.replayAttemptAt,
    replayError: snapshot.replayError,
  };
}

export function readWorkflowShape(value: unknown): CoreTaskRecoveryWorkflowShape | null {
  return value === 'sequential' || value === 'concurrent' || value === 'converge'
    ? (value as CoreTaskRecoveryWorkflowShape)
    : value === 'parallel'
      ? ('concurrent' as CoreTaskRecoveryWorkflowShape)
      : null;
}
