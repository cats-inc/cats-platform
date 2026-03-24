import type {
  ChannelDispatchResult,
  ChatState,
} from '../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingOutcome,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../shared/roomRouting.js';
import { appendMessage, setChannelCatLease, setChannelOrchestratorLease } from './model.js';
import { refreshDerivedMemoryLayers } from './memoryLayers.js';
import {
  mergeUnresolvedMentions,
  resolveTargets,
  resolveWorkflowBranchStrategy,
  type DispatchFrame,
  workflowShapeForTargets,
} from './roomRoutingRuntime.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  updateDispatch,
  updateWorkflowTarget,
} from './roomRoutingWorkflow.js';
import type { DispatchExecution } from './runtimeDispatchExecution.js';
import { resolveExecutionMetadataForTarget } from './runtimeTargeting.js';
import {
  participantKey,
  setReadyAfterMessage,
  toParticipantRef,
} from './runtimeSessionState.js';

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
    const appendedResponse = appendMessage(
      nextState,
      channelId,
      {
        senderKind: execution.target.participantKind === 'orchestrator'
          ? 'orchestrator'
          : 'agent',
        senderName: execution.target.participantName,
        body: execution.responseBody ?? '',
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

    const continuationResolution = resolveTargets(nextState, channelId, responseMessage.body, {
      allowDefaultTarget: false,
      explicitTrigger: 'continuation_mention',
    });
    if (continuationResolution.unresolved.length > 0) {
      mergeUnresolvedMentions(outcome, continuationResolution.unresolved);
    }

    if (continuationResolution.targets.length === 0) {
      if (continuationResolution.unresolved.length > 0) {
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'no_targets',
          `No valid continuation targets were resolved from ${execution.target.participantName}'s handoff.`,
          nowIso,
          toParticipantRef(execution.target),
        );
      }
      continue;
    }

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
      );
      break;
    }

    outcome.continuationCount += 1;
    activeTurn.continuationCount = outcome.continuationCount;
    activeTurn.stageId = 'continuation_handoff';
    activeTurn.workflowShape = workflowShapeForTargets(continuationResolution.targets.length);
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
        handoffReason: 'workflow_continuation',
        branchStrategy: continuationResolution.targets.length > 1
          ? 'transplant_context'
          : resolveWorkflowBranchStrategy(
              toParticipantRef(execution.target),
              continuationResolution.targets[0]!,
              execution.depth + 1,
            ),
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
    });
  }

  return {
    state: nextState,
    latestCheckpoint,
    guardReason,
  };
}
