import { useEffect, useMemo, useRef, useState } from 'react';

import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import {
  applyLiveIndicatorEvent,
  createWaitingLiveIndicatorState,
  EMPTY_LIVE_INDICATOR,
  hasLiveIndicatorIdentity,
  hasVisibleAssistantReplyAfterMessage,
  hasVisibleLiveIndicatorSpeakerReplyAfterMessage,
  projectLiveIndicatorStateFromSegments,
  resolveLiveIndicatorSpeakerState,
  resolvePrimaryLiveIndicatorSegment,
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
    senderName?: string;
    metadata?: Record<string, unknown> | null | undefined;
    createdAt: string;
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
        id?: string | null;
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

export interface SequencedLiveIndicatorStreamCursor {
  sessionId: string;
  streamSeq: number;
  streamSeqIndex: number;
}

interface WaitingIndicatorInputs {
  targetStateId: string | null;
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
  targetStateId: string | null;
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
      targetStateId: null,
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
    targetStateId: nextTarget.id?.trim() || null,
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
  if (
    !previous.active
    || previous.phase === 'waiting'
    || !hasRenderableLiveIndicatorContent(previous)
  ) {
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
    return mergeWaitingIndicatorTimelineState(input.previous, input.waitingState);
  }

  if (input.previous.phase === 'waiting' && !hasRenderableLiveIndicatorContent(input.previous)) {
    return replaceWaitingIndicatorTimelineIdentity(input.previous, input.waitingState);
  }

  if (input.previous.phase === 'sealed') {
    return mergeWaitingIndicatorTimelineState(input.previous, input.waitingState);
  }

  return input.previous;
}

function doesLiveIndicatorIdentityMatch(
  left: LiveIndicatorState,
  right: LiveIndicatorState,
): boolean {
  return left.targetStateId === right.targetStateId
    && left.segmentIndex === right.segmentIndex
    && left.participantId === right.participantId
    && left.catId === right.catId
    && left.speakerLabel === right.speakerLabel;
}

function mergeWaitingIndicatorTimelineState(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): LiveIndicatorState {
  const waitingSegment = resolvePrimaryLiveIndicatorSegment(waitingState);
  if (!waitingSegment) {
    return previous;
  }

  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  if (!previous.active || !previousSegment) {
    return waitingState;
  }

  if (previousSegment.phase === 'waiting') {
    if (doesLiveIndicatorIdentityMatch(previous, waitingState)) {
      return previous;
    }
    return projectLiveIndicatorStateFromSegments([
      ...previous.segments.slice(0, -1),
      waitingSegment,
    ]);
  }

  const sealedPrevious = previousSegment.phase === 'sealed'
    ? previousSegment
    : {
        ...previousSegment,
        phase: 'sealed' as const,
      };
  return projectLiveIndicatorStateFromSegments([
    ...previous.segments.slice(0, -1),
    sealedPrevious,
    waitingSegment,
  ]);
}

function replaceWaitingIndicatorTimelineIdentity(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): LiveIndicatorState {
  const waitingSegment = resolvePrimaryLiveIndicatorSegment(waitingState);
  if (!waitingSegment) {
    return previous;
  }

  const previousSegment = resolvePrimaryLiveIndicatorSegment(previous);
  if (!previous.active || !previousSegment) {
    return waitingState;
  }

  if (previousSegment.phase !== 'waiting') {
    return previous;
  }

  if (doesLiveIndicatorIdentityMatch(previous, waitingState)) {
    return previous;
  }

  return projectLiveIndicatorStateFromSegments([
    ...previous.segments.slice(0, -1),
    waitingSegment,
  ]);
}

export function shouldPromoteStreamingBubbleToWaitingSpeaker(
  previous: LiveIndicatorState,
  waitingState: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  if (
    !previous.active
    || previous.phase !== 'streaming'
    || !waitingState.active
    || waitingState.phase !== 'waiting'
    || !hasLiveIndicatorIdentity(waitingState)
    || doesLiveIndicatorIdentityMatch(previous, waitingState)
  ) {
    return false;
  }

  const sourceMessageId = selectedChannel?.roomRouting.workflow.activeTurn?.sourceMessageId ?? null;
  if (!sourceMessageId) {
    return false;
  }

  return hasVisibleLiveIndicatorSpeakerReplyAfterMessage(
    selectedChannel?.messages ?? [],
    sourceMessageId,
    previous,
  );
}

export function shouldReconnectLiveIndicatorAfterSourceError(
  current: LiveIndicatorState,
  selectedChannel: LiveIndicatorSelectedChannelLike | null,
): boolean {
  const primarySegment = resolvePrimaryLiveIndicatorSegment(current);
  if (primarySegment?.phase === 'sealed') {
    return false;
  }

  if (shouldPinLiveIndicatorUntilPersistedReply(current, selectedChannel)) {
    return false;
  }

  return true;
}

export function shouldReconnectLiveIndicatorAfterSessionClose(
  current: LiveIndicatorState,
  waitingState: LiveIndicatorState,
): boolean {
  const currentSegment = resolvePrimaryLiveIndicatorSegment(current);
  const waitingSegment = resolvePrimaryLiveIndicatorSegment(waitingState);
  if (!waitingSegment?.targetStateId) {
    return false;
  }

  if (!currentSegment) {
    return true;
  }

  return waitingSegment.targetStateId !== currentSegment.targetStateId
    || waitingSegment.segmentIndex !== currentSegment.segmentIndex;
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

export function advanceSequencedLiveIndicatorStreamCursor(
  previous: SequencedLiveIndicatorStreamCursor | null,
  data: Record<string, unknown>,
): {
  accept: boolean;
  cursor: SequencedLiveIndicatorStreamCursor | null;
} {
  const sessionId = readTraceString(data.sessionId);
  const streamSeq = typeof data.streamSeq === 'number' && Number.isFinite(data.streamSeq)
    ? data.streamSeq
    : null;
  const streamSeqIndex = typeof data.streamSeqIndex === 'number' && Number.isFinite(data.streamSeqIndex)
    ? data.streamSeqIndex
    : null;

  if (!sessionId || streamSeq === null || streamSeqIndex === null) {
    return {
      accept: true,
      cursor: previous,
    };
  }

  if (
    previous
    && previous.sessionId === sessionId
    && (
      streamSeq < previous.streamSeq
      || (streamSeq === previous.streamSeq && streamSeqIndex <= previous.streamSeqIndex)
    )
  ) {
    return {
      accept: false,
      cursor: previous,
    };
  }

  return {
    accept: true,
    cursor: {
      sessionId,
      streamSeq,
      streamSeqIndex,
    },
  };
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
  const streamCursorRef = useRef<SequencedLiveIndicatorStreamCursor | null>(null);

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
      targetStateId: waitingSpeakerState.targetStateId,
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
      waitingSpeakerState.targetStateId,
      waitingSpeakerState.participantId,
      waitingSpeakerState.revealIdentity,
      waitingSpeakerState.speakerLabel,
    ],
  );
  const waitingIndicatorInputsRef = useRef<WaitingIndicatorInputs>(waitingIndicatorInputs);

  function createCurrentWaitingState(): LiveIndicatorState {
    const current = waitingIndicatorInputsRef.current;
    return createWaitingLiveIndicatorState({
      targetStateId: current.targetStateId,
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
      setState((previous) => {
        const next = updater(previous);
        stateRef.current = next;
        return next;
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

      const streamCursorDecision = advanceSequencedLiveIndicatorStreamCursor(
        streamCursorRef.current,
        data,
      );
      if (!streamCursorDecision.accept) {
        traceBrowser('stream_event_deduped', {
          sessionId: readTraceString(data.sessionId),
          participantId: readTraceString(data.participantId),
          catId: readTraceString(data.catId),
          speakerLabel: readTraceString(data.speakerLabel),
          reason: 'stale_replayed_event',
          details: {
            eventType: (data.type as string) ?? e.type,
            streamSeq: typeof data.streamSeq === 'number' ? data.streamSeq : null,
            streamSeqIndex: typeof data.streamSeqIndex === 'number' ? data.streamSeqIndex : null,
          },
        });
        return;
      }
      streamCursorRef.current = streamCursorDecision.cursor;

      reconnectAttempts = 0;

      const eventType = (data.type as string) ?? e.type;
      const shouldRetrySessionClose = shouldRetryLiveIndicatorSessionClose({
        eventType,
        channelId,
        busy,
        routingStatus,
      });
      const primarySegment = resolvePrimaryLiveIndicatorSegment(stateRef.current);
      const shouldPinReplyCommit = shouldRetrySessionClose
        && shouldPinLiveIndicatorUntilPersistedReply(stateRef.current, selectedChannelRef.current);
      const shouldIgnoreSealedSessionClose = shouldRetrySessionClose
        && primarySegment?.phase === 'sealed';

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
          if (shouldIgnoreSealedSessionClose) {
            traceBrowser('stream_session_close_ignored', {
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'sealed_segment_already_completed',
            });
            return previous;
          }
          if (shouldPinReplyCommit) {
            traceBrowser('stream_reply_commit_pending', {
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'pin_until_persisted_reply',
            });
            return previous;
          }
          const waitingState = createCurrentWaitingState();
          if (!shouldReconnectLiveIndicatorAfterSessionClose(previous, waitingState)) {
            traceBrowser('stream_session_close_no_followup', {
              participantId: previous.participantId,
              catId: previous.catId,
              speakerLabel: previous.speakerLabel,
              reason: 'no_distinct_followup_target',
            });
            return previous;
          }
          const nextSpeakerState = resolveLiveIndicatorSpeakerState(waitingState, data);
          traceBrowser('stream_waiting_restart', {
            participantId: readTraceString(data.participantId),
            catId: nextSpeakerState.catId,
            speakerLabel: nextSpeakerState.speakerLabel,
            reason: 'session_close_reconnect',
          });
          return mergeWaitingIndicatorTimelineState(previous, waitingState);
        }
        return applyLiveIndicatorEvent(previous, eventType, data);
      });

      if (
        shouldRetrySessionClose
        && !shouldPinReplyCommit
        && !shouldIgnoreSealedSessionClose
        && shouldReconnectLiveIndicatorAfterSessionClose(
          stateRef.current,
          createCurrentWaitingState(),
        )
      ) {
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
        if (!shouldReconnectLiveIndicatorAfterSourceError(
          stateRef.current,
          selectedChannelRef.current,
        )) {
          traceBrowser('stream_source_error_ignored', {
            participantId: stateRef.current.participantId,
            catId: stateRef.current.catId,
            speakerLabel: stateRef.current.speakerLabel,
            reason: 'reply_commit_or_sealed_segment',
            details: {
              phase: resolvePrimaryLiveIndicatorSegment(stateRef.current)?.phase ?? null,
            },
          });
          closeSource();
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
      streamCursorRef.current = null;
      if (shouldPinLiveIndicatorUntilPersistedReply(stateRef.current, selectedChannelRef.current)) {
        traceBrowser('indicator_pin_pending_reply', {
          participantId: stateRef.current.participantId,
          catId: stateRef.current.catId,
          speakerLabel: stateRef.current.speakerLabel,
          reason: 'waiting_not_needed_but_reply_not_persisted',
          details: {
            phase: resolvePrimaryLiveIndicatorSegment(stateRef.current)?.phase ?? null,
          },
        });
        return undefined;
      }
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
    if (previousChannelId !== channelId) {
      streamCursorRef.current = null;
    }
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
      if (
        shouldPromoteStreamingBubbleToWaitingSpeaker(
          previous,
          waitingState,
          selectedChannelRef.current,
        )
      ) {
        const next = mergeWaitingIndicatorTimelineState(previous, waitingState);
        stateRef.current = next;
        return next;
      }

      if (!previous.active || previous.phase !== 'waiting') {
        return previous;
      }

      const next = replaceWaitingIndicatorTimelineIdentity(previous, waitingState);
      stateRef.current = next;
      return next;
    });
  }, [
    busy,
    channelId,
    routingStatus,
    selectedChannel,
    shouldShowWaitingIndicator,
    waitingIndicatorInputs,
  ]);

  return state;
}

function readTraceString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
