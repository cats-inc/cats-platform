import type {
  ChannelDispatchResult,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRouteBlockedReason,
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingOutcome,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import {
  appendMessage,
  requireChannel,
  setChannelCatLease,
  setChannelOrchestratorLease,
} from '../model/index.js';
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import {
  mergeUnresolvedMentions,
  resolveTargets,
  resolveWorkflowBranchStrategy,
  type DispatchFrame,
  type TargetResolution,
  workflowShapeForTargets,
} from '../room-routing/runtime.js';
import {
  buildContinuationReplayMetadata,
} from '../room-routing/continuationReplay.js';
import {
  extractWorkflowRecommendationFromBody,
  resolveWorkflowRecommendationTargets,
  serializeWorkflowRecommendation,
  type WorkflowRecommendation,
} from '../room-routing/recommendations.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  updateDispatch,
  updateWorkflowTarget,
} from '../room-routing/workflow.js';
import type { DispatchExecution } from './execution.js';
import { resolveExecutionMetadataForTarget } from '../runtimeTargeting.js';
import { isSoloChatChannel } from '../runtimeTargeting.js';
import {
  participantKey,
  setReadyAfterMessage,
  toParticipantRef,
} from '../runtime-session/state.js';

type ContinuationSource = 'explicit_mentions' | 'workflow_recommendation';

interface BlockedDispatchResolution {
  blockedReason: RoomRouteBlockedReason;
  note: string;
}

function buildRecommendationContinuationResolution(
  state: ChatState,
  channelId: string,
  recommendation: WorkflowRecommendation,
): TargetResolution {
  const resolved = resolveWorkflowRecommendationTargets(state, channelId, recommendation);
  const resolvedTargets = resolved.targets.map((target) => toParticipantRef(target));
  const routingMode = resolved.targets.length === 0
    ? 'room_default'
    : resolved.targets.length === 1
      ? 'explicit_single'
      : 'explicit_multi';

  return {
    targets: resolved.targets,
    unresolved: resolved.unresolved,
    mentionNames: resolved.mentionNames,
    trigger: 'continuation_mention',
    resolution: {
      routingMode,
      selectionKind: resolved.targets.length === 0 ? 'blocked' : 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: resolved.targets.length === 0 ? 'no_valid_targets' : null,
      note: resolved.targets.length === 0
        ? 'Structured workflow recommendation did not resolve to an active room participant.'
        : 'Structured workflow recommendation routed the next room stage.',
    },
  };
}

function resolveContinuationStage(
  recommendation: WorkflowRecommendation | null,
  targetCount: number,
): {
  stageId: string;
  workflowShape: RoomWorkflowTurn['workflowShape'];
  reviewRequired: boolean;
} {
  if (recommendation?.workflowShape === 'converge' && targetCount === 1) {
    return {
      stageId: 'converge_review',
      workflowShape: 'converge',
      reviewRequired: true,
    };
  }

  return {
    stageId: targetCount > 1 ? 'parallel_fan_out' : 'continuation_handoff',
    workflowShape: workflowShapeForTargets(targetCount),
    reviewRequired: false,
  };
}

export function applyDispatchExecutions(
  state: ChatState,
  channelId: string,
  executions: DispatchExecution[],
  now: Date,
  options: {
    nowIso: string;
    workflow: RoomWorkflowState;
    activeTurn: RoomWorkflowTurn;
    outcome: RoomRoutingOutcome;
    latestCheckpoint: RoomRoutingCheckpoint | null;
    maxContinuations: number;
    results: ChannelDispatchResult[];
    targetVisitCounts: Map<string, number>;
    queue: DispatchFrame[];
    describeGuardReason: (reason: Exclude<RoomRoutingGuardReason, null>) => string;
  },
): {
  state: ChatState;
  latestCheckpoint: RoomRoutingCheckpoint | null;
  guardReason: RoomRoutingGuardReason;
  blockedResolution: BlockedDispatchResolution | null;
} {
  const {
    nowIso,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint: initialCheckpoint,
    maxContinuations,
    results,
    targetVisitCounts,
    queue,
    describeGuardReason,
  } = options;

  let nextState = state;
  let latestCheckpoint = initialCheckpoint;
  let guardReason: RoomRoutingGuardReason = null;
  let blockedResolution: BlockedDispatchResolution | null = null;

  for (const execution of executions) {
    outcome.totalDispatchCount += 1;
    activeTurn.dispatchCount = outcome.totalDispatchCount;
    const targetKey = participantKey(execution.target);
    targetVisitCounts.set(targetKey, (targetVisitCounts.get(targetKey) ?? 0) + 1);

    if (execution.error) {
      nextState = execution.target.participantKind === 'cat'
        ? setChannelCatLease(
            nextState,
            channelId,
            execution.target.participantId,
            { status: 'error', lastError: execution.error, lastUsedAt: nowIso },
            now,
          )
        : setChannelOrchestratorLease(
            nextState,
            channelId,
            { status: 'error', lastError: execution.error, lastUsedAt: nowIso },
            now,
          );
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to route the message to ${execution.target.participantName}: ${execution.error}`,
        },
        now,
        {
          metadata: {
            event: 'runtime_error',
            targetKind: execution.target.participantKind,
            targetId: execution.target.participantId,
            sessionId: execution.target.sessionId,
          },
        },
      ).state;
      updateDispatch(outcome, execution.dispatchId, {
        status: 'error',
        completedAt: nowIso,
        error: execution.error,
      });
      updateWorkflowTarget(activeTurn, execution.targetStateId, nowIso, {
        status: 'failed',
        completedAt: nowIso,
        error: execution.error,
      });
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'target_failed',
          'failed',
          `Runtime delivery to ${execution.target.participantName} failed: ${execution.error}`,
          nowIso,
          execution.sourceParticipant,
          execution.sourceMessage.id,
          [toParticipantRef(execution.target)],
          {
            dispatchId: execution.dispatchId,
            metadata: {
              phase: 'dispatch',
              parentCheckpointId: execution.parentCheckpointId,
              branchStrategy: execution.branchStrategy,
              handoffReason: execution.handoffReason,
            },
          },
        ),
      );
      latestCheckpoint = addWorkflowCheckpoint(
        outcome,
        workflow,
        activeTurn,
        'runtime_error',
        `Runtime delivery to ${execution.target.participantName} failed: ${execution.error}`,
        nowIso,
        execution.sourceParticipant,
        [toParticipantRef(execution.target)],
      );
      results.push({
        targetKind: execution.target.participantKind,
        targetId: execution.target.participantId,
        targetName: execution.target.participantName,
        sessionId: execution.target.sessionId,
        status: 'error',
        dispatchId: execution.dispatchId,
        turnId: activeTurn.id,
        targetStatus: 'failed',
        error: execution.error,
        sourceMessageId: execution.sourceMessage.id,
        trigger: execution.trigger,
        dispatchDepth: execution.depth,
      });
      continue;
    }

    nextState = setReadyAfterMessage(
      nextState,
      channelId,
      execution.target.participantKind === 'cat'
        ? { catId: execution.target.participantId }
        : 'orchestrator',
      now,
    );
    const extractedWorkflowRecommendation = extractWorkflowRecommendationFromBody(
      execution.responseBody ?? '',
    );
    const channel = requireChannel(nextState, channelId);
    const hiddenSoloReply = execution.target.participantKind === 'orchestrator'
      && isSoloChatChannel(channel);
    const serializedWorkflowRecommendation = extractedWorkflowRecommendation.recommendation
      ? serializeWorkflowRecommendation(extractedWorkflowRecommendation.recommendation)
      : null;
    const appendedResponse = appendMessage(
      nextState,
      channelId,
      {
        senderKind: execution.target.participantKind === 'orchestrator'
          ? (hiddenSoloReply ? 'agent' : 'orchestrator')
          : 'agent',
        senderName: hiddenSoloReply ? 'Orchestrator' : execution.target.participantName,
        body: extractedWorkflowRecommendation.body,
      },
      now,
      {
        metadata: {
          event: 'runtime_response',
          targetKind: execution.target.participantKind,
          targetId: execution.target.participantId,
          sessionId: execution.target.sessionId,
          turnId: outcome.turnId,
          sourceMessageId: execution.sourceMessage.id,
          routingTrigger: execution.trigger,
          dispatchDepth: execution.depth,
          ...(serializedWorkflowRecommendation
            ? {
                workflowRecommendation: serializedWorkflowRecommendation,
              }
            : {}),
        },
        usage: execution.usage,
        execution: resolveExecutionMetadataForTarget(nextState, channelId, execution.target),
        incrementUnread: false,
      },
    );
    nextState = appendedResponse.state;
    nextState = refreshDerivedMemoryLayers(nextState, channelId, now);
    const responseMessage = appendedResponse.message;
    updateDispatch(outcome, execution.dispatchId, {
      status: 'completed',
      responseMessageId: responseMessage.id,
      completedAt: nowIso,
      error: null,
    });
    updateWorkflowTarget(activeTurn, execution.targetStateId, nowIso, {
      status: 'completed',
      completedAt: nowIso,
      responseMessageId: responseMessage.id,
      error: null,
    });
    appendWorkflowEvent(
      workflow,
      activeTurn,
      createWorkflowEvent(
        activeTurn.id,
        'target_completed',
        'completed',
        `${execution.target.participantName} completed this room dispatch.`,
        nowIso,
        execution.sourceParticipant,
        execution.sourceMessage.id,
        [toParticipantRef(execution.target)],
        {
          dispatchId: execution.dispatchId,
          metadata: {
            responseMessageId: responseMessage.id,
            parentCheckpointId: execution.parentCheckpointId,
            branchStrategy: execution.branchStrategy,
            handoffReason: execution.handoffReason,
            workflowRecommendation: serializedWorkflowRecommendation,
          },
        },
      ),
    );
    results.push({
      targetKind: execution.target.participantKind,
      targetId: execution.target.participantId,
      targetName: execution.target.participantName,
      sessionId: execution.target.sessionId,
      status: 'sent',
      dispatchId: execution.dispatchId,
      turnId: activeTurn.id,
      targetStatus: 'completed',
      sourceMessageId: execution.sourceMessage.id,
      trigger: execution.trigger,
      dispatchDepth: execution.depth,
    });

    let continuationResolution = resolveTargets(nextState, channelId, responseMessage.body, {
      allowDefaultTarget: false,
      explicitTrigger: 'continuation_mention',
    });
    let continuationSource: ContinuationSource = 'explicit_mentions';

    if (
      continuationResolution.targets.length === 0
      && extractedWorkflowRecommendation.recommendation
    ) {
      continuationResolution = buildRecommendationContinuationResolution(
        nextState,
        channelId,
        extractedWorkflowRecommendation.recommendation,
      );
      continuationSource = 'workflow_recommendation';
    }

    if (continuationResolution.unresolved.length > 0) {
      mergeUnresolvedMentions(outcome, continuationResolution.unresolved);
    }

    const continuationStage = resolveContinuationStage(
      extractedWorkflowRecommendation.recommendation,
      continuationResolution.targets.length,
    );
    const recommendationBranchStrategy = continuationSource === 'workflow_recommendation'
      ? extractedWorkflowRecommendation.recommendation?.branchStrategy ?? null
      : null;

    if (continuationResolution.targets.length === 0) {
      if (serializedWorkflowRecommendation) {
        const blockedNote = continuationResolution.resolution.note
          ?? `No valid continuation targets were resolved from ${execution.target.participantName}'s handoff.`;
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'no_targets',
          blockedNote,
          nowIso,
          toParticipantRef(execution.target),
          [],
          {
            blockedReason: 'no_valid_targets',
            branchStrategy: recommendationBranchStrategy,
            ...buildContinuationReplayMetadata({
              sourceMessageId: responseMessage.id,
              mentionNames: continuationResolution.mentionNames,
              trigger: continuationResolution.trigger,
              workflowStageId: continuationStage.stageId,
              workflowShape: continuationStage.workflowShape,
              reviewRequired: continuationStage.reviewRequired,
              continuationSource,
              workflowRecommendation: serializedWorkflowRecommendation,
              unresolvedTargets: continuationResolution.unresolved,
            }),
          },
        );
        blockedResolution = {
          blockedReason: 'no_valid_targets',
          note: blockedNote,
        };
        break;
      }

      if (continuationResolution.unresolved.length > 0) {
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'no_targets',
          `No valid continuation targets were resolved from ${execution.target.participantName}'s handoff.`,
          nowIso,
          toParticipantRef(execution.target),
          [],
          {
            continuationSource,
            workflowRecommendation: serializedWorkflowRecommendation,
            unresolvedTargets: structuredClone(continuationResolution.unresolved),
          },
        );
      }
      continue;
    }

    const branchStrategy = recommendationBranchStrategy ?? (
      continuationResolution.targets.length > 1
        ? 'transplant_context'
        : resolveWorkflowBranchStrategy(
            toParticipantRef(execution.target),
            continuationResolution.targets[0]!,
            execution.depth + 1,
          )
    );

    if (execution.depth + 1 > maxContinuations) {
      guardReason = 'max_continuations';
      activeTurn.guard = guardReason;
      activeTurn.status = 'blocked';
      latestCheckpoint = addWorkflowCheckpoint(
        outcome,
        workflow,
        activeTurn,
        'loop_guard',
        `Room routing stopped after reaching ${describeGuardReason('max_continuations')}.`,
        nowIso,
        toParticipantRef(execution.target),
        continuationResolution.targets.map((target) => toParticipantRef(target)),
        {
          reason: 'max_continuations',
          branchStrategy,
          ...buildContinuationReplayMetadata({
            sourceMessageId: responseMessage.id,
            mentionNames: continuationResolution.mentionNames,
            trigger: continuationResolution.trigger,
            workflowStageId: continuationStage.stageId,
            workflowShape: continuationStage.workflowShape,
            reviewRequired: continuationStage.reviewRequired,
            continuationSource,
            workflowRecommendation: serializedWorkflowRecommendation,
            unresolvedTargets: continuationResolution.unresolved,
          }),
        },
      );
      break;
    }

    outcome.continuationCount += 1;
    activeTurn.continuationCount = outcome.continuationCount;
    activeTurn.stageId = continuationStage.stageId;
    activeTurn.workflowShape = continuationStage.workflowShape;
    activeTurn.reviewRequired = continuationStage.reviewRequired;
    latestCheckpoint = addWorkflowCheckpoint(
      outcome,
      workflow,
      activeTurn,
      'continuation',
      `${execution.target.participantName} handed the room forward to ${continuationResolution.targets.map((target) => target.participantName).join(', ')}.`,
      nowIso,
      toParticipantRef(execution.target),
      continuationResolution.targets.map((target) => toParticipantRef(target)),
      {
        mentionNames: structuredClone(continuationResolution.mentionNames),
        workflowStageId: activeTurn.stageId,
        workflowShape: activeTurn.workflowShape,
        reviewRequired: activeTurn.reviewRequired,
        handoffReason: 'workflow_continuation',
        branchStrategy,
        continuationSource,
        workflowRecommendation: serializedWorkflowRecommendation,
        unresolvedTargets: structuredClone(continuationResolution.unresolved),
      },
    );
    queue.push({
      sourceMessage: responseMessage,
      sourceParticipant: toParticipantRef(execution.target),
      targets: continuationResolution.targets,
      unresolved: continuationResolution.unresolved,
      mentionNames: continuationResolution.mentionNames,
      trigger: continuationResolution.trigger,
      depth: execution.depth + 1,
      branchStrategyOverride: branchStrategy,
      workflowShapeOverride: activeTurn.workflowShape,
      workflowStageId: activeTurn.stageId,
      reviewRequired: activeTurn.reviewRequired,
      continuationSource,
      workflowRecommendation: serializedWorkflowRecommendation,
    });
  }

  return {
    state: nextState,
    latestCheckpoint,
    guardReason,
    blockedResolution,
  };
}
