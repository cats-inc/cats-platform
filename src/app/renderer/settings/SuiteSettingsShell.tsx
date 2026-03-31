import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

type SuiteSettingsSection = 'general' | 'runtime' | 'data';

export interface SuiteSettingsShellProps {
  section: SuiteSettingsSection;
  title: string;
  children: ReactNode;
}

export function SuiteSettingsShell({
  section,
  title,
  children,
}: SuiteSettingsShellProps) {
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
          Suite Settings
        </p>
        <button
          className={section === 'general' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/general')}
        >
          General
        </button>
        <button
          className={section === 'runtime' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/runtime')}
        >
          Runtime
        </button>
        <button
          className={section === 'data' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/data')}
        >
          Data
        </button>
        <p
          style={{
            padding: '12px 12px 0',
            margin: 0,
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'var(--muted)',
            textTransform: 'uppercase',
          }}
        >
          Product Settings
        </p>
        <button
          className="settingsTab"
          type="button"
          onClick={() => navigate('/chat/settings/general')}
        >
          Chat
        </button>
        <button
          className="settingsTab"
          type="button"
          onClick={() => navigate('/chat/settings/cats')}
        >
          Cats
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
