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
  const hasInnerWrap = Boolean(eyebrow);
  const titleNode = (
    <TitleTag
      className="settings-section-header__title"
      data-nested={nested ? 'true' : undefined}
    >
      {title}
    </TitleTag>
  );
  return (
    <>
      <header className="contentCardHeader settings-section-header">
        {hasInnerWrap ? (
          <div>
            <p className="settings-section-header__eyebrow">{eyebrow}</p>
            {titleNode}
          </div>
        ) : (
          titleNode
        )}
        {status ? (
          <span className="settings-section-header__status">{status}</span>
        ) : null}
      </header>
      {description ? (
        <p className="settings-section-header__description">{description}</p>
      ) : null}
    </>
  );
}
