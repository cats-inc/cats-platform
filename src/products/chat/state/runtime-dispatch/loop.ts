import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingState,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import {
  type DispatchFrame,
  type DispatchRequest,
  type TargetResolution,
  resolveWorkflowBranchStrategy,
  resolveWorkflowHandoffReason,
} from '../room-routing/runtime.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createPendingDispatch,
  createWorkflowEvent,
  queueWorkflowTarget,
  updateDispatch,
  updateWorkflowTarget,
} from '../room-routing/workflow.js';
import { resolveWakeReasonFromRoutingTrigger } from '../room-routing/wake.js';
import type { RuntimeTransportContext } from '../runtimeTargeting.js';
import {
  type DispatchExecution,
  executeDispatch,
  settleInCompletionOrder,
  shouldBlockAntiPingPong,
} from './execution.js';
import { prepareReadyRequests } from './wake.js';
import { applyDispatchExecutions } from './results.js';
import {
  participantKey,
  toParticipantRef,
} from '../runtime-session/state.js';
import {
  materializeInFlightDispatchState,
  persistInFlightDispatchState,
} from './persistence.js';

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
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'write' | 'readCore' | 'writeCore'>;
}

export async function processDispatchQueue(
  options: ProcessDispatchQueueOptions,
): Promise<{
  state: ChatState;
  latestCheckpoint: RoomRoutingCheckpoint | null;
  guardReason: RoomRoutingGuardReason;
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
    transport,
    userMessage,
    workflow,
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

  while (queue.length > 0) {
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

    const allowedRequests: DispatchRequest[] = [];
    for (const target of frame.targets) {
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
        );
        break;
      }

      const request: DispatchRequest = {
        ...frame,
        target,
        dispatchId: randomUUID(),
        targetStateId: randomUUID(),
        parentCheckpointId: latestCheckpoint?.id ?? null,
        branchStrategy: frame.branchStrategyOverride
          ?? resolveWorkflowBranchStrategy(
            frame.sourceParticipant,
            target,
            frame.depth,
          ),
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
          frame.sourceMessage.id,
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
            frame.sourceMessage.id,
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
        );
        if (frame.targets.length === 1 && queue.length === 0) {
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
          sourceMessageId: frame.sourceMessage.id,
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
            frame.sourceMessage.id,
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
        );
        if (frame.targets.length === 1 && queue.length === 0) {
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
          sourceMessageId: frame.sourceMessage.id,
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
      activeTurn.workflowShape = 'parallel';
      activeTurn.stageId = 'parallel_fan_out';
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
          frame.sourceMessage.id,
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
        companionStore,
        memoryService,
        chatStore,
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
    latestCheckpoint = wakePrepared.latestCheckpoint;
    const readyRequests = wakePrepared.readyRequests;

    if (readyRequests.length === 0) {
      continue;
    }

    const stateSnapshot = nextState;
    const executions = await settleInCompletionOrder(
      readyRequests.map((request) =>
        executeDispatch(
          stateSnapshot,
          channelId,
          request,
          runtimeClient,
          now,
          transport,
          companionStore,
        ),
      ),
    );

    const appliedExecutions = applyDispatchExecutions(
      nextState,
      channelId,
      executions,
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
    nextState = materializeInFlightDispatchState(
      appliedExecutions.state,
      channelId,
      baseRoomRouting,
      workflow,
      outcome,
      appliedExecutions.latestCheckpoint,
      now,
    );
    nextState = await persistInFlightDispatchState(chatStore, nextState);
    latestCheckpoint = appliedExecutions.latestCheckpoint;
    guardReason = guardReason ?? appliedExecutions.guardReason;

    if (guardReason) {
      break;
    }
  }

  return {
    state: nextState,
    latestCheckpoint,
    guardReason,
  };
}
