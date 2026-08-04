export const PLATFORM_BROWSER_HANDOFF_EXCHANGE_PATH =
  '/api/auth/browser-handoff/exchange';

export type PlatformBrowserHandoffLaunchPayload =
  | {
      launchMode: 'handoff';
      launchPath: string;
      expiresAt: string;
    }
  | {
      launchMode: 'direct';
      launchPath: string;
      expiresAt: null;
    };
