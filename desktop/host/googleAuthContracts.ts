/** Mirrors browser-safe nativeGoogleAuth.ts; the Desktop root cannot import src.
 * Boundary tests pin these wire constants and structural bridge compatibility. */
export const DESKTOP_GOOGLE_AUTH_CHANNELS = {
  start: 'cats-host:google-auth-start', status: 'cats-host:google-auth-status',
  cancel: 'cats-host:google-auth-cancel', submit: 'cats-host:google-auth-submit',
} as const;
export const GOOGLE_CALLBACK_PATH = '/oauth/google/callback';
export const GOOGLE_AUTH_TTL_MS = 5 * 60 * 1000;
export interface DesktopGoogleAuthStatus {
  transactionId: string;
  phase: 'waiting' | 'verified' | 'cancelled' | 'failed';
  expiresAt: string;
  error?: string;
  committing?: boolean;
}
export type DesktopGoogleAuthStartInput =
  | { purpose: 'bootstrap'; attemptId: string }
  | { purpose: 'login' }
  | { purpose: 'link_google'; csrfToken: string; actionToken: string }
  | { purpose: 'set_password'; csrfToken: string };
export interface DesktopGoogleAuthAvailability {
  available: boolean;
  reason: 'ready' | 'not_configured';
}
