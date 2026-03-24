import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatChannelState,
  ChatState,
} from '../api/contracts.js';
import type {
  RoomRouteResolution,
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingTrigger,
  RoomWorkflowEvent,
  RoomWorkflowBranchStrategy,
  RoomWorkflowEventKind,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetState,
  RoomWorkflowTargetStatus,
  RoomWorkflowTurn,
} from '../../../shared/roomRouting.js';
import type {
  CompanionBoxStore,
} from './companionBoxStore.js';
import type { ChatStore } from './store.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../platform/memory/runtimeMaintenance.js';
import type {
  RuntimeClient,
} from '../../../platform/runtime/client.js';
import {
  appendMessage,
  buildChannelView,
  requireChannel,
  setChannelPendingExecutionTarget,
  setChannelOrchestratorLease,
  setChannelRoomRouting,
} from './model.js';
import { refreshDerivedMemoryLayers } from './memoryLayers.js';
import {
  type RoutingTarget,
} from './mentionRouter.js';
import {
  resolveRoomRoutingState,
} from './roomRouting.js';
import {
  resolveWorkflowBranchStrategy,
  resolveWorkflowHandoffReason,
  type DispatchFrame,
  type DispatchRequest,
  type TargetResolution,
} from './roomRoutingRuntime.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createPendingDispatch,
  createWorkflowEvent,
  queueWorkflowTarget,
  updateDispatch,
  updateWorkflowTarget,
} from './roomRoutingWorkflow.js';
import {
  resolveWakeReasonFromRoutingTrigger,
} from './roomRoutingWake.js';
import {
  type RuntimeTransportContext,
} from './runtimeTargeting.js';
import {
  applyRoomRoutingSnapshot,
  ensureChannelMarkedActive,
  normalizeRuntimeStatus,
  participantKey,
  setErroredSession,
  toParticipantRef,
} from './runtimeSessionState.js';
import {
  type DispatchExecution,
  executeDispatch,
  settleInCompletionOrder,
  shouldBlockAntiPingPong,
} from './runtimeDispatchExecution.js';
import {
  prepareDispatchTurn,
} from './runtimeDispatchTurn.js';
import {
  finalizeDispatchTurn,
} from './runtimeDispatchFinalize.js';
import {
  prepareReadyRequests,
} from './runtimeDispatchWake.js';
import { applyDispatchExecutions } from './runtimeDispatchResults.js';
interface RouteChannelMessageOptions {
  transport?: RuntimeTransportContext;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
}

function normalizePendingTargetValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function describeGuardReason(reason: Exclude<RoomRoutingGuardReason, null>): string {
  switch (reason) {
    case 'max_continuations':
      return 'the continuation depth limit';
    case 'max_dispatches':
      return 'the per-turn dispatch limit';
    case 'max_target_visits':
      return 'the per-target revisit limit';
    case 'anti_ping_pong':
      return 'anti-ping-pong protection';
    default:
      return 'a routing guard';
  }
}

export async function routeChannelMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  let nextState = state;
  const channelBeforeMessage = requireChannel(nextState, channelId);
  const nextPendingProvider = payload.pendingProvider === undefined
    ? channelBeforeMessage.pendingProvider
    : normalizePendingTargetValue(payload.pendingProvider);
  const nextPendingModel = payload.pendingModel === undefined
    ? channelBeforeMessage.pendingModel
    : normalizePendingTargetValue(payload.pendingModel);
  const nextPendingInstance = payload.pendingInstance === undefined
    ? channelBeforeMessage.pendingInstance
    : normalizePendingTargetValue(payload.pendingInstance);
  const pendingTargetChanged = channelBeforeMessage.composerMode === 'solo'
    && (
      nextPendingProvider !== channelBeforeMessage.pendingProvider
      || nextPendingModel !== channelBeforeMessage.pendingModel
      || nextPendingInstance !== channelBeforeMessage.pendingInstance
    );

  if (
    pendingTargetChanged
    && channelBeforeMessage.orchestratorLease.sessionId
  ) {
    await bestEffortFlushRuntimeSessionMemory({
      runtimeClient,
      sessionId: channelBeforeMessage.orchestratorLease.sessionId,
      requestedPhase: 'pre_reset',
      memoryService: options.memoryService,
      companionStore: options.companionStore,
      now,
    });
    await runtimeClient.closeSession(channelBeforeMessage.orchestratorLease.sessionId);
    nextState = setChannelOrchestratorLease(
      nextState,
      channelId,
      {
        sessionId: null,
        status: 'not_started',
        lastError: null,
        provider: nextPendingProvider,
        model: nextPendingModel,
        startedAt: null,
      },
      now,
    );
  }

  nextState = setChannelPendingExecutionTarget(
    nextState,
    channelId,
    {
      provider: nextPendingProvider,
      model: nextPendingModel,
      instance: nextPendingInstance,
    },
    now,
  );
  nextState = appendMessage(
    nextState,
    channelId,
    {
      senderKind: 'user',
      senderName: payload.senderName?.trim() || 'User',
      body: payload.body,
    },
    now,
    {
      metadata: payload.choiceResponse
        ? {
            event: 'choice_response',
            sourceMessageId: payload.choiceResponse.sourceMessageId,
          }
        : {},
      choiceResponse: payload.choiceResponse,
    },
  ).state;
  nextState = refreshDerivedMemoryLayers(nextState, channelId, now);

  const preparedTurn = prepareDispatchTurn(nextState, channelId, payload, now);
  nextState = preparedTurn.state;
  if (preparedTurn.terminalResult) {
    return preparedTurn.terminalResult;
  }
  const {
    activeTurn,
    baseRoomRouting,
    initialResolution,
    latestCheckpoint: initialCheckpoint,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    nowIso,
    outcome,
    results,
    userMessage,
    workflow,
  } = preparedTurn;
  let latestCheckpoint = initialCheckpoint;

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
        branchStrategy: resolveWorkflowBranchStrategy(
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
        transport: options.transport,
        companionStore: options.companionStore,
        memoryService: options.memoryService,
        chatStore: options.chatStore,
      },
    );
    nextState = wakePrepared.state;
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
          options.transport,
          options.companionStore,
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
    nextState = appliedExecutions.state;
    latestCheckpoint = appliedExecutions.latestCheckpoint;
    guardReason = guardReason ?? appliedExecutions.guardReason;

    if (guardReason) {
      break;
    }
  }

  nextState = finalizeDispatchTurn(nextState, channelId, now, {
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    guardReason,
    userMessageId: userMessage.id,
    describeGuardReason,
  });

  return { state: nextState, results };
}
