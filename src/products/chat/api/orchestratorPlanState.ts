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
  sameProviderModelSelection,
} from '../../../shared/providerSelection.js';
import {
  hasPendingExecutionTargetPatch,
  resolveNextPendingExecutionTarget,
} from '../state/pendingExecutionTarget.js';

export function buildChannelMessageOrchestratorPlanState(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  now: Date,
): ChatState {
  if (!hasPendingExecutionTargetPatch(payload)) {
    return state;
  }

  const channel = requireChannel(state, channelId);
  const nextTarget = resolveNextPendingExecutionTarget(channel, payload);
  const pendingTargetChanged = channel.composerMode === 'solo'
    && (
      nextTarget.provider !== channel.pendingProvider
      || nextTarget.model !== channel.pendingModel
      || nextTarget.instance !== channel.pendingInstance
      || !sameProviderModelSelection(
        channel.pendingModelSelection,
        nextTarget.modelSelection,
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
        provider: nextTarget.provider,
        instance: nextTarget.instance,
        model: nextTarget.model,
        modelSelection: nextTarget.modelSelection,
        startedAt: null,
      },
      now,
    );
  }

  return setChannelPendingExecutionTarget(
    nextState,
    channelId,
    {
      provider: nextTarget.provider,
      model: nextTarget.model,
      instance: nextTarget.instance,
      modelSelection: nextTarget.modelSelection,
    },
    now,
  );
}
