import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import type {
  ActiveAckRequest,
  ActiveSubmitRequest,
} from './useComposerRequestLifecycle.js';

type LoadStateLike<TPayload> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export interface UseComposerRequestControlsOptions<TPayload> {
  activeDispatchRequestRef: MutableRefObject<ActiveSubmitRequest | null>;
  cancelPendingAckRequest: () => ActiveAckRequest | null;
  cancelChannel: (channelId: string) => Promise<{ appShell: TPayload }>;
  cancelConcurrentGroup: (
    groupId: string,
    input: { activeChannelId: string },
  ) => Promise<{ appShell: TPayload }>;
  setBusy: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<LoadStateLike<TPayload>>>;
}

export function useComposerRequestControls<TPayload>({
  activeDispatchRequestRef,
  cancelPendingAckRequest,
  cancelChannel,
  cancelConcurrentGroup,
  setBusy,
  setFeedback,
  setState,
}: UseComposerRequestControlsOptions<TPayload>) {
  const onStopMessage = useCallback(async (): Promise<void> => {
    const activeRequest = activeDispatchRequestRef.current;
    if (!activeRequest) {
      return;
    }

    activeDispatchRequestRef.current = null;
    setFeedback('');
    setBusy(
      activeRequest.kind === 'concurrent'
        ? 'parallelChat:stop'
        : `message:stop:${activeRequest.channelId}`,
    );

    try {
      const cancellation = activeRequest.kind === 'concurrent'
        ? await cancelConcurrentGroup(activeRequest.groupId ?? '', {
            activeChannelId: activeRequest.channelId,
          })
        : await cancelChannel(activeRequest.channelId);
      setState({ status: 'ready', payload: cancellation.appShell });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to stop response.');
    } finally {
      setBusy('');
    }
  }, [
    activeDispatchRequestRef,
    cancelChannel,
    cancelConcurrentGroup,
    setBusy,
    setFeedback,
    setState,
  ]);

  const onCancelPendingSend = useCallback((): void => {
    const activeRequest = cancelPendingAckRequest();
    if (!activeRequest) {
      return;
    }

    setFeedback('');
  }, [cancelPendingAckRequest, setFeedback]);

  return {
    onCancelPendingSend,
    onStopMessage,
  };
}
