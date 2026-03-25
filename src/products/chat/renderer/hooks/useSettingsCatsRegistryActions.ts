import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';

import { type AppShellPayload } from '../../api/contracts.js';
import {
  createBotBindingApi,
  createGlobalCat,
  deleteBotBindingApi,
  deleteGlobalCat,
  updateCatProfile,
} from '../api/index.js';
import { emptyCatForm, type CatFormState } from '../chatUtils.js';

export interface BotFormState {
  botName: string;
  botToken: string;
  webhookSecret: string;
  inboundMode: 'polling' | 'webhook';
}

function emptyBotForm(): BotFormState {
  return {
    botName: '',
    botToken: '',
    webhookSecret: '',
    inboundMode: 'polling',
  };
}

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

  async function onCreateCat(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    onBusy('cat:create');
    try {
      const result = await createGlobalCat({
        name: catForm.name,
        provider: catForm.provider,
        instance: catForm.instance || undefined,
        model: catForm.model || undefined,
        modelSelection: catForm.modelSelection,
        makeBoss: catForm.makeBoss || undefined,
        products: catForm.products.length > 0 ? catForm.products : undefined,
      });
      onPayloadUpdate(result);
      setCatForm(emptyCatForm());
      onFeedback('Cat saved.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to save cat.');
    } finally {
      onBusy('');
    }
  }

  async function onRenameCat(catId: string): Promise<void> {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      return;
    }

    onBusy(`cat:rename:${catId}`);
    try {
      const result = await updateCatProfile(catId, { name: trimmed });
      onPayloadUpdate(result);
      setRenameValue('');
      onFeedback('Cat renamed.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to rename cat.');
    } finally {
      onBusy('');
    }
  }

  async function onArchiveCat(catId: string, catName: string): Promise<void> {
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

  async function onDeleteCat(catId: string, catName: string): Promise<void> {
    const confirmed = confirmDialog
      ? await confirmDialog({ title: 'Delete cat', message: `Delete "${catName}"? This cannot be undone.` })
      : true;
    if (!confirmed) return;
    onBusy(`cat:delete:${catId}`);
    onFeedback('');
    try {
      const next = await deleteGlobalCat(catId);
      onPayloadUpdate(next);
      onFeedback(`${catName} deleted.`);
      if (expandedCatId === catId) {
        setExpandedCatId(null);
      }
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to delete cat');
    } finally {
      onBusy('');
    }
  }

  async function onMakeBossCat(catId: string): Promise<void> {
    onBusy(`cat:makeBoss:${catId}`);
    try {
      const result = await updateCatProfile(catId, { makeBoss: true });
      onPayloadUpdate(result);
      onFeedback('Boss Cat updated.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to set Boss Cat.');
    } finally {
      onBusy('');
    }
  }

  async function onSkillChange(catId: string, skillProfile: string): Promise<void> {
    onBusy(`cat:skill:${catId}`);
    try {
      const result = await updateCatProfile(catId, {
        skillProfile: skillProfile === 'chat-default' ? null : skillProfile,
      });
      onPayloadUpdate(result);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to update skill.');
    } finally {
      onBusy('');
    }
  }

  async function onUpdateProducts(catId: string, products: string[]): Promise<void> {
    onBusy(`cat:products:${catId}`);
    try {
      const result = await updateCatProfile(catId, { products });
      onPayloadUpdate(result);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to update products.');
    } finally {
      onBusy('');
    }
  }

  async function onCreateBinding(catId: string): Promise<void> {
    if (!botForm.botName.trim()) {
      return;
    }

    onBusy('bot:create');
    try {
      const result = await createBotBindingApi({
        botName: botForm.botName.trim(),
        catId,
        inboundMode: botForm.inboundMode,
        botToken: botForm.botToken.trim() || undefined,
        webhookSecret:
          botForm.inboundMode === 'webhook'
            ? (botForm.webhookSecret.trim() || undefined)
            : undefined,
      });
      onPayloadUpdate(result);
      setBotForm(emptyBotForm());
      onFeedback('Telegram bot binding created.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to create binding.');
    } finally {
      onBusy('');
    }
  }

  async function onDeleteBinding(bindingId: string): Promise<void> {
    onBusy(`bot:delete:${bindingId}`);
    try {
      const result = await deleteBotBindingApi(bindingId);
      onPayloadUpdate(result);
      onFeedback('Binding removed.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to remove binding.');
    } finally {
      onBusy('');
    }
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
    onUpdateProducts,
  };
}
