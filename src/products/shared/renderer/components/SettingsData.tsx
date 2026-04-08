import { SettingsShell } from './SettingsShell.js';

export interface SettingsDataProps {
  feedback: string;
  busy: string;
  onResetSetup: () => void;
}

export function SettingsData({
  feedback,
  busy,
  onResetSetup,
}: SettingsDataProps) {
  void feedback;

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
          disabled={busy === 'setup:reset'}
          onClick={onResetSetup}
        >
          {busy === 'setup:reset' ? 'Resetting...' : 'Reset all data'}
        </button>
      </div>
    </SettingsShell>
  );
}
