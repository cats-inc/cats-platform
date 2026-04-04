import { useState } from 'react';

import type { AppShellPayload } from '../../../products/chat/api/contracts.js';
import { AvatarCropDialog } from '../../../design/components/AvatarCropDialog.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

export interface PlatformSettingsGeneralProps {
  payload: AppShellPayload;
  feedback: string;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
}

export function PlatformSettingsGeneral({
  payload,
  feedback,
  onPayloadUpdate,
  onFeedback,
}: PlatformSettingsGeneralProps) {
  const [cropOpen, setCropOpen] = useState(false);

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
      if (!response.ok) {
        throw new Error(errorMessage);
      }
      onPayloadUpdate({
        ...payload,
        ownerAvatarUrl: nextAvatarUrl,
      });
      onFeedback('');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : errorMessage);
    }
  }

  const avatarUrl = payload.ownerAvatarUrl;
  const initials = nameInitials(payload.ownerDisplayName);

  return (
    <>
      <PlatformSettingsShell
        section="general"
        title="General"
        products={payload.products}
      >
        <div className="contentCard">
          <div className="settingsProfileRow">
            <div
              className="settingsOwnerAvatar"
              style={avatarUrl
                ? {
                    backgroundImage: `url(${avatarUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined}
              onClick={() => setCropOpen(true)}
              role="button"
              tabIndex={0}
              data-tooltip="Change avatar"
            >
              {!avatarUrl ? initials : null}
            </div>
            <div className="settingsProfileMeta">
              <p className="settingsProfileName">{payload.ownerDisplayName}</p>
              <p className="heroNote settingsProfileNote">
                This is your platform-wide profile across Lobby, Chat, Work, and Code.
              </p>
            </div>
          </div>
          <div className="settingsActionRow">
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
                onClick={() => void updateOwnerAvatar(null, 'Failed to remove avatar')}
              >
                Remove avatar
              </button>
            ) : null}
          </div>
        </div>

        {feedback ? <p className="feedbackText">{feedback}</p> : null}
      </PlatformSettingsShell>
      {cropOpen ? (
        <AvatarCropDialog
          onSave={(dataUrl) => {
            setCropOpen(false);
            void updateOwnerAvatar(dataUrl, 'Failed to save avatar');
          }}
          onClose={() => setCropOpen(false)}
        />
      ) : null}
    </>
  );
}
