import { startTransition, useCallback } from 'react';

import {
  clearBusyState,
  createChannelParticipantBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys, type MessageKey } from '../../../../shared/i18n/index.js';
import { formatWorkspaceChatActionError } from './workspaceChatActionErrorLabels.js';

/**
 * A participant popover's conversation actions: moving or clearing the
 * coordinator (SPEC-125 FR-12) and removing the participant (FR-4).
 */
export function useWorkspaceChannelParticipantActions<TPayload>(input: {
  setChannelCoordinatorApi: (
    channelId: string,
    coordinatorParticipantId: string | null,
  ) => Promise<TPayload>;
  removeChannelParticipantApi: (channelId: string, participantId: string) => Promise<TPayload>;
  setBusy: (value: WorkspaceBusyState) => void;
  setFeedback: (value: string) => void;
  setState: (value: { status: 'ready'; payload: TPayload }) => void;
}) {
  const {
    setChannelCoordinatorApi,
    removeChannelParticipantApi,
    setBusy,
    setFeedback,
    setState,
  } = input;
  const { t } = useI18n();
  const run = useCallback(async (
    participantId: string,
    mutate: () => Promise<TPayload>,
    errorKey: MessageKey,
  ) => {
    setBusy(createChannelParticipantBusyState(participantId));
    try {
      const payload = await mutate();
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(formatWorkspaceChatActionError(error, t(errorKey), t));
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState, t]);

  const setCoordinator = useCallback((
    channelId: string,
    participantId: string,
    coordinate: boolean,
  ) => run(
    participantId,
    () => setChannelCoordinatorApi(channelId, coordinate ? participantId : null),
    messageKeys.chatParticipantsErrorSetCoordinator,
  ), [run, setChannelCoordinatorApi]);

  const removeParticipant = useCallback((channelId: string, participantId: string) => run(
    participantId,
    () => removeChannelParticipantApi(channelId, participantId),
    messageKeys.chatParticipantsErrorRemoveParticipant,
  ), [removeChannelParticipantApi, run]);

  return { setCoordinator, removeParticipant };
}
