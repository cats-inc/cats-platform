export type SettingsStatusChipTone = 'ready' | 'warm' | 'muted';

export const SETTINGS_STATUS_CHIP_TONE_CLASS: Record<SettingsStatusChipTone, string> = {
  ready: 'statusChipReady',
  warm: 'statusChipWarm',
  muted: 'statusChipMuted',
};
