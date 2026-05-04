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
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { formatWorkspaceChatActionError } from './workspaceChatActionErrorLabels.js';

export interface WorkspaceDirectLaneModelValueLike {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
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

export interface UseWorkspaceResetChannelContinuityOptions<TPayload> {
  resetChannelContinuity: (channelId: string) => Promise<TPayload>;
  publishReadyPayload: (payload: TPayload) => void;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}

export function useWorkspaceResetChannelContinuity<TPayload>({
  resetChannelContinuity,
  publishReadyPayload,
  setBusy,
  setFeedback,
}: UseWorkspaceResetChannelContinuityOptions<TPayload>) {
  const { t } = useI18n();
  return useCallback(
    async (channelId: string): Promise<void> => {
      setBusy(createChannelBusyState('reset'));
      setFeedback('');
      try {
        const payload = await resetChannelContinuity(channelId);
        startTransition(() => publishReadyPayload(payload));
      } catch (error) {
        setFeedback(formatWorkspaceChatActionError(
          error,
          t(messageKeys.sharedChannelContinuityStartFreshError),
          t,
        ));
      } finally {
        setBusy(clearBusyState());
      }
    },
    [publishReadyPayload, resetChannelContinuity, setBusy, setFeedback, t],
  );
}
