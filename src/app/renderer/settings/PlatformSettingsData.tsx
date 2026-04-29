import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import { SettingsDangerZone } from '../../../design/components/settings/index.js';
import {
  isSetupResetBusy,
  type WorkspaceBusyState,
} from '../../../shared/workspaceBusy.js';
import { useI18n } from '../i18n/index.js';

export interface PlatformSettingsDataProps {
  payload: AppShellPayload;
  busy: WorkspaceBusyState;
  onResetSetup: () => Promise<void>;
}

export function PlatformSettingsData({
  busy,
  onResetSetup,
}: PlatformSettingsDataProps) {
  const resetBusy = isSetupResetBusy(busy);
  const { toasts, showToast } = useToast();
  const { t } = useI18n();

  async function handleReset(): Promise<void> {
    try {
      await onResetSetup();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('settingsDataResetFailure'));
    }
  }

  return (
    <>
      <SettingsDangerZone
        title={t('settingsDataResetAllDataTitle')}
        description={t('settingsDataResetAllDataDescription')}
      >
        <button
          className="dangerButton"
          type="button"
          disabled={resetBusy}
          onClick={() => void handleReset()}
        >
          {resetBusy
            ? t('settingsDataResetButtonResetting')
            : t('settingsDataResetButtonLabel')}
        </button>
      </SettingsDangerZone>
      <ToastContainer toasts={toasts} />
    </>
  );
}
