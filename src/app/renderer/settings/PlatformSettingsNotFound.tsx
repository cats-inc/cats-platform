import { useNavigate } from 'react-router-dom';

import {
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';

export function PlatformSettingsNotFound() {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t(messageKeys.settingsRouteTitleNotFound)}
          description={t(messageKeys.settingsRouteNotFoundDescription)}
        />
      )}
    >
      <div className="settingsActionRow">
        <button
          type="button"
          className="secondaryButton"
          onClick={() => navigate('/settings/general')}
        >
          {t(messageKeys.settingsRouteNotFoundOpenGeneral)}
        </button>
      </div>
    </SettingsSection>
  );
}
