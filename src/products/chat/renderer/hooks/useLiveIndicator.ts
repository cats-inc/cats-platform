import { startTransition, useEffect, useRef, useState } from 'react';

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
  progressText: string;
  progressKind: string | null;
  tools: LiveToolEntry[];
}

export const EMPTY_LIVE_INDICATOR: LiveIndicatorState = {
  active: false,
  phase: 'idle',
  catId: null,
  catName: null,
  progressText: '',
  progressKind: null,
  tools: [],
};

export function shouldConnectLiveIndicatorStream(
  channelId: string | null,
  busy: string,
): boolean {
  if (busy !== 'message:send' || !channelId) {
    return false;
  }

  return !isOptimisticDraftChannelId(channelId);
}

export function useLiveIndicator(options: {
  channelId: string | null;
  busy: string;
  selectedChannel: SelectedChannelView | null;
}): LiveIndicatorState {
  const { channelId, busy, selectedChannel } = options;
  const [state, setState] = useState<LiveIndicatorState>(EMPTY_LIVE_INDICATOR);
  const sourceRef = useRef<EventSource | null>(null);

  // Extract stable primitive from selectedChannel to avoid object reference in deps
  const leadCatId = selectedChannel?.roomRouting.leadParticipantId ?? null;

  useEffect(() => {
    const shouldShowWaitingIndicator = busy === 'message:send' && Boolean(channelId);
    if (!shouldShowWaitingIndicator) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      setState(EMPTY_LIVE_INDICATOR);
      return undefined;
    }

    const workingCatId = leadCatId;

    setState({
      active: true,
      phase: 'waiting',
      catId: workingCatId,
      catName: null,
      progressText: '',
      progressKind: null,
      tools: [],
    });

    if (!shouldConnectLiveIndicatorStream(channelId, busy)) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      return undefined;
    }

    const source = new EventSource(`/api/channels/${channelId}/stream`);
    sourceRef.current = source;

    function handleEvent(e: MessageEvent): void {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(e.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      const eventType = (data.type as string) ?? e.type;

      startTransition(() => {
        setState((prev) => {
          if (!prev.active) return prev;

          switch (eventType) {
            case 'progress': {
              const text = typeof data.text === 'string' ? data.text : '';
              const meta = data.metadata as Record<string, unknown> | undefined;
              const kind = typeof meta?.kind === 'string' ? meta.kind : null;
              return { ...prev, phase: 'streaming', progressText: text, progressKind: kind };
            }
            case 'text': {
              // Show text preview only if no progress has arrived yet
              if (prev.phase === 'waiting') {
                const text = typeof data.text === 'string' ? data.text.slice(0, 200) : '';
                return { ...prev, phase: 'streaming', progressText: text };
              }
              return prev;
            }
            case 'tool_use': {
              const toolName = typeof data.toolName === 'string' ? data.toolName : 'tool';
              const toolId = typeof data.toolId === 'string' ? data.toolId : '';
              return {
                ...prev,
                phase: 'streaming',
                tools: [...prev.tools, { toolName, toolId, done: false }],
              };
            }
            case 'tool_result': {
              const toolId = typeof data.toolId === 'string' ? data.toolId : '';
              return {
                ...prev,
                tools: prev.tools.map((t) =>
                  t.toolId === toolId ? { ...t, done: true } : t,
                ),
              };
            }
            case 'result':
            case 'session_closed':
              return {
                ...prev,
                phase: 'streaming',
                progressKind: 'finalizing',
                progressText: prev.progressText || 'Finalizing...',
              };
            case 'error':
              return {
                ...prev,
                phase: 'streaming',
                progressKind: 'error',
                progressText: typeof data.text === 'string' && data.text.trim()
                  ? data.text
                  : 'Finishing...',
              };
            default:
              return prev;
          }
        });
      });
    }

    source.addEventListener('progress', handleEvent);
    source.addEventListener('text', handleEvent);
    source.addEventListener('tool_use', handleEvent);
    source.addEventListener('tool_result', handleEvent);
    source.addEventListener('result', handleEvent);
    source.addEventListener('error', handleEvent);
    source.addEventListener('session_closed', handleEvent);

    // SSE error (connection lost) — silently keep dots
    source.onerror = () => {};

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [channelId, busy, leadCatId]);

  return state;
}
