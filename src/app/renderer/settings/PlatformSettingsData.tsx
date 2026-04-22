import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import { SettingsDangerZone } from '../../../design/components/settings/index.js';
import {
  isSetupResetBusy,
  type WorkspaceBusyState,
} from '../../../shared/workspaceBusy.js';

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

  async function handleReset(): Promise<void> {
    try {
      await onResetSetup();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to reset setup.');
    }
  }

  return (
    <>
      <SettingsDangerZone
        title="Reset all data"
        description="This will erase all chats, cats, platform preferences, and setup state. You will be returned to the setup wizard."
      >
        <button
          className="dangerButton"
          type="button"
          disabled={resetBusy}
          onClick={() => void handleReset()}
        >
          {resetBusy ? 'Resetting...' : 'Reset all data'}
        </button>
      </SettingsDangerZone>
      <ToastContainer toasts={toasts} />
    </>
  );
}
