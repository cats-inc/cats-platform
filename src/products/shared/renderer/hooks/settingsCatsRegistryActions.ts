import type { Dispatch, FormEvent, SetStateAction } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  clearBusyState,
  createBotBusyState,
  createCatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import {
  createBotBindingApi,
  createGlobalCat,
  deleteBotBindingApi,
  deleteGlobalCat,
  updateCatProfile,
} from '../api/index.js';
import type { CatFormState } from '../workspaceChatUtils.js';
import { formatSettingsCatsRegistryMutationError } from './settingsCatsRegistryErrorLabels.js';

export interface BotFormState {
  botName: string;
  botToken: string;
  webhookSecret: string;
  inboundMode: 'polling' | 'webhook';
}

type SettingsCatsRegistryActionTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

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
  onBusy: (busy: WorkspaceBusyState) => void;
  onFeedback: (message: string) => void;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  catForm: CatFormState;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  renameValue: string;
  setRenameValue: Dispatch<SetStateAction<string>>;
  botForm: BotFormState;
  setBotForm: Dispatch<SetStateAction<BotFormState>>;
  emptyCatForm: () => CatFormState;
  t?: SettingsCatsRegistryActionTranslator;
}

export function createSettingsCatsRegistryActions(
  context: SettingsCatsRegistryActionsContext,
) {
  const t = context.t ?? createTranslator('en');

  async function performCreateCat(): Promise<AppShellPayload | null> {
    context.onBusy(createCatBusyState('create'));
    try {
      const result = await createGlobalCat({
        name: context.catForm.name,
        provider: context.catForm.provider,
        instance: context.catForm.instance || undefined,
        model: context.catForm.model || undefined,
        modelSelection: context.catForm.modelSelection,
        makeBoss: context.catForm.makeBoss || undefined,
        products: context.catForm.products.length > 0 ? context.catForm.products : undefined,
        skillProfile: context.catForm.skillProfile || undefined,
        mcpProfile:
          context.catForm.mcpProfile && context.catForm.mcpProfile !== 'chat-memory'
            ? context.catForm.mcpProfile
            : undefined,
      });
      context.onPayloadUpdate(result);
      context.setCatForm(context.emptyCatForm());
      context.onFeedback(t(messageKeys.sharedSettingsCatsSaveSuccess));
      return result;
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsSaveError),
        t,
      ));
      return null;
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  async function onCreateCat(event: FormEvent<HTMLFormElement>): Promise<AppShellPayload | null> {
    event.preventDefault();
    return performCreateCat();
  }

  async function onRenameCat(catId: string): Promise<void> {
    const trimmed = context.renameValue.trim();
    if (!trimmed) {
      return;
    }

    context.onBusy(createCatBusyState('rename', catId));
    try {
      const result = await updateCatProfile(catId, { name: trimmed });
      context.onPayloadUpdate(result);
      context.setRenameValue('');
      context.onFeedback(t(messageKeys.sharedSettingsCatsRenameSuccess));
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsRenameError),
        t,
      ));
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  async function onDeleteCat(catId: string, catName: string): Promise<void> {
    context.onBusy(createCatBusyState('delete', catId));
    context.onFeedback('');
    try {
      const next = await deleteGlobalCat(catId);
      context.onPayloadUpdate(next);
      context.onFeedback(t(messageKeys.sharedSettingsCatsDeleteSuccess, { catName }));
      if (context.expandedCatId === catId) {
        context.setExpandedCatId(null);
      }
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsDeleteError),
        t,
      ));
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  async function onMakeBossCat(catId: string): Promise<void> {
    context.onBusy(createCatBusyState('makeBoss', catId));
    try {
      const result = await updateCatProfile(catId, { makeBoss: true });
      context.onPayloadUpdate(result);
      context.onFeedback(t(messageKeys.sharedSettingsCatsBossUpdated));
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsSetBossCatError),
        t,
      ));
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  async function onSkillChange(catId: string, skillProfile: string): Promise<void> {
    context.onBusy(createCatBusyState('skill', catId));
    try {
      const result = await updateCatProfile(catId, {
        skillProfile: skillProfile === 'chat-default' ? null : skillProfile,
      });
      context.onPayloadUpdate(result);
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsSkillUpdateError),
        t,
      ));
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  async function onMcpProfileChange(catId: string, mcpProfile: string): Promise<void> {
    context.onBusy(createCatBusyState('skill', catId));
    try {
      const result = await updateCatProfile(catId, { mcpProfile });
      context.onPayloadUpdate(result);
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsChangeMcpProfileError),
        t,
      ));
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  async function onCreateBinding(catId: string): Promise<void> {
    if (!context.botForm.botName.trim()) {
      return;
    }

    context.onBusy(createBotBusyState('create'));
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
      context.onFeedback(t(messageKeys.sharedSettingsCatsTelegramBindingCreated));
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsTelegramBindingCreateError),
        t,
      ));
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  async function onDeleteBinding(bindingId: string): Promise<void> {
    context.onBusy(createBotBusyState('delete', bindingId));
    try {
      const result = await deleteBotBindingApi(bindingId);
      context.onPayloadUpdate(result);
      context.onFeedback(t(messageKeys.sharedSettingsCatsTelegramBindingRemoved));
    } catch (error) {
      context.onFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsTelegramBindingRemoveError),
        t,
      ));
    } finally {
      context.onBusy(clearBusyState());
    }
  }

  return {
    onCreateBinding,
    onCreateCat,
    performCreateCat,
    onDeleteBinding,
    onDeleteCat,
    onMakeBossCat,
    onMcpProfileChange,
    onRenameCat,
    onSkillChange,
  };
}
