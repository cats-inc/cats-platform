import { useCallback, useState, type ComponentType, type Dispatch, type FormEvent, type SetStateAction } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import { ConfirmDialog, useConfirmDialog } from '../../../../../design/components/ConfirmDialog.js';
import { ToastContainer, useToast } from '../../../../../design/components/Toast.js';
import { ALL_PLATFORM_SURFACES } from '../../../../../shared/platformSurfaces.js';
import type { CatFormState } from '../../workspaceChatUtils.js';
import { useSettingsCatsMemory } from '../../hooks/useSettingsCatsMemory.js';
import {
  useSettingsCatsRegistryActions,
  type BotFormState,
} from '../../hooks/useSettingsCatsRegistryActions.js';
import { useSettingsCatsTelegram } from '../../hooks/useSettingsCatsTelegram.js';
import { SettingsCatsCreateForm } from './SettingsCatsCreateForm.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';
import { SettingsCatsTransportPanel } from './SettingsCatsTransportPanel.js';

export interface SettingsCatsRegistryController<TBotForm> {
  botForm: TBotForm;
  renameValue: string;
  setBotForm: Dispatch<SetStateAction<TBotForm>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  onCreateBinding: (catId: string) => Promise<void>;
  onDeleteBinding: (bindingId: string) => Promise<void>;
  onArchiveCat: (catId: string, catName: string) => Promise<void>;
  onUnarchiveCat: (catId: string, catName: string) => Promise<void>;
  onDeleteCat: (catId: string, catName: string) => Promise<void>;
  onMakeBossCat: (catId: string) => Promise<void>;
  onRenameCat: (catId: string) => Promise<void>;
  onSkillChange: (catId: string, skillProfile: string) => Promise<void>;
  onUpdateProducts: (catId: string, products: string[]) => Promise<void>;
}

export interface SettingsCatsRegistryActionsHookResult<TBotForm>
  extends SettingsCatsRegistryController<TBotForm> {
  catForm: CatFormState;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export interface SettingsCatsRegistryComponentProps<TBotForm> {
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  busy: string;
  expandedCatId: string | null;
  memoryController: ReturnType<typeof useSettingsCatsMemory>;
  payload: AppShellPayload;
  registryController: SettingsCatsRegistryController<TBotForm>;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  telegramDiagnostics: ReturnType<typeof useSettingsCatsTelegram>['telegramDiagnostics'];
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  onPayloadUpdate?: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export interface SettingsCatsProps {
  payload: AppShellPayload;
  feedback: string;
  busy: string;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
  onBusy: (key: string) => void;
}

export interface SharedSettingsCatsProps<TBotForm> extends SettingsCatsProps {
  useSettingsCatsRegistryActionsHook: (options: {
    expandedCatId: string | null;
    setExpandedCatId: Dispatch<SetStateAction<string | null>>;
    onBusy: (key: string) => void;
    onFeedback: (message: string) => void;
    onPayloadUpdate: (payload: AppShellPayload) => void;
    confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  }) => SettingsCatsRegistryActionsHookResult<TBotForm>;
  SettingsCatsRegistryComponent: ComponentType<SettingsCatsRegistryComponentProps<TBotForm>>;
}

export function SettingsCats<TBotForm>({
  payload,
  feedback,
  busy,
  onPayloadUpdate,
  onFeedback,
  onBusy,
  useSettingsCatsRegistryActionsHook,
  SettingsCatsRegistryComponent,
}: SharedSettingsCatsProps<TBotForm>) {
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();

  const toastFeedback = useCallback((message: string) => {
    onFeedback(message);
    if (message) {
      showToast(message);
    }
  }, [onFeedback, showToast]);

  const {
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
    onArchiveCat,
    onUnarchiveCat,
    onRenameCat,
    onSkillChange,
    onUpdateProducts,
  } = useSettingsCatsRegistryActionsHook({
    expandedCatId,
    setExpandedCatId,
    onBusy,
    onFeedback: toastFeedback,
    onPayloadUpdate,
    confirm,
  });
  const {
    botBindings,
    telegramStatus,
    telegramDiagnostics,
    telegramLoading,
    telegramError,
    refreshTelegramDiagnostics,
  } = useSettingsCatsTelegram(payload);
  const memoryController = useSettingsCatsMemory({
    expandedCatId,
    onBusy,
    onFeedback: toastFeedback,
  });
  const enabledSurfaces = payload.chat.capabilities.availableSurfaces;
  const configurableSurfaces = [...ALL_PLATFORM_SURFACES];

  return (
    <>
      <div className="catsLayout">
        <section className="contentCard">
          <SettingsCatsRegistryComponent
            botBindings={botBindings}
            busy={busy}
            expandedCatId={expandedCatId}
            memoryController={memoryController}
            payload={payload}
            registryController={{
              botForm,
              renameValue,
              setBotForm,
              setRenameValue,
              onArchiveCat,
              onCreateBinding,
              onDeleteBinding,
              onDeleteCat,
              onMakeBossCat,
              onRenameCat,
              onSkillChange,
              onUnarchiveCat,
              onUpdateProducts,
            }}
            setExpandedCatId={setExpandedCatId}
            telegramDiagnostics={telegramDiagnostics}
            availableSurfaces={configurableSurfaces}
            enabledSurfaces={enabledSurfaces}
            onPayloadUpdate={onPayloadUpdate}
            confirm={confirm}
          />
        </section>

        <SettingsCatsCreateForm
          busy={busy}
          catForm={catForm}
          onCatFormChange={setCatForm}
          onCreateCat={onCreateCat}
          atCatLimit={payload.chat.cats.filter((cat) => cat.status === 'active').length >= payload.chat.capabilities.maxCats}
          availableSurfaces={configurableSurfaces}
          enabledSurfaces={enabledSurfaces}
        />

        <section className="contentCard">
          <SettingsCatsTransportPanel
            telegramDiagnostics={telegramDiagnostics}
            telegramError={telegramError}
            telegramLoading={telegramLoading}
            telegramStatus={telegramStatus}
            onRefresh={() => void refreshTelegramDiagnostics()}
          />
        </section>
      </div>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </>
  );
}

export interface WorkspaceSettingsCatsProps extends Omit<
  SharedSettingsCatsProps<BotFormState>,
  'useSettingsCatsRegistryActionsHook' | 'SettingsCatsRegistryComponent'
> {}

export function WorkspaceSettingsCats(props: WorkspaceSettingsCatsProps) {
  return (
    <SettingsCats
      {...props}
      useSettingsCatsRegistryActionsHook={useSettingsCatsRegistryActions}
      SettingsCatsRegistryComponent={SettingsCatsRegistry}
    />
  );
}
