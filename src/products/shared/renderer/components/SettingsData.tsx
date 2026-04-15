import { SettingsShell } from './SettingsShell.js';
import {
  isSetupResetBusy,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';

export interface SettingsDataProps {
  feedback: string;
  busy: WorkspaceBusyState;
  onResetSetup: () => void;
}

export function SettingsData({
  feedback,
  busy,
  onResetSetup,
}: SettingsDataProps) {
  void feedback;
  const resetBusy = isSetupResetBusy(busy);

  return (
    <SettingsShell section="data" title="Data">
      <div className="contentCard">
        <h2>Reset all data</h2>
        <p className="heroNote">
          This will erase all chats, cats, and settings. You will be returned to the setup wizard.
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
    </SettingsShell>
  );
}
