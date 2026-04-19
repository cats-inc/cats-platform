import type { ReactNode } from 'react';

export type SettingsStatusChipTone = 'ready' | 'warm' | 'muted';

export interface SettingsStatusChipProps {
  tone: SettingsStatusChipTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASS: Record<SettingsStatusChipTone, string> = {
  ready: 'statusChipReady',
  warm: 'statusChipWarm',
  muted: 'statusChipMuted',
};

export function SettingsStatusChip({
  tone,
  children,
  className,
}: SettingsStatusChipProps) {
  const merged = [
    'statusChip',
    TONE_CLASS[tone],
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
