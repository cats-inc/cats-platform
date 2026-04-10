import { startTransition, useCallback } from 'react';

import type { AppShellPayload } from '../../api/contracts.js';

export function useChannelParticipantUpdate(input: {
  updateChannelParticipantApi: (
    channelId: string,
    participantId: string,
    update: { name?: string; roleHint?: string | null },
  ) => Promise<AppShellPayload>;
  setBusy: (value: string) => void;
  setFeedback: (value: string) => void;
  setState: (value: { status: 'ready'; payload: AppShellPayload }) => void;
}) {
  const { updateChannelParticipantApi, setBusy, setFeedback, setState } = input;
  return useCallback(async (
    channelId: string,
    participantId: string,
    update: { name?: string; roleHint?: string | null },
  ) => {
    setBusy(`channel:participant:update:${participantId}`);
    try {
      const payload = await updateChannelParticipantApi(channelId, participantId, update);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to update participant.');
    } finally {
      setBusy('');
    }
  }, [setBusy, setFeedback, setState, updateChannelParticipantApi]);
}
