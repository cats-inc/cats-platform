import { useState } from 'react';

import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { useI18n } from '../i18n/index.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
import { formatSettingsDesktopMutationError } from './settingsDesktopErrorLabels.js';
import { resolveDefaultDesktopPreferences } from './settingsDesktopPreferences.js';

export interface PlatformSettingsDesktopStartupBehaviorProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  showToast: (message: string) => void;
}

/**
 * `Startup behavior` section for `Settings > Desktop`.
 *
 * This is the only Desktop section that writes preferences. It updates the
 * payload optimistically and restores the previous value on failure, so a
 * rejected write never leaves the checkbox showing a state the host did not
 * accept.
 */
export function PlatformSettingsDesktopStartupBehavior({
  payload,
  onPayloadUpdate,
  showToast,
}: PlatformSettingsDesktopStartupBehaviorProps) {
  const { t } = useI18n();
  const [savingDesktopPrefs, setSavingDesktopPrefs] = useState(false);
  const desktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();

  async function updateDesktopPreferences(
    nextDesktopPrefs: AppShellPayload['desktop'],
  ): Promise<void> {
    const previousDesktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();
    const failureMessage = t('settingsConversationPreferenceUpdateFailure');
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
          throw new Error(failureMessage);
        }
        const body = await response.json() as Partial<AppShellPayload['desktop']>;
        persistedPrefs = {
          ...desktopPrefs,
          startAtLogin: body.startAtLogin !== false,
          openWindowOnStartup: body.openWindowOnStartup === true,
          systemTrayEnabled: body.systemTrayEnabled !== false,
        };
      }

      onPayloadUpdate({
        ...payload,
        desktop: persistedPrefs,
      });
      dispatchPlatformEnvelopeRefresh();
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        desktop: previousDesktopPrefs,
      });
      showToast(formatSettingsDesktopMutationError(error, failureMessage, t));
    } finally {
      setSavingDesktopPrefs(false);
    }
  }

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t('settingsDesktopStartupTitle')}
          description={t('settingsDesktopStartupDescription')}
        />
      )}
    >
      <SettingsOptionRow
        asChoice
        label={t('settingsDesktopStartupSignInLabel')}
        description={t('settingsDesktopStartupSignInDescription')}
        control={(
          <input
            type="checkbox"
            checked={desktopPrefs.startAtLogin}
            disabled={savingDesktopPrefs}
            onChange={() => {
              void updateDesktopPreferences({
                ...desktopPrefs,
                startAtLogin: !desktopPrefs.startAtLogin,
              });
            }}
          />
        )}
      />
      <SettingsOptionRow
        asChoice
        label={t('settingsDesktopStartupTrayLabel')}
        description={t('settingsDesktopStartupTrayDescription')}
        control={(
          <input
            type="checkbox"
            checked={desktopPrefs.systemTrayEnabled}
            disabled={savingDesktopPrefs}
            onChange={() => {
              void updateDesktopPreferences({
                ...desktopPrefs,
                systemTrayEnabled: !desktopPrefs.systemTrayEnabled,
              });
            }}
          />
        )}
      />
      <SettingsOptionRow
        asChoice
        label={t('settingsDesktopStartupOpenWindowLabel')}
        description={t('settingsDesktopStartupOpenWindowDescription')}
        control={(
          <input
            type="checkbox"
            checked={desktopPrefs.openWindowOnStartup}
            disabled={savingDesktopPrefs}
            onChange={() => {
              void updateDesktopPreferences({
                ...desktopPrefs,
                openWindowOnStartup: !desktopPrefs.openWindowOnStartup,
              });
            }}
          />
        )}
      />
    </SettingsSection>
  );
}
