import { useState } from 'react';

import type { AppShellPayload } from '../../../products/chat/api/contracts.js';
import { AvatarCropDialog } from '../../../design/components/AvatarCropDialog.js';
import { nameInitials } from '../../../shared/nameInitials.js';
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
  const [savingDesktopPrefs, setSavingDesktopPrefs] = useState(false);
  const [savingLobbyPrefs, setSavingLobbyPrefs] = useState(false);
  const [savingSidecarMode, setSavingSidecarMode] = useState(false);

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

  async function updateDesktopPreferences(
    nextDesktopPrefs: AppShellPayload['desktop'],
    errorMessage: string,
  ): Promise<void> {
    const previousDesktopPrefs = payload.desktop;
    onPayloadUpdate({
      ...payload,
      desktop: nextDesktopPrefs,
    });
    setSavingDesktopPrefs(true);
    try {
      const desktopHost = (
        window as Window & {
          catsDesktopHost?: {
            updateDesktopPreferences?: (
              prefs: AppShellPayload['desktop'],
            ) => Promise<AppShellPayload['desktop']>;
          };
        }
      ).catsDesktopHost;

      let persistedPrefs = nextDesktopPrefs;
      if (desktopHost?.updateDesktopPreferences) {
        persistedPrefs = await desktopHost.updateDesktopPreferences(nextDesktopPrefs);
      } else {
        const response = await fetch('/api/platform/preferences', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nextDesktopPrefs),
        });
        if (!response.ok) {
          throw new Error(errorMessage);
        }
        const body = await response.json() as Partial<AppShellPayload['desktop']>;
        persistedPrefs = {
          startAtLogin: body.startAtLogin !== false,
          openWindowOnStartup: body.openWindowOnStartup === true,
        };
      }

      onPayloadUpdate({
        ...payload,
        desktop: persistedPrefs,
      });
      dispatchPlatformEnvelopeRefresh();
      onFeedback('');
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        desktop: previousDesktopPrefs,
      });
      onFeedback(error instanceof Error ? error.message : errorMessage);
    } finally {
      setSavingDesktopPrefs(false);
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
    nextMode: 'auto' | 'drawer' | 'bubble',
    errorMessage: string,
  ): Promise<void> {
    const previousMode = payload.guideCatSidecarMode ?? 'auto';
    onPayloadUpdate({
      ...payload,
      guideCatSidecarMode: nextMode,
    });
    setSavingSidecarMode(true);
    try {
      const response = await fetch('/api/platform/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guideCatSidecarMode: nextMode }),
      });
      if (!response.ok) {
        throw new Error(errorMessage);
      }
      dispatchPlatformEnvelopeRefresh();
      onFeedback('');
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        guideCatSidecarMode: previousMode,
      });
      onFeedback(error instanceof Error ? error.message : errorMessage);
    } finally {
      setSavingSidecarMode(false);
    }
  }

  const avatarUrl = payload.ownerAvatarUrl;
  const initials = nameInitials(payload.ownerDisplayName);
  const desktopPrefs = payload.desktop ?? {
    startAtLogin: true,
    openWindowOnStartup: false,
  };
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
            <p className="heroNote">
              Choose how {payload.guideCat.name} appears when you click the floating avatar.
            </p>
            <label className="settingsCheckboxRow">
              <input
                type="radio"
                name="guide-cat-sidecar-mode"
                checked={(payload.guideCatSidecarMode ?? 'auto') === 'auto'}
                disabled={savingSidecarMode}
                onChange={() => {
                  void updateGuideCatSidecarMode('auto', 'Failed to update guide cat mode');
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
                checked={(payload.guideCatSidecarMode ?? 'auto') === 'drawer'}
                disabled={savingSidecarMode}
                onChange={() => {
                  void updateGuideCatSidecarMode('drawer', 'Failed to update guide cat mode');
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
                checked={(payload.guideCatSidecarMode ?? 'auto') === 'bubble'}
                disabled={savingSidecarMode}
                onChange={() => {
                  void updateGuideCatSidecarMode('bubble', 'Failed to update guide cat mode');
                }}
              />
              <span className="settingsCheckboxMeta">
                <span className="settingsCheckboxLabel">Speech bubble</span>
                <span className="heroNote">
                  Always show a compact speech bubble with quick actions.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        <div className="contentCard">
          <h2>Desktop startup</h2>
          <p className="heroNote">
            Control whether Cats Desktop launches in the background when your computer
            signs you in, and whether it opens the main window automatically.
          </p>
          <label className="settingsCheckboxRow">
            <input
              type="checkbox"
              checked={desktopPrefs.startAtLogin}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences(
                  {
                    ...desktopPrefs,
                    startAtLogin: !desktopPrefs.startAtLogin,
                  },
                  'Failed to update desktop startup preference',
                );
              }}
            />
            <span className="settingsCheckboxMeta">
              <span className="settingsCheckboxLabel">
                Start Cats Desktop when you sign in to your computer
              </span>
              <span className="heroNote">
                Keep Cats Desktop running in the tray/background after you log in.
              </span>
            </span>
          </label>
          <label className="settingsCheckboxRow">
            <input
              type="checkbox"
              checked={desktopPrefs.openWindowOnStartup}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences(
                  {
                    ...desktopPrefs,
                    openWindowOnStartup: !desktopPrefs.openWindowOnStartup,
                  },
                  'Failed to update startup window preference',
                );
              }}
            />
            <span className="settingsCheckboxMeta">
              <span className="settingsCheckboxLabel">
                Open Cats when Cats Desktop starts
              </span>
              <span className="heroNote">
                When disabled, a sign-in launch keeps Cats in the tray until you open it.
              </span>
            </span>
          </label>
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
