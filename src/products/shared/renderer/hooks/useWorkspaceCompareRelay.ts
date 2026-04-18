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
      });
      startTransition(() => setState({ status: 'ready', payload: dispatch.appShell }));

      const failures = dispatch.results.filter((result) => result.status === 'error');
      if (failures.length > 0) {
        setFeedback(
          failures
            .map((result) => result.error || `Relay failed for ${result.channelId}.`)
            .join(' '),
        );
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to relay compare message.');
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
  ]);
}
