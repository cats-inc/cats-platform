import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { AvatarCropDialog } from '../../../design/components/AvatarCropDialog.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type {
  AssistantResponseLanguage,
  GuideCatSidecarMode,
  PlatformLanguagePreferences,
  PlatformUiLanguagePreference,
} from '../../../shared/platform-contract.js';
import {
  ASSISTANT_RESPONSE_LANGUAGE_CODES,
  isAssistantResponseLanguage,
} from '../../../shared/assistantResponseLanguage.js';
import { useGuideCatUiPrefs } from '../guideCatUiPrefsStore.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
import {
  isGuideCatEnabledStatus,
  resolveClientGuideCatName,
} from '../../../shared/guideCatIdentity.js';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.js';
import {
  fetchPlatformAuthStatus,
  logoutPlatformSession,
} from '../auth/api.js';
import { PLATFORM_AUTH_ERROR_CODES } from '../../../platform/auth/errorCodes.js';

export interface PlatformSettingsGeneralProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

function isPlatformUiLanguagePreference(value: unknown): value is PlatformUiLanguagePreference {
  return value === 'auto' || value === 'en' || value === 'zh-TW';
}

function resolveLanguagePreferences(
  language: AppShellPayload['language'] | undefined,
  fallbackUiLanguage: PlatformUiLanguagePreference,
): PlatformLanguagePreferences {
  return {
    assistantResponseLanguage: language?.assistantResponseLanguage ?? 'unspecified',
    uiLanguagePreference: language?.uiLanguagePreference ?? fallbackUiLanguage,
  };
}

function formatAssistantLanguageName(
  languageCode: Exclude<AssistantResponseLanguage, 'unspecified'>,
  locale: string,
): string {
  const displayCode = languageCode === 'zh-TW'
    ? 'zh-Hant'
    : languageCode === 'zh-CN'
      ? 'zh-Hans'
      : languageCode;
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(displayCode) ?? languageCode;
  } catch {
    return languageCode;
  }
}

export function PlatformSettingsGeneral({
  payload,
  onPayloadUpdate,
}: PlatformSettingsGeneralProps) {
  const navigate = useNavigate();
  const { languagePreference, locale, setLanguagePreference, t } = useI18n();
  const [cropOpen, setCropOpen] = useState(false);
  const [savingLobbyPrefs, setSavingLobbyPrefs] = useState(false);
  const [savingLanguagePreference, setSavingLanguagePreference] = useState(false);
  const [savingAssistantLanguage, setSavingAssistantLanguage] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [nameDraft, setNameDraft] = useState(payload.ownerDisplayName);
  const [savingName, setSavingName] = useState(false);
  // Escape sets this synchronously before calling blur(); commitOwnerDisplayName
  // reads it on the same tick and bails out, so the queued setNameDraft revert
  // is not raced by the blur-triggered commit reading the stale draft.
  const revertedNameDraftRef = useRef(false);
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
    if (revertedNameDraftRef.current) {
      // Escape just queued a revert; skip this commit so we do not race the
      // pending setNameDraft and accidentally save the pre-revert draft.
      revertedNameDraftRef.current = false;
      return;
    }
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      // Empty value is not a valid name; revert silently to the canonical value.
      setNameDraft(payload.ownerDisplayName);
      return;
    }
    if (trimmed === payload.ownerDisplayName) {
      // Whitespace-only edit (e.g. " Alice " against canonical "Alice"):
      // normalize the visible draft so the field does not look "saved" while
      // showing a value that disagrees with the server.
      setNameDraft(payload.ownerDisplayName);
      return;
    }
    setSavingName(true);
    try {
      const response = await fetch('/api/core/owner-profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      });
      if (!response.ok) {
        throw new Error(t('settingsGeneralUpdateNameError'));
      }
      onPayloadUpdate({
        ...payload,
        ownerDisplayName: trimmed,
      });
      dispatchPlatformEnvelopeRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('settingsGeneralUpdateNameError'));
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

  async function updateUiLanguagePreference(
    nextPreference: PlatformUiLanguagePreference,
  ): Promise<void> {
    if (nextPreference === languagePreference) {
      return;
    }

    const previousPreference = languagePreference;
    const previousLanguage = resolveLanguagePreferences(payload.language, previousPreference);

    setLanguagePreference(nextPreference);
    onPayloadUpdate({
      ...payload,
      language: {
        ...previousLanguage,
        uiLanguagePreference: nextPreference,
      },
    });
    setSavingLanguagePreference(true);

    try {
      const response = await fetch('/api/platform/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uiLanguagePreference: nextPreference }),
      });
      if (!response.ok) {
        throw new Error(t('settingsGeneralUpdateLanguageError'));
      }
      const body = await response.json() as {
        uiLanguagePreference?: unknown;
      };
      const persistedPreference = isPlatformUiLanguagePreference(body.uiLanguagePreference)
        ? body.uiLanguagePreference
        : nextPreference;
      setLanguagePreference(persistedPreference);
      onPayloadUpdate({
        ...payload,
        language: {
          ...previousLanguage,
          uiLanguagePreference: persistedPreference,
        },
      });
      dispatchPlatformEnvelopeRefresh();
    } catch (error) {
      setLanguagePreference(previousPreference);
      onPayloadUpdate({
        ...payload,
        language: previousLanguage,
      });
      showToast(
        error instanceof Error
          ? error.message
          : t('settingsGeneralUpdateLanguageError'),
      );
    } finally {
      setSavingLanguagePreference(false);
    }
  }

  async function updateAssistantResponseLanguage(
    nextLanguage: AssistantResponseLanguage,
  ): Promise<void> {
    const previousLanguage = resolveLanguagePreferences(payload.language, languagePreference);
    if (nextLanguage === previousLanguage.assistantResponseLanguage) {
      return;
    }

    onPayloadUpdate({
      ...payload,
      language: {
        ...previousLanguage,
        assistantResponseLanguage: nextLanguage,
      },
    });
    setSavingAssistantLanguage(true);

    try {
      const response = await fetch('/api/platform/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assistantResponseLanguage: nextLanguage }),
      });
      if (!response.ok) {
        throw new Error(t('settingsGeneralUpdateAssistantLanguageError'));
      }
      const body = await response.json() as {
        assistantResponseLanguage?: unknown;
      };
      const persistedLanguage = isAssistantResponseLanguage(body.assistantResponseLanguage)
        ? body.assistantResponseLanguage
        : nextLanguage;
      onPayloadUpdate({
        ...payload,
        language: {
          ...previousLanguage,
          assistantResponseLanguage: persistedLanguage,
        },
      });
      dispatchPlatformEnvelopeRefresh();
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        language: previousLanguage,
      });
      showToast(
        error instanceof Error
          ? error.message
          : t('settingsGeneralUpdateAssistantLanguageError'),
      );
    } finally {
      setSavingAssistantLanguage(false);
    }
  }

  async function updateGuideCatSidecarMode(
    nextMode: GuideCatSidecarMode,
  ): Promise<void> {
    try {
      guideCatUiPrefs.update({ sidecarMode: nextMode });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t('settingsGeneralUpdateGuideCatModeError'),
      );
    }
  }

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      const status = await fetchPlatformAuthStatus({
        fallbackMessageForStatus: (statusCode) =>
          t('settingsGeneralSignOutFailedWithStatus', { status: statusCode }),
      });
      if (!status.csrfToken) {
        navigate('/login', { replace: true });
        return;
      }
      await logoutPlatformSession(status.csrfToken, {
        fallbackMessageForStatus: (statusCode) =>
          t('settingsGeneralSignOutFailedWithStatus', { status: statusCode }),
        errorMessagesByCode: {
          [PLATFORM_AUTH_ERROR_CODES.csrfMismatch]: t('settingsGeneralSignOutCsrfError'),
          [PLATFORM_AUTH_ERROR_CODES.forbidden]: t('settingsGeneralSignOutForbiddenError'),
          [PLATFORM_AUTH_ERROR_CODES.unauthenticated]: t('settingsGeneralSignOutUnauthenticated'),
        },
      });
      navigate('/login', { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('settingsGeneralSignOutFailed'));
    } finally {
      setSigningOut(false);
    }
  }

  const avatarUrl = payload.ownerAvatarUrl;
  const initials = nameInitials(nameDraft || payload.ownerDisplayName);
  const guideCatName = resolveClientGuideCatName();
  const guideCatEnabled = isGuideCatEnabledStatus(payload.guideCat?.status);
  const lobbyPrefs = payload.lobby ?? {
    animationMode: 'reduced',
  };
  const assistantResponseLanguage = resolveLanguagePreferences(
    payload.language,
    languagePreference,
  ).assistantResponseLanguage;
  const assistantLanguageOptions = useMemo(
    () => ASSISTANT_RESPONSE_LANGUAGE_CODES.map((code) => ({
      code,
      label: formatAssistantLanguageName(code, locale),
    })),
    [locale],
  );

  return (
    <>
        <SettingsSection
          header={
            <SettingsSectionHeader
              title={t('settingsGeneralProfileTitle')}
              description={t('settingsGeneralProfileDescription')}
            />
          }
        >
          <div className="settings-sub-card">
            <div className="fieldLabel">
              <span>{t('settingsGeneralAvatarLabel')}</span>
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
                  aria-label={avatarUrl ? t('settingsGeneralAvatarChangeLabel') : t('settingsGeneralAvatarUploadLabel')}
                  data-tooltip={avatarUrl ? t('settingsGeneralAvatarChangeLabel') : t('settingsGeneralAvatarUploadLabel')}
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
                      void updateOwnerAvatar(null, t('settingsGeneralRemoveAvatarError'));
                    }}
                    aria-label={t('settingsGeneralAvatarRemoveLabel')}
                    data-tooltip={t('settingsGeneralAvatarRemoveLabel')}
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
              <span>{t('settingsGeneralNameLabel')}</span>
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
                    revertedNameDraftRef.current = true;
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
              title={t('settingsGeneralAccountTitle')}
              description={t('settingsGeneralAccountDescription')}
            />
          }
        >
          <div className="setupActionGroup">
            <button
              type="button"
              className="secondaryButton"
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              {signingOut
                ? t('settingsGeneralSigningOutButton')
                : t('settingsGeneralSignOutButton')}
            </button>
          </div>
        </SettingsSection>

        <SettingsSection
          header={
            <SettingsSectionHeader
              title={t('settingsGeneralLanguageTitle')}
              description={t('settingsGeneralLanguageDescription')}
            />
          }
        >
          <SettingsOptionRow
            label={t('settingsGeneralLanguagePreferenceLabel')}
            description={t('settingsGeneralLanguagePreferenceDescription')}
            layout="stack"
            control={
              <select
                className="textInput"
                value={languagePreference}
                disabled={savingLanguagePreference}
                onChange={(event) => {
                  void updateUiLanguagePreference(
                    event.target.value as PlatformUiLanguagePreference,
                  );
                }}
                aria-label={t('settingsGeneralLanguageSelectAriaLabel')}
              >
                <option value="auto">{t('settingsGeneralLanguageAutoOption')}</option>
                <option value="en">{t('settingsGeneralLanguageEnglishOption')}</option>
                <option value="zh-TW">
                  {t('settingsGeneralLanguageTraditionalChineseOption')}
                </option>
              </select>
            }
          />
          <SettingsOptionRow
            label={t('settingsGeneralAssistantLanguagePreferenceLabel')}
            description={t('settingsGeneralAssistantLanguagePreferenceDescription')}
            layout="stack"
            control={
              <select
                className="textInput"
                value={assistantResponseLanguage}
                disabled={savingAssistantLanguage}
                onChange={(event) => {
                  const nextLanguage = event.target.value;
                  if (isAssistantResponseLanguage(nextLanguage)) {
                    void updateAssistantResponseLanguage(nextLanguage);
                  }
                }}
                aria-label={t('settingsGeneralAssistantLanguageSelectAriaLabel')}
              >
                <option value="unspecified">
                  {t('settingsGeneralAssistantLanguageUnspecifiedOption')}
                </option>
                {assistantLanguageOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          />
        </SettingsSection>

        <SettingsSection
          header={
            <SettingsSectionHeader
              title={t('settingsGeneralLobbyMotionTitle')}
              description={t('settingsGeneralLobbyMotionDescription')}
            />
          }
        >
          <SettingsOptionRow
            asChoice
            label={t('settingsGeneralLobbyMotionOffLabel')}
            description={t('settingsGeneralLobbyMotionOffDescription')}
            control={
              <input
                type="radio"
                name="lobby-animation-mode"
                checked={lobbyPrefs.animationMode === 'off'}
                disabled={savingLobbyPrefs}
                onChange={() => {
                  void updateLobbyAnimationMode('off', t('settingsGeneralUpdateLobbyAnimationError'));
                }}
              />
            }
          />
          <SettingsOptionRow
            asChoice
            label={t('settingsGeneralLobbyMotionReducedLabel')}
            description={t('settingsGeneralLobbyMotionReducedDescription')}
            control={
              <input
                type="radio"
                name="lobby-animation-mode"
                checked={lobbyPrefs.animationMode === 'reduced'}
                disabled={savingLobbyPrefs}
                onChange={() => {
                  void updateLobbyAnimationMode('reduced', t('settingsGeneralUpdateLobbyAnimationError'));
                }}
              />
            }
          />
          <SettingsOptionRow
            asChoice
            label={t('settingsGeneralLobbyMotionFullLabel')}
            description={t('settingsGeneralLobbyMotionFullDescription')}
            control={
              <input
                type="radio"
                name="lobby-animation-mode"
                checked={lobbyPrefs.animationMode === 'full'}
                disabled={savingLobbyPrefs}
                onChange={() => {
                  void updateLobbyAnimationMode('full', t('settingsGeneralUpdateLobbyAnimationError'));
                }}
              />
            }
          />
        </SettingsSection>

        {payload.guideCat ? (
          <SettingsSection
            header={
              <SettingsSectionHeader
                title={t('settingsGeneralGuideCatAssistTitle')}
                description={
                  guideCatEnabled
                    ? t('settingsGeneralGuideCatAssistEnabledDescription', { guideCatName })
                    : t('settingsGeneralGuideCatAssistDisabledDescription', { guideCatName })
                }
              />
            }
          >
            {!guideCatEnabled ? (
              <div className="setupActionGroup">
                <button
                  type="button"
                className="secondaryButton"
                onClick={() => navigate('/settings/assistants')}
              >
                {t('settingsGeneralOpenAssistantsButton')}
              </button>
            </div>
            ) : (
              <>
                <SettingsOptionRow
                  asChoice
                  label={t('settingsGeneralGuideCatAutoLabel')}
                  description={t('settingsGeneralGuideCatAutoDescription')}
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
                  label={t('settingsGeneralGuideCatSidePanelLabel')}
                  description={t('settingsGeneralGuideCatSidePanelDescription')}
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
                  label={t('settingsGeneralGuideCatBubbleLabel')}
                  description={t('settingsGeneralGuideCatBubbleDescription')}
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

      {cropOpen ? (
        <AvatarCropDialog
          onSave={(dataUrl) => {
            setCropOpen(false);
            void updateOwnerAvatar(dataUrl, t('settingsGeneralSaveAvatarError'));
          }}
          onClose={() => setCropOpen(false)}
          initialDataUrl={avatarUrl ?? null}
        />
      ) : null}
      <ToastContainer toasts={toasts} />
    </>
  );
}
