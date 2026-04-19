import type { ReactNode } from 'react';

export interface SettingsDangerZoneProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
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
      <div className="settings-danger-zone__actions">{children}</div>
    </section>
  );
}
