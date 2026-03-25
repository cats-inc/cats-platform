import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../../api/contracts';
import { ConfirmDialog, useConfirmDialog } from '../../../../../design/components/ConfirmDialog';
import { ToastContainer, useToast } from '../../../../../design/components/Toast';
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
  const navigate = useNavigate();
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

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/general')}>
          General
        </button>
        <button
          className="settingsTab settingsTabActive"
          type="button"
          onClick={() => navigate('/settings/cats')}
        >
          Cats
        </button>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/data')}>
          Data
        </button>
      </nav>
      <div className="settingsContent">
        <div className="viewIntro">
          <h1>Cats</h1>
          <p className="heroNote">
            Manage your cats, assign skills, bind Telegram bots, and view memory.
          </p>
        </div>

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
                onCreateBinding,
                onDeleteBinding,
                onDeleteCat,
                onMakeBossCat,
                onRenameCat,
                onSkillChange,
                onUpdateProducts,
              }}
              setExpandedCatId={setExpandedCatId}
              telegramDiagnostics={telegramDiagnostics}
              availableSurfaces={payload.chat.capabilities.availableSurfaces}
              confirm={confirm}
            />
          </section>

          <SettingsCatsCreateForm
            busy={busy}
            catForm={catForm}
            onCatFormChange={setCatForm}
            onCreateCat={onCreateCat}
            atCatLimit={payload.chat.cats.filter((c) => c.status === 'active').length >= payload.chat.capabilities.maxCats}
            availableSurfaces={payload.chat.capabilities.availableSurfaces}
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
      </div>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </div>
  );
}
