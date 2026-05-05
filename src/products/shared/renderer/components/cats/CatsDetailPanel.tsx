import { useState } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import { AvatarCropDialog } from '../../../../../design/components/AvatarCropDialog.js';
import { updateCatProfile } from '../../api/index.js';
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { SettingsCatsMemoryController } from '../../hooks/useSettingsCatsMemory.js';
import { catInitials } from '../../workspaceChatUtils.js';
import {
  CatsDetailPanelContent,
  type CatsDetailPanelRegistryController,
} from './CatsDetailPanelContent.js';

export interface CatsDetailPanelProps {
  busy: WorkspaceBusyState;
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  cat: AppShellPayload['chat']['cats'][number];
  isBossCat: boolean;
  memoryController: SettingsCatsMemoryController;
  registryController: CatsDetailPanelRegistryController;
  telegramDiagnostics: Parameters<typeof CatsDetailPanelContent>[0]['telegramDiagnostics'];
  onPayloadUpdate?: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export function CatsDetailPanel({
  busy,
  botBindings,
  cat,
  isBossCat,
  memoryController,
  registryController,
  telegramDiagnostics,
  onPayloadUpdate,
  confirm: confirmDialog,
}: CatsDetailPanelProps) {
  const [cropOpen, setCropOpen] = useState(false);
  const { t } = useI18n();

  async function handleCatAvatarSave(dataUrl: string): Promise<void> {
    setCropOpen(false);
    try {
      const next = await updateCatProfile(cat.id, { avatarUrl: dataUrl });
      onPayloadUpdate?.(next);
    } catch {
      // silent
    }
  }

  async function handleCatAvatarRemove(): Promise<void> {
    try {
      const next = await updateCatProfile(cat.id, { avatarUrl: null });
      onPayloadUpdate?.(next);
    } catch {
      // silent
    }
  }

  return (
    <div className="catDetailPanel">
      <div className="catDetailSection">
        <p className="sectionLabel">{t(messageKeys.settingsGeneralAvatarLabel)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="catAvatar"
            style={{
              width: 40,
              height: 40,
              fontSize: '0.85rem',
              cursor: 'pointer',
              ...(cat.avatarUrl
                ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' }
                : cat.avatarColor ? { background: cat.avatarColor } : {}),
            }}
            onClick={() => setCropOpen(true)}
            role="button"
            tabIndex={0}
          >
            {cat.avatarUrl ? '' : catInitials(cat.name)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="primaryButton"
              onClick={() => setCropOpen(true)}
            >
              {cat.avatarUrl ? t(messageKeys.settingsGeneralAvatarChangeLabel) : t(messageKeys.settingsGeneralAvatarUploadLabel)}
            </button>
            {cat.avatarUrl ? (
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void handleCatAvatarRemove()}
              >
                {t(messageKeys.settingsGeneralAvatarRemoveLabel)}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {cropOpen ? (
        <AvatarCropDialog
          onSave={(dataUrl) => void handleCatAvatarSave(dataUrl)}
          onClose={() => setCropOpen(false)}
        />
      ) : null}
      <CatsDetailPanelContent
        busy={busy}
        botBindings={botBindings}
        cat={cat}
        isBossCat={isBossCat}
        memoryController={memoryController}
        registryController={registryController}
        telegramDiagnostics={telegramDiagnostics}
        confirm={confirmDialog}
      />
    </div>
  );
}
