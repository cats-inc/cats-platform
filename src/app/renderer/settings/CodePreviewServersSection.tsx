import { useEffect, useState } from 'react';

import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { CODE_API_PREVIEW_SETTINGS_PATH } from '../../../products/code/shared/apiPaths.js';
import { useI18n } from '../i18n/index.js';

export interface CodePreviewServersSectionProps {
  showToast: (message: string) => void;
}

/**
 * Settings > Code "Cats may run preview servers" (SPEC-123 CAP-08). The host
 * stops running dev previews when it is turned off.
 */
export function CodePreviewServersSection({ showToast }: CodePreviewServersSectionProps) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(CODE_API_PREVIEW_SETTINGS_PATH)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as { previewServersEnabled?: unknown };
        if (!cancelled) setEnabled(body.previewServersEnabled === true);
      })
      .catch(() => {
        if (!cancelled) showToast(t('settingsCodePreviewServersLoadFailure'));
      });
    return () => { cancelled = true; };
  }, []);

  async function update(next: boolean): Promise<void> {
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const response = await fetch(CODE_API_PREVIEW_SETTINGS_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ previewServersEnabled: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      setEnabled(previous);
      showToast(t('settingsConversationPreferenceUpdateFailure'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t('settingsCodePreviewServersTitle')}
          description={t('settingsCodePreviewServersDescription')}
        />
      )}
    >
      <SettingsOptionRow
        asChoice
        label={t('settingsCodePreviewServersEnableLabel')}
        description={t('settingsCodePreviewServersToggleDescription')}
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
