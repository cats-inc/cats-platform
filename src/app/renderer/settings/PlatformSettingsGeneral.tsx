import { useEffect, useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { AvatarCropDialog } from '../../../design/components/AvatarCropDialog.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { GuideCatSidecarMode } from '../../../shared/platform-contract.js';
import { useGuideCatUiPrefs } from '../guideCatUiPrefsStore.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';
import {
  isGuideCatEnabledStatus,
  resolveClientGuideCatName,
} from '../../../shared/guideCatIdentity.js';
import { useNavigate } from 'react-router-dom';

export interface PlatformSettingsGeneralProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

export function PlatformSettingsGeneral({
  payload,
  onPayloadUpdate,
}: PlatformSettingsGeneralProps) {
  const navigate = useNavigate();
  const [cropOpen, setCropOpen] = useState(false);
  const [savingLobbyPrefs, setSavingLobbyPrefs] = useState(false);
  const [nameDraft, setNameDraft] = useState(payload.ownerDisplayName);
  const [savingName, setSavingName] = useState(false);
  const guideCatUiPrefs = useGuideCatUiPrefs();
  const { toasts, showToast } = useToast();

  useEffect(() => {
    setNameDraft(payload.ownerDisplayName);
  }, [payload.ownerDisplayName]);

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
    } catch (error) {
      showToast(error instanceof Error ? error.message : errorMessage);
    }
  }

  async function commitOwnerDisplayName(): Promise<void> {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      // Empty value is not a valid name; revert silently to the canonical value.
      setNameDraft(payload.ownerDisplayName);
      return;
    }
    if (trimmed === payload.ownerDisplayName) return;
    setSavingName(true);
    try {
      const response = await fetch('/api/core/owner-profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      });
      if (!response.ok) {
        throw new Error('Failed to update name');
      }
      onPayloadUpdate({
        ...payload,
        ownerDisplayName: trimmed,
      });
      dispatchPlatformEnvelopeRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update name');
    } finally {
      setSavingName(false);
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
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        lobby: previousLobbyPrefs,
      });
      showToast(error instanceof Error ? error.message : errorMessage);
    } finally {
      setSavingLobbyPrefs(false);
    }
  }

  async function updateGuideCatSidecarMode(
    nextMode: GuideCatSidecarMode,
  ): Promise<void> {
    try {
      guideCatUiPrefs.update({ sidecarMode: nextMode });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update guide cat mode');
    }
  }

  const avatarUrl = payload.ownerAvatarUrl;
  const initials = nameInitials(nameDraft || payload.ownerDisplayName);
  const guideCatName = resolveClientGuideCatName();
  const guideCatEnabled = isGuideCatEnabledStatus(payload.guideCat?.status);
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
        <SettingsSection
          header={
            <SettingsSectionHeader
              title="Profile"
              description="This is your platform-wide profile across Chat, Code, Work, and Lobby."
            />
          }
        >
          <div className="settings-sub-card">
            <div className="fieldLabel">
              <span>Avatar</span>
              <div className="settingsOwnerAvatarDock">
                <button
                  type="button"
                  className="settingsOwnerAvatar"
                  style={avatarUrl
                    ? {
                        backgroundImage: `url(${avatarUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        color: 'transparent',
                      }
                    : undefined}
                  onClick={() => setCropOpen(true)}
                  aria-label={avatarUrl ? 'Change avatar' : 'Upload avatar'}
                  data-tooltip={avatarUrl ? 'Change avatar' : 'Upload avatar'}
                >
                  {avatarUrl ? '' : initials}
                </button>
                <span className="settingsOwnerAvatarCamera" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                {avatarUrl ? (
                  <button
                    type="button"
                    className="settingsOwnerAvatarRemove"
                    onClick={(event) => {
                      event.stopPropagation();
                      void updateOwnerAvatar(null, 'Failed to remove avatar');
                    }}
                    aria-label="Remove avatar"
                    data-tooltip="Remove avatar"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
            <label className="fieldLabel">
              <span>Name</span>
              <input
                className="textInput"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void commitOwnerDisplayName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void commitOwnerDisplayName();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setNameDraft(payload.ownerDisplayName);
                    event.currentTarget.blur();
                  }
                }}
                disabled={savingName}
                aria-busy={savingName}
              />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          header={
            <SettingsSectionHeader
              title="Lobby motion"
              description="Choose how lively the Lobby background should feel. Reduced is the default."
            />
          }
        >
          <SettingsOptionRow
            asChoice
            label="Off"
            description="Keep the Lobby still and remove the bouncing cats background."
            control={
              <input
                type="radio"
                name="lobby-animation-mode"
                checked={lobbyPrefs.animationMode === 'off'}
                disabled={savingLobbyPrefs}
                onChange={() => {
                  void updateLobbyAnimationMode('off', 'Failed to update Lobby motion');
                }}
              />
            }
          />
          <SettingsOptionRow
            asChoice
            label="Reduced"
            description="Keep the background alive, but soft and slow."
            control={
              <input
                type="radio"
                name="lobby-animation-mode"
                checked={lobbyPrefs.animationMode === 'reduced'}
                disabled={savingLobbyPrefs}
                onChange={() => {
                  void updateLobbyAnimationMode('reduced', 'Failed to update Lobby motion');
                }}
              />
            }
          />
          <SettingsOptionRow
            asChoice
            label="Full"
            description="Let the cats bounce at full speed in the Lobby background."
            control={
              <input
                type="radio"
                name="lobby-animation-mode"
                checked={lobbyPrefs.animationMode === 'full'}
                disabled={savingLobbyPrefs}
                onChange={() => {
                  void updateLobbyAnimationMode('full', 'Failed to update Lobby motion');
                }}
              />
            }
          />
        </SettingsSection>

        {payload.guideCat ? (
          <SettingsSection
            header={
              <SettingsSectionHeader
                title="Guide Cat assist"
                description={
                  !guideCatEnabled
                    ? `${guideCatName} is disabled. Enable it again from Settings > Assistants when you want ${guideCatName} help back.`
                    : `Choose how ${guideCatName} appears when you click the floating avatar.`
                }
              />
            }
          >
            {!guideCatEnabled ? (
              <div className="setupActionGroup">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => navigate('/settings/cats/assistants')}
                >
                  Open Assistants
                </button>
              </div>
            ) : (
              <>
                <SettingsOptionRow
                  asChoice
                  label="Auto"
                  description="First time shows a speech bubble, then switches to a full side panel."
                  control={
                    <input
                      type="radio"
                      name="guide-cat-sidecar-mode"
                      checked={guideCatUiPrefs.prefs.sidecarMode === 'auto'}
                      onChange={() => {
                        void updateGuideCatSidecarMode('auto');
                      }}
                    />
                  }
                />
                <SettingsOptionRow
                  asChoice
                  label="Side panel"
                  description="Always open a full side panel when you click the guide cat avatar."
                  control={
                    <input
                      type="radio"
                      name="guide-cat-sidecar-mode"
                      checked={guideCatUiPrefs.prefs.sidecarMode === 'drawer'}
                      onChange={() => {
                        void updateGuideCatSidecarMode('drawer');
                      }}
                    />
                  }
                />
                <SettingsOptionRow
                  asChoice
                  label="Speech bubble"
                  description="Always show a compact speech bubble with quick actions."
                  control={
                    <input
                      type="radio"
                      name="guide-cat-sidecar-mode"
                      checked={guideCatUiPrefs.prefs.sidecarMode === 'bubble'}
                      onChange={() => {
                        void updateGuideCatSidecarMode('bubble');
                      }}
                    />
                  }
                />
              </>
            )}
          </SettingsSection>
        ) : null}

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
      <ToastContainer toasts={toasts} />
    </>
  );
}
