import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import {
  clearBusyState,
  createChannelComposerBusyScope,
  createComposerBusyState,
  createParallelChatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import type {
  ActiveAckRequest,
  ActiveSubmitRequest,
} from './useComposerRequestLifecycle.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { formatWorkspaceChatActionError } from './workspaceChatActionErrorLabels.js';

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
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
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
  const { t } = useI18n();
  const onStopMessage = useCallback(async (): Promise<void> => {
    const activeRequest = activeDispatchRequestRef.current;
    if (!activeRequest) {
      return;
    }

    activeDispatchRequestRef.current = null;
    setFeedback('');
    setBusy(
      activeRequest.kind === 'parallel'
        ? createParallelChatBusyState('stop')
        : createComposerBusyState('stop', createChannelComposerBusyScope(activeRequest.channelId)),
    );

    try {
      const cancellation = activeRequest.kind === 'parallel'
        ? await cancelConcurrentGroup(activeRequest.groupId ?? '', {
            activeChannelId: activeRequest.channelId,
          })
        : await cancelChannel(activeRequest.channelId);
      setState({ status: 'ready', payload: cancellation.appShell });
    } catch (error) {
      setFeedback(formatWorkspaceChatActionError(
        error,
        t(messageKeys.chatComposerErrorStopFailed),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    activeDispatchRequestRef,
    cancelChannel,
    cancelConcurrentGroup,
    setBusy,
    setFeedback,
    setState,
    t,
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
