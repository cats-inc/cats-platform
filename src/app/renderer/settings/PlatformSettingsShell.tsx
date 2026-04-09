import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import type {
  PlatformProductDescriptor,
  PlatformProductSettingsDescriptor,
} from '../../../shared/platform-contract.js';
import { isDesktopEnvironment } from '../../../shared/desktopRecoveryBridge.js';

type PlatformSettingsSection =
  | 'general'
  | 'cats'
  | 'cats:my-cats'
  | 'cats:assistants'
  | 'desktop'
  | 'runtime'
  | 'data'
  | string;

interface PlatformSettingsProductEntry extends PlatformProductSettingsDescriptor {
  productId: PlatformProductDescriptor['id'];
}

export interface PlatformSettingsShellProps {
  section: PlatformSettingsSection;
  title: string;
  products: PlatformProductDescriptor[];
  children: ReactNode;
}

export function buildPlatformSettingsProductEntries(
  products: readonly PlatformProductDescriptor[],
) : PlatformSettingsProductEntry[] {
  return products
    .filter((product) => product.installState !== 'available' && (product.settings?.length ?? 0) > 0)
    .flatMap((product) =>
      (product.settings ?? []).map((entry) => ({
        ...entry,
        productId: product.id,
      })),
    );
}

export function PlatformSettingsShell({
  section,
  title,
  products,
  children,
}: PlatformSettingsShellProps) {
  const navigate = useNavigate();
  const productEntries = buildPlatformSettingsProductEntries(products);
  const showDesktop = isDesktopEnvironment();

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <p className="settingsNavHeading">Settings</p>
        <button
          className={section === 'general' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/general')}
        >
          General
        </button>
        <p className="settingsNavSubheading">Cats</p>
        <div className="settingsSidebarGroup">
          <button
            className={section === 'cats:my-cats' ? 'settingsTab settingsTabActive' : 'settingsTab'}
            type="button"
            onClick={() => navigate('/settings/cats/my-cats')}
          >
            My Cats
          </button>
          <button
            className={section === 'cats:assistants' ? 'settingsTab settingsTabActive' : 'settingsTab'}
            type="button"
            onClick={() => navigate('/settings/cats/assistants')}
          >
            Assistants
          </button>
        </div>
        {productEntries.map((entry) => (
          <button
            key={`${entry.productId}:${entry.id}`}
            className={section === entry.productId ? 'settingsTab settingsTabActive' : 'settingsTab'}
            type="button"
            onClick={() => navigate(entry.path)}
          >
            {entry.label}
          </button>
        ))}
        {showDesktop ? (
          <button
            className={section === 'desktop' ? 'settingsTab settingsTabActive' : 'settingsTab'}
            type="button"
            onClick={() => navigate('/settings/desktop')}
          >
            Desktop
          </button>
        ) : null}
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
