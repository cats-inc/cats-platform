import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';

import { type AppShellPayload } from '../../api/contracts.js';
import {
  createSettingsCatsRegistryActions,
  emptyBotForm,
  type BotFormState,
} from '../../../shared/renderer/hooks/settingsCatsRegistryActions.js';
import {
  deleteGlobalCat,
  updateCatProfile,
} from '../api/index.js';
import { emptyCatForm, type CatFormState } from '../chatUtils.js';

export type { BotFormState } from '../../../shared/renderer/hooks/settingsCatsRegistryActions.js';

export function useSettingsCatsRegistryActions(options: {
  expandedCatId: string | null;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  onBusy: (key: string) => void;
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
  const {
    onCreateBinding,
    onCreateCat,
    onDeleteBinding,
    onDeleteCat: onDeleteCatBase,
    onMakeBossCat,
    onRenameCat,
    onSkillChange,
    onUpdateProducts,
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
          message: `Archive "${catName}"? Telegram bot bindings will be removed, but you can still recover the cat later from Settings.`,
          confirmLabel: 'Archive',
        })
      : true;
    if (!confirmed) return;
    onBusy(`cat:archive:${catId}`);
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
      onBusy('');
    }
  }

  async function onUnarchiveCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: 'Recover cat',
          message: `Recover "${catName}" from archive? Avatar and cat settings will return, but Telegram bindings stay removed.`,
          confirmLabel: 'Recover',
        })
      : true;
    if (!confirmed) return;
    onBusy(`cat:unarchive:${catId}`);
    onFeedback('');
    try {
      const next = await updateCatProfile(catId, { unarchive: true });
      onPayloadUpdate(next);
      onFeedback(`${catName} recovered.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to recover cat');
    } finally {
      onBusy('');
    }
  }

  async function onDeleteCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({ title: 'Delete cat', message: `Delete "${catName}"? This cannot be undone.` })
      : true;
    if (!confirmed) return;
    await onDeleteCatBase(catId, catName);
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
    onDeleteBinding,
    onDeleteCat,
    onMakeBossCat,
    onRenameCat,
    onSkillChange,
    onUnarchiveCat,
    onUpdateProducts,
  };
}
