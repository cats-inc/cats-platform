import { useEffect, useState } from 'react';

import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';

export const CLAUDE_IN_CHROME_SETTINGS_PATH = '/api/provider-interactions/preferences';

export interface ClaudeInChromeSectionProps {
  showToast: (message: string) => void;
}

/**
 * Settings > Runtime "Claude in Chrome" (PLAN-125). Off by default; the route
 * accepts only the local owner because it lets Cats act in the owner's browser.
 */
export function ClaudeInChromeSection({ showToast }: ClaudeInChromeSectionProps) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(CLAUDE_IN_CHROME_SETTINGS_PATH, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as { claudeInChromeEnabled?: unknown };
        if (!cancelled) setEnabled(body.claudeInChromeEnabled === true);
      })
      .catch(() => {
        if (!cancelled) showToast(t(messageKeys.providerControlsChromeLoadFailure));
      });
    return () => { cancelled = true; };
  }, []);

  async function update(next: boolean): Promise<void> {
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const response = await fetch(CLAUDE_IN_CHROME_SETTINGS_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claudeInChromeEnabled: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      setEnabled(previous);
      showToast(t(messageKeys.providerControlsChromeSaveFailure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t(messageKeys.providerControlsChromeTitle)}
          description={t(messageKeys.providerControlsChromeDescription)}
        />
      )}
    >
      <SettingsOptionRow
        asChoice
        label={t(messageKeys.providerControlsChromeToggle)}
        description={t(messageKeys.providerControlsChromeToggleHelp)}
        control={(
          <input
            type="checkbox"
            checked={enabled === true}
            disabled={enabled === null || saving}
            onChange={(event) => { void update(event.target.checked); }}
          />
        )}
      />
    </SettingsSection>
  );
}
