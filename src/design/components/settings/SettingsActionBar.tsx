import type { ReactNode } from 'react';

export interface SettingsActionBarProps {
  children: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}

export function SettingsActionBar({
  children,
  tone = 'default',
  className,
}: SettingsActionBarProps) {
  const merged = [
    'settingsActionRow',
    'settings-action-bar',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={merged}
      data-tone={tone === 'danger' ? 'danger' : undefined}
    >
      {children}
    </div>
  );
}
