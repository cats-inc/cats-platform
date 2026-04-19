import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  isSetupResetBusy,
  type WorkspaceBusyState,
} from '../../../shared/workspaceBusy.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

export interface PlatformSettingsDataProps {
  payload: AppShellPayload;
  busy: WorkspaceBusyState;
  onResetSetup: () => Promise<void>;
}

export function PlatformSettingsData({
  payload,
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
    <PlatformSettingsShell
      section="data"
      title="Data"
      products={payload.products}
    >
      <div className="contentCard">
        <h2>Reset all data</h2>
        <p className="heroNote">
          This will erase all chats, cats, platform preferences, and setup state.
          You will be returned to the setup wizard.
        </p>
        <button
          className="dangerButton"
          type="button"
          disabled={resetBusy}
          onClick={() => void handleReset()}
        >
          {resetBusy ? 'Resetting...' : 'Reset all data'}
        </button>
      </div>
      <ToastContainer toasts={toasts} />
    </PlatformSettingsShell>
  );
}
