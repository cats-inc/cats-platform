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
}) {
  const {
    expandedCatId,
    setExpandedCatId,
    onBusy,
    onFeedback,
    onPayloadUpdate,
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

  async function onDeleteCat(catId: string, catName: string): Promise<void> {
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
    onCreateBinding,
    onCreateCat,
    onDeleteBinding,
    onDeleteCat,
    onMakeBossCat,
    onRenameCat,
    onSkillChange,
  };
}
