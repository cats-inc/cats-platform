import type { Dispatch, FormEvent, SetStateAction } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  createBotBindingApi,
  createGlobalCat,
  deleteBotBindingApi,
  deleteGlobalCat,
  updateCatProfile,
} from '../api/index.js';
import type { CatFormState } from '../workspaceChatUtils.js';

export interface BotFormState {
  botName: string;
  botToken: string;
  webhookSecret: string;
  inboundMode: 'polling' | 'webhook';
}

export function emptyBotForm(): BotFormState {
  return {
    botName: '',
    botToken: '',
    webhookSecret: '',
    inboundMode: 'polling',
  };
}

export interface SettingsCatsRegistryActionsContext {
  expandedCatId: string | null;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  onBusy: (key: string) => void;
  onFeedback: (message: string) => void;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  catForm: CatFormState;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  renameValue: string;
  setRenameValue: Dispatch<SetStateAction<string>>;
  botForm: BotFormState;
  setBotForm: Dispatch<SetStateAction<BotFormState>>;
  emptyCatForm: () => CatFormState;
}

export function createSettingsCatsRegistryActions(
  context: SettingsCatsRegistryActionsContext,
) {
  async function onCreateCat(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    context.onBusy('cat:create');
    try {
      const result = await createGlobalCat({
        name: context.catForm.name,
        provider: context.catForm.provider,
        instance: context.catForm.instance || undefined,
        model: context.catForm.model || undefined,
        modelSelection: context.catForm.modelSelection,
        makeBoss: context.catForm.makeBoss || undefined,
        products: context.catForm.products.length > 0 ? context.catForm.products : undefined,
      });
      context.onPayloadUpdate(result);
      context.setCatForm(context.emptyCatForm());
      context.onFeedback('Cat saved.');
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to save cat.');
    } finally {
      context.onBusy('');
    }
  }

  async function onRenameCat(catId: string): Promise<void> {
    const trimmed = context.renameValue.trim();
    if (!trimmed) {
      return;
    }

    context.onBusy(`cat:rename:${catId}`);
    try {
      const result = await updateCatProfile(catId, { name: trimmed });
      context.onPayloadUpdate(result);
      context.setRenameValue('');
      context.onFeedback('Cat renamed.');
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to rename cat.');
    } finally {
      context.onBusy('');
    }
  }

  async function onDeleteCat(catId: string, catName: string): Promise<void> {
    context.onBusy(`cat:delete:${catId}`);
    context.onFeedback('');
    try {
      const next = await deleteGlobalCat(catId);
      context.onPayloadUpdate(next);
      context.onFeedback(`${catName} deleted.`);
      if (context.expandedCatId === catId) {
        context.setExpandedCatId(null);
      }
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to delete cat');
    } finally {
      context.onBusy('');
    }
  }

  async function onMakeBossCat(catId: string): Promise<void> {
    context.onBusy(`cat:makeBoss:${catId}`);
    try {
      const result = await updateCatProfile(catId, { makeBoss: true });
      context.onPayloadUpdate(result);
      context.onFeedback('Boss Cat updated.');
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to set Boss Cat.');
    } finally {
      context.onBusy('');
    }
  }

  async function onSkillChange(catId: string, skillProfile: string): Promise<void> {
    context.onBusy(`cat:skill:${catId}`);
    try {
      const result = await updateCatProfile(catId, {
        skillProfile: skillProfile === 'chat-default' ? null : skillProfile,
      });
      context.onPayloadUpdate(result);
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to update skill.');
    } finally {
      context.onBusy('');
    }
  }

  async function onUpdateProducts(catId: string, products: string[]): Promise<void> {
    context.onBusy(`cat:products:${catId}`);
    try {
      const result = await updateCatProfile(catId, { products });
      context.onPayloadUpdate(result);
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to update products.');
    } finally {
      context.onBusy('');
    }
  }

  async function onCreateBinding(catId: string): Promise<void> {
    if (!context.botForm.botName.trim()) {
      return;
    }

    context.onBusy('bot:create');
    try {
      const result = await createBotBindingApi({
        botName: context.botForm.botName.trim(),
        catId,
        inboundMode: context.botForm.inboundMode,
        botToken: context.botForm.botToken.trim() || undefined,
        webhookSecret:
          context.botForm.inboundMode === 'webhook'
            ? (context.botForm.webhookSecret.trim() || undefined)
            : undefined,
      });
      context.onPayloadUpdate(result);
      context.setBotForm(emptyBotForm());
      context.onFeedback('Telegram bot binding created.');
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to create binding.');
    } finally {
      context.onBusy('');
    }
  }

  async function onDeleteBinding(bindingId: string): Promise<void> {
    context.onBusy(`bot:delete:${bindingId}`);
    try {
      const result = await deleteBotBindingApi(bindingId);
      context.onPayloadUpdate(result);
      context.onFeedback('Binding removed.');
    } catch (error) {
      context.onFeedback(error instanceof Error ? error.message : 'Failed to remove binding.');
    } finally {
      context.onBusy('');
    }
  }

  return {
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
