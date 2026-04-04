import { useCallback, useState } from 'react';

import type { AppShellPayload } from '../../../api/contracts';
import { ConfirmDialog, useConfirmDialog } from '../../../../../design/components/ConfirmDialog';
import { ToastContainer, useToast } from '../../../../../design/components/Toast';
import { ALL_PLATFORM_SURFACES } from '../../../../../shared/platformSurfaces';
import { useSettingsCatsRegistryActions } from '../../hooks/useSettingsCatsRegistryActions';
import { useSettingsCatsMemory } from '../../hooks/useSettingsCatsMemory';
import { useSettingsCatsTelegram } from '../../hooks/useSettingsCatsTelegram';
import { SettingsCatsCreateForm } from './SettingsCatsCreateForm';
import { SettingsCatsRegistry } from './SettingsCatsRegistry';
import { SettingsCatsTransportPanel } from './SettingsCatsTransportPanel';

export interface SettingsCatsProps {
  payload: AppShellPayload;
  feedback: string;
  busy: string;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
  onBusy: (key: string) => void;
}

export function SettingsCats({
  payload,
  feedback,
  busy,
  onPayloadUpdate,
  onFeedback,
  onBusy,
}: SettingsCatsProps) {
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();

  const toastFeedback = useCallback((message: string) => {
    onFeedback(message);
    if (message) showToast(message);
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
  } = useSettingsCatsRegistryActions({
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
          <SettingsCatsRegistry
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
          atCatLimit={payload.chat.cats.filter((c) => c.status === 'active').length >= payload.chat.capabilities.maxCats}
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
