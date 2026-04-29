import { useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import type {
  PlatformProductDescriptor,
  PlatformProductSettingsDescriptor,
} from '../../../shared/platform-contract.js';
import { isDesktopEnvironment } from '../../../shared/desktopRecoveryBridge.js';
import { getSettingsExitDelta } from './settingsExitMemory.js';
import { useI18n } from '../i18n/index.js';

type PlatformSettingsSection =
  | 'general'
  | 'cats'
  | 'cats:my-cats'
  | 'cats:assistants'
  | 'apps'
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
  const { t } = useI18n();

  // settingsExitMemory tracks the idx just before the user entered /settings
  // in this session. If we have that memory, navigate(-N) jumps past all
  // in-settings tab navigations (General → My Cats → Assistants) in one
  // step and lands on whatever non-settings surface the user came from.
  // If memory is absent (tray direct, bookmark, hard reload on /settings),
  // fall back to /lobby with replace so the forward button cannot un-close.
  const handleClose = useCallback(() => {
    const historyState = window.history.state as { idx?: number } | null;
    const delta = getSettingsExitDelta(historyState?.idx);
    if (delta !== null) {
      navigate(delta);
    } else {
      navigate('/lobby', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <p className="settingsNavHeading">{t('settingsShellHeading')}</p>
        <button
          className={section === 'general' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/general')}
        >
          {t('settingsShellSectionGeneral')}
        </button>
        <p className="settingsNavSubheading">{t('settingsShellSectionCats')}</p>
        <div className="settingsSidebarGroup">
          <button
            className={section === 'cats:my-cats' ? 'settingsTab settingsTabActive' : 'settingsTab'}
            type="button"
            onClick={() => navigate('/settings/cats/my-cats')}
          >
            {t('settingsShellSubsectionMyCats')}
          </button>
          <button
            className={section === 'cats:assistants' ? 'settingsTab settingsTabActive' : 'settingsTab'}
            type="button"
            onClick={() => navigate('/settings/cats/assistants')}
          >
            {t('settingsShellSubsectionAssistants')}
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
        <button
          className={section === 'apps' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/apps')}
        >
          {t('settingsShellSectionApps')}
        </button>
        {showDesktop ? (
          <button
            className={section === 'desktop' ? 'settingsTab settingsTabActive' : 'settingsTab'}
            type="button"
            onClick={() => navigate('/settings/desktop')}
          >
            {t('settingsShellSectionDesktop')}
          </button>
        ) : null}
        <button
          className={section === 'runtime' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/runtime')}
        >
          {t('settingsShellSectionRuntime')}
        </button>
        <button
          className={section === 'data' ? 'settingsTab settingsTabActive' : 'settingsTab'}
          type="button"
          onClick={() => navigate('/settings/data')}
        >
          {t('settingsShellSectionData')}
        </button>
      </nav>
      <section className="settingsContent">
        <header className="settingsHeader">
          <h1>{title}</h1>
          <button
            type="button"
            className="settingsCloseButton"
            aria-label={t('settingsShellCloseButtonLabel')}
            onClick={handleClose}
          >
            &#x2715;
          </button>
        </header>
        <div className="settingsBody">
          {children}
        </div>
      </section>
    </div>
  );
}
