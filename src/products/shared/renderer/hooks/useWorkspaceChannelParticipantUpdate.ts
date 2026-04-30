import { startTransition, useCallback } from 'react';

import type { UpdateChannelParticipantInput } from '../../api/workspaceContracts.js';
import {
  clearBusyState,
  createChannelParticipantBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

export function useWorkspaceChannelParticipantUpdate<TPayload>(input: {
  updateChannelParticipantApi: (
    channelId: string,
    participantId: string,
    update: UpdateChannelParticipantInput,
  ) => Promise<TPayload>;
  setBusy: (value: WorkspaceBusyState) => void;
  setFeedback: (value: string) => void;
  setState: (value: { status: 'ready'; payload: TPayload }) => void;
}) {
  const { updateChannelParticipantApi, setBusy, setFeedback, setState } = input;
  const { t } = useI18n();
  return useCallback(async (
    channelId: string,
    participantId: string,
    update: UpdateChannelParticipantInput,
  ) => {
    setBusy(createChannelParticipantBusyState(participantId));
    try {
      const payload = await updateChannelParticipantApi(channelId, participantId, update);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatParticipantsErrorUpdateParticipant));
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState, t, updateChannelParticipantApi]);
}
