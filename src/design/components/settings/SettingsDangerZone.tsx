import type { ReactElement, ReactNode } from 'react';

export interface SettingsDangerZoneProps {
  title: string;
  description?: ReactNode;
  /** Single action element (typically a `<button className="dangerButton">`).
   * For multi-button rows, wrap in `<SettingsActionBar>` — otherwise the
   * section's `> * + *` row rhythm stacks the buttons vertically. Typed as
   * `ReactElement` so the multi-child mistake fails at compile time. */
  children: ReactElement;
  className?: string;
}

export function SettingsDangerZone({
  title,
  description,
  children,
  className,
}: SettingsDangerZoneProps) {
  const merged = [
    'contentCard',
    'settings-section',
    'settings-danger-zone',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={merged}>
      <h2 className="settings-danger-zone__title">{title}</h2>
      {description ? (
        <p className="settings-danger-zone__description">{description}</p>
      ) : null}
      {children}
    </section>
  );
}
