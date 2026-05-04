import { startTransition, useCallback } from 'react';

import type {
  ParallelChatGroupSummary,
  ParallelChatRelayCommandKind,
  RelayParallelChatMessageInput,
} from '../../api/workspaceContracts.js';
import type { ParallelChatDispatchResponse } from '../api/chat.js';
import {
  clearBusyState,
  createParallelChatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

interface SelectedChannelLike {
  id: string;
}

export function useWorkspaceCompareRelay<TPayload extends { chat: unknown }>(input: {
  selectedChannel: SelectedChannelLike | null;
  selectedParallelChatGroup: ParallelChatGroupSummary | null;
  relayParallelChatMessage: (
    groupId: string,
    body: RelayParallelChatMessageInput,
    signal?: AbortSignal,
  ) => Promise<ParallelChatDispatchResponse & { appShell: TPayload }>;
  setBusy: (value: WorkspaceBusyState) => void;
  setFeedback: (value: string) => void;
  setState: (value: { status: 'ready'; payload: TPayload }) => void;
}) {
  const {
    selectedChannel,
    selectedParallelChatGroup,
    relayParallelChatMessage,
    setBusy,
    setFeedback,
    setState,
  } = input;
  const { locale, t } = useI18n();

  return useCallback(async (
    messageId: string,
    command: ParallelChatRelayCommandKind,
  ): Promise<void> => {
    if (!selectedChannel || !selectedParallelChatGroup) {
      return;
    }

    setBusy(createParallelChatBusyState('relay'));
    setFeedback('');
    try {
      const dispatch = await relayParallelChatMessage(selectedParallelChatGroup.id, {
        activeChannelId: selectedChannel.id,
        sourceChannelId: selectedChannel.id,
        sourceMessageId: messageId,
        command,
        targetPolicy: 'all_others',
        locale,
      });
      startTransition(() => setState({ status: 'ready', payload: dispatch.appShell }));

      const failures = dispatch.results.filter((result) => result.status === 'error');
      if (failures.length > 0) {
        setFeedback(
          failures
            .map((result) => result.error || t(messageKeys.chatComposerErrorRelayFailedForChannel, {
              channelId: result.channelId,
            }))
            .join(' '),
        );
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatComposerErrorRelayCompareFailed));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    relayParallelChatMessage,
    selectedChannel,
    selectedParallelChatGroup,
    setBusy,
    setFeedback,
    setState,
    locale,
    t,
  ]);
}
