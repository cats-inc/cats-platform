import type {
  ChatState,
  SendChannelMessageInput,
} from './contracts.js';
import {
  requireChannel,
  setChannelOrchestratorLease,
  setChannelPendingExecutionTarget,
} from '../state/model/index.js';
import {
  cloneProviderModelSelection,
  createExplicitProviderModelSelection,
  sameProviderModelSelection,
} from '../../../shared/providerSelection.js';

function normalizePendingTargetValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function buildChannelMessageOrchestratorPlanState(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  now: Date,
): ChatState {
  if (
    payload.pendingProvider === undefined
    && payload.pendingModel === undefined
    && payload.pendingInstance === undefined
    && payload.pendingModelSelection === undefined
  ) {
    return state;
  }

  const channel = requireChannel(state, channelId);
  const nextPendingProvider = payload.pendingProvider === undefined
    ? channel.pendingProvider
    : normalizePendingTargetValue(payload.pendingProvider);
  const nextPendingModel = payload.pendingModel === undefined
    ? channel.pendingModel
    : normalizePendingTargetValue(payload.pendingModel);
  const nextPendingInstance = payload.pendingInstance === undefined
    ? channel.pendingInstance
    : normalizePendingTargetValue(payload.pendingInstance);
  const nextPendingModelSelection = payload.pendingModelSelection === undefined
    ? cloneProviderModelSelection(channel.pendingModelSelection)
    : cloneProviderModelSelection(payload.pendingModelSelection)
      ?? createExplicitProviderModelSelection(payload.pendingModel ?? channel.pendingModel);
  const pendingTargetChanged = channel.composerMode === 'solo'
    && (
      nextPendingProvider !== channel.pendingProvider
      || nextPendingModel !== channel.pendingModel
      || nextPendingInstance !== channel.pendingInstance
      || !sameProviderModelSelection(
        channel.pendingModelSelection,
        nextPendingModelSelection,
      )
    );

  let nextState = state;
  if (pendingTargetChanged) {
    nextState = setChannelOrchestratorLease(
      nextState,
      channelId,
      {
        sessionId: null,
        status: 'not_started',
        lastError: null,
        provider: nextPendingProvider,
        instance: nextPendingInstance,
        model: nextPendingModel,
        modelSelection: nextPendingModelSelection ?? null,
        startedAt: null,
      },
      now,
    );
  }

  return setChannelPendingExecutionTarget(
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
}
