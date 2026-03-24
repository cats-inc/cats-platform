import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../../api/contracts';
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
  } = useSettingsCatsRegistryActions({
    expandedCatId,
    setExpandedCatId,
    onBusy,
    onFeedback,
    onPayloadUpdate,
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
    onFeedback,
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
          {feedback ? <p className="feedbackText">{feedback}</p> : null}
        </div>

        <div className="catsLayout">
          <section className="contentCard">
            <SettingsCatsTransportPanel
              telegramDiagnostics={telegramDiagnostics}
              telegramError={telegramError}
              telegramLoading={telegramLoading}
              telegramStatus={telegramStatus}
              onRefresh={() => void refreshTelegramDiagnostics()}
            />

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
              }}
              setExpandedCatId={setExpandedCatId}
              telegramDiagnostics={telegramDiagnostics}
            />
          </section>

          <SettingsCatsCreateForm
            busy={busy}
            catForm={catForm}
            onCatFormChange={setCatForm}
            onCreateCat={onCreateCat}
          />
        </div>
      </div>
    </div>
  );
}
