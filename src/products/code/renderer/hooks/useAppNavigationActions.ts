import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts.js';
import {
  clearBusyState,
  createCatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import type { ExecutionTargetValue } from '../../../shared/renderer/components/ExecutionTarget.js';
import {
  updateCatProfile,
} from '../api/index.js';
import {
  useWorkspaceAppNavigationActions,
  type WorkspaceNavigationLoadState,
} from '../../../shared/renderer/hooks/useWorkspaceAppNavigationActions.js';
import { formatSettingsCatsRegistryMutationError } from '../../../shared/renderer/hooks/settingsCatsRegistryErrorLabels.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

type LoadStateLike = WorkspaceNavigationLoadState;

export function useAppNavigationActions(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatExecutionTargetOverrides: Dispatch<SetStateAction<Map<string, ExecutionTargetValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const {
    state,
    setState,
    navigate,
    setBusy,
    setFeedback,
    confirm: confirmDialog,
  } = options;
  const { t } = useI18n();
  const sharedActions = useWorkspaceAppNavigationActions<ExecutionTargetValue>({
    ...options,
    platformShellSurface: 'code',
  });

  const onArchiveCat = useCallback(async (catId: string): Promise<void> => {
    const catName = state.status === 'ready'
      ? (
          state.payload.chat.cats.find((cat) => cat.id === catId)?.name
          ?? t(messageKeys.sharedSettingsCatsFallbackCatName)
        )
      : t(messageKeys.sharedSettingsCatsFallbackCatName);
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t(messageKeys.sharedSettingsCatsArchiveConfirmTitle),
          message: t(messageKeys.sharedSettingsCatsArchiveWithTelegramConfirmMessage, {
            catName,
          }),
          confirmLabel: t(messageKeys.sharedSettingsCatsArchiveLabel),
        })
      : true;
    if (!confirmed) return;
    setBusy(createCatBusyState('archive', catId));
    try {
      const payload = await updateCatProfile(catId, { archive: true });
      setState({ status: 'ready', payload });
    } catch (error) {
      setFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsArchiveError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [confirmDialog, setBusy, setFeedback, setState, state, t]);

  return {
    ...sharedActions,
    onArchiveCat,
  };
}
