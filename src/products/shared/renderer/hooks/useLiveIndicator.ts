import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
  EMPTY_LIVE_INDICATOR,
  hasVisibleAssistantReplyAfterMessage,
  resolveLiveIndicatorSpeakerState,
  type LiveIndicatorState,
} from '../../../../shared/liveIndicator.js';
import { pushBrowserLiveTrace } from '../../../../shared/liveTrace.js';
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
  messages?: Array<{
    id: string;
    senderKind: string;
  }>;
  roomRouting: {
    defaultRecipientId: string | null;
    workflow: {
      activeTurn?: {
        status: string | null;
        sourceMessageId?: string | null;
        workflowShape?: string | null;
        targetStatuses?: Array<{
          status: string | null;
          participant: {
            participantKind?: string | null;
            participantId: string;
            participantName?: string | null;
          };
        }>;
      } | null;
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

interface WaitingIndicatorInputs {
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
  revealIdentity: boolean;
  defaultRecipientCatId: string | null;
  fallbackSpeakerLabel: string | null;
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

function resolveWaitingSpeakerState(
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): {
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
  revealIdentity: boolean;
} {
  const activeTurn = selectedChannel?.roomRouting.workflow.activeTurn ?? null;
  const activeTargets = activeTurn?.targetStatuses?.filter((target) =>
    target.status === 'running' || target.status === 'pending') ?? [];
  const nextTarget = activeTargets[0];
  if (!nextTarget) {
    return {
      participantId: null,
      catId: null,
      speakerLabel: null,
      revealIdentity: false,
    };
  }

  const hasVisibleAssistantReply = activeTurn?.sourceMessageId
    ? hasVisibleAssistantReplyAfterMessage(
      selectedChannel?.messages ?? [],
      activeTurn.sourceMessageId,
    )
    : false;
  const revealIdentity = activeTurn?.workflowShape === 'concurrent' || hasVisibleAssistantReply;

  return {
    participantId: nextTarget.participant.participantId,
    catId: null,
    speakerLabel: nextTarget.participant.participantName?.trim() || null,
    revealIdentity,
  };
}

export function shouldRetryLiveIndicatorSessionClose(
  input: LiveIndicatorStreamDecisionInput & {
    eventType: string;
  },
): boolean {
  return input.eventType === 'session_closed'
    && defaultShouldConnectStream(input);
}

function hasRenderableLiveIndicatorContent(
  state: LiveIndicatorState,
): boolean {
  return state.contentBlocks.length > 0
    || state.progressText.trim().length > 0
    || state.events.length > 0;
}

export function shouldPinLiveIndicatorUntilPersistedReply(
  previous: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  if (!previous.active || previous.phase !== 'streaming' || !hasRenderableLiveIndicatorContent(previous)) {
    return false;
  }

  const activeTurnSourceMessageId =
    selectedChannel?.roomRouting.workflow.activeTurn?.sourceMessageId ?? null;
  if (!activeTurnSourceMessageId) {
    return false;
  }

  return !hasVisibleAssistantReplyAfterMessage(
    selectedChannel?.messages ?? [],
    activeTurnSourceMessageId,
  );
}

export function resolveWaitingIndicatorStateTransition(input: {
  previous: LiveIndicatorState;
  waitingState: LiveIndicatorState;
  selectedChannel: LiveIndicatorSelectedChannelLike | null;
  previousChannelId: string | null;
  channelId: string | null;
}): LiveIndicatorState {
  if (input.previousChannelId !== input.channelId || !input.previous.active) {
    return input.waitingState;
  }

  if (shouldPinLiveIndicatorUntilPersistedReply(input.previous, input.selectedChannel)) {
    return input.previous;
  }

  if (input.previous.phase === 'streaming') {
    return input.waitingState;
  }

  if (input.previous.phase === 'waiting' && !hasRenderableLiveIndicatorContent(input.previous)) {
    return input.waitingState;
  }

  return input.previous;
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
  debugTraceEnabled?: boolean;
  resolveRoutingStatus?: (selectedChannel: TSelectedChannel | null) => string | null;
  shouldShowWaitingIndicator?: (input: LiveIndicatorStreamDecisionInput) => boolean;
  shouldConnectStream?: (input: LiveIndicatorStreamDecisionInput) => boolean;
}): LiveIndicatorState {
  const {
    channelId,
    busy,
    selectedChannel,
    debugTraceEnabled = false,
    resolveRoutingStatus,
    shouldShowWaitingIndicator = defaultShouldShowWaitingIndicator,
    shouldConnectStream = defaultShouldConnectStream,
  } = options;
  const [state, setState] = useState<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);
  const sourceRef = useRef<EventSource | null>(null);
  const stateRef = useRef<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);
  const selectedChannelRef = useRef<TSelectedChannel | null>(selectedChannel);
  const previousChannelIdRef = useRef<string | null>(null);

  const defaultRecipientCatId = selectedChannel?.roomRouting.defaultRecipientId ?? null;
  const routingStatus = resolveRoutingStatus?.(selectedChannel) ?? null;
  const activeTurn = selectedChannel?.roomRouting.workflow.activeTurn ?? null;
  const speakerLabel = defaultRecipientCatId
    ? null
    : resolveLiveIndicatorSpeakerLabel(selectedChannel);
  const waitingSpeakerState = useMemo(
    () => resolveWaitingSpeakerState(selectedChannel),
    [activeTurn, selectedChannel?.messages],
  );
  const waitingIndicatorInputs = useMemo<WaitingIndicatorInputs>(
    () => ({
      participantId: waitingSpeakerState.participantId,
      catId: waitingSpeakerState.catId,
      speakerLabel: waitingSpeakerState.speakerLabel,
      revealIdentity: waitingSpeakerState.revealIdentity,
      defaultRecipientCatId,
      fallbackSpeakerLabel: speakerLabel,
    }),
    [
      defaultRecipientCatId,
      speakerLabel,
      waitingSpeakerState.catId,
      waitingSpeakerState.participantId,
      waitingSpeakerState.revealIdentity,
      waitingSpeakerState.speakerLabel,
    ],
  );
  const waitingIndicatorInputsRef = useRef<WaitingIndicatorInputs>(waitingIndicatorInputs);

  function createCurrentWaitingState(): LiveIndicatorState {
    const current = waitingIndicatorInputsRef.current;
    return createWaitingLiveIndicatorState({
      participantId: current.revealIdentity ? current.participantId : null,
      catId: current.revealIdentity ? current.catId : current.defaultRecipientCatId,
      speakerLabel: current.revealIdentity ? current.speakerLabel : current.fallbackSpeakerLabel,
      revealIdentity: current.revealIdentity,
    });
  }

  function traceBrowser(event: string, input: {
    sessionId?: string | null;
    participantId?: string | null;
    catId?: string | null;
    speakerLabel?: string | null;
    reason?: string | null;
    details?: Record<string, unknown> | null;
    signature?: string | null;
  } = {}): void {
    if (!debugTraceEnabled) {
      return;
    }

    pushBrowserLiveTrace({
      event,
      channelId,
      sessionId: readTraceString(input.sessionId),
      participantId: readTraceString(input.participantId),
      catId: readTraceString(input.catId),
      speakerLabel: readTraceString(input.speakerLabel),
      reason: readTraceString(input.reason),
      details: input.details ?? null,
      signature: input.signature ?? null,
    });
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  useEffect(() => {
    waitingIndicatorInputsRef.current = waitingIndicatorInputs;
  }, [waitingIndicatorInputs]);

  useEffect(() => {
    const shouldShowWaiting = shouldShowWaitingIndicator({
      channelId,
      busy,
      routingStatus,
    });
    const previousChannelId = previousChannelIdRef.current;
    previousChannelIdRef.current = channelId;
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

      reconnectAttempts = 0;

      const eventType = (data.type as string) ?? e.type;
      const shouldRetrySessionClose = shouldRetryLiveIndicatorSessionClose({
        eventType,
        channelId,
        busy,
        routingStatus,
      });
      const shouldPinReplyCommit = shouldRetrySessionClose
        && shouldPinLiveIndicatorUntilPersistedReply(stateRef.current, selectedChannelRef.current);

      traceBrowser('stream_event', {
        sessionId: readTraceString(data.sessionId),
        participantId: readTraceString(data.participantId),
        catId: readTraceString(data.catId),
        speakerLabel: readTraceString(data.speakerLabel),
        reason: shouldRetrySessionClose ? 'session_close_reconnect' : null,
        details: {
          eventType,
          busy,
          routingStatus,
        },
      });

      updateIndicatorState((previous) => {
        if (!previous.active) {
          return previous;
        }
        if (shouldRetrySessionClose) {
          if (shouldPinReplyCommit) {
            traceBrowser('stream_reply_commit_pending', {
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'pin_until_persisted_reply',
            });
            return previous;
          }
          const nextSpeakerState = resolveLiveIndicatorSpeakerState(previous, data);
          traceBrowser('stream_waiting_restart', {
            participantId: readTraceString(data.participantId),
            catId: nextSpeakerState.catId,
            speakerLabel: nextSpeakerState.speakerLabel,
            reason: 'session_close_reconnect',
          });
          return createWaitingLiveIndicatorState({
            participantId: nextSpeakerState.participantId,
            catId: nextSpeakerState.catId,
            speakerLabel: nextSpeakerState.speakerLabel,
            revealIdentity: Boolean(
              nextSpeakerState.participantId
              || nextSpeakerState.catId
              || nextSpeakerState.speakerLabel
            ),
          });
        }
        return applyLiveIndicatorEvent(previous, eventType, data);
      });

      if (shouldRetrySessionClose && !shouldPinReplyCommit) {
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
      traceBrowser('stream_connect', {
        reason: 'open_source',
        details: {
          busy,
          routingStatus,
        },
      });

      source.addEventListener('progress', handleEvent);
      source.addEventListener('text', handleEvent);
      source.addEventListener('tool_use', handleEvent);
      source.addEventListener('tool_result', handleEvent);
      source.addEventListener('content_block', handleEvent);
      source.addEventListener('result', handleEvent);
      source.addEventListener('error', handleEvent);
      source.addEventListener('session_closed', handleEvent);
      source.onerror = () => {
        if (disposed || source !== sourceRef.current) {
          return;
        }
        traceBrowser('stream_source_error', {
          reason: 'eventsource_terminated',
          details: {
            busy,
            routingStatus,
          },
        });
        closeSource();
        scheduleReconnect();
      };
    }

    if (!shouldShowWaiting) {
      clearReconnectTimer();
      closeSource();
      traceBrowser('indicator_reset', {
        reason: 'waiting_not_needed',
        details: {
          busy,
          routingStatus,
        },
        signature: `indicator_reset::${channelId ?? ''}::${busy}::${routingStatus ?? ''}`,
      });
      stateRef.current = EMPTY_LIVE_INDICATOR;
      setState(EMPTY_LIVE_INDICATOR);
      return undefined;
    }

    const waitingState = createCurrentWaitingState();
    setState((previous) => {
      const next = resolveWaitingIndicatorStateTransition({
        previous,
        waitingState,
        selectedChannel: selectedChannelRef.current,
        previousChannelId,
        channelId,
      });
      stateRef.current = next;
      return next;
    });
    traceBrowser('waiting_started', {
      participantId: waitingIndicatorInputs.revealIdentity
        ? waitingIndicatorInputs.participantId
        : null,
      catId: waitingIndicatorInputs.revealIdentity
        ? waitingIndicatorInputs.catId
        : waitingIndicatorInputs.defaultRecipientCatId,
      speakerLabel: waitingIndicatorInputs.revealIdentity
        ? waitingIndicatorInputs.speakerLabel
        : waitingIndicatorInputs.fallbackSpeakerLabel,
      reason: shouldConnectStream({ channelId, busy, routingStatus })
        ? 'awaiting_stream_attach'
        : 'waiting_without_stream',
      details: {
        busy,
        routingStatus,
      },
    });

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
    debugTraceEnabled,
    routingStatus,
    shouldConnectStream,
    shouldShowWaitingIndicator,
  ]);

  useEffect(() => {
    const shouldShowWaiting = shouldShowWaitingIndicator({
      channelId,
      busy,
      routingStatus,
    });
    if (!shouldShowWaiting) {
      return;
    }

    const waitingState = createCurrentWaitingState();
    setState((previous) => {
      if (!previous.active || previous.phase !== 'waiting') {
        return previous;
      }

      if (
        previous.participantId === waitingState.participantId
        && previous.catId === waitingState.catId
        && previous.speakerLabel === waitingState.speakerLabel
      ) {
        return previous;
      }

      stateRef.current = waitingState;
      return waitingState;
    });
  }, [
    busy,
    channelId,
    routingStatus,
    shouldShowWaitingIndicator,
    waitingIndicatorInputs,
  ]);

  return state;
}

function readTraceString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
