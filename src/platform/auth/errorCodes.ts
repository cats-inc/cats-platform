export const PLATFORM_AUTH_ERROR_CODES = {
  unauthenticated: 'E_UNAUTHENTICATED',
  forbidden: 'E_FORBIDDEN',
  csrfMismatch: 'E_CSRF_MISMATCH',
} as const;

export type PlatformAuthErrorCode =
  (typeof PLATFORM_AUTH_ERROR_CODES)[keyof typeof PLATFORM_AUTH_ERROR_CODES];
