import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type { CatsCoreState } from '../../../../core/types.js';
import type {
  RoomRoutingGuardReason,
} from '../../../../shared/roomRouting.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import type {
  CompanionBoxStore,
} from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import type {
  RuntimeClient,
} from '../../../../platform/runtime/client.js';
import {
  appendMessage,
  requireChannel,
  setChannelPendingExecutionTarget,
  setChannelOrchestratorLease,
} from '../model/index.js';
import {
  cloneProviderModelSelection,
  createExplicitProviderModelSelection,
  sameProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import { normalizeRuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import {
  buildCanonicalChatUserMessage,
} from '../chatCoreInterop.js';
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import {
  type RuntimeTransportContext,
} from '../runtimeTargeting.js';
import {
  prepareDispatchTurn,
  prepareDispatchTurnForExistingUserMessage,
} from './turn.js';
import type {
  ChannelDispatchCancellationRegistry,
} from './cancellation.js';
import {
  materializeInFlightDispatchState,
  persistInFlightDispatchState,
} from './persistence.js';
import {
  finalizeDispatchTurn,
} from './finalize.js';
import { processDispatchQueue } from './loop.js';
import { mergeCompletedDispatchState } from './merge.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  finalizeWorkflowTurn,
} from '../room-routing/workflow.js';
import { applyRoomRoutingSnapshot } from '../runtime-session/state.js';
import { resolveOrchestratorLeaseAttachment } from '../../shared/channelParticipants.js';

interface RouteChannelMessageOptions {
  transport?: RuntimeTransportContext;
  transportBindingId?: string | null;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'write' | 'readCore' | 'writeCore'>;
  latestState?: ChatState;
  runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
  chatStatePath?: string;
  runtimeDataDir?: string;
  cancellationRegistry?: ChannelDispatchCancellationRegistry;
  onStateWritten?: (channelId: string) => void;
}

function readMessageRetryMetadata(
  message: ChatMessage,
): SendChannelMessageInput['messageMetadata'] | undefined {
  const candidateMetadata = message.metadata ?? {};
  const recipientParticipantIds = Array.isArray(candidateMetadata.recipientParticipantIds)
    ? candidateMetadata.recipientParticipantIds.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  const workflowShape = candidateMetadata.workflowShape;
  const normalizedWorkflowShape =
    workflowShape === 'sequential'
      || workflowShape === 'concurrent'
      || workflowShape === 'converge'
      || workflowShape === 'parallel'
      ? workflowShape
      : null;

  if (recipientParticipantIds.length === 0 && !normalizedWorkflowShape) {
    return undefined;
  }

  return {
    ...(recipientParticipantIds.length > 0
      ? {
          recipientParticipantIds,
        }
      : {}),
    ...(normalizedWorkflowShape
      ? {
          workflowShape: normalizedWorkflowShape,
        }
      : {}),
  };
}

function buildRetrySendPayload(message: ChatMessage): SendChannelMessageInput {
  const messageMetadata = readMessageRetryMetadata(message);
  return {
    body: message.body,
    senderName: message.senderName,
    ...(message.choiceResponse
      ? {
          choiceResponse: message.choiceResponse,
        }
      : {}),
    ...(messageMetadata
      ? {
          messageMetadata,
        }
      : {}),
  };
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

export interface BegunChannelMessageDispatch {
  state: ChatState;
  results: ChannelDispatchResult[];
  preparedTurn: import('./turn.js').PreparedDispatchTurn | null;
  userMessage: ChatMessage;
}

export async function beginChannelMessageDispatch(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<BegunChannelMessageDispatch> {
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
  const nextPendingModelSelection = payload.pendingModelSelection === undefined
    ? cloneProviderModelSelection(channelBeforeMessage.pendingModelSelection)
    : cloneProviderModelSelection(payload.pendingModelSelection)
      ?? createExplicitProviderModelSelection(
        payload.pendingModel ?? channelBeforeMessage.pendingModel,
      );
  const pendingTargetChanged = channelBeforeMessage.composerMode === 'solo'
    && (
      nextPendingProvider !== channelBeforeMessage.pendingProvider
      || nextPendingModel !== channelBeforeMessage.pendingModel
      || nextPendingInstance !== channelBeforeMessage.pendingInstance
      || !sameProviderModelSelection(
        channelBeforeMessage.pendingModelSelection,
        nextPendingModelSelection,
      )
    );
  const orchestratorSessionAttachment = resolveOrchestratorLeaseAttachment(channelBeforeMessage);
  const orchestratorSessionId = orchestratorSessionAttachment?.sessionId ?? null;

  if (
    pendingTargetChanged
    && orchestratorSessionId
  ) {
    await bestEffortFlushRuntimeSessionMemory({
      runtimeClient,
      sessionId: orchestratorSessionId,
      requestedPhase: 'pre_reset',
      memoryService: options.memoryService,
      companionStore: options.companionStore,
      coreStore: options.chatStore,
      now,
    });
    await runtimeClient.closeSession(orchestratorSessionId);
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
      modelSelection: nextPendingModelSelection,
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
      metadata: {
        ...(payload.messageMetadata ?? {}),
        ...(payload.choiceResponse
          ? {
              event: 'choice_response',
              sourceMessageId: payload.choiceResponse.sourceMessageId,
            }
          : {}),
      },
      choiceResponse: payload.choiceResponse,
    },
  ).state;
  nextState = refreshDerivedMemoryLayers(nextState, channelId, now);

  const choiceResponseCore = payload.choiceResponse && options.chatStore
    ? await options.chatStore.readCore()
    : undefined;
  const preparedTurn = prepareDispatchTurn(
    nextState,
    channelId,
    payload,
    now,
    choiceResponseCore,
  );
  nextState = materializeInFlightDispatchState(
    preparedTurn.state,
    channelId,
    preparedTurn.baseRoomRouting,
    preparedTurn.workflow,
    preparedTurn.outcome,
    preparedTurn.latestCheckpoint,
    now,
  );
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return {
    state: nextState,
    results: preparedTurn.results,
    preparedTurn: preparedTurn.terminalResult ? null : preparedTurn,
    userMessage: preparedTurn.userMessage,
  };
}

export async function beginChannelMessageRetryDispatch(
  state: ChatState,
  channelId: string,
  sourceMessageId: string,
  _runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<BegunChannelMessageDispatch> {
  const channel = requireChannel(state, channelId);
  let core: CatsCoreState | undefined;
  let sourceMessage = channel.messages.find((message) => message.id === sourceMessageId) ?? null;
  if (!sourceMessage && options.chatStore) {
    core = await options.chatStore.readCore();
    sourceMessage = buildCanonicalChatUserMessage(core, channelId, sourceMessageId);
  }
  if (!sourceMessage) {
    throw new Error(`Channel message not found: ${sourceMessageId}`);
  }
  if (sourceMessage.senderKind !== 'user') {
    throw new Error(`Only user messages can be retried: ${sourceMessageId}`);
  }

  const choiceResponseCore = sourceMessage.choiceResponse && options.chatStore
    ? (core ?? await options.chatStore.readCore())
    : core;
  const preparedTurn = prepareDispatchTurnForExistingUserMessage(
    state,
    channelId,
    buildRetrySendPayload(sourceMessage),
    sourceMessageId,
    now,
    choiceResponseCore,
  );
  const nextState = await persistInFlightDispatchState(
    options.chatStore,
    materializeInFlightDispatchState(
      preparedTurn.state,
      channelId,
      preparedTurn.baseRoomRouting,
      preparedTurn.workflow,
      preparedTurn.outcome,
      preparedTurn.latestCheckpoint,
      now,
    ),
  );
  options.onStateWritten?.(channelId);

  return {
    state: nextState,
    results: preparedTurn.results,
    preparedTurn: preparedTurn.terminalResult ? null : preparedTurn,
    userMessage: sourceMessage,
  };
}

export async function continueBegunChannelMessageDispatch(
  begun: BegunChannelMessageDispatch,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  if (!begun.preparedTurn) {
    return { state: begun.state, results: begun.results };
  }

  const runtimeRecovery = normalizeRuntimeDispatchRecoveryPolicy(options.runtimeRecovery);
  let nextState = begun.state;
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
  } = begun.preparedTurn;
  let latestCheckpoint = initialCheckpoint;
  const loopResult = await processDispatchQueue({
    state: nextState,
    channelId,
    runtimeClient,
    now,
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    initialResolution,
    userMessage,
    results,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    describeGuardReason,
    transport: options.transport,
    transportBindingId: options.transportBindingId,
    companionStore: options.companionStore,
    memoryService: options.memoryService,
    chatStore: options.chatStore,
    chatStatePath: options.chatStatePath,
    runtimeDataDir: options.runtimeDataDir,
    runtimeRecovery,
    cancellationRegistry: options.cancellationRegistry,
    onStateWritten: options.onStateWritten,
  });
  nextState = loopResult.state;
  latestCheckpoint = loopResult.latestCheckpoint;
  const guardReason = loopResult.guardReason;
  const blockedResolution = loopResult.blockedResolution;

  nextState = finalizeDispatchTurn(nextState, channelId, now, {
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    guardReason,
    blockedResolution,
    userMessageId: userMessage.id,
    describeGuardReason,
  });
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return { state: nextState, results };
}

export async function settleBegunChannelMessageDispatchFailure(
  begun: BegunChannelMessageDispatch,
  channelId: string,
  error: unknown,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  if (!begun.preparedTurn) {
    return { state: begun.state, results: begun.results };
  }

  const errorMessage = error instanceof Error
    ? error.message
    : 'Runtime dispatch failed before completion.';
  const {
    activeTurn,
    baseRoomRouting,
    latestCheckpoint: initialCheckpoint,
    outcome,
    results,
    userMessage,
    workflow,
  } = begun.preparedTurn;
  const nowIso = now.toISOString();

  const latestState = options.latestState ?? begun.state;
  let nextState = appendMessage(
    latestState,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: `Failed to continue the message dispatch: ${errorMessage}`,
    },
    now,
    {
      metadata: {
        event: 'runtime_error',
        phase: 'dispatch_continue',
      },
    },
  ).state;

  outcome.status = 'error';
  outcome.completedAt = nowIso;
  activeTurn.status = 'failed';
  activeTurn.stageId = 'runtime_error';
  activeTurn.completedAt = nowIso;
  activeTurn.updatedAt = nowIso;
  const plannedTargets = activeTurn.targetStatuses.map((target) => structuredClone(target.participant));

  const latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'runtime_error',
    `Room workflow failed before completion: ${errorMessage}`,
    nowIso,
    null,
    plannedTargets,
    {
      error: errorMessage,
      checkpointSeed: randomUUID(),
    },
  );
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'outcome',
      'failed',
      `Room workflow failed before completion: ${errorMessage}`,
      nowIso,
      null,
      userMessage.id,
      plannedTargets,
      {
        outcomeId: randomUUID(),
        checkpointId: latestCheckpoint.id,
        targetIdentities: activeTurn.targetStatuses.map((target) => ({
          participantKind: target.participant.participantKind,
          participantId: target.participant.participantId,
          laneId: target.laneId,
          sessionId: target.sessionId,
        })),
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          workflowLastCheckpointId: latestCheckpoint.id,
          failedBeforeCompletion: true,
          previousCheckpointId: initialCheckpoint?.id ?? null,
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
  if (options.latestState) {
    nextState = mergeCompletedDispatchState(
      latestState,
      begun.state,
      nextState,
      channelId,
      now,
    );
  }
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return { state: nextState, results };
}

export async function routeChannelMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    payload,
    runtimeClient,
    now,
    options,
  );
  return continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    now,
    options,
  );
}
