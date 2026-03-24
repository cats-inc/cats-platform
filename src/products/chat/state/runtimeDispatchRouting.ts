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
  setChannelCatLease,
  setChannelRoomRouting,
} from './model.js';
import { refreshDerivedMemoryLayers } from './memoryLayers.js';
import {
  type RoutingTarget,
} from './mentionRouter.js';
import {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from './roomRouting.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createPendingDispatch,
  createRoutingOutcome,
  createWorkflowEvent,
  createWorkflowTurn,
  deriveTerminalTurnStatuses,
  finalizeWorkflowTurn,
  mergeUnresolvedMentions,
  queueWorkflowTarget,
  resolveTargets,
  resolveWakeReasonFromRoutingTrigger,
  resolveWorkflowBranchStrategy,
  resolveWorkflowHandoffReason,
  type DispatchFrame,
  type DispatchRequest,
  type TargetResolution,
  updateDispatch,
  updateWorkflowTarget,
  workflowShapeForTargets,
  workflowStageIdForTrigger,
} from './roomRoutingRuntime.js';
import {
  type RuntimeTransportContext,
  resolveChoiceResponseTarget,
  resolveExecutionMetadataForTarget,
} from './runtimeTargeting.js';
import {
  applyRoomRoutingSnapshot,
  ensureChannelMarkedActive,
  normalizeRuntimeStatus,
  participantKey,
  setErroredSession,
  setReadyAfterMessage,
  toParticipantRef,
} from './runtimeSessionState.js';
import {
  ensureTargetSession,
  maybeAutoCheckoutChannelTask,
} from './runtimeSessionRouting.js';
import {
  type DispatchExecution,
  executeDispatch,
  settleInCompletionOrder,
  shouldBlockAntiPingPong,
} from './runtimeDispatchExecution.js';
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

  const channelAfterUserMessage = buildChannelView(nextState, channelId);
  const userMessage = channelAfterUserMessage.messages[channelAfterUserMessage.messages.length - 1];
  const choiceResponseTarget = payload.choiceResponse
    ? resolveChoiceResponseTarget(
        nextState,
        channelAfterUserMessage,
        payload.choiceResponse.sourceMessageId,
      )
    : null;
  const initialResolution = choiceResponseTarget
    ? {
        targets: [choiceResponseTarget],
        unresolved: [],
        mentionNames: [],
        trigger: 'room_default' as const,
        resolution: {
          routingMode: 'room_default' as const,
          selectionKind: 'default_target' as const,
          defaultTarget: toParticipantRef(choiceResponseTarget),
          defaultTargetReason: null,
          fallbackTarget: null,
          blockedReason: null,
          note: 'Structured choice response routed back to the originating participant.',
        },
      }
    : resolveTargets(nextState, channelId, payload.body, {
        allowDefaultTarget: true,
        explicitTrigger: 'explicit_mention',
      });
  const results: ChannelDispatchResult[] = [];
  const nowIso = now.toISOString();
  const channelRouting = requireChannel(nextState, channelId).roomRouting;
  const baseRoomRouting = resolveRoomRoutingState(channelRouting);
  const workflow = resolveRoomWorkflowState(baseRoomRouting.workflow);
  const maxContinuations =
    baseRoomRouting.maxContinuations ?? DEFAULT_MAX_ROUTING_CONTINUATIONS;
  const maxDispatches =
    baseRoomRouting.maxDispatchesPerTurn ?? DEFAULT_MAX_ROUTING_DISPATCHES;
  const maxTargetVisits =
    baseRoomRouting.maxTargetVisitsPerTurn ?? DEFAULT_MAX_ROUTING_TARGET_VISITS;
  const outcome = createRoutingOutcome(channelAfterUserMessage, userMessage, initialResolution, nowIso);
  const activeTurn = createWorkflowTurn(
    userMessage,
    nowIso,
    workflowStageIdForTrigger(initialResolution.trigger),
    workflowShapeForTargets(initialResolution.targets.length),
  );
  activeTurn.id = outcome.turnId;
  workflow.activeTurn = activeTurn;
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System routing started a new room turn.',
      nowIso,
      null,
      userMessage.id,
      initialResolution.targets.map((target) => toParticipantRef(target)),
      {
        metadata: {
          trigger: initialResolution.trigger,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          selectionKind: initialResolution.resolution.selectionKind,
          defaultTargetReason: initialResolution.resolution.defaultTargetReason,
          blockedReason: initialResolution.resolution.blockedReason,
          unresolvedMentions: structuredClone(initialResolution.unresolved),
        },
      },
    ),
  );
  let latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'turn_started',
    'System routing started a new room turn.',
    nowIso,
    null,
    initialResolution.targets.map((target) => toParticipantRef(target)),
  );

  if (initialResolution.unresolved.length > 0) {
    mergeUnresolvedMentions(outcome, initialResolution.unresolved);
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: `Unresolved mentions: ${initialResolution.unresolved.map((item) => `@${item}`).join(', ')}`,
      },
      now,
      {
        metadata: {
          event: 'unresolved_mentions',
          mentions: initialResolution.unresolved,
        },
      },
    ).state;
  }

  if (initialResolution.targets.length === 0) {
    const blockedTargets = outcome.resolution.defaultTarget
      ? [outcome.resolution.defaultTarget]
      : [];
    const blockedNote = outcome.resolution.note
      ?? 'No routing targets matched this message. Mention someone or let the room default target handle it.';
    latestCheckpoint = addWorkflowCheckpoint(
      outcome,
      workflow,
      activeTurn,
      'no_targets',
      blockedNote,
      nowIso,
      null,
      blockedTargets,
    );
    outcome.status = 'blocked';
    outcome.completedAt = nowIso;
    activeTurn.status = 'blocked';
    activeTurn.stageId = 'blocked';
    activeTurn.completedAt = nowIso;
    activeTurn.updatedAt = nowIso;
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: blockedNote,
      },
      now,
      {
        metadata: {
          event: 'routing_skipped',
          blockedReason: outcome.resolution.blockedReason,
          selectionKind: outcome.resolution.selectionKind,
        },
      },
    ).state;
    appendWorkflowEvent(
      workflow,
      activeTurn,
      createWorkflowEvent(
        activeTurn.id,
        'outcome',
        'blocked',
        blockedNote,
        nowIso,
        null,
        userMessage.id,
        blockedTargets,
        {
          outcomeId: randomUUID(),
          metadata: {
            workflowStageId: activeTurn.stageId,
            workflowShape: activeTurn.workflowShape,
            status: 'blocked',
            blockedReason: outcome.resolution.blockedReason,
          },
        },
      ),
    );
    finalizeWorkflowTurn(workflow, activeTurn);
    nextState = applyRoomRoutingSnapshot(
      nextState,
      channelId,
      baseRoomRouting,
      workflow,
      outcome,
      latestCheckpoint,
      now,
    );
    return { state: nextState, results };
  }

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

    const readyRequests: DispatchRequest[] = [];
    for (const request of allowedRequests) {
      const ensured = await ensureTargetSession(
        nextState,
        channelId,
        request.target,
        runtimeClient,
        now,
        {
          transport: options.transport,
          companionStore: options.companionStore,
          memoryService: options.memoryService,
          roomRouting: baseRoomRouting,
          wakeTrigger: 'route_target',
          wakeReason: request.trigger === 'continuation_mention'
            ? 'workflow_continuation'
            : resolveWakeReasonFromRoutingTrigger(request.trigger),
          sourceMessageId: request.sourceMessage.id,
        },
      );
      nextState = ensured.state;
      if (ensured.error) {
        updateDispatch(outcome, request.dispatchId, {
          status: 'error',
          completedAt: nowIso,
          error: ensured.error,
        });
        updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
          wakeRequestId: ensured.wakeRequest?.id ?? null,
          status: 'failed',
          completedAt: nowIso,
          error: ensured.error,
        });
        appendWorkflowEvent(
          workflow,
          activeTurn,
          createWorkflowEvent(
            activeTurn.id,
            'target_failed',
            'failed',
            `Failed to wake ${request.target.participantName}: ${ensured.error}`,
            nowIso,
            request.sourceParticipant,
            request.sourceMessage.id,
            [toParticipantRef(request.target)],
            {
              dispatchId: request.dispatchId,
              metadata: {
                phase: 'wake',
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
          'runtime_error',
          `Failed to wake ${request.target.participantName}: ${ensured.error}`,
          nowIso,
          request.sourceParticipant,
          [toParticipantRef(request.target)],
        );
        results.push({
          targetKind: request.target.participantKind,
          targetId: request.target.participantId,
          targetName: request.target.participantName,
          sessionId: null,
          status: 'error',
          dispatchId: request.dispatchId,
          turnId: activeTurn.id,
          targetStatus: 'failed',
          error: ensured.error,
          sourceMessageId: request.sourceMessage.id,
          trigger: request.trigger,
          dispatchDepth: request.depth,
        });
        continue;
      }

      nextState = ensureChannelMarkedActive(nextState, channelId, now);
      await maybeAutoCheckoutChannelTask(
        options.chatStore,
        runtimeClient,
        channelId,
        ensured.target,
        now,
      );
      readyRequests.push({
        ...request,
        target: ensured.target,
      });
      updateDispatch(outcome, request.dispatchId, {
        status: 'running',
        startedAt: nowIso,
      });
      updateWorkflowTarget(activeTurn, request.targetStateId, nowIso, {
        wakeRequestId: ensured.wakeRequest?.id ?? null,
        status: 'running',
        startedAt: nowIso,
      });
      appendWorkflowEvent(
        workflow,
        activeTurn,
        createWorkflowEvent(
          activeTurn.id,
          'target_running',
          'running',
          `${ensured.target.participantName} is running this room dispatch.`,
          nowIso,
          request.sourceParticipant,
          request.sourceMessage.id,
          [toParticipantRef(ensured.target)],
            {
              dispatchId: request.dispatchId,
              metadata: {
                depth: request.depth,
                trigger: request.trigger,
                parentCheckpointId: request.parentCheckpointId,
                branchStrategy: request.branchStrategy,
                handoffReason: request.handoffReason,
              },
            },
          ),
        );
    }

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

    if (guardReason) {
      break;
    }
  }

  outcome.guard = guardReason;
  activeTurn.guard = guardReason;
  activeTurn.continuationCount = outcome.continuationCount;
  activeTurn.dispatchCount = outcome.totalDispatchCount;
  activeTurn.stageId = guardReason ? 'guard_blocked' : 'turn_completed';
  const terminalStatuses = deriveTerminalTurnStatuses(outcome, guardReason);
  outcome.status = terminalStatuses.outcomeStatus;
  activeTurn.status = terminalStatuses.workflowStatus;
  outcome.completedAt = nowIso;
  activeTurn.completedAt = nowIso;
  activeTurn.updatedAt = nowIso;
  latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'completed',
    guardReason
      ? `Room routing stopped because it hit ${describeGuardReason(guardReason)}.`
      : 'Room routing completed for this turn.',
    nowIso,
    null,
  );
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'outcome',
      activeTurn.status,
      guardReason
        ? `Room workflow ended in a blocked state because it hit ${describeGuardReason(guardReason)}.`
        : activeTurn.status === 'completed'
          ? 'Room workflow completed for this turn.'
          : 'Room workflow ended with failures for this turn.',
      nowIso,
      null,
      userMessage.id,
      outcome.resolvedTargets,
      {
        outcomeId: randomUUID(),
        metadata: {
          guard: guardReason,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          workflowLastCheckpointId: activeTurn.lastCheckpointId,
          selectionKind: outcome.resolution.selectionKind,
          defaultTargetReason: outcome.resolution.defaultTargetReason,
          blockedReason: outcome.resolution.blockedReason,
          continuationCount: outcome.continuationCount,
          totalDispatchCount: outcome.totalDispatchCount,
          unresolvedMentions: structuredClone(outcome.unresolvedMentions),
        },
      },
    ),
  );
  finalizeWorkflowTurn(workflow, activeTurn);
  nextState = applyRoomRoutingSnapshot(
    nextState,
    channelId,
    baseRoomRouting,
    workflow,
    outcome,
    latestCheckpoint,
    now,
  );

  return { state: nextState, results };
}
