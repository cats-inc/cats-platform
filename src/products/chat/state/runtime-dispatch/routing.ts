import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingGuardReason,
} from '../../../../shared/roomRouting.js';
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
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import {
  type RuntimeTransportContext,
} from '../runtimeTargeting.js';
import {
  prepareDispatchTurn,
} from './turn.js';
import {
  materializeInFlightDispatchState,
  persistInFlightDispatchState,
} from './persistence.js';
import {
  finalizeDispatchTurn,
} from './finalize.js';
import { processDispatchQueue } from './loop.js';

interface RouteChannelMessageOptions {
  transport?: RuntimeTransportContext;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'write' | 'readCore' | 'writeCore'>;
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
      coreStore: options.chatStore,
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
  if (preparedTurn.terminalResult) {
    return {
      state: nextState,
      results: preparedTurn.terminalResult.results,
    };
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
    companionStore: options.companionStore,
    memoryService: options.memoryService,
    chatStore: options.chatStore,
  });
  nextState = loopResult.state;
  latestCheckpoint = loopResult.latestCheckpoint;
  const guardReason = loopResult.guardReason;

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
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);

  return { state: nextState, results };
}
