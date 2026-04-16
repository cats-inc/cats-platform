import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import { getComposerDispatchChannelId, isComposerStopBusy } from '../../../../shared/composer.js';
import {
  clearBusyState,
  isParallelChatBusy,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';

type LoadStateLike<TPayload> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export interface ActiveAckRequest {
  id: number;
  controller: AbortController;
}

export interface ActiveSubmitRequest {
  id: number;
  kind: 'channel' | 'parallel';
  channelId: string;
  groupId?: string;
  channelIds?: string[];
}

function isDispatchRequestRunning<TPayload>(
  payload: TPayload,
  request: ActiveSubmitRequest,
  isChannelDispatchRunning: (payload: TPayload, channelId: string) => boolean,
): boolean {
  if (request.kind === 'parallel') {
    return (request.channelIds ?? [request.channelId]).some((channelId) =>
      isChannelDispatchRunning(payload, channelId));
  }

  return isChannelDispatchRunning(payload, request.channelId);
}

function matchesExpectedDispatchBusy(
  busy: WorkspaceBusyState,
  request: ActiveSubmitRequest,
): boolean {
  if (request.kind === 'parallel') {
    return isParallelChatBusy(busy, 'dispatch');
  }

  return getComposerDispatchChannelId(busy) === request.channelId;
}

export function useComposerRequestLifecycle<TPayload>(options: {
  state: LoadStateLike<TPayload>;
  busy: WorkspaceBusyState;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setState: Dispatch<SetStateAction<LoadStateLike<TPayload>>>;
  fetchPayload: () => Promise<TPayload>;
  isChannelDispatchRunning: (payload: TPayload, channelId: string) => boolean;
}) {
  const { state, busy, setBusy, setState, fetchPayload, isChannelDispatchRunning } = options;
  const activeAckRequestRef = useRef<ActiveAckRequest | null>(null);
  const activeDispatchRequestRef = useRef<ActiveSubmitRequest | null>(null);
  const nextSubmitIdRef = useRef(1);

  useEffect(() => () => {
    activeAckRequestRef.current?.controller.abort();
    activeAckRequestRef.current = null;
    activeDispatchRequestRef.current = null;
  }, []);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const activeRequest = activeDispatchRequestRef.current;
    if (!activeRequest || isComposerStopBusy(busy)) {
      return;
    }

    if (isDispatchRequestRunning(state.payload, activeRequest, isChannelDispatchRunning)) {
      return;
    }

    if (matchesExpectedDispatchBusy(busy, activeRequest)) {
      activeDispatchRequestRef.current = null;
      setBusy(clearBusyState());
    }
  }, [busy, isChannelDispatchRunning, setBusy, state]);

  useEffect(() => {
    const activeRequest = activeDispatchRequestRef.current;
    if (!activeRequest) {
      return;
    }

    if (!matchesExpectedDispatchBusy(busy, activeRequest)) {
      return;
    }

    let cancelled = false;
    let refetchInFlight = false;
    const interval = window.setInterval(async () => {
      if (cancelled || refetchInFlight) {
        return;
      }

      refetchInFlight = true;
      try {
        const payload = await fetchPayload();
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', payload });

        const currentRequest = activeDispatchRequestRef.current;
        if (!currentRequest || currentRequest.id !== activeRequest.id) {
          return;
        }

        if (!isDispatchRequestRunning(payload, currentRequest, isChannelDispatchRunning)) {
          activeDispatchRequestRef.current = null;
          setBusy(clearBusyState());
        }
      } catch {
        // Keep the existing SSE-driven path as primary; this only prevents indefinite busy lockups.
      } finally {
        refetchInFlight = false;
      }
    }, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [busy, fetchPayload, isChannelDispatchRunning, setBusy, setState]);

  const beginAckRequest = useCallback((): ActiveAckRequest => {
    const request = {
      id: nextSubmitIdRef.current,
      controller: new AbortController(),
    };
    nextSubmitIdRef.current += 1;
    activeAckRequestRef.current = request;
    return request;
  }, []);

  const clearAckRequestIfCurrent = useCallback((id: number): void => {
    if (activeAckRequestRef.current?.id === id) {
      activeAckRequestRef.current = null;
    }
  }, []);

  const cancelPendingAckRequest = useCallback((): ActiveAckRequest | null => {
    const request = activeAckRequestRef.current;
    if (!request) {
      return null;
    }

    activeAckRequestRef.current = null;
    request.controller.abort();
    return request;
  }, []);

  const setActiveDispatchRequest = useCallback((request: ActiveSubmitRequest | null): void => {
    activeDispatchRequestRef.current = request;
  }, []);

  const clearDispatchRequestIfCurrent = useCallback((id: number): void => {
    if (activeDispatchRequestRef.current?.id === id) {
      activeDispatchRequestRef.current = null;
    }
  }, []);

  return {
    activeDispatchRequestRef,
    beginAckRequest,
    cancelPendingAckRequest,
    clearAckRequestIfCurrent,
    clearDispatchRequestIfCurrent,
    setActiveDispatchRequest,
  };
}
