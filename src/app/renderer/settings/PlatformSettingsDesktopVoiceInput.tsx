import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import type { ShowToast } from '../../../design/components/Toast.js';
import { resolveDesktopHostBridge } from '../../../shared/desktopRecoveryBridge.js';
import {
  DICTATION_LANGUAGE_AUTO,
  type DictationLanguageOptions,
} from '../../../shared/dictationLanguageBridge.js';
import {
  dictationLanguageName,
  scrollToSettingsSection,
  VOICE_INPUT_LANGUAGE_SELECT_ID,
  VOICE_INPUT_SECTION_ID,
} from '../../../shared/dictationLanguageLabels.js';
import {
  LINUX_STT_PACK_ID,
  OPTIONAL_DOWNLOADS_SECTION_ID,
} from '../../../shared/featurePackLabels.js';
import { useI18n } from '../i18n/index.js';

export interface PlatformSettingsDesktopVoiceInputProps {
  showToast: ShowToast;
  /** `navigator.platform`, injectable for tests. */
  platform?: string;
}

type HelpPlatform = 'linux' | 'mac' | 'windows' | 'other';

function helpPlatform(platform: string, options: DictationLanguageOptions | null): HelpPlatform {
  if (options?.automatic === 'detect') {
    return 'linux';
  }
  const normalized = platform.toLowerCase();
  if (normalized.startsWith('mac')) {
    return 'mac';
  }
  if (normalized.startsWith('win')) {
    return 'windows';
  }
  if (!options && normalized.startsWith('linux')) {
    return 'linux';
  }
  return 'other';
}

/**
 * `Voice input` for `Settings > Desktop` (SPEC-146 FR-6). It renders wherever
 * the host exposes the dictation language bridge, which follows the voice
 * bridge. Success is silent; a failed save restores the previous value and
 * says so in a toast (AGENTS.md Settings UI rules).
 */
export function PlatformSettingsDesktopVoiceInput({
  showToast,
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
}: PlatformSettingsDesktopVoiceInputProps) {
  const { t } = useI18n();
  const bridge = useMemo(() => resolveDesktopHostBridge(), []);
  const available = Boolean(bridge?.getDictationLanguageOptions && bridge.setDictationLanguage);
  const [options, setOptions] = useState<DictationLanguageOptions | null>(null);
  const [value, setValue] = useState<string>(DICTATION_LANGUAGE_AUTO);
  const [saving, setSaving] = useState(false);
  // Linux only: whether linux-stt allows dictation (SPEC-145 FR-B5), from `usable`.
  const [packUsable, setPackUsable] = useState<boolean | null>(null);
  const tRef = useRef(t);
  tRef.current = t;
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!bridge?.getDictationLanguageOptions) {
      return;
    }
    try {
      const next = await bridge.getDictationLanguageOptions();
      if (mounted.current) {
        setOptions(next);
        setValue(next.value);
      }
    } catch {
      if (mounted.current) {
        showToast(tRef.current('settingsDesktopVoiceInputLoadFailed'));
      }
    }
  }, [bridge, showToast]);

  // FR-4: every time the section opens, the host lists again.
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // The Linux options come from the usable pack, so they change when it does.
  const detectsFromSpeech = options?.automatic === 'detect';
  useEffect(() => {
    const packs = bridge?.featurePacks;
    if (!detectsFromSpeech || !packs) {
      return undefined;
    }
    let active = true;
    let lastKey: string | null = null;
    const apply = (usable: boolean, activeVersion: string | null) => {
      const key = `${usable}:${activeVersion ?? ''}`;
      if (!active || key === lastKey) {
        return;
      }
      const reload = lastKey !== null;
      lastKey = key;
      setPackUsable(usable);
      if (reload) {
        void load();
      }
    };
    const unsubscribe = packs.onChange((change) => {
      if (change.snapshot.id === LINUX_STT_PACK_ID) {
        apply(change.snapshot.usable, change.snapshot.activeVersion);
      }
    });
    Promise.resolve().then(() => packs.get(LINUX_STT_PACK_ID)).then((snapshot) => {
      apply(snapshot.usable, snapshot.activeVersion);
    }, () => {
      if (active) {
        setPackUsable(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge, detectsFromSpeech, load]);

  // `#voice-input` from the composer toast (SPEC-146 D3).
  useEffect(() => {
    if (!available || typeof window === 'undefined') {
      return;
    }
    if (window.location.hash === `#${VOICE_INPUT_SECTION_ID}`) {
      scrollToSettingsSection(VOICE_INPUT_SECTION_ID);
    }
  }, [available]);

  const choose = useCallback(async (next: string) => {
    if (!bridge?.setDictationLanguage || next === value) {
      return;
    }
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      await bridge.setDictationLanguage(next);
    } catch {
      if (mounted.current) {
        setValue(previous);
        showToast(tRef.current('settingsDesktopVoiceInputSaveFailed'));
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  }, [bridge, showToast, value]);

  if (!available) {
    return null;
  }

  const help = helpPlatform(platform, options);
  const linux = help === 'linux';
  const waitingForPack = linux && packUsable !== true;
  const languages = [...(options?.options ?? [])]
    .sort()
    .map((tag) => ({ tag, name: dictationLanguageName(tag) }));
  const savedUnavailable = value !== DICTATION_LANGUAGE_AUTO
    && !languages.some((language) => language.tag === value);
  const automaticLabel = linux
    ? t('settingsDesktopVoiceInputAutoDetect')
    : options?.system
      ? t('settingsDesktopVoiceInputFollowSystemWithLanguage', {
        language: dictationLanguageName(options.system),
      })
      : t('settingsDesktopVoiceInputFollowSystem');
  const helpText = help === 'linux'
    ? t('settingsDesktopVoiceInputHelpLinux')
    : help === 'mac'
      ? t('settingsDesktopVoiceInputHelpMac')
      : help === 'windows'
        ? t('sharedVoiceInputPrivacyUnknown')
        : null;

  return (
    <SettingsSection
      id={VOICE_INPUT_SECTION_ID}
      className="settingsVoiceInput"
      header={(
        <SettingsSectionHeader
          title={t('settingsDesktopVoiceInputTitle')}
          description={t('settingsDesktopVoiceInputDescription')}
        />
      )}
    >
      <SettingsOptionRow
        layout="stack"
        label={t('settingsDesktopVoiceInputLanguageLabel')}
        description={helpText}
        control={(
          <div className="settingsVoiceInputControl">
            <select
              id={VOICE_INPUT_LANGUAGE_SELECT_ID}
              className="textInput"
              value={value}
              disabled={saving || waitingForPack || !options}
              aria-label={t('settingsDesktopVoiceInputLanguageLabel')}
              onChange={(event) => {
                void choose(event.target.value);
              }}
            >
              <option value={DICTATION_LANGUAGE_AUTO}>{automaticLabel}</option>
              {languages.map((language) => (
                <option key={language.tag} value={language.tag}>{language.name}</option>
              ))}
              {savedUnavailable
                ? (
                  <option value={value} disabled>
                    {t('settingsDesktopVoiceInputUnavailableOption', {
                      language: dictationLanguageName(value),
                    })}
                  </option>
                )
                : null}
            </select>
            {waitingForPack && packUsable === false
              ? (
                <span className="settingsVoiceInputPackLine">
                  <span className="heroNote">{t('settingsDesktopVoiceInputNeedsPack')}</span>
                  <button
                    type="button"
                    className="secondaryButton settingsInlineLink"
                    onClick={() => {
                      scrollToSettingsSection(OPTIONAL_DOWNLOADS_SECTION_ID);
                    }}
                  >
                    {t('settingsDesktopVoiceInputShowOptionalDownloads')}
                  </button>
                </span>
              )
              : null}
          </div>
        )}
      />
    </SettingsSection>
  );
}
