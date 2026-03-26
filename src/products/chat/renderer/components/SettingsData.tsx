import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <p style={{ padding: '0 12px', marginBottom: 12, fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>Settings</p>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/general')}>General</button>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/cats')}>Cats</button>
        <button className="settingsTab settingsTabActive" type="button" onClick={() => navigate('/settings/data')}>Data</button>
      </nav>
      <div className="settingsContent">
        <h1>Data</h1>
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
      </div>
    </div>
  );
}
