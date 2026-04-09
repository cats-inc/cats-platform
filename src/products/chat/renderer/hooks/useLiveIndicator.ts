import {
  getComposerDispatchChannelId,
  isComposerDispatchBusy,
} from '../../../../shared/composer.js';
import {
  EMPTY_LIVE_INDICATOR,
  resolveLiveIndicatorSpeakerLabel,
  type LiveIndicatorSelectedChannelLike,
  type LiveIndicatorState,
  type LiveIndicatorStreamDecisionInput,
  useLiveIndicator as useWorkspaceLiveIndicator,
} from '../../../shared/renderer/hooks/useLiveIndicator.js';
import type { SelectedChannelView } from '../chatUtils.js';
import { isOptimisticDraftChannelId } from '../../shared/channelPaths.js';

export type {
  LiveIndicatorContentBlock,
  LiveIndicatorEventEntry,
  LiveIndicatorState,
  LiveToolEntry,
} from '../../../../shared/liveIndicator.js';
export { EMPTY_LIVE_INDICATOR } from '../../../shared/renderer/hooks/useLiveIndicator.js';

function isDispatchBusyForCurrentChannel(
  channelId: string | null,
  busy: string,
  routingStatus?: string | null,
): boolean {
  if (!channelId || !isComposerDispatchBusy(busy)) {
    return false;
  }

  const targetedChannelId = getComposerDispatchChannelId(busy);
  if (targetedChannelId) {
    return targetedChannelId === channelId;
  }

  return busy === 'parallelChat:dispatch' && routingStatus === 'running';
}

export function shouldConnectLiveIndicatorStream(
  channelId: string | null,
  busy: string,
  routingStatus?: string | null,
): boolean {
  if (!channelId) {
    return false;
  }

  const channelRouting = routingStatus === 'running';
  const dispatchBusyForCurrentChannel = isDispatchBusyForCurrentChannel(
    channelId,
    busy,
    routingStatus,
  );
  if ((!isComposerDispatchBusy(busy) || !dispatchBusyForCurrentChannel) && !channelRouting) {
    return false;
  }

  return !isOptimisticDraftChannelId(channelId);
}

function resolveRoutingStatus(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): string | null {
  const workflowStatus = selectedChannel?.roomRouting.workflow.activeTurn?.status ?? null;
  return workflowStatus === 'pending'
    ? 'running'
    : workflowStatus === 'failed'
      ? 'error'
      : workflowStatus;
}

function shouldShowWaitingIndicator(
  input: LiveIndicatorStreamDecisionInput,
): boolean {
  return (
    (
      isComposerDispatchBusy(input.busy)
      && isDispatchBusyForCurrentChannel(input.channelId, input.busy, input.routingStatus)
    )
    || input.routingStatus === 'running'
  ) && Boolean(input.channelId);
}

function shouldConnectChatLiveIndicatorStream(
  input: LiveIndicatorStreamDecisionInput,
): boolean {
  return shouldConnectLiveIndicatorStream(
    input.channelId,
    input.busy,
    input.routingStatus,
  );
}

export function useLiveIndicator(options: {
  channelId: string | null;
  busy: string;
  selectedChannel: SelectedChannelView | null;
}): LiveIndicatorState {
  return useWorkspaceLiveIndicator({
    ...options,
    resolveRoutingStatus,
    shouldShowWaitingIndicator,
    shouldConnectStream: shouldConnectChatLiveIndicatorStream,
  });
}

export { resolveLiveIndicatorSpeakerLabel };
