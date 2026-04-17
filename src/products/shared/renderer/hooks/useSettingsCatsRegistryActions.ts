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
import { updateCatProfile } from '../api/index.js';
import { emptyCatForm, type CatFormState } from '../workspaceChatUtils.js';

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
  });

  async function onArchiveCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: 'Archive cat',
          message: `Archive "${catName}"? You can recover this cat later from Settings.`,
          confirmLabel: 'Archive',
        })
      : true;
    if (!confirmed) return;
    onBusy(createCatBusyState('archive', catId));
    onFeedback('');
    try {
      const next = await updateCatProfile(catId, { archive: true });
      onPayloadUpdate(next);
      onFeedback(`${catName} archived.`);
      if (expandedCatId === catId) {
        setExpandedCatId(null);
      }
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to archive cat');
    } finally {
      onBusy(clearBusyState());
    }
  }

  async function onUnarchiveCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: 'Recover cat',
          message: `Recover "${catName}" from archive?`,
          confirmLabel: 'Recover',
        })
      : true;
    if (!confirmed) return;
    onBusy(createCatBusyState('unarchive', catId));
    onFeedback('');
    try {
      const next = await updateCatProfile(catId, { unarchive: true });
      onPayloadUpdate(next);
      onFeedback(`${catName} recovered.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to recover cat');
    } finally {
      onBusy(clearBusyState());
    }
  }

  async function onDeleteCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({ title: 'Delete cat', message: `Delete "${catName}"? This cannot be undone.` })
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
    onRenameCat,
    onSkillChange,
    onUnarchiveCat,
  };
}
