import { startTransition, useState } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { AvatarCropDialog } from '../../../../design/components/AvatarCropDialog.js';
import { nameInitials } from '../../../../shared/nameInitials.js';
import { updateVerbosePreference } from '../api/index.js';
import { SettingsShell } from './SettingsShell.js';

export interface SettingsGeneralProps {
  payload: AppShellPayload;
  feedback: string;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
}

export function SettingsGeneral({
  payload,
  feedback,
  onPayloadUpdate,
  onFeedback,
}: SettingsGeneralProps) {
  const [cropOpen, setCropOpen] = useState(false);
  void feedback;

  async function updateOwnerAvatar(
    nextAvatarUrl: string | null,
    errorMessage: string,
  ): Promise<void> {
    try {
      const response = await fetch('/api/core/owner-profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatarUrl: nextAvatarUrl }),
      });
      if (!response.ok) throw new Error(errorMessage);
      onPayloadUpdate({ ...payload, ownerAvatarUrl: nextAvatarUrl });
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : errorMessage);
    }
  }

  async function handleAvatarSave(dataUrl: string): Promise<void> {
    setCropOpen(false);
    await updateOwnerAvatar(dataUrl, 'Failed to save avatar');
  }

  async function handleAvatarRemove(): Promise<void> {
    await updateOwnerAvatar(null, 'Failed to remove avatar');
  }

  const avatarUrl = payload.ownerAvatarUrl;
  const initials = nameInitials(payload.ownerDisplayName);

  return (
    <>
      <SettingsShell section="general" title="General">
        <div className="contentCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div
              className="settingsOwnerAvatar"
              style={avatarUrl
                ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : undefined}
              onClick={() => setCropOpen(true)}
              role="button"
              tabIndex={0}
              data-tooltip="Change avatar"
            >
              {!avatarUrl ? initials : null}
            </div>
            <p style={{ margin: 0, fontWeight: 600 }}>{payload.ownerDisplayName}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primaryButton"
                onClick={() => setCropOpen(true)}
              >
                {avatarUrl ? 'Change avatar' : 'Upload avatar'}
              </button>
              {avatarUrl ? (
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => void handleAvatarRemove()}
                >
                  Remove avatar
                </button>
              ) : null}
            </div>
          </div>
          <label className="fieldLabel">
            <span>Display name</span>
            <input className="textInput" value={payload.ownerDisplayName} readOnly />
          </label>
          <div style={{ marginTop: 16 }}>
            <p className="sectionLabel">Runtime</p>
            <span className={payload.runtime.reachable ? 'statusChip statusChipReady' : 'statusChip statusChipWarm'}>
              {payload.runtime.reachable ? 'Cats Runtime connected' : 'Cats Runtime not detected'}
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <p className="sectionLabel">Chat</p>
            <button
              type="button"
              className="toggleRow"
              onClick={async () => {
                const show = !payload.chat.showVerboseMessages;
                onPayloadUpdate({
                  ...payload,
                  chat: { ...payload.chat, showVerboseMessages: show },
                });
                try {
                  const next = await updateVerbosePreference(show);
                  startTransition(() => onPayloadUpdate(next));
                } catch (error) {
                  onPayloadUpdate({
                    ...payload,
                    chat: { ...payload.chat, showVerboseMessages: !show },
                  });
                  onFeedback(error instanceof Error ? error.message : 'Failed to update preference');
                }
              }}
            >
              <span className={payload.chat.showVerboseMessages ? 'toggleDot toggleDotOn' : 'toggleDot'} />
              <span>Show verbose messages</span>
            </button>
          </div>
        </div>
      </SettingsShell>
      {cropOpen ? (
        <AvatarCropDialog
          onSave={(dataUrl) => void handleAvatarSave(dataUrl)}
          onClose={() => setCropOpen(false)}
        />
      ) : null}
    </>
  );
}
