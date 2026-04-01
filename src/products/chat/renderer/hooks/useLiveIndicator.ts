import { startTransition, useEffect, useRef, useState } from 'react';

import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
  EMPTY_LIVE_INDICATOR,
  type LiveIndicatorState,
} from '../../../../shared/liveIndicator.js';
import {
  getComposerDispatchChannelId,
  isComposerDispatchBusy,
} from '../../../../shared/composer.js';
import type { SelectedChannelView } from '../chatUtils.js';
import { isOptimisticDraftChannelId } from '../../shared/channelPaths.js';

export type {
  LiveIndicatorContentBlock,
  LiveIndicatorEventEntry,
  LiveIndicatorState,
  LiveToolEntry,
} from '../../../../shared/liveIndicator.js';
export { EMPTY_LIVE_INDICATOR } from '../../../../shared/liveIndicator.js';

const LIVE_INDICATOR_RETRY_DELAY_MS = 150;
const LIVE_INDICATOR_RETRY_LIMIT = 8;

export function shouldConnectLiveIndicatorStream(
  channelId: string | null,
  busy: string,
  routingStatus?: string | null,
): boolean {
  if (!channelId) {
    return false;
  }

  const channelRouting = routingStatus === 'running' || routingStatus === 'blocked';
  const dispatchBusyForCurrentChannel =
    busy === 'concurrent:dispatch'
    || getComposerDispatchChannelId(busy) === channelId;
  if ((!isComposerDispatchBusy(busy) || !dispatchBusyForCurrentChannel) && !channelRouting) {
    return false;
  }

  return !isOptimisticDraftChannelId(channelId);
}

export function resolveLiveIndicatorSpeakerLabel(
  selectedChannel: SelectedChannelView | null,
): string | null {
  if (!selectedChannel || selectedChannel.roomRouting.leadParticipantId) {
    return null;
  }

  if (selectedChannel.composerMode !== 'solo' || !selectedChannel.pendingProvider) {
    return null;
  }

  return buildExecutionLabel(
    selectedChannel.pendingProvider,
    selectedChannel.pendingInstance,
    null,
  );
}

export function useLiveIndicator(options: {
  channelId: string | null;
  busy: string;
  selectedChannel: SelectedChannelView | null;
}): LiveIndicatorState {
  const { channelId, busy, selectedChannel } = options;
  const [state, setState] = useState<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);
  const sourceRef = useRef<EventSource | null>(null);
  const stateRef = useRef<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);

  // Extract stable primitive from selectedChannel to avoid object reference in deps
  const leadCatId = selectedChannel?.roomRouting.leadParticipantId ?? null;
  const workflowStatus = selectedChannel?.roomRouting.workflow.activeTurn?.status
    ?? selectedChannel?.roomRouting.workflow.lastOutcomeEvent?.status
    ?? null;
  const routingStatus = workflowStatus === 'pending'
    ? 'running'
    : workflowStatus === 'failed'
      ? 'error'
      : workflowStatus;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const channelRouting = routingStatus === 'running' || routingStatus === 'blocked';
    const dispatchBusyForCurrentChannel =
      busy === 'concurrent:dispatch'
      || getComposerDispatchChannelId(busy) === channelId;
    const shouldShowWaitingIndicator =
      ((isComposerDispatchBusy(busy) && dispatchBusyForCurrentChannel) || channelRouting)
      && Boolean(channelId);
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    function updateIndicatorState(
      updater: (previous: LiveIndicatorState) => LiveIndicatorState,
    ): void {
      startTransition(() => {
        setState((previous) => {
          const next = updater(previous);
          stateRef.current = next;
          return next;
        });
      });
    }

    function clearReconnectTimer(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function closeSource(): void {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    }

    function scheduleReconnect(): void {
      if (
        disposed
        || reconnectAttempts >= LIVE_INDICATOR_RETRY_LIMIT
        || !shouldConnectLiveIndicatorStream(channelId, busy, routingStatus)
      ) {
        return;
      }

      reconnectAttempts += 1;
      closeSource();
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!disposed) {
          openSource();
        }
      }, LIVE_INDICATOR_RETRY_DELAY_MS);
    }

    function handleEvent(e: MessageEvent): void {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(e.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      const eventType = (data.type as string) ?? e.type;
      const shouldRetrySessionClose = eventType === 'session_closed'
        && stateRef.current.phase === 'waiting';

      updateIndicatorState((previous) => {
        if (!previous.active) {
          return previous;
        }
        return applyLiveIndicatorEvent(previous, eventType, data);
      });

      if (shouldRetrySessionClose) {
        scheduleReconnect();
      }
    }

    function openSource(): void {
      if (disposed || !shouldConnectLiveIndicatorStream(channelId, busy, routingStatus)) {
        return;
      }

      closeSource();
      const source = new EventSource(`/api/channels/${channelId}/stream`);
      sourceRef.current = source;

      source.addEventListener('progress', handleEvent);
      source.addEventListener('text', handleEvent);
      source.addEventListener('tool_use', handleEvent);
      source.addEventListener('tool_result', handleEvent);
      source.addEventListener('content_block', handleEvent);
      source.addEventListener('result', handleEvent);
      source.addEventListener('error', handleEvent);
      source.addEventListener('session_closed', handleEvent);
      source.onerror = () => {
        if (stateRef.current.phase === 'waiting') {
          scheduleReconnect();
        }
      };
    }

    if (!shouldShowWaitingIndicator) {
      clearReconnectTimer();
      closeSource();
      stateRef.current = EMPTY_LIVE_INDICATOR;
      setState(EMPTY_LIVE_INDICATOR);
      return undefined;
    }

    const workingCatId = leadCatId;
    const speakerLabel = workingCatId
      ? null
      : resolveLiveIndicatorSpeakerLabel(selectedChannel);

    const waitingState = createWaitingLiveIndicatorState({
      catId: workingCatId,
      speakerLabel,
    });
    stateRef.current = waitingState;
    setState(waitingState);

    if (!shouldConnectLiveIndicatorStream(channelId, busy, routingStatus)) {
      clearReconnectTimer();
      closeSource();
      return undefined;
    }

    openSource();

    return () => {
      disposed = true;
      clearReconnectTimer();
      closeSource();
    };
  }, [channelId, busy, leadCatId, routingStatus]);

  return state;
}
