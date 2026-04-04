import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import type {
  PlatformProductDescriptor,
  PlatformProductSettingsDescriptor,
} from '../../../shared/platform-contract.js';

type PlatformSettingsSection = 'general' | 'runtime' | 'data';

interface PlatformSettingsProductGroup {
  productId: PlatformProductDescriptor['id'];
  productName: string;
  entries: PlatformProductSettingsDescriptor[];
}

export interface PlatformSettingsShellProps {
  section: PlatformSettingsSection;
  title: string;
  products: PlatformProductDescriptor[];
  children: ReactNode;
}

export function buildPlatformSettingsProductGroups(
  products: readonly PlatformProductDescriptor[],
): PlatformSettingsProductGroup[] {
  return products
    .filter((product) => product.installState !== 'available' && (product.settings?.length ?? 0) > 0)
    .map((product) => ({
      productId: product.id,
      productName: product.productName,
      entries: product.settings?.map((entry) => ({ ...entry })) ?? [],
    }));
}

export function PlatformSettingsShell({
  section,
  title,
  products,
  children,
}: PlatformSettingsShellProps) {
  const navigate = useNavigate();
  const productGroups = buildPlatformSettingsProductGroups(products);

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <p className="settingsNavHeading">Platform Settings</p>
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
        {productGroups.length > 0 ? (
          <>
            <p className="settingsNavSubheading">Product Settings</p>
            {productGroups.map((group) => (
              <div key={group.productId} className="settingsSidebarGroup">
                {productGroups.length > 1 ? (
                  <p className="settingsNavProductLabel">{group.productName}</p>
                ) : null}
                {group.entries.map((entry) => (
                  <button
                    key={`${group.productId}:${entry.id}`}
                    className="settingsTab"
                    type="button"
                    onClick={() => navigate(entry.path)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            ))}
          </>
        ) : null}
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
