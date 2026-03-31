import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { SuiteHostEnvelope } from '../../../shared/suite-contract.js';
import { AvatarCropDialog } from '../../../design/components/AvatarCropDialog.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import { SuiteSettingsShell } from './SuiteSettingsShell.js';

export interface SuiteSettingsGeneralProps {
  envelope: SuiteHostEnvelope;
  feedback: string;
  onEnvelopeUpdate: (updater: (current: SuiteHostEnvelope) => SuiteHostEnvelope) => void;
  onFeedback: (message: string) => void;
}

export function SuiteSettingsGeneral({
  envelope,
  feedback,
  onEnvelopeUpdate,
  onFeedback,
}: SuiteSettingsGeneralProps) {
  const navigate = useNavigate();
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
      onEnvelopeUpdate((current) => ({
        ...current,
        ownerAvatarUrl: nextAvatarUrl,
      }));
      onFeedback('');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : errorMessage);
    }
  }

  const avatarUrl = envelope.ownerAvatarUrl;
  const initials = nameInitials(envelope.ownerDisplayName);

  return (
    <>
      <SuiteSettingsShell
        section="general"
        title="General"
        products={envelope.products}
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
              <p className="settingsProfileName">{envelope.ownerDisplayName}</p>
              <p className="heroNote settingsProfileNote">
                This is your suite-wide profile across Lobby, Chat, Work, and Code.
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

        <div className="contentCard">
          <h2>Product settings</h2>
          <p className="heroNote">
            Chat-specific preferences now live beneath the Chat product route.
          </p>
          <div className="settingsActionRow">
            <button
              type="button"
              className="secondaryButton"
              onClick={() => navigate('/chat/settings/general')}
            >
              Open Chat settings
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => navigate('/chat/settings/cats')}
            >
              Manage Cats
            </button>
          </div>
        </div>

        {feedback ? <p className="feedbackText">{feedback}</p> : null}
      </SuiteSettingsShell>
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
