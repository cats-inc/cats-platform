import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRouteBlockedReason,
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingState,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import {
  appendMessage,
} from '../model/index.js';
import {
  type DispatchFrame,
  type DispatchRequest,
  type TargetResolution,
  resolveWorkflowBranchStrategy,
  resolveWorkflowHandoffReason,
} from '../room-routing/runtime.js';
import {
  buildContinuationReplayMetadata,
} from '../room-routing/continuationReplay.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createPendingDispatch,
  createWorkflowEvent,
  queueWorkflowTarget,
  updateDispatch,
  updateWorkflowTarget,
} from '../room-routing/workflow.js';
import type { RuntimeTransportContext } from '../runtimeTargeting.js';
import {
  settleInCompletionOrder,
  shouldBlockAntiPingPong,
} from './execution.js';
import {
  cancelInFlightWorkflowTargets,
  consumeCancellationRequest,
} from './cancellationSupport.js';
import {
  executeDispatchWithRecovery,
  prepareReadyRequests,
} from './wake.js';
import { applyDispatchExecutions } from './results.js';
import {
  participantKey,
  toParticipantRef,
} from '../runtime-session/state.js';
import {
  materializeInFlightDispatchState,
  persistInFlightDispatchState,
} from './persistence.js';
import type {
  ChannelDispatchCancellationRegistry,
  ChannelDispatchCancellationRequest,
} from './cancellation.js';

export interface ProcessDispatchQueueOptions {
  state: ChatState;
  channelId: string;
  runtimeClient: RuntimeClient;
  now: Date;
  nowIso: string;
  baseRoomRouting: RoomRoutingState;
  workflow: RoomWorkflowState;
  activeTurn: RoomWorkflowTurn;
  outcome: import('../../../../shared/roomRouting.js').RoomRoutingOutcome;
  latestCheckpoint: RoomRoutingCheckpoint | null;
  initialResolution: TargetResolution;
  userMessage: ChatMessage;
  results: ChannelDispatchResult[];
  maxContinuations: number;
  maxDispatches: number;
  maxTargetVisits: number;
  describeGuardReason: (reason: Exclude<RoomRoutingGuardReason, null>) => string;
  transport?: RuntimeTransportContext;
  transportBindingId?: string | null;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'write' | 'readCore' | 'writeCore'>;
  chatStatePath?: string;
  runtimeDataDir?: string;
  runtimeRecovery: RuntimeDispatchRecoveryPolicy;
  cancellationRegistry?: ChannelDispatchCancellationRegistry;
  onStateWritten?: (channelId: string) => void;
}

export async function processDispatchQueue(
  options: ProcessDispatchQueueOptions,
): Promise<{
  state: ChatState;
  latestCheckpoint: RoomRoutingCheckpoint | null;
  guardReason: RoomRoutingGuardReason;
  blockedResolution: {
    blockedReason: RoomRouteBlockedReason;
    note: string;
  } | null;
}> {
  const {
    activeTurn,
    baseRoomRouting,
    channelId,
    chatStore,
    companionStore,
    describeGuardReason,
    initialResolution,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    memoryService,
    now,
    nowIso,
    outcome,
    results,
    runtimeClient,
    runtimeRecovery,
    transport,
    userMessage,
    workflow,
    cancellationRegistry,
  } = options;
  let latestCheckpoint = options.latestCheckpoint;
  let nextState = options.state;

  const queue: DispatchFrame[] = [
    {
      sourceMessage: userMessage,
      sourceParticipant: null,
      targets: initialResolution.targets,
      unresolved: initialResolution.unresolved,
      mentionNames: initialResolution.mentionNames,
      trigger: initialResolution.trigger,
      depth: 0,
    },
  ];
  const targetVisitCounts = new Map<string, number>();
  let guardReason: RoomRoutingGuardReason = null;
  let blockedResolution: {
    blockedReason: RoomRouteBlockedReason;
    note: string;
  } | null = null;
  let cancellationRequest: ChannelDispatchCancellationRequest | null = null;

  while (queue.length > 0) {
    cancellationRequest = cancellationRequest
      ?? consumeCancellationRequest(
        cancellationRegistry,
        channelId,
        nowIso,
        activeTurn,
        workflow,
        outcome,
        results,
      );
    if (cancellationRequest) {
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Chat',
          body: cancellationRequest.note,
        },
        now,
        {
          metadata: {
            event: 'routing_cancelled',
            blockedReason: 'user_cancelled',
          },
          incrementUnread: false,
        },
      ).state;
      blockedResolution = {
        blockedReason: 'user_cancelled',
        note: cancellationRequest.note,
      };
      break;
    }

    const frame = queue.shift();
    if (!frame) {
      break;
    }

    if (frame.workflowShapeOverride) {
      activeTurn.workflowShape = frame.workflowShapeOverride;
    }
    if (frame.workflowStageId) {
      activeTurn.stageId = frame.workflowStageId;
    }
    if (frame.reviewRequired !== undefined) {
      activeTurn.reviewRequired = frame.reviewRequired;
    }

    const shouldProcessSequentially =
      frame.targets.length > 1 && activeTurn.workflowShape === 'sequential';
    const targetsForThisPass = shouldProcessSequentially
      ? [frame.targets[0]!]
      : frame.targets;
    if (shouldProcessSequentially) {
      queue.unshift({
        ...frame,
        targets: frame.targets.slice(1),
        // Keep the original room-audience queue on the sequential rail even if
        // an earlier reply mutates the active turn's workflow shape.
        workflowShapeOverride: 'sequential',
      });
    }

    const effectiveSourceMessage = frame.promptSourceMessage ?? frame.sourceMessage;
    const allowedRequests: DispatchRequest[] = [];
    for (const target of targetsForThisPass) {
      const branchStrategy = frame.branchStrategyOverride
        ?? resolveWorkflowBranchStrategy(
          frame.sourceParticipant,
          target,
          frame.depth,
        );
      if (outcome.totalDispatchCount >= maxDispatches) {
        guardReason = 'max_dispatches';
        activeTurn.guard = guardReason;
        activeTurn.status = 'blocked';
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'loop_guard',
          `Room routing stopped after reaching ${describeGuardReason('max_dispatches')}.`,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
          {
            reason: 'max_dispatches',
            branchStrategy,
            ...buildContinuationReplayMetadata({
              sourceMessageId: effectiveSourceMessage.id,
              mentionNames: frame.mentionNames,
              trigger: frame.trigger,
              workflowStageId: activeTurn.stageId,
              workflowShape: activeTurn.workflowShape,
              reviewRequired: activeTurn.reviewRequired,
              continuationSource: frame.continuationSource ?? null,
              workflowRecommendation: frame.workflowRecommendation ?? null,
              unresolvedTargets: frame.unresolved,
            }),
          },
        );
        break;
      }

      const request: DispatchRequest = {
        ...frame,
        turnId: activeTurn.id,
        sourceMessage: effectiveSourceMessage,
        target,
        dispatchId: randomUUID(),
        targetStateId: randomUUID(),
        parentCheckpointId: latestCheckpoint?.id ?? null,
        branchStrategy,
        handoffReason: resolveWorkflowHandoffReason(frame.trigger),
      };
      createPendingDispatch(outcome, request, nowIso);
      queueWorkflowTarget(activeTurn, request, nowIso);
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'target_pending',
          'pending',
          `${target.participantName} is pending dispatch for this room turn.`,
          nowIso,
          frame.sourceParticipant,
          effectiveSourceMessage.id,
          [toParticipantRef(target)],
          {
            dispatchId: request.dispatchId,
            metadata: {
              depth: frame.depth,
              trigger: frame.trigger,
              parentCheckpointId: request.parentCheckpointId,
              branchStrategy: request.branchStrategy,
              handoffReason: request.handoffReason,
              mentionNames: structuredClone(frame.mentionNames),
              continuationSource: frame.continuationSource ?? null,
              workflowRecommendation: frame.workflowRecommendation
                ? structuredClone(frame.workflowRecommendation)
                : null,
            },
          },
        ),
      );

      const targetKey = participantKey(target);
      if ((targetVisitCounts.get(targetKey) ?? 0) >= maxTargetVisits) {
        const blockedError = `${target.participantName} already reached the per-turn revisit limit.`;
        updateDispatch(outcome, request.dispatchId, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        appendWorkflowEvent(
          workflow,
          activeTurn,
          createWorkflowEvent(
            activeTurn.id,
            'target_blocked',
            'blocked',
            blockedError,
            nowIso,
            frame.sourceParticipant,
            effectiveSourceMessage.id,
            [toParticipantRef(target)],
            {
              dispatchId: request.dispatchId,
              metadata: {
                reason: 'max_target_visits',
                parentCheckpointId: request.parentCheckpointId,
                branchStrategy: request.branchStrategy,
                handoffReason: request.handoffReason,
                continuationSource: frame.continuationSource ?? null,
                workflowRecommendation: frame.workflowRecommendation
                  ? structuredClone(frame.workflowRecommendation)
                  : null,
              },
            },
          ),
        );
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'loop_guard',
          `${target.participantName} was blocked after reaching ${describeGuardReason('max_target_visits')}.`,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
          {
            reason: 'max_target_visits',
            branchStrategy: request.branchStrategy,
            ...buildContinuationReplayMetadata({
              sourceMessageId: effectiveSourceMessage.id,
              mentionNames: frame.mentionNames,
              trigger: frame.trigger,
              workflowStageId: activeTurn.stageId,
              workflowShape: activeTurn.workflowShape,
              reviewRequired: activeTurn.reviewRequired,
              continuationSource: frame.continuationSource ?? null,
              workflowRecommendation: frame.workflowRecommendation ?? null,
              unresolvedTargets: frame.unresolved,
            }),
          },
        );
        if (targetsForThisPass.length === 1 && queue.length === 0) {
          guardReason = 'max_target_visits';
        }
        results.push({
          targetKind: target.participantKind,
          targetId: target.participantId,
          targetName: target.participantName,
          sessionId: target.sessionId,
          status: 'skipped',
          dispatchId: request.dispatchId,
          turnId: activeTurn.id,
          targetStatus: 'blocked',
          error: blockedError,
          sourceMessageId: effectiveSourceMessage.id,
          trigger: frame.trigger,
          dispatchDepth: frame.depth,
        });
        continue;
      }

      if (
        frame.sourceParticipant
        && shouldBlockAntiPingPong(frame.sourceParticipant, target, outcome.dispatches)
      ) {
        const blockedError = `Blocked a routing ping-pong between ${frame.sourceParticipant.participantName} and ${target.participantName}.`;
        updateDispatch(outcome, request.dispatchId, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
          status: 'blocked',
          completedAt: nowIso,
          error: blockedError,
        });
        appendWorkflowEvent(
          workflow,
          activeTurn,
          createWorkflowEvent(
            activeTurn.id,
            'target_blocked',
            'blocked',
            blockedError,
            nowIso,
            frame.sourceParticipant,
            effectiveSourceMessage.id,
            [toParticipantRef(target)],
            {
              dispatchId: request.dispatchId,
              metadata: {
                reason: 'anti_ping_pong',
                parentCheckpointId: request.parentCheckpointId,
                branchStrategy: request.branchStrategy,
                handoffReason: request.handoffReason,
                continuationSource: frame.continuationSource ?? null,
                workflowRecommendation: frame.workflowRecommendation
                  ? structuredClone(frame.workflowRecommendation)
                  : null,
              },
            },
          ),
        );
        latestCheckpoint = addWorkflowCheckpoint(
          outcome,
          workflow,
          activeTurn,
          'anti_ping_pong',
          blockedError,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
          {
            reason: 'anti_ping_pong',
            branchStrategy: request.branchStrategy,
            ...buildContinuationReplayMetadata({
              sourceMessageId: effectiveSourceMessage.id,
              mentionNames: frame.mentionNames,
              trigger: frame.trigger,
              workflowStageId: activeTurn.stageId,
              workflowShape: activeTurn.workflowShape,
              reviewRequired: activeTurn.reviewRequired,
              continuationSource: frame.continuationSource ?? null,
              workflowRecommendation: frame.workflowRecommendation ?? null,
              unresolvedTargets: frame.unresolved,
            }),
          },
        );
        if (targetsForThisPass.length === 1 && queue.length === 0) {
          guardReason = 'anti_ping_pong';
        }
        results.push({
          targetKind: target.participantKind,
          targetId: target.participantId,
          targetName: target.participantName,
          sessionId: target.sessionId,
          status: 'skipped',
          dispatchId: request.dispatchId,
          turnId: activeTurn.id,
          targetStatus: 'blocked',
          error: blockedError,
          sourceMessageId: effectiveSourceMessage.id,
          trigger: frame.trigger,
          dispatchDepth: frame.depth,
        });
        continue;
      }

      allowedRequests.push(request);
    }

    if (guardReason === 'max_dispatches') {
      break;
    }
    if (allowedRequests.length === 0) {
      if (guardReason) {
        break;
      }
      continue;
    }

    if (allowedRequests.length > 1) {
      activeTurn.workflowShape = 'concurrent';
      activeTurn.stageId = 'concurrent_fan_out';
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'fan_out',
          'running',
          `Fan-out scheduled ${allowedRequests.map((request) => request.target.participantName).join(', ')} in parallel.`,
          nowIso,
          frame.sourceParticipant,
          effectiveSourceMessage.id,
          allowedRequests.map((request) => toParticipantRef(request.target)),
          {
            metadata: {
              branchCount: allowedRequests.length,
              workflowStageId: activeTurn.stageId,
              workflowShape: activeTurn.workflowShape,
              continuationSource: frame.continuationSource ?? null,
              workflowRecommendation: frame.workflowRecommendation
                ? structuredClone(frame.workflowRecommendation)
                : null,
            },
          },
        ),
      );
      latestCheckpoint = addWorkflowCheckpoint(
        outcome,
        workflow,
        activeTurn,
        'fan_out',
        `Fan-out routed this step to ${allowedRequests.map((request) => request.target.participantName).join(', ')}.`,
        nowIso,
        frame.sourceParticipant,
        allowedRequests.map((request) => toParticipantRef(request.target)),
        {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          continuationSource: frame.continuationSource ?? null,
          workflowRecommendation: frame.workflowRecommendation
            ? structuredClone(frame.workflowRecommendation)
            : null,
        },
      );
    }

    const wakePrepared = await prepareReadyRequests(
      nextState,
      channelId,
      allowedRequests,
      runtimeClient,
      now,
      {
        nowIso,
        baseRoomRouting,
        workflow,
        activeTurn,
        outcome,
        latestCheckpoint,
        results,
        transport,
        transportBindingId: options.transportBindingId,
        companionStore,
        memoryService,
        chatStore,
        chatStatePath: options.chatStatePath,
        runtimeDataDir: options.runtimeDataDir,
      },
    );
    nextState = materializeInFlightDispatchState(
      wakePrepared.state,
      channelId,
      baseRoomRouting,
      workflow,
      outcome,
      wakePrepared.latestCheckpoint,
      now,
    );
    nextState = await persistInFlightDispatchState(chatStore, nextState);
    options.onStateWritten?.(channelId);
    latestCheckpoint = wakePrepared.latestCheckpoint;
    const readyRequests = wakePrepared.readyRequests;

    cancellationRequest = cancellationRequest
      ?? consumeCancellationRequest(
        cancellationRegistry,
        channelId,
        nowIso,
        activeTurn,
        workflow,
        outcome,
        results,
      );
    if (cancellationRequest) {
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Chat',
          body: cancellationRequest.note,
        },
        now,
        {
          metadata: {
            event: 'routing_cancelled',
            blockedReason: 'user_cancelled',
          },
          incrementUnread: false,
        },
      ).state;
      blockedResolution = {
        blockedReason: 'user_cancelled',
        note: cancellationRequest.note,
      };
      break;
    }

    if (readyRequests.length === 0) {
      continue;
    }

    const stateSnapshot = nextState;
    const executions = await settleInCompletionOrder(
      readyRequests.map((request) =>
        executeDispatchWithRecovery({
          state: stateSnapshot,
          channelId,
          request,
          runtimeClient,
          now,
          transport,
          transportBindingId: options.transportBindingId,
          companionStore,
          memoryService,
          chatStore,
          chatStatePath: options.chatStatePath,
          runtimeDataDir: options.runtimeDataDir,
          runtimeRecovery,
        }),
      ),
    );

    cancellationRequest = cancellationRequest
      ?? consumeCancellationRequest(
        cancellationRegistry,
        channelId,
        nowIso,
        activeTurn,
        workflow,
        outcome,
        results,
      );

    const executionsForThisPass = cancellationRequest
      ? executions.filter((execution) => !execution.error)
      : executions;

    const appliedExecutions = applyDispatchExecutions(
      nextState,
      channelId,
      executionsForThisPass,
      now,
      {
        nowIso,
        workflow,
        activeTurn,
        outcome,
        latestCheckpoint,
        maxContinuations,
        results,
        targetVisitCounts,
        queue,
        describeGuardReason,
      },
    );
    if (cancellationRequest) {
      nextState = appendMessage(
        appliedExecutions.state,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Chat',
          body: cancellationRequest.note,
        },
        now,
        {
          metadata: {
            event: 'routing_cancelled',
            blockedReason: 'user_cancelled',
          },
          incrementUnread: false,
        },
      ).state;
      cancelInFlightWorkflowTargets({
        workflow,
        activeTurn,
        outcome,
        results,
        nowIso,
      });
      blockedResolution = {
        blockedReason: 'user_cancelled',
        note: cancellationRequest.note,
      };
    } else {
      nextState = appliedExecutions.state;
    }
    nextState = materializeInFlightDispatchState(
      nextState,
      channelId,
      baseRoomRouting,
      workflow,
      outcome,
      appliedExecutions.latestCheckpoint,
      now,
    );
    nextState = await persistInFlightDispatchState(chatStore, nextState);
    options.onStateWritten?.(channelId);
    latestCheckpoint = appliedExecutions.latestCheckpoint;
    guardReason = guardReason ?? appliedExecutions.guardReason;
    blockedResolution = blockedResolution ?? appliedExecutions.blockedResolution;

    if (guardReason || blockedResolution) {
      break;
    }
  }

  return {
    state: nextState,
    latestCheckpoint,
    guardReason,
    blockedResolution,
  };
}
