import { startTransition, useEffect, useRef, useState } from 'react';

import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
  EMPTY_LIVE_INDICATOR,
  resolveLiveIndicatorSpeakerState,
  type LiveIndicatorState,
} from '../../../../shared/liveIndicator.js';
import { isComposerDispatchBusy } from '../../../../shared/composer.js';
import { isOptimisticDraftChannelId } from '../../channelPaths.js';

export type {
  LiveIndicatorContentBlock,
  LiveIndicatorEventEntry,
  LiveIndicatorState,
  LiveToolEntry,
} from '../../../../shared/liveIndicator.js';
export { EMPTY_LIVE_INDICATOR } from '../../../../shared/liveIndicator.js';

const LIVE_INDICATOR_RETRY_DELAY_MS = 150;
const LIVE_INDICATOR_RETRY_LIMIT = 8;

export interface LiveIndicatorSelectedChannelLike {
  roomRouting: {
    defaultRecipientId: string | null;
    workflow: {
      activeTurn?: { status: string | null } | null;
    };
  };
  composerMode: string;
  pendingProvider: string | null;
  pendingInstance: string | null;
}

export interface LiveIndicatorStreamDecisionInput {
  channelId: string | null;
  busy: string;
  routingStatus?: string | null;
}

export function shouldConnectLiveIndicatorStream(
  channelId: string | null,
  busy: string,
  _routingStatus?: string | null,
): boolean {
  if (!isComposerDispatchBusy(busy) || !channelId) {
    return false;
  }

  return !isOptimisticDraftChannelId(channelId);
}

export function resolveLiveIndicatorSpeakerLabel(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): string | null {
  if (!selectedChannel || selectedChannel.roomRouting.defaultRecipientId) {
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

export function shouldRetryLiveIndicatorSessionClose(
  input: LiveIndicatorStreamDecisionInput & {
    eventType: string;
  },
): boolean {
  return input.eventType === 'session_closed'
    && defaultShouldConnectStream(input);
}

function defaultShouldShowWaitingIndicator(
  input: LiveIndicatorStreamDecisionInput,
): boolean {
  return isComposerDispatchBusy(input.busy) && Boolean(input.channelId);
}

function defaultShouldConnectStream(
  input: LiveIndicatorStreamDecisionInput,
): boolean {
  return shouldConnectLiveIndicatorStream(
    input.channelId,
    input.busy,
    input.routingStatus,
  );
}

export function useLiveIndicator<
  TSelectedChannel extends LiveIndicatorSelectedChannelLike = LiveIndicatorSelectedChannelLike,
>(options: {
  channelId: string | null;
  busy: string;
  selectedChannel: TSelectedChannel | null;
  resolveRoutingStatus?: (selectedChannel: TSelectedChannel | null) => string | null;
  shouldShowWaitingIndicator?: (input: LiveIndicatorStreamDecisionInput) => boolean;
  shouldConnectStream?: (input: LiveIndicatorStreamDecisionInput) => boolean;
}): LiveIndicatorState {
  const {
    channelId,
    busy,
    selectedChannel,
    resolveRoutingStatus,
    shouldShowWaitingIndicator = defaultShouldShowWaitingIndicator,
    shouldConnectStream = defaultShouldConnectStream,
  } = options;
  const [state, setState] = useState<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);
  const sourceRef = useRef<EventSource | null>(null);
  const stateRef = useRef<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);

  const defaultRecipientCatId = selectedChannel?.roomRouting.defaultRecipientId ?? null;
  const routingStatus = resolveRoutingStatus?.(selectedChannel) ?? null;
  const speakerLabel = defaultRecipientCatId
    ? null
    : resolveLiveIndicatorSpeakerLabel(selectedChannel);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const shouldShowWaiting = shouldShowWaitingIndicator({
      channelId,
      busy,
      routingStatus,
    });
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
        || !shouldConnectStream({ channelId, busy, routingStatus })
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
      const shouldRetrySessionClose = shouldRetryLiveIndicatorSessionClose({
        eventType,
        channelId,
        busy,
        routingStatus,
      });

      updateIndicatorState((previous) => {
        if (!previous.active) {
          return previous;
        }
        if (shouldRetrySessionClose) {
          const nextSpeakerState = resolveLiveIndicatorSpeakerState(previous, data);
          return createWaitingLiveIndicatorState({
            catId: nextSpeakerState.catId,
            speakerLabel: nextSpeakerState.speakerLabel,
          });
        }
        return applyLiveIndicatorEvent(previous, eventType, data);
      });

      if (shouldRetrySessionClose) {
        scheduleReconnect();
      }
    }

    function openSource(): void {
      if (disposed || !shouldConnectStream({ channelId, busy, routingStatus })) {
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
    }

    if (!shouldShowWaiting) {
      clearReconnectTimer();
      closeSource();
      stateRef.current = EMPTY_LIVE_INDICATOR;
      setState(EMPTY_LIVE_INDICATOR);
      return undefined;
    }

    const waitingState = createWaitingLiveIndicatorState({
      catId: defaultRecipientCatId,
      speakerLabel,
    });
    stateRef.current = waitingState;
    setState(waitingState);

    if (!shouldConnectStream({ channelId, busy, routingStatus })) {
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
  }, [
    busy,
    channelId,
    defaultRecipientCatId,
    routingStatus,
    speakerLabel,
    shouldConnectStream,
    shouldShowWaitingIndicator,
  ]);

  return state;
}
