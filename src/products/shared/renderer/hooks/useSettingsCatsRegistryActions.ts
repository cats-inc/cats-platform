import { useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  clearBusyState,
  createCatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import {
  createSettingsCatsRegistryActions,
  emptyBotForm,
  type BotFormState,
} from './settingsCatsRegistryActions.js';
import { buildDeleteCatConfirmation } from '../deleteConfirmations.js';
import { updateCatProfile } from '../api/index.js';
import { emptyCatForm, type CatFormState } from '../workspaceChatUtils.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { formatSettingsCatsRegistryMutationError } from './settingsCatsRegistryErrorLabels.js';

export type { BotFormState } from './settingsCatsRegistryActions.js';

export function useSettingsCatsRegistryActions(options: {
  expandedCatId: string | null;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  onBusy: (busy: WorkspaceBusyState) => void;
  onFeedback: (message: string) => void;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const {
    expandedCatId,
    setExpandedCatId,
    onBusy,
    onFeedback,
    onPayloadUpdate,
    confirm: confirmDialog,
  } = options;
  const { t } = useI18n();
  const [catForm, setCatForm] = useState<CatFormState>(emptyCatForm);
  const [renameValue, setRenameValue] = useState('');
  const [botForm, setBotForm] = useState<BotFormState>(emptyBotForm);
  const creatingCatRef = useRef(false);
  const {
    onCreateBinding,
    onCreateCat: onCreateCatBase,
    performCreateCat: performCreateCatBase,
    onDeleteBinding,
    onDeleteCat: onDeleteCatBase,
    onMakeBossCat,
    onMcpProfileChange,
    onRenameCat,
    onSkillChange,
  } = createSettingsCatsRegistryActions({
    expandedCatId,
    setExpandedCatId,
    onBusy,
    onFeedback,
    onPayloadUpdate,
    catForm,
    setCatForm,
    renameValue,
    setRenameValue,
    botForm,
    setBotForm,
    emptyCatForm,
    t,
  });

  async function onArchiveCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t(messageKeys.sharedSettingsCatsArchiveConfirmTitle),
          message: t(messageKeys.sharedSettingsCatsArchiveConfirmMessage, { catName }),
          confirmLabel: t(messageKeys.sharedSettingsCatsArchiveLabel),
        })
      : true;
    if (!confirmed) return;
    onBusy(createCatBusyState('archive', catId));
    onFeedback('');
    try {
      const next = await updateCatProfile(catId, { archive: true });
      onPayloadUpdate(next);
      onFeedback(t(messageKeys.sharedSettingsCatsArchiveSuccess, { catName }));
      if (expandedCatId === catId) {
        setExpandedCatId(null);
      }
    } catch (error) {
      onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsArchiveError),
        t,
      ));
    } finally {
      onBusy(clearBusyState());
    }
  }

  async function onUnarchiveCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t(messageKeys.sharedSettingsCatsRecoverConfirmTitle),
          message: t(messageKeys.sharedSettingsCatsRecoverConfirmMessage, { catName }),
          confirmLabel: t(messageKeys.sharedSettingsCatsRecoverConfirmLabel),
        })
      : true;
    if (!confirmed) return;
    onBusy(createCatBusyState('unarchive', catId));
    onFeedback('');
    try {
      const next = await updateCatProfile(catId, { unarchive: true });
      onPayloadUpdate(next);
      onFeedback(t(messageKeys.sharedSettingsCatsRecoverSuccess, { catName }));
    } catch (error) {
      onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsRecoverError),
        t,
      ));
    } finally {
      onBusy(clearBusyState());
    }
  }

  async function onDeleteCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog(buildDeleteCatConfirmation(catName, t))
      : true;
    if (!confirmed) return;
    await onDeleteCatBase(catId, catName);
  }

  async function performCreateCat(): Promise<AppShellPayload | null> {
    if (creatingCatRef.current) {
      return null;
    }
    creatingCatRef.current = true;
    try {
      return await performCreateCatBase();
    } finally {
      creatingCatRef.current = false;
    }
  }

  async function onCreateCat(
    event: Parameters<typeof onCreateCatBase>[0],
  ): Promise<AppShellPayload | null> {
    event.preventDefault();
    return performCreateCat();
  }

  return {
    botForm,
    catForm,
    renameValue,
    setBotForm,
    setCatForm,
    setRenameValue,
    onArchiveCat,
    onCreateBinding,
    onCreateCat,
    performCreateCat,
    onDeleteBinding,
    onDeleteCat,
    onMakeBossCat,
    onMcpProfileChange,
    onRenameCat,
    onSkillChange,
    onUnarchiveCat,
  };
}
