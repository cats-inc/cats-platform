import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface EntityDetailPaneTab {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

export interface EntityDetailPaneProps {
  breadcrumbLabel: string;
  breadcrumbHref: string;
  ariaLabel: string;
  avatar: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs: readonly EntityDetailPaneTab[];
  children: ReactNode;
}

export function EntityDetailPane({
  breadcrumbLabel,
  breadcrumbHref,
  ariaLabel,
  avatar,
  title,
  subtitle,
  actions,
  tabs,
  children,
}: EntityDetailPaneProps) {
  return (
    <div className="screen entityDetailScreen" aria-label={ariaLabel}>
      <nav className="entityDetailBreadcrumb" aria-label={breadcrumbLabel}>
        <Link to={breadcrumbHref} className="entityDetailBreadcrumbLink">
          <span aria-hidden="true">←</span>
          <span>{breadcrumbLabel}</span>
        </Link>
      </nav>
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
