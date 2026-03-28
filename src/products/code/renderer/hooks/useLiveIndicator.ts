import { startTransition, useEffect, useRef, useState } from 'react';

import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import { isComposerDispatchBusy } from '../../../../shared/composer.js';
import type { SelectedChannelView } from '../chatUtils.js';
import { isOptimisticDraftChannelId } from '../../shared/channelPaths.js';

export interface LiveToolEntry {
  toolName: string;
  toolId: string;
  done: boolean;
}

export interface LiveIndicatorState {
  active: boolean;
  phase: 'idle' | 'waiting' | 'streaming';
  catId: string | null;
  catName: string | null;
  speakerLabel: string | null;
  progressText: string;
  progressKind: string | null;
  tools: LiveToolEntry[];
}

export const EMPTY_LIVE_INDICATOR: LiveIndicatorState = {
  active: false,
  phase: 'idle',
  catId: null,
  catName: null,
  speakerLabel: null,
  progressText: '',
  progressKind: null,
  tools: [],
};

const LIVE_INDICATOR_RETRY_DELAY_MS = 150;
const LIVE_INDICATOR_RETRY_LIMIT = 8;

export function shouldConnectLiveIndicatorStream(
  channelId: string | null,
  busy: string,
): boolean {
  if (!isComposerDispatchBusy(busy) || !channelId) {
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

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const shouldShowWaitingIndicator = isComposerDispatchBusy(busy) && Boolean(channelId);
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
        || !shouldConnectLiveIndicatorStream(channelId, busy)
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

        switch (eventType) {
          case 'progress': {
            const text = typeof data.text === 'string' ? data.text : '';
            const meta = data.metadata as Record<string, unknown> | undefined;
            const kind = typeof meta?.kind === 'string' ? meta.kind : null;
            return { ...previous, phase: 'streaming', progressText: text, progressKind: kind };
          }
          case 'text': {
            if (previous.phase === 'waiting') {
              const text = typeof data.text === 'string' ? data.text.slice(0, 200) : '';
              return { ...previous, phase: 'streaming', progressText: text };
            }
            return previous;
          }
          case 'tool_use': {
            const toolName = typeof data.toolName === 'string' ? data.toolName : 'tool';
            const toolId = typeof data.toolId === 'string' ? data.toolId : '';
            return {
              ...previous,
              phase: 'streaming',
              tools: [...previous.tools, { toolName, toolId, done: false }],
            };
          }
          case 'tool_result': {
            const toolId = typeof data.toolId === 'string' ? data.toolId : '';
            return {
              ...previous,
              tools: previous.tools.map((tool) =>
                tool.toolId === toolId ? { ...tool, done: true } : tool,
              ),
            };
          }
          case 'result':
          case 'session_closed':
            return {
              ...previous,
              phase: 'streaming',
              progressKind: 'finalizing',
              progressText: previous.progressText || 'Finalizing...',
            };
          case 'error':
            return {
              ...previous,
              phase: 'streaming',
              progressKind: 'error',
              progressText: typeof data.text === 'string' && data.text.trim()
                ? data.text
                : 'Finishing...',
            };
          default:
            return previous;
        }
      });

      if (shouldRetrySessionClose) {
        scheduleReconnect();
      }
    }

    function openSource(): void {
      if (disposed || !shouldConnectLiveIndicatorStream(channelId, busy)) {
        return;
      }

      closeSource();
      const source = new EventSource(`/api/channels/${channelId}/stream`);
      sourceRef.current = source;

      source.addEventListener('progress', handleEvent);
      source.addEventListener('text', handleEvent);
      source.addEventListener('tool_use', handleEvent);
      source.addEventListener('tool_result', handleEvent);
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

    const waitingState: LiveIndicatorState = {
      active: true,
      phase: 'waiting',
      catId: workingCatId,
      catName: null,
      speakerLabel,
      progressText: '',
      progressKind: null,
      tools: [],
    };
    stateRef.current = waitingState;
    setState(waitingState);

    if (!shouldConnectLiveIndicatorStream(channelId, busy)) {
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
  }, [channelId, busy, leadCatId]);

  return state;
}
