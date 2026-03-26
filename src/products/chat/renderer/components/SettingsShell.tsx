import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

type SettingsSection = 'general' | 'cats' | 'data';

export interface SettingsShellProps {
  section: SettingsSection;
  title: string;
  children: ReactNode;
}

export function SettingsShell({
  section,
  title,
  children,
}: SettingsShellProps) {
  const navigate = useNavigate();

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <p
          style={{
            padding: '0 12px',
            marginBottom: 12,
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          Settings
        </p>
        <button
          className={section === 'general' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/general')}
        >
          General
        </button>
        <button
          className={section === 'cats' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/cats')}
        >
          Cats
        </button>
        <button
          className={section === 'data' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/data')}
        >
          Data
        </button>
      </nav>
      <section className="settingsContent">
        <h1>{title}</h1>
        <div className="settingsBody">
          {children}
        </div>
      </section>
    </div>
  );
}
