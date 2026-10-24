/** P0 contract. Host IPC/private transport is implemented in PLAN-122 P2. */
export const DESKTOP_GOOGLE_AUTH_CHANNELS = {
  start: 'cats-host:google-auth-start',
  status: 'cats-host:google-auth-status',
  cancel: 'cats-host:google-auth-cancel',
} as const;

export const PLATFORM_NATIVE_GOOGLE_AUTH_PATHS = {
  start: '/api/desktop/auth/google/start',
  complete: '/api/desktop/auth/google/complete',
  cancel: '/api/desktop/auth/google/cancel',
} as const;

export const PLATFORM_DESKTOP_AUTH_KEY_HEADER = 'x-cats-desktop-auth-key';

export const PLATFORM_GOOGLE_PROOF_HEADER = 'x-cats-google-proof';
export const PLATFORM_DESKTOP_AUTH_CONTEXT_HEADER = 'x-cats-desktop-auth-context';
export const NATIVE_GOOGLE_TRANSACTION_TTL_MS = 5 * 60 * 1000;
export const NATIVE_GOOGLE_CALLBACK_PATH = '/oauth/google/callback';

// Context ids come from the trusted host window registry, never renderer input.
export type NativeGoogleAuthBinding = { contextId: string } & (
  | { purpose: 'bootstrap'; attemptId: string }
  | { purpose: 'login' }
  | { purpose: 'link_google' | 'set_password'; accountId: string; sessionId: string }
);

/** Renderer requests never choose an Account, Session, window, nonce or audience. */
export type DesktopGoogleAuthStartInput =
  | { purpose: 'bootstrap'; attemptId: string }
  | { purpose: 'login' | 'link_google' | 'set_password' };

export interface DesktopGoogleAuthStatus {
  transactionId: string;
  phase: 'waiting' | 'verified' | 'cancelled' | 'failed';
  expiresAt: string;
}

/** Private Platform -> host response; never exposed through renderer IPC. */
export interface NativeGoogleAuthStartResult {
  transactionId: string;
  state: string;
  nonce: string;
  callbackUrl: string;
  expiresAt: string;
}

/** Private host -> Platform completion, after the host's code/PKCE exchange. */
export interface NativeGoogleAuthCompleteInput {
  transactionId: string;
  state: string;
  callbackUrl: string;
  idToken: string;
}

export interface NativeGoogleAuthProof {
  proofToken: string;
  expiresAt: string;
}
