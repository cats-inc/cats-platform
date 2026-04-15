import { useState } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import { AvatarCropDialog } from '../../../../../design/components/AvatarCropDialog.js';
import { updateCatProfile } from '../../api/index.js';
import type { SettingsCatsMemoryController } from '../../hooks/useSettingsCatsMemory.js';
import { catInitials } from '../../workspaceChatUtils.js';
import {
  SettingsCatsDetailPanelContent,
  type SettingsCatsDetailPanelRegistryController,
} from './SettingsCatsDetailPanelContent.js';

export interface SettingsCatsDetailPanelProps {
  busy: WorkspaceBusyState;
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  cat: AppShellPayload['chat']['cats'][number];
  isBossCat: boolean;
  memoryController: SettingsCatsMemoryController;
  registryController: SettingsCatsDetailPanelRegistryController;
  telegramDiagnostics: Parameters<typeof SettingsCatsDetailPanelContent>[0]['telegramDiagnostics'];
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  onPayloadUpdate?: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export function SettingsCatsDetailPanel({
  busy,
  botBindings,
  cat,
  isBossCat,
  memoryController,
  registryController,
  telegramDiagnostics,
  availableSurfaces,
  enabledSurfaces,
  onPayloadUpdate,
  confirm: confirmDialog,
}: SettingsCatsDetailPanelProps) {
  const [cropOpen, setCropOpen] = useState(false);

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
        <p className="sectionLabel">Avatar</p>
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
              {cat.avatarUrl ? 'Change avatar' : 'Upload avatar'}
            </button>
            {cat.avatarUrl ? (
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void handleCatAvatarRemove()}
              >
                Remove avatar
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
      <SettingsCatsDetailPanelContent
        busy={busy}
        botBindings={botBindings}
        cat={cat}
        isBossCat={isBossCat}
        memoryController={memoryController}
        registryController={registryController}
        telegramDiagnostics={telegramDiagnostics}
        availableSurfaces={availableSurfaces}
        enabledSurfaces={enabledSurfaces}
        confirm={confirmDialog}
      />
    </div>
  );
}
