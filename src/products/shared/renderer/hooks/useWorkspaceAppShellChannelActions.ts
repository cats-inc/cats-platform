import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import {
  clearBusyState,
  createChannelBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';

export interface WorkspaceDirectLaneModelValueLike {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface WorkspaceChannelActivationResultLike<TPayload> {
  appShell: TPayload;
  results: ReadonlyArray<{
    status: string;
    targetName: string;
    error?: string | null;
  }>;
}

export interface UseWorkspaceDirectLaneModelSaveOptions<TPayload> {
  updateCatProfile: (
    catId: string,
    input: WorkspaceDirectLaneModelValueLike,
  ) => Promise<TPayload>;
  publishReadyPayload: (payload: TPayload) => void;
}

export function useWorkspaceDirectLaneModelSave<TPayload>({
  updateCatProfile,
  publishReadyPayload,
}: UseWorkspaceDirectLaneModelSaveOptions<TPayload>) {
  return useCallback(
    async (catId: string, value: WorkspaceDirectLaneModelValueLike) => {
      try {
        const result = await updateCatProfile(catId, {
          provider: value.provider,
          instance: value.instance,
          model: value.model,
          modelSelection: value.modelSelection,
        });
        startTransition(() => publishReadyPayload(result));
      } catch {
        // Silent fail; the panel continues showing payload-backed state.
      }
    },
    [publishReadyPayload, updateCatProfile],
  );
}

export interface UseWorkspaceResumeChannelOptions<TPayload> {
  activateChatChannel: (
    channelId: string,
  ) => Promise<WorkspaceChannelActivationResultLike<TPayload>>;
  publishReadyPayload: (payload: TPayload) => void;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}

export function useWorkspaceResumeChannel<TPayload>({
  activateChatChannel,
  publishReadyPayload,
  setBusy,
  setFeedback,
}: UseWorkspaceResumeChannelOptions<TPayload>) {
  return useCallback(
    async (channelId: string): Promise<void> => {
      setBusy(createChannelBusyState('resume'));
      setFeedback('');
      try {
        const activation = await activateChatChannel(channelId);
        startTransition(() => publishReadyPayload(activation.appShell));
        const errors = activation.results.filter(
          (result) => result.status === 'error',
        );
        if (errors.length > 0) {
          setFeedback(
            errors
              .map(
                (result) =>
                  result.error || `Failed to resume ${result.targetName}.`,
              )
              .join(' '),
          );
        }
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : 'Failed to resume chat session.',
        );
      } finally {
        setBusy(clearBusyState());
      }
    },
    [activateChatChannel, publishReadyPayload, setBusy, setFeedback],
  );
}
