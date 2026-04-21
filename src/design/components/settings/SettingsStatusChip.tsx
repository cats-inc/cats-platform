import type { ReactNode } from 'react';

import {
  SETTINGS_STATUS_CHIP_TONE_CLASS,
  type SettingsStatusChipTone,
} from './SettingsStatusChipTone.js';

export interface SettingsStatusChipProps {
  tone: SettingsStatusChipTone;
  children: ReactNode;
  className?: string;
}

export function SettingsStatusChip({
  tone,
  children,
  className,
}: SettingsStatusChipProps) {
  const merged = [
    'statusChip',
    SETTINGS_STATUS_CHIP_TONE_CLASS[tone],
    'settings-status-chip',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={merged} data-tone={tone}>
      {children}
    </span>
  );
}
