import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface EntityDetailPaneTab {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

export interface EntityDetailPaneProps {
  ariaLabel: string;
  avatar: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs: readonly EntityDetailPaneTab[];
  children: ReactNode;
}

/**
 * Pane shell for an entity (Cat / Clowder / Cattery) — header with
 * avatar / title / actions, tab bar, and body slot. The page-level
 * breadcrumb (back to /lobby) is provided by the surrounding
 * EntitiesShell, so this pane does NOT render its own breadcrumb.
 * Per PLAN-091 phase 7, every entity route mounts inside
 * EntitiesShell; standalone usage is no longer supported.
 */
export function EntityDetailPane({
  ariaLabel,
  avatar,
  title,
  subtitle,
  actions,
  tabs,
  children,
}: EntityDetailPaneProps) {
  return (
    <div className="entityDetailPane" aria-label={ariaLabel}>
      <header className="entityDetailHeader">
        <span className="entityDetailAvatar">{avatar}</span>
        <div className="entityDetailHeading">
          <h1 className="entityDetailTitle">{title}</h1>
          {subtitle ? <p className="entityDetailSubtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="entityDetailActions">{actions}</div> : null}
      </header>
      <nav className="entityDetailTabs" aria-label={ariaLabel}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.href}
            className={tab.active ? 'entityDetailTab entityDetailTabActive' : 'entityDetailTab'}
            aria-current={tab.active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <section className="entityDetailBody">{children}</section>
    </div>
  );
}
