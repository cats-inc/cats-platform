import { useEffect, useState } from 'react';

import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';
import {
  readDesktopControl,
  setDesktopControlEnabled,
  type DesktopControlState,
} from '../../../products/shared/renderer/components/desktop-control/api.js';

export interface DesktopControlSectionProps {
  showToast: (message: string) => void;
}

/**
 * Settings > Runtime "Desktop control" (SPEC-133 DC-02). Off by default; the routes accept only
 * the local owner because it lets Cats see apps on this computer. Hidden where it cannot run.
 */
export function DesktopControlSection({ showToast }: DesktopControlSectionProps) {
  const { t } = useI18n();
  const [state, setState] = useState<DesktopControlState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readDesktopControl()
      .then((value) => { if (!cancelled) setState(value); })
      .catch(() => { if (!cancelled) showToast(t(messageKeys.desktopControlLoadFailure)); });
    return () => { cancelled = true; };
  }, []);

  async function update(next: boolean): Promise<void> {
    const previous = state;
    if (state) setState({ ...state, enabled: next });
    setSaving(true);
    try {
      setState(await setDesktopControlEnabled(next));
    } catch {
      setState(previous);
      showToast(t(messageKeys.desktopControlSaveFailure));
    } finally {
      setSaving(false);
    }
  }

  // Desktop control exists only in the Windows Desktop app; elsewhere there is nothing to set.
  if (state && !state.available && state.reason === 'not_windows') return null;

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t(messageKeys.desktopControlSettingsTitle)}
          description={t(messageKeys.desktopControlSettingsDescription)}
        />
      )}
    >
      {state && !state.available && <p role="status">{t(messageKeys.desktopControlUnavailable, { reason: state.reason ?? '' })}</p>}
      <SettingsOptionRow
        asChoice
        label={t(messageKeys.desktopControlSettingsToggle)}
        description={t(messageKeys.desktopControlSettingsToggleHelp)}
        control={(
          <input
            type="checkbox"
            checked={state?.enabled === true}
            disabled={state === null || !state.available || saving}
            onChange={(event) => { void update(event.target.checked); }}
          />
        )}
      />
    </SettingsSection>
  );
}
