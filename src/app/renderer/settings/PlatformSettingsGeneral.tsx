import { useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { AvatarCropDialog } from '../../../design/components/AvatarCropDialog.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { GuideCatSidecarMode } from '../../../shared/platform-contract.js';
import {
  readLegacyGuideCatUiPrefsInput,
  useGuideCatUiPrefs,
} from '../guideCatUiPrefsStore.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
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
  const [savingLobbyPrefs, setSavingLobbyPrefs] = useState(false);
  const guideCatUiPrefs = useGuideCatUiPrefs({
    legacy: readLegacyGuideCatUiPrefsInput(payload),
  });

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
      dispatchPlatformEnvelopeRefresh();
      onFeedback('');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : errorMessage);
    }
  }

  async function updateLobbyAnimationMode(
    nextAnimationMode: AppShellPayload['lobby']['animationMode'],
    errorMessage: string,
  ): Promise<void> {
    const previousLobbyPrefs = payload.lobby;
    onPayloadUpdate({
      ...payload,
      lobby: {
        ...payload.lobby,
        animationMode: nextAnimationMode,
      },
    });
    setSavingLobbyPrefs(true);
    try {
      const response = await fetch('/api/platform/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lobbyAnimationMode: nextAnimationMode }),
      });
      if (!response.ok) {
        throw new Error(errorMessage);
      }
      const body = await response.json() as { lobbyAnimationMode?: AppShellPayload['lobby']['animationMode'] };
      onPayloadUpdate({
        ...payload,
        lobby: {
          ...payload.lobby,
          animationMode: body.lobbyAnimationMode ?? nextAnimationMode,
        },
      });
      dispatchPlatformEnvelopeRefresh();
      onFeedback('');
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        lobby: previousLobbyPrefs,
      });
      onFeedback(error instanceof Error ? error.message : errorMessage);
    } finally {
      setSavingLobbyPrefs(false);
    }
  }

  async function updateGuideCatSidecarMode(
    nextMode: GuideCatSidecarMode,
  ): Promise<void> {
    try {
      guideCatUiPrefs.update({ sidecarMode: nextMode });
      onFeedback('');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to update guide cat mode');
    }
  }

  const avatarUrl = payload.ownerAvatarUrl;
  const initials = nameInitials(payload.ownerDisplayName);
  const lobbyPrefs = payload.lobby ?? {
    animationMode: 'reduced',
  };

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

        <div className="contentCard">
          <h2>Lobby motion</h2>
          <p className="heroNote">
            Choose how lively the Lobby background should feel. Reduced is the default.
          </p>
          <label className="settingsCheckboxRow">
            <input
              type="radio"
              name="lobby-animation-mode"
              checked={lobbyPrefs.animationMode === 'off'}
              disabled={savingLobbyPrefs}
              onChange={() => {
                void updateLobbyAnimationMode('off', 'Failed to update Lobby motion');
              }}
            />
            <span className="settingsCheckboxMeta">
              <span className="settingsCheckboxLabel">Off</span>
              <span className="heroNote">
                Keep the Lobby still and remove the bouncing cats background.
              </span>
            </span>
          </label>
          <label className="settingsCheckboxRow">
            <input
              type="radio"
              name="lobby-animation-mode"
              checked={lobbyPrefs.animationMode === 'reduced'}
              disabled={savingLobbyPrefs}
              onChange={() => {
                void updateLobbyAnimationMode('reduced', 'Failed to update Lobby motion');
              }}
            />
            <span className="settingsCheckboxMeta">
              <span className="settingsCheckboxLabel">Reduced</span>
              <span className="heroNote">
                Keep the background alive, but soft and slow.
              </span>
            </span>
          </label>
          <label className="settingsCheckboxRow">
            <input
              type="radio"
              name="lobby-animation-mode"
              checked={lobbyPrefs.animationMode === 'full'}
              disabled={savingLobbyPrefs}
              onChange={() => {
                void updateLobbyAnimationMode('full', 'Failed to update Lobby motion');
              }}
            />
            <span className="settingsCheckboxMeta">
              <span className="settingsCheckboxLabel">Full</span>
              <span className="heroNote">
                Let the cats bounce at full speed in the Lobby background.
              </span>
            </span>
          </label>
        </div>

        {payload.guideCat ? (
          <div className="contentCard">
            <h2>Guide Cat assist</h2>
            {payload.guideCat.status === 'dismissed' ? (
              <>
                <p className="heroNote">
                  {payload.guideCat.name} is currently dismissed. Restore to show the floating guide cat assistant again.
                </p>
                <div className="setupActionGroup">
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={() => {
                      void fetch('/api/platform/guide-cat', {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ status: 'active' }),
                      }).then((r) => {
                        if (r.ok) dispatchPlatformEnvelopeRefresh();
                      });
                    }}
                  >
                    Restore {payload.guideCat.name}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="heroNote">
                  Choose how {payload.guideCat.name} appears when you click the floating avatar.
                </p>
                <label className="settingsCheckboxRow">
                  <input
                    type="radio"
                    name="guide-cat-sidecar-mode"
                    checked={guideCatUiPrefs.prefs.sidecarMode === 'auto'}
                    onChange={() => {
                      void updateGuideCatSidecarMode('auto');
                    }}
                  />
                  <span className="settingsCheckboxMeta">
                    <span className="settingsCheckboxLabel">Auto</span>
                    <span className="heroNote">
                      First time shows a speech bubble, then switches to a full side panel.
                    </span>
                  </span>
                </label>
                <label className="settingsCheckboxRow">
                  <input
                    type="radio"
                    name="guide-cat-sidecar-mode"
                    checked={guideCatUiPrefs.prefs.sidecarMode === 'drawer'}
                    onChange={() => {
                      void updateGuideCatSidecarMode('drawer');
                    }}
                  />
                  <span className="settingsCheckboxMeta">
                    <span className="settingsCheckboxLabel">Side panel</span>
                    <span className="heroNote">
                      Always open a full side panel when you click the guide cat avatar.
                    </span>
                  </span>
                </label>
                <label className="settingsCheckboxRow">
                  <input
                    type="radio"
                    name="guide-cat-sidecar-mode"
                    checked={guideCatUiPrefs.prefs.sidecarMode === 'bubble'}
                    onChange={() => {
                      void updateGuideCatSidecarMode('bubble');
                    }}
                  />
                  <span className="settingsCheckboxMeta">
                    <span className="settingsCheckboxLabel">Speech bubble</span>
                    <span className="heroNote">
                      Always show a compact speech bubble with quick actions.
                    </span>
                  </span>
                </label>
              </>
            )}
          </div>
        ) : null}

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
