import type { CatsAppInstallState } from '../../shared/catsAppManifest.js';
import type { MessageKey } from '../../shared/i18n/index.js';

/** Localized install-state labels shared by Settings > Apps and the App host shell. */
export const APP_INSTALL_STATE_LABEL_BY_STATE: Record<CatsAppInstallState, MessageKey> = {
  enabled: 'settingsAppsInstallStateEnabled',
  installed: 'settingsAppsInstallStateInstalled',
  disabled: 'settingsAppsInstallStateDisabled',
  error: 'settingsAppsInstallStateError',
  'upgrade-pending': 'settingsAppsInstallStateUpgradePending',
  uninstalled: 'settingsAppsInstallStateUninstalled',
};
