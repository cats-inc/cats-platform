import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { AppShellPayload } from '../api/contracts';
import type { ChatOperatorSnapshot } from '../shared/operatorLoop';
import {
  sendChatMessage,
  writeCoreApprovalDecision,
  writeCoreOperatorAction,
} from './api';
import type { MessageChoicesSubmitInput } from './components/MessageChoices';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type OperatorStateLike =
  | { status: 'idle'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'loading'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'ready'; snapshot: ChatOperatorSnapshot; message: string }
  | { status: 'error'; snapshot: ChatOperatorSnapshot | null; message: string };

export function useGovernanceActions(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  operatorState: OperatorStateLike;
  setOperatorState: Dispatch<SetStateAction<OperatorStateLike>>;
  setBusy: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}) {
  const {
    state,
    setState,
    operatorState,
    setOperatorState,
    setBusy,
    setFeedback,
  } = options;

  const onApprovalDecision = useCallback(async (
    taskId: string,
    action: 'approve' | 'reroute' | 'reject',
  ): Promise<void> => {
    if (!operatorState.snapshot) {
      return;
    }

    setBusy(`approval:${taskId}:${action}`);
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
      setFeedback(error instanceof Error ? error.message : 'Failed to update approval.');
    } finally {
      setBusy('');
    }
  }, [operatorState.snapshot, setBusy, setFeedback, setOperatorState]);

  const onChoiceSubmit = useCallback(async (input: MessageChoicesSubmitInput): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const channelId = input.channelId;
    if (!channelId) {
      return;
    }

    setBusy(`choice:${input.choiceResponse.sourceMessageId}:${input.choiceResponse.status}`);
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
      setFeedback(error instanceof Error ? error.message : 'Failed to submit choice response.');
    } finally {
      setBusy('');
    }
  }, [setBusy, setFeedback, setState, state]);

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
    setBusy(`operator-action:${input.action}:${busyKey}`);
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
      setFeedback(error instanceof Error ? error.message : 'Failed to record operator action.');
    } finally {
      setBusy('');
    }
  }, [operatorState.snapshot, setBusy, setFeedback, setOperatorState]);

  return {
    onApprovalDecision,
    onChoiceSubmit,
    onOperatorAction,
  };
}
