import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type {
  AppShellPayload,
  ChatMessageChoiceResponse,
} from '../../api/workspaceContracts.js';
import type { ChatOperatorSnapshot } from '../../operator-loop/index.js';
import {
  sendChatMessage as sendWorkspaceChatMessage,
  writeCoreApprovalDecision,
  writeCoreOperatorAction,
} from '../api/index.js';
import {
  clearBusyState,
  createApprovalBusyState,
  createChoiceBusyState,
  createOperatorActionBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

export interface WorkspaceGovernancePayloadLike {
  ownerDisplayName: string;
}

type LoadStateLike<TPayload extends WorkspaceGovernancePayloadLike> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

type OperatorStateLike =
  | { status: 'idle'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'loading'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'ready'; snapshot: ChatOperatorSnapshot; message: string }
  | { status: 'error'; snapshot: ChatOperatorSnapshot | null; message: string };

interface MessageChoicesSubmitInput {
  channelId: string;
  body: string;
  choiceResponse: ChatMessageChoiceResponse;
}

export function useWorkspaceGovernanceActions<
  TPayload extends WorkspaceGovernancePayloadLike = AppShellPayload,
  TChoiceResponse extends {
    sourceMessageId: string;
    status: string;
  } = ChatMessageChoiceResponse,
>(options: {
  state: LoadStateLike<TPayload>;
  setState: Dispatch<SetStateAction<LoadStateLike<TPayload>>>;
  operatorState: OperatorStateLike;
  setOperatorState: Dispatch<SetStateAction<OperatorStateLike>>;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  sendChatMessage?: (channelId: string, input: {
    body: string;
    senderName: string;
    choiceResponse: TChoiceResponse;
  }) => Promise<{ appShell: TPayload }>;
}) {
  const {
    state,
    setState,
    operatorState,
    setOperatorState,
    setBusy,
    setFeedback,
    sendChatMessage = sendWorkspaceChatMessage as unknown as (channelId: string, input: {
      body: string;
      senderName: string;
      choiceResponse: TChoiceResponse;
    }) => Promise<{ appShell: TPayload }>,
  } = options;
  const { t } = useI18n();

  const onApprovalDecision = useCallback(async (
    taskId: string,
    action: 'approve' | 'reroute' | 'reject',
  ): Promise<void> => {
    if (!operatorState.snapshot) {
      return;
    }

    setBusy(createApprovalBusyState(taskId, action));
    try {
      const snapshot = await writeCoreApprovalDecision({
        taskId,
        status: action === 'approve' ? 'approved' : 'rejected',
        action,
        decidedByActorId: operatorState.snapshot.core.ownerProfile.actorId,
      });
      startTransition(() => {
        setOperatorState({
          status: 'ready',
          snapshot,
          message: '',
        });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatGovernanceErrorUpdateApproval));
    } finally {
      setBusy(clearBusyState());
    }
  }, [operatorState.snapshot, setBusy, setFeedback, setOperatorState, t]);

  const onChoiceSubmit = useCallback(async (
    input: Omit<MessageChoicesSubmitInput, 'choiceResponse'> & { choiceResponse: TChoiceResponse },
  ): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const channelId = input.channelId;
    if (!channelId) {
      return;
    }

    setBusy(createChoiceBusyState(input.choiceResponse.sourceMessageId, input.choiceResponse.status));
    try {
      const dispatch = await sendChatMessage(channelId, {
        body: input.body,
        senderName: state.payload.ownerDisplayName,
        choiceResponse: input.choiceResponse,
      });
      startTransition(() => {
        setState({ status: 'ready', payload: dispatch.appShell });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatGovernanceErrorSubmitChoiceResponse));
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState, state, t]);

  const onOperatorAction = useCallback(async (input: {
    action: 'retry' | 'acknowledge';
    taskId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
  }): Promise<void> => {
    if (!operatorState.snapshot) {
      return;
    }

    const busyKey = input.runId ?? input.taskId ?? input.checkpointId ?? input.outcomeId ?? 'global';
    setBusy(createOperatorActionBusyState(input.action, busyKey));
    try {
      const snapshot = await writeCoreOperatorAction({
        ...input,
        actorId: operatorState.snapshot.core.ownerProfile.actorId,
      });
      startTransition(() => {
        setOperatorState({
          status: 'ready',
          snapshot,
          message: '',
        });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatGovernanceErrorRecordOperatorAction));
    } finally {
      setBusy(clearBusyState());
    }
  }, [operatorState.snapshot, setBusy, setFeedback, setOperatorState, t]);

  return {
    onApprovalDecision,
    onChoiceSubmit,
    onOperatorAction,
  };
}

export const useGovernanceActions = useWorkspaceGovernanceActions;
