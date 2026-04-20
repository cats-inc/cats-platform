import { isSettingsPath, SETTINGS_PATH } from './settingsRoute.js';

export const SETUP_PATH = '/setup';
export const LOBBY_PATH = '/lobby';
export const PRODUCTS_PATH = '/products';

export function isSetupPath(pathname: string): boolean {
  return pathname === SETUP_PATH;
}

export function isLobbyPath(pathname: string): boolean {
  return pathname === LOBBY_PATH || pathname.startsWith(`${LOBBY_PATH}/`);
}

export function isProductsPath(pathname: string): boolean {
  return pathname === PRODUCTS_PATH || pathname.startsWith(`${PRODUCTS_PATH}/`);
}

export function isPlatformNonProductPath(pathname: string): boolean {
  return isSetupPath(pathname)
    || isLobbyPath(pathname)
    || isProductsPath(pathname)
    || isSettingsPath(pathname);
}

export { SETTINGS_PATH, isSettingsPath };
