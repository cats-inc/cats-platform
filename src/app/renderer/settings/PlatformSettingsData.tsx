import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import {
  isSetupResetBusy,
  type WorkspaceBusyState,
} from '../../../shared/workspaceBusy.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

export interface PlatformSettingsDataProps {
  payload: AppShellPayload;
  busy: WorkspaceBusyState;
  onResetSetup: () => void;
}

export function PlatformSettingsData({
  payload,
  busy,
  onResetSetup,
}: PlatformSettingsDataProps) {
  const resetBusy = isSetupResetBusy(busy);
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
          onClick={onResetSetup}
        >
          {resetBusy ? 'Resetting...' : 'Reset all data'}
        </button>
      </div>
    </PlatformSettingsShell>
  );
}
