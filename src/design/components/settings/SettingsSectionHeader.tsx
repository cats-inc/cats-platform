import type { ReactNode } from 'react';

export interface SettingsSectionHeaderProps {
  title: string;
  eyebrow?: string;
  status?: ReactNode;
  description?: ReactNode;
  nested?: boolean;
}

export function SettingsSectionHeader({
  title,
  eyebrow,
  status,
  description,
  nested = false,
}: SettingsSectionHeaderProps) {
  const TitleTag = nested ? 'h3' : 'h2';
  return (
    <header className="settings-section-header">
      <div>
        {eyebrow ? (
          <p className="settings-section-header__eyebrow">{eyebrow}</p>
        ) : null}
        <TitleTag
          className="settings-section-header__title"
          data-nested={nested ? 'true' : undefined}
        >
          {title}
        </TitleTag>
        {description ? (
          <p className="settings-section-header__description">{description}</p>
        ) : null}
      </div>
      {status ? (
        <span className="settings-section-header__status">{status}</span>
      ) : null}
    </header>
  );
}
