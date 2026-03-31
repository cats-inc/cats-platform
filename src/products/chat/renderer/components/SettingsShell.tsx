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
        <p className="settingsNavHeading">Chat Settings</p>
        <button
          className={section === 'general' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/chat/settings/general')}
        >
          General
        </button>
        <button
          className={section === 'cats' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/chat/settings/cats')}
        >
          Cats
        </button>
        <p className="settingsNavSubheading">Suite</p>
        <button
          className="settingsTab"
          type="button"
          onClick={() => navigate('/settings/general')}
        >
          Suite settings
        </button>
        <button
          className={section === 'data' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/data')}
        >
          Suite data
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
