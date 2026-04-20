export const SETTINGS_PATH = '/settings';

export function isSettingsPath(pathname: string): boolean {
  return pathname === SETTINGS_PATH || pathname.startsWith(`${SETTINGS_PATH}/`);
}
