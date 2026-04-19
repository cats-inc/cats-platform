import type { ReactNode } from 'react';

export interface SettingsSectionProps {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'form';
  id?: string;
}

export function SettingsSection({
  header,
  children,
  className,
  variant = 'default',
  id,
}: SettingsSectionProps) {
  const merged = [
    'contentCard',
    variant === 'form' ? 'contentCardForm' : null,
    'settings-section',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      className={merged}
      data-variant={variant === 'form' ? 'form' : undefined}
      id={id}
    >
      {header}
      {children}
    </section>
  );
}
