export const PLATFORM_BROWSER_HANDOFF_EXCHANGE_PATH =
  '/api/auth/browser-handoff/exchange';

export interface PlatformBrowserHandoffLaunchPayload {
  launchPath: string;
  expiresAt: string;
}
